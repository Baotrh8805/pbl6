"""Bộ thủ Khang Hi (C4): bảng 214 bộ, bộ của một chữ, gom chữ theo bộ và mẹo nhớ mẫu khi không có Gemini.

Người Việt nhớ chữ Hán nhanh nhất qua cặp "bộ thủ + âm Hán-Việt" (海 = bộ Thủy «nước» + âm HẢI) nên thẻ bộ thủ ghép ba
thứ đó với nghĩa. Mẹo nhớ ưu tiên Gemini (gemini.generate_mnemonics); thiếu key / hết quota / mẹo bị lọc thì dùng
template_mnemonic ở đây để thẻ không bao giờ trống (quyết định 19/10/2026; mọi mẹo đều qua admin duyệt ở backend
trước khi công khai nên template chỉ cần đúng và đủ ý, không cần hay).

Dữ liệu: data/radicals_214.csv (đã commit, nguồn ghi ở data/README.md) nạp lười một lần, thiếu file → bảng rỗng,
radical_of() trả None và available() False, service vẫn chạy (như kanjidata). Số bộ của một chữ lấy từ
kanjidata.radical_strokes (Unihan kRSUnicode); chữ JLPT gom theo bộ dựng lười từ classifier.jlpt_kanji_set().
"""
from __future__ import annotations

import csv
import re
import threading
import unicodedata
import zlib
from pathlib import Path
from typing import Optional

from app.extract import kanjidata
from app.extract.jlpt import classifier

DATA_FILE = Path(__file__).parent / "data" / "radicals_214.csv"
RADICAL_COUNT = 214
MAX_MNEMONIC_CHARS = 200   # một câu mẹo nhớ vừa một thẻ; Gemini cũng được yêu cầu ≤ 200
_MEANING_CHARS = 40        # gloss EN trong template: chỉ nghĩa đầu, cắt ngắn để cả câu chắc chắn dưới 200 ký tự

# Dạng viết khác của bộ thủ khi đứng trong chữ (氵 của 水, 艹 của 艸, 辶 của 辵…) và dạng NFKC / cũ của các bộ mà bảng ghi
# theo dạng JIS (戸 青 麦 黄 黒 → 戶 靑 麥 黃 黑): giáo viên Việt viết "bộ Thủy 氵" nên mẹo nhớ Gemini dùng các dạng này
# phải được chấp nhận (gemini.mnemonic_ok), không bị coi là "chữ Nhật khác".
RADICAL_VARIANTS: dict[int, str] = {
    9: "亻", 18: "刂", 26: "㔾", 42: "⺌⺍", 47: "川", 58: "彑⺕", 61: "忄⺗", 63: "戶户", 64: "扌", 66: "攵", 85: "氵氺",
    86: "灬", 87: "爫⺤", 90: "丬", 93: "牜", 94: "犭", 96: "王", 113: "礻", 118: "⺮", 120: "糹", 122: "罒", 125: "耂",
    130: "月", 140: "艹", 145: "衤", 146: "覀", 149: "訁", 157: "⻊", 162: "辶⻌⻍", 163: "阝", 167: "釒", 170: "阝",
    174: "靑", 184: "飠", 199: "麥", 201: "黃", 203: "黑", 210: "斉", 211: "歯", 212: "竜", 213: "亀",
}
# Nghĩa JMdict / JLPT là phụ tố, lượng từ, kính ngữ ("-ian (e.g. Italian)", "counter for occurrences", "Our ~",
# "honorific prefix"): ghép vào câu mẹo nhớ thành vô nghĩa (人 → nghĩa "-ian") và làm Gemini hiểu sai chữ → bỏ.
_AFFIX_GLOSS_RE = re.compile(r"^(?:[-(~]|counter for\b|prefix\b|suffix\b|honorific|honorable|polite\b|humble\b|our ~)",
                             re.IGNORECASE)
_PAREN_RE = re.compile(r"\([^()]*\)")

_lock = threading.Lock()   # nạp lười chạy đúng một lần dù nhiều request đầu tiên đến cùng lúc (threadpool), như kanjidata
_table: list[dict] | None = None          # dòng CSV theo thứ tự số bộ (no = vị trí + 1)
_by_char: dict[str, dict] = {}            # cả ký tự khối Kangxi (⽔) lẫn chữ CJK thống nhất (水) → dòng
_by_radical: dict[int, list[dict]] | None = None   # số bộ → [{kanji, level, strokeCount}] từ JLPT


# ----------------------------------------------------------------------------- nạp lười

def _parse(path: Path) -> list[dict]:
    """radicals_214.csv (no,char,unified,strokes,name_vi,meaning_vi,han_viet) → list dòng theo số bộ. Dòng thiếu / số
    hỏng → bỏ qua; file thiếu → []. Không kiểm tra đủ 214 ở đây để test dùng bảng tí hon được."""
    rows: list[dict] = []
    if not path.exists():
        return rows
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                no, strokes = int(row["no"]), int(row["strokes"])
            except (KeyError, TypeError, ValueError):
                continue
            char = (row.get("char") or "").strip()
            unified = (row.get("unified") or "").strip() or unicodedata.normalize("NFKC", char)
            if not char or no < 1:
                continue
            rows.append({
                "no": no, "char": char, "unified": unified, "strokes": strokes,
                "name_vi": (row.get("name_vi") or "").strip(),
                "meaning_vi": (row.get("meaning_vi") or "").strip(),
                "han_viet": (row.get("han_viet") or "").strip().upper(),
            })
    rows.sort(key=lambda r: r["no"])
    return rows


def _load() -> list[dict]:
    global _table, _by_char
    if _table is None:
        with _lock:
            if _table is None:
                rows = _parse(DATA_FILE)
                by_char: dict[str, dict] = {}
                for r in rows:
                    by_char.setdefault(r["unified"], r)
                    by_char.setdefault(r["char"], r)
                    # bộ ghi dạng JIS (青) vẫn tra được bằng dạng NFKC của ký tự Khang Hi (靑)
                    by_char.setdefault(unicodedata.normalize("NFKC", r["char"]), r)
                _by_char = by_char
                _table = rows   # gán cuối: cờ "đã nạp" chỉ bật khi chỉ mục theo chữ đã sẵn sàng
    return _table


def reset() -> None:
    """Xoá bảng đã nạp (test đổi DATA_FILE / dữ liệu JLPT giả rồi gọi)."""
    global _table, _by_char, _by_radical
    with _lock:
        _table, _by_char, _by_radical = None, {}, None


def available() -> bool:
    """Bảng bộ thủ nạp được (cờ health; parse 214 dòng rất rẻ nên nạp luôn thay vì chỉ stat như kanjidata)."""
    return bool(_load())


# ----------------------------------------------------------------------------- tra cứu bảng

def table() -> list[dict]:
    """Toàn bộ bảng (bản sao từng dòng để caller sửa thoải mái), theo số bộ 1..214."""
    return [dict(r) for r in _load()]


def radical(no: int) -> Optional[dict]:
    """Dòng bộ thủ số ``no`` → {no, char, unified, strokes, name_vi, meaning_vi, han_viet} | None."""
    rows = _load()
    if 1 <= no <= len(rows) and rows[no - 1]["no"] == no:   # bảng đủ: tra thẳng theo vị trí
        return dict(rows[no - 1])
    return next((dict(r) for r in rows if r["no"] == no), None)


def radical_of(ch: str) -> Optional[dict]:
    """Bộ thủ của một chữ theo Unihan (kanjidata.radical_strokes(ch)[0]); chữ chính là một bộ thủ (水, hay ký tự khối
    Kangxi ⽔ không có trong Unihan) thì tra thẳng bảng. Không biết → None."""
    rs = kanjidata.radical_strokes(ch)
    if rs:
        return radical(rs[0])
    _load()
    r = _by_char.get(ch)
    return dict(r) if r else None


def variants(no: int) -> tuple[str, ...]:
    """Các dạng viết khác của bộ ``no`` (85 → 氵 氺) để mẹo nhớ nhắc bộ theo cách giáo viên hay viết; không có → ()."""
    return tuple(RADICAL_VARIANTS.get(no, ""))


# ----------------------------------------------------------------------------- chữ JLPT theo bộ

def _easiest_level(ch: str) -> Optional[str]:
    """Cấp JLPT dễ nhất trong các từ chứa chữ (entries_containing đi N5 → N1 nên mục đầu là dễ nhất)."""
    best: Optional[str] = None
    for _, _, _, level in classifier.entries_containing(ch):
        if best is None or classifier.level_index(level) < classifier.level_index(best):
            best = level
    return best


def _kanji_index() -> dict[int, list[dict]]:
    """Số bộ → chữ JLPT, dựng lười một lần: ~2 000 chữ × một lần tra Unihan + quét từ chứa chữ, dưới 1 s khi
    classifier đã nạp. Trong mỗi bộ xếp cấp dễ → khó, rồi ít nét trước, rồi theo mã chữ để thứ tự ổn định."""
    global _by_radical
    if _by_radical is None:
        with _lock:
            if _by_radical is None:
                idx: dict[int, list[dict]] = {}
                for ch in sorted(classifier.jlpt_kanji_set()):
                    rs = kanjidata.radical_strokes(ch)
                    if not rs:
                        continue
                    idx.setdefault(rs[0], []).append({"kanji": ch, "level": _easiest_level(ch), "strokeCount": rs[1]})
                for items in idx.values():
                    items.sort(key=lambda it: (classifier.level_index(it["level"]), it["strokeCount"], it["kanji"]))
                _by_radical = idx
    return _by_radical


def kanji_by_radical(no: int, levels: Optional[list[str]] = None) -> list[dict]:
    """Chữ JLPT thuộc bộ ``no`` → [{kanji, level, strokeCount}] (level = cấp dễ nhất của từ chứa chữ).
    ``levels`` (vd ["N5", "N4"]) chỉ giữ chữ có cấp trong danh sách; None / rỗng = tất cả."""
    items = _kanji_index().get(no, [])
    if levels:
        wanted = set(levels)
        items = [it for it in items if it["level"] in wanted]
    return [dict(it) for it in items]


def group_kanji(kanji_list: list[str]) -> list[dict]:
    """Gom chữ theo bộ → [{radical: dòng bảng | None, kanji: [...]}]: nhóm theo thứ tự bộ xuất hiện lần đầu, trong
    nhóm giữ thứ tự gửi lên (bỏ trùng); chữ không tra được bộ gom chung một nhóm radical=None để frontend vẫn hiển
    thị được thay vì làm mất thẻ."""
    groups: dict[Optional[int], dict] = {}
    for ch in kanji_list:
        r = radical_of(ch)
        key = r["no"] if r else None
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"radical": r, "kanji": []}
        if ch not in g["kanji"]:
            g["kanji"].append(ch)
    return list(groups.values())


# ----------------------------------------------------------------------------- mẹo nhớ mẫu

# {k} chữ, {hv} âm Hán-Việt viết hoa, {rad} tên bộ (viết hoa chữ đầu), {rm} nghĩa bộ, {mn} ', nghĩa tiếng Anh "…"' hoặc
# rỗng (gloss là tiếng Anh của JMdict / JLPT — ghi rõ để câu tiếng Việt không trông như dịch sai; nghĩa tiếng Việt là {rm}).
# Nhiều mẫu, chọn theo CRC32 của chữ (hash() của str đổi theo tiến trình nên không dùng) để một bộ thẻ không đọc
# giống hệt nhau mà vẫn xác định — backend cache / admin duyệt không thấy câu nhảy giữa hai lần gọi.
_T_FULL = (
    "Chữ {k} có bộ {rad} ({rm}), âm Hán-Việt {hv}{mn}: thấy {rm} là nhớ {hv}.",
    "{hv} — chữ {k} mang bộ {rad} nghĩa là {rm}{mn}; hình dung {rm} rồi đọc to {hv}.",
    "Thấy bộ {rad} ({rm}) trong chữ {k}, đọc ngay {hv}{mn}.",
    "Nhớ {k} bằng công thức: bộ {rad} ({rm}) + âm {hv}{mn}.",
    "Chữ {k} ({hv}) thuộc bộ {rad}: {rm} gợi nhớ {hv}{mn}.",
)
_T_RADICAL = (   # không có âm Hán-Việt (chữ hiếm ngoài Unihan kVietnamese)
    "Chữ {k} có bộ {rad} ({rm}){mn}: thấy {rm} là nhớ chữ {k}.",
    "Nhớ {k} qua bộ {rad}: {rm}{mn}.",
)
_T_HV = (        # không tra được bộ
    "Chữ {k} đọc Hán-Việt là {hv}{mn}: nhìn chữ, đọc to {hv} ba lần.",
    "{hv} là âm của chữ {k}{mn} — gắn {hv} với hình chữ để nhớ.",
)
_T_BARE = ("Chữ {k}{mn}: viết lại ba lần và đọc to nghĩa để nhớ mặt chữ.",)


def _strip_parens(text: str) -> str:
    """Bỏ ghi chú trong ngoặc, kể cả lồng nhau: "person (same as 人 (ひと))" → "person"."""
    while True:
        new = _PAREN_RE.sub("", text)
        if new == text:
            return text.strip()
        text = new


def clean_meaning(meaning_en: Optional[str]) -> Optional[str]:
    """Gloss EN bỏ các nghĩa là phụ tố / lượng từ / kính ngữ (nghĩa đầu của một sense, sau khi bỏ ngoặc, khớp
    _AFFIX_GLOSS_RE hoặc chứa "~"): "counter for occurrences; a time, an instance" → "a time, an instance"; mọi nghĩa đều
    là phụ tố (人: "-ian…; -er…") → None để caller rơi về nguồn khác / không ghi nghĩa. Không bỏ gì → trả nguyên chuỗi."""
    if not meaning_en:
        return None
    senses = [s.strip() for s in str(meaning_en).split(";") if s.strip()]
    kept: list[str] = []
    for sense in senses:
        first = _strip_parens(sense).split(",")[0].strip()
        if not first or "~" in first or _AFFIX_GLOSS_RE.search(first):
            continue
        kept.append(sense)
    if len(kept) == len(senses):
        return meaning_en
    return "; ".join(kept) or None


def _short_meaning(meaning_en: Optional[str]) -> str:
    """Nghĩa đầu tiên của gloss EN đã lọc phụ tố ("sea; ocean" → "sea"), bỏ ngoặc, cắt ở _MEANING_CHARS; không có → ""."""
    first = _strip_parens((clean_meaning(meaning_en) or "").split(";")[0]).split(",")[0].strip()
    if len(first) > _MEANING_CHARS:
        first = first[:_MEANING_CHARS - 1].rstrip() + "…"
    return first


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def template_mnemonic(ch: str, radical: Optional[dict], han_viet: Optional[str], meaning_en: Optional[str]) -> str:
    """Câu mẹo nhớ tiếng Việt xác định, không rỗng, ≤ MAX_MNEMONIC_CHARS, ghép tên bộ + âm Hán-Việt + nghĩa.
    ``radical`` là dòng bảng (name_vi / meaning_vi; nhận cả nameVi / meaningVi của thẻ); thiếu bộ hay thiếu âm thì
    rơi về mẫu ít thành phần hơn, không bao giờ trả chuỗi rỗng."""
    hv = (han_viet or "").strip().upper() or None
    name = ((radical or {}).get("name_vi") or (radical or {}).get("nameVi") or "").strip()
    rad = name[:1].upper() + name[1:] if name else None
    # chỉ nghĩa đầu của bộ ("đi, bước đi" → "đi") để câu đọc trôi
    rm = ((radical or {}).get("meaning_vi") or (radical or {}).get("meaningVi") or "").split(";")[0].split(",")[0].strip() or None
    meaning = _short_meaning(meaning_en)
    mn = f', nghĩa tiếng Anh "{meaning}"' if meaning else ""
    if rad and rm and hv:
        pool = _T_FULL
    elif rad and rm:
        pool = _T_RADICAL
    elif hv:
        pool = _T_HV
    else:
        pool = _T_BARE
    text = pool[zlib.crc32(ch.encode("utf-8")) % len(pool)].format(k=ch, hv=hv, rad=rad, rm=rm, mn=mn)
    return _clip(text, MAX_MNEMONIC_CHARS)
