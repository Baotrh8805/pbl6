"""Luyện trọng âm cao thấp (E4): mẫu H/L chuẩn theo mora và lượng tử hoá đường F0 của người học.

Thuần hàm, không I/O. Kiểu trọng âm tra qua kanjidata.pitch_accent (kanjium, file chưa commit → None → router trả
404 và available() False); các hàm còn lại chạy không cần dữ liệu.

Vì sao chấm ở cả hai nơi: trình duyệt tự ước lượng F0 bằng WebAudio và chấm ngay để âm thanh không rời máy người
học; backend chỉ nhận đường (t, f0) để chấm lại khi lưu kết quả. quantize_hl / pitch_score vì thế PHẢI cho kết quả
y hệt frontend/src/lib/pitch.ts (quantizeHL / pitchScore) — lệch nhau thì cùng một bản ghi ra hai điểm khác nhau.
Đổi quy tắc ở đây thì đổi cả bên kia và frontend/scripts/selfCheck.ts (tests/test_pitch.py chép các ca từ đó).
"""
from __future__ import annotations

import math
import unicodedata
from typing import Any, Optional, Sequence

from app.extract import kanjidata
from app.extract.jachars import kata_to_hira

MoraLevel = Optional[str]   # "H" | "L" | None (ô không có mẫu có thanh)

# Kana nhỏ dính vào mora đứng trước (きょ, ふぁ, くゎ); ん っ ー mỗi cái một mora vì chiếm trọn một nhịp.
SMALL_KANA = frozenset("ゃゅょぁぃぅぇぉゎ")
# Biến đổi nhỏ hơn ngưỡng này (nửa cung) không tính là lên / xuống giọng: đủ lớn để bỏ nhiễu ước lượng F0 và độ
# trôi xuống tự nhiên trong một mora, đủ nhỏ để bắt bước lên đầu từ của heiban (thường 2–4 nửa cung).
DEADBAND_ST = 1.0

_HINTS = {
    "heiban": "Mẫu bằng phẳng (heiban): lên giọng ở mora 2 rồi giữ cao đến hết từ, không hạ.",
    "atamadaka": "Mẫu đầu cao (atamadaka): mora 1 cao nhất, hạ ngay ở mora 2 và giữ thấp.",
    "nakadaka": "Mẫu giữa cao (nakadaka): lên ở mora 2, giữ cao đến mora {a} rồi hạ.",
    "odaka": "Mẫu cuối cao (odaka): lên ở mora 2 và giữ cao đến hết từ, chỉ hạ ở trợ từ theo sau.",
}
_HINTS_ONE_MORA = {
    "heiban": "Từ một mora bằng phẳng (heiban): giữ giọng đều, không hạ.",
    "atamadaka": "Từ một mora đầu cao (atamadaka): hạ giọng ngay trong mora.",
}


# ----------------------------------------------------------------------------- mora & mẫu chuẩn

def normalize_reading(reading: str) -> str:
    """Cách đọc đúng như moraSplit bên frontend nhìn thấy: NFKC (kana nửa rộng ｶﾞｯｺｳ → ガッコウ, số toàn rộng １２ → 12)
    rồi chỉ giữ chữ cái / chữ số (bỏ 。・ khoảng trắng; ー là Lm nên isalpha() giữ lại như \\p{L} bên JS), rồi katakana →
    hiragana. Router dùng chung để cổng "cách đọc phải là kana" nhận đúng những gì trình duyệt đã chấm được."""
    text = unicodedata.normalize("NFKC", reading or "")
    return kata_to_hira("".join(ch for ch in text if ch.isalpha() or ch.isnumeric()))


def mora_split(reading: str) -> list[str]:
    """Chia cách đọc thành mora (bản Python của frontend/src/lib/kana.ts moraSplit, phải cho cùng kết quả):
    normalize_reading trước (Sudachi trả katakana, kanjium ghi hiragana), kana nhỏ ゃゅょぁぃぅぇぉゎ dính vào ký tự
    trước, ん っ ー mỗi cái một mora. Chữ cái / chữ số không phải kana lọt vào vẫn thành mora riêng để số ô thời gian
    không lệch với số mora; dấu câu và khoảng trắng bị bỏ."""
    moras: list[str] = []
    for ch in normalize_reading(reading):
        if ch in SMALL_KANA and moras:
            moras[-1] += ch
        else:
            moras.append(ch)
    return moras


def reference_hl(mora_count: int, accent_type: int) -> list[str]:
    """Mẫu H/L chuẩn Tokyo theo kiểu trọng âm kanjium (0 = 平板, n = hạ sau mora n):
      0 heiban            L H H H…
      1 atamadaka         H L L L…
      1 < n < số mora     L H…H (đến mora n) rồi L   (nakadaka)
      n == số mora        L H…H                       (odaka: hạ ở trợ từ, ngoài phạm vi từ)
    accent_type ngoài [0, mora_count] bị kẹp vào dải như referenceHL bên frontend; mora_count <= 0 → []."""
    if mora_count <= 0:
        return []
    a = max(0, min(int(math.floor(accent_type)), mora_count))
    out: list[str] = []
    for m in range(1, mora_count + 1):
        if a == 0:
            out.append("L" if m == 1 else "H")
        elif a == 1:
            out.append("H" if m == 1 else "L")
        else:
            out.append("L" if m == 1 else ("H" if m <= a else "L"))
    return out


def reference_contour(reading: str, accent_type: int) -> list[dict[str, str]]:
    """[{mora, level}] cho giao diện vẽ bậc thang và dán nhãn từng mora."""
    moras = mora_split(reading)
    return [{"mora": m, "level": lv} for m, lv in zip(moras, reference_hl(len(moras), accent_type))]


def accent_kind(mora_count: int, accent_type: int) -> str:
    """Tên kiểu trọng âm: heiban / atamadaka / nakadaka / odaka (từ 1 mora kiểu 1 gọi là atamadaka)."""
    if mora_count <= 0:
        return "heiban"
    a = max(0, min(int(math.floor(accent_type)), mora_count))
    if a == 0:
        return "heiban"
    if a == 1:
        return "atamadaka"
    return "nakadaka" if a < mora_count else "odaka"


# ----------------------------------------------------------------------------- lượng tử hoá đường F0

def _point(p: Any) -> tuple[Optional[float], Optional[float]]:
    """(t, f0) từ dict {"t", "f0"} (JSON) hoặc object có thuộc tính t / f0 (pydantic)."""
    if isinstance(p, dict):
        return p.get("t"), p.get("f0")
    return getattr(p, "t", None), getattr(p, "f0", None)


def _voiced(contour: Sequence[Any]) -> list[tuple[float, float]]:
    """Các điểm có thanh: f0 > 0 và cả t lẫn f0 hữu hạn. NaN / Infinity lọt qua json.loads của Python (JSON chuẩn
    không có) được coi như khung không có thanh thay vì làm floor() ném lỗi → 500."""
    out: list[tuple[float, float]] = []
    for t, f0 in map(_point, contour):
        if t is None or f0 is None:
            continue
        try:
            t, f0 = float(t), float(f0)
        except (TypeError, ValueError):
            continue
        if f0 > 0 and math.isfinite(f0) and math.isfinite(t):
            out.append((t, f0))
    return out


def _median(values: list[float]) -> float:
    s = sorted(values)
    mid = len(s) >> 1
    return s[mid] if len(s) % 2 == 1 else (s[mid - 1] + s[mid]) / 2


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def quantize_hl(contour: Sequence[Any], mora_count: int, deadband_st: float = DEADBAND_ST) -> list[MoraLevel]:
    """Chia các mẫu có thanh thành mora_count ô thời gian bằng nhau rồi gán H/L theo BIẾN ĐỔI giữa các mora
    (bản Python của quantizeHL bên frontend — giữ nguyên từng bước để kết quả trùng khớp):
      - Mora đầu: "H" nếu biến đổi đáng kể đầu tiên so với nó là đi XUỐNG (atamadaka), ngược lại "L" (kể cả khi
        không có biến đổi nào: giọng đều → toàn "L").
      - Các mora sau giữ mức cho tới khi lệch >= deadband_st so với mora lúc đổi mức gần nhất: lên → "H",
        xuống → "L". So với mốc đổi mức chứ không phải mora liền trước nên dốc thoải qua nhiều mora vẫn tính.
    Vì sao không so với trung vị: bên nào nhiều mora hơn (LHH, HLL, LHLL…) nằm đúng trung vị và sụp về mức của mora
    đầu. Vì sao không so trung điểm min/max: nakadaka hạ sau hạt nhân sâu hơn bước lên đầu từ (たまご ≈ 0 / +2.5 / −3
    nửa cung) nên mora đầu bị đẩy lên trên trung điểm → HHL.

    Ô không có mẫu có thanh → None (không bịa mức): っ, す/し vô thanh hoá không thể có thanh, để pitch_score bỏ qua.
    Từ 1 mora không có mora khác để so nên dùng dốc trong mora: nửa sau thấp hơn nửa đầu >= deadband_st → "H"
    (kiểu 1: 木, 目), ngược lại "L" (kiểu 0: 日, 気). Không có mẫu có thanh hoặc mora_count <= 0 → [].
    """
    voiced = _voiced(contour)
    if not voiced or mora_count <= 0:
        return []
    ref = _median([f0 for _, f0 in voiced])
    st = [(t, 12.0 * math.log2(f0 / ref)) for t, f0 in voiced]

    if mora_count == 1:
        half = len(st) >> 1
        if half == 0:
            return ["L"]
        fall = _mean([s for _, s in st[:half]]) - _mean([s for _, s in st[len(st) - half:]])
        return ["H" if fall >= deadband_st else "L"]

    t0 = st[0][0]
    span = st[-1][0] - t0
    sums = [0.0] * mora_count
    counts = [0] * mora_count
    for t, s in st:
        b = min(mora_count - 1, int(math.floor((t - t0) / span * mora_count))) if span > 0 else 0
        if b < 0:
            # Điểm có t < t0 (đầu vào không theo thứ tự thời gian): bên JS ghi vào chỉ số âm nên bị bỏ qua;
            # bỏ qua ở đây luôn thay vì để Python đếm ngược từ cuối mảng.
            continue
        sums[b] += s
        counts[b] += 1
    # Nửa cung trung bình của từng ô có mẫu; ô trống giữ None ở kết quả.
    bins = [(i, sums[i] / counts[i]) for i in range(mora_count) if counts[i] > 0]
    if not bins:
        return []

    first = bins[0][1]
    level = "L"
    for _, m in bins:
        d = m - first
        if abs(d) >= deadband_st:
            level = "H" if d < 0 else "L"
            break
    anchor = first
    levels: list[MoraLevel] = [None] * mora_count
    for i, m in bins:
        if level == "L" and m - anchor >= deadband_st:
            level, anchor = "H", m
        elif level == "H" and anchor - m >= deadband_st:
            level, anchor = "L", m
        levels[i] = level
    return levels


# ----------------------------------------------------------------------------- chấm điểm

def pitch_score(user_hl: Sequence[MoraLevel], ref_hl: Sequence[str]) -> tuple[int, list[int]]:
    """(% mora CÓ THANH trùng mức với mẫu, chỉ số 0-based các mora sai). Mora None (っ, nguyên âm vô thanh hoá…) bị
    loại khỏi cả tử lẫn mẫu số vì người học không thể làm nó có thanh; mora thiếu (nói ngắn hơn mẫu) tính là sai.
    Làm tròn kiểu Math.round của JS (.5 lên) chứ không phải round() của Python (.5 về chẵn) để 12.5 → 13 ở cả hai bên."""
    if not ref_hl:
        return 0, []
    wrong: list[int] = []
    scored = 0
    for i, r in enumerate(ref_hl):
        u = user_hl[i] if i < len(user_hl) else ""   # thiếu ≠ None: vẫn chấm và tính sai
        if u is None:
            continue
        scored += 1
        if u != r:
            wrong.append(i)
    if scored == 0:
        return 0, wrong
    return int(math.floor((scored - len(wrong)) / scored * 100 + 0.5)), wrong


def feedback(moras: Sequence[str], ref_hl: Sequence[str], user_hl: Sequence[MoraLevel], wrong: Sequence[int],
             pct: int, voiced_ratio: float, accent_type: int) -> str:
    """Nhận xét tiếng Việt: khen khi trùng mẫu, còn lại chỉ ra mora sai (tối đa 3) và nhắc lại hình dạng mẫu."""
    if not moras:
        return "Không chia được mora từ cách đọc."
    if not user_hl:
        return "Không nghe thấy giọng nói trong bản ghi. Hãy nói to, rõ và gần micro hơn rồi thử lại."
    kind = accent_kind(len(moras), accent_type)
    pattern = "".join(ref_hl)
    if pct == 100:
        return f"Đúng mẫu trọng âm {kind} ({pattern})."
    if len(moras) == 1:
        hint = _HINTS_ONE_MORA.get(kind, _HINTS[kind])
    else:
        hint = _HINTS[kind].format(a=max(0, min(int(accent_type), len(moras))))
    detail = "; ".join(f"mora {i + 1} 「{moras[i]}」 cần {'cao' if ref_hl[i] == 'H' else 'thấp'} hơn" for i in wrong[:3])
    more = f" (+{len(wrong) - 3} mora khác)" if len(wrong) > 3 else ""
    weak = " Nhiều đoạn không bắt được giọng; hãy nói liền mạch hơn." if voiced_ratio < 0.3 else ""
    return f"{pct}% mora đúng mẫu {pattern}: {detail}{more}. {hint}{weak}"


def score(user_contour: Sequence[Any], reading: str, accent_type: int, deadband_st: float = DEADBAND_ST) -> dict:
    """Chấm đường F0 của người học với mẫu chuẩn của (cách đọc, kiểu trọng âm).

    userHL rỗng khi không có mẫu có thanh (như quantizeHL bên frontend); voicedRatio = tỉ lệ điểm có f0 trên toàn
    đường để giao diện cảnh báo bản ghi quá im lặng.
    """
    moras = mora_split(reading)
    ref_hl = reference_hl(len(moras), accent_type)
    user_hl = quantize_hl(user_contour, len(moras), deadband_st)
    pct, wrong = pitch_score(user_hl, ref_hl)
    total = len(user_contour)
    voiced_ratio = round(len(_voiced(user_contour)) / total, 3) if total else 0.0
    return {
        "pct": pct,
        "userHL": user_hl,
        "refHL": ref_hl,
        "wrongMora": wrong,
        "voicedRatio": voiced_ratio,
        "feedback": feedback(moras, ref_hl, user_hl, wrong, pct, voiced_ratio, accent_type),
    }


# ----------------------------------------------------------------------------- dữ liệu

def accent_type(word: str, reading: Optional[str] = None) -> Optional[int]:
    """Kiểu trọng âm kanjium của từ (kanjidata.pitch_accent); chưa có dữ liệu hoặc không biết → None."""
    return kanjidata.pitch_accent(word, reading)


def available() -> bool:
    """Cờ health: file trọng âm kanjium có mặt (chỉ stat, không parse — xem kanjidata.availability)."""
    return bool(kanjidata.availability().get("pitch"))
