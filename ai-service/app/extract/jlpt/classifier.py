"""Gán cấp JLPT cho một từ (plan §4.8).

Nguồn 1: 5 file CSV data/jlpt/n5..n1.csv (expression,reading,meaning,tags).
  Tra (expression, reading) → expression → reading (chỉ khi từ toàn kana).
  Nhiều cấp → chọn cấp dễ nhất, confidence = 1/số cấp, sources liệt kê hết.
  Dòng gộp nhiều biến thể ("高校; 高等学校", "こうこう; こうとうがっこう") tách thành từng mục lúc nạp (_split_variants).
  Vài từ lõi N5 mà danh sách xếp cao / bỏ sót (日本, 日本語, 日本人) được sửa tay lúc nạp (_LEVEL_FIXES); nghĩa sai rõ
  ràng (中学校 "junior high school pupil") sửa bằng data/jlpt_meaning_overrides.csv (OVERRIDE_FILE).
Nguồn 2 (fallback): wordfreq zipf_frequency(lemma, 'ja') → N4/N3/N2/N1, confidence 0.4.
Không có → (None, 0.0, []).
"""
from __future__ import annotations

import csv
import math
import re
import threading
from collections import defaultdict
from pathlib import Path
from typing import Optional

from app.extract.jachars import is_kana, is_kanji, kata_to_hira

LEVELS = ["N5", "N4", "N3", "N2", "N1"]  # dễ → khó
DATA_DIR = Path(__file__).parent.parent / "data" / "jlpt"
# Nghĩa EN sửa tay (expression,reading,meaning) cho vài mục mà CSV ghi sai nghĩa thông dụng; nằm ngoài data/jlpt/ vì
# thư mục đó do build_dicts.py ghi đè mỗi lần dựng lại — sửa thẳng n*.csv sẽ mất.
OVERRIDE_FILE = Path(__file__).parent.parent / "data" / "jlpt_meaning_overrides.csv"

_by_pair: dict[tuple[str, str], set[str]] | None = None
_by_expr: dict[str, set[str]] = {}
_by_reading: dict[str, set[str]] = {}
_meaning: dict[str, str] = {}
# Chỉ mục từng dòng cho distractors (C2/C3): mỗi (expression, reading) một mục ở cấp dễ nhất gặp đầu tiên
# (LEVELS đi từ N5 → N1 nên dòng đầu là cấp dễ nhất, khớp cách classify() chọn cấp).
_entries: list[tuple[str, str, str, str]] = []   # (expression, reading, meaning, level)
_idx_expr: dict[str, list[int]] = {}             # expression → vị trí trong _entries
_idx_reading: dict[str, list[int]] = {}          # cách đọc hiragana → vị trí (đồng âm)
_idx_char: dict[str, list[int]] = {}             # chữ Hán → vị trí các từ chứa nó (giống hình)
_lock = threading.Lock()   # nạp lười chạy đúng một lần dù nhiều request đầu tiên đến cùng lúc (threadpool), như kanjidata


def level_index(level: Optional[str]) -> int:
    """Chỉ số độ khó (N5=0 … N1=4); None → 5 (xếp sau cùng)."""
    return LEVELS.index(level) if level in LEVELS else len(LEVELS)


def _clean(s: str) -> str:
    return s.strip().replace("～", "").replace("〜", "")


# ----------------------------------------------------------------------------- tách dòng nhiều biến thể

# Danh sách Tanos gộp các cách viết / cách đọc của cùng một mục vào một ô: "高校; 高等学校" + "こうこう; こうとうがっこう",
# "行く" + "いく; ゆく", "回る、回す" + "まわる、まわす". Để nguyên thì cả chuỗi thành một "từ" — đồ thị Hán-Việt vẽ node
# "高校; 高等学校" không có âm Hán-Việt, thẻ chữ Hán không căn được furigana, tra (高校, こうこう) không trúng cặp nào.
# Chỉ tách ở ";" / "；" / "、": dấu phẩy và ngoặc trong ô là ghi chú ngữ cảnh ("(花を〜) 生ける, 活ける"), không phải biến thể.
_VARIANT_SEP = re.compile(r"[;；、]")
_HIRA_TAIL = re.compile(r"[ぁ-ゖ]+$")


def _variants(cell: str) -> list[str]:
    """Một ô expression / reading → các biến thể đã _clean, bỏ phần rỗng ("～くらい; ぐらい" → ["くらい", "ぐらい"])."""
    return [v for v in (_clean(p) for p in _VARIANT_SEP.split(cell or "")) if v]


def _kana_fits(expr: str, reading: str) -> bool:
    """Phần kana của cách viết phải nằm đúng chỗ trong cách đọc (mỗi cụm chữ Hán khớp ≥ 1 kana bất kỳ): お金持ち (お…ち)
    nhận おかねもち nhưng không nhận かねもち — cách đọc thứ hai của dòng "お金持ち / かねもち; おかねもち" là của 金持ち."""
    parts: list[str] = []
    for ch in expr:
        if is_kana(ch) and not is_kanji(ch):   # ヶ thuộc cả hai lớp: coi như chữ Hán (一ヶ月 いっかげつ)
            parts.append(re.escape(kata_to_hira(ch)))
        elif not parts or parts[-1] != ".+":
            parts.append(".+")
    return re.fullmatch("".join(parts), reading) is not None


def _share_okurigana(exprs: list[str], readings: list[str]) -> list[str]:
    """Viết tắt kiểu "堅; 硬; 固い" / "伯父; 叔父さん": các biến thể trước bỏ phần kana cuối dùng chung với biến thể cuối.
    Gắn lại phần đó cho biến thể kết thúc bằng chữ Hán khi mọi cách đọc đều kết thúc bằng nó (かたい → 堅い, 硬い, 固い);
    không thì giữ nguyên ("足; 脚" không có đuôi kana)."""
    m = _HIRA_TAIL.search(exprs[-1])
    # biến thể cuối toàn kana ("足; あし") thì phần "đuôi" là cả từ, không phải okurigana → không gắn
    if len(exprs) < 2 or not m or m.start() == 0 or not all(r.endswith(m.group()) for r in readings):
        return exprs
    return [e + m.group() if is_kanji(e[-1]) else e for e in exprs[:-1]] + [exprs[-1]]


def _split_variants(expression: str, reading: str) -> list[tuple[str, str]]:
    """Ô expression + ô reading của một dòng CSV → [(cách viết, cách đọc hiragana)], mỗi biến thể một mục.
    Số biến thể hai ô bằng nhau → ghép theo vị trí (高校 ↔ こうこう, 高等学校 ↔ こうとうがっこう). Lệch nhau ("足; 脚" / あし,
    "行く" / "いく; ゆく") → mỗi cách viết nhận mọi cách đọc khớp phần kana của nó (_kana_fits); không cách đọc nào khớp
    thì nhận hết, không bỏ mất mục. Dòng thường (một biến thể) → đúng một cặp như trước."""
    exprs = _variants(expression)
    if not exprs:
        return []
    readings = [kata_to_hira(r) for r in _variants(reading)] or [""]
    if len(exprs) == len(readings):
        return list(zip(exprs, readings))
    out: list[tuple[str, str]] = []
    for expr in _share_okurigana(exprs, readings):
        fits = [r for r in readings if r and _kana_fits(expr, r)] or readings
        out.extend((expr, r) for r in fits)
    return out


def _read_overrides() -> dict[tuple[str, str], str]:
    """jlpt_meaning_overrides.csv → {(expression, cách đọc hiragana): nghĩa}. Khoá chuẩn hoá như CSV JLPT (_clean, bỏ ～,
    katakana → hiragana) nên ghi "～人" hay "人" đều được. Thiếu file / dòng thiếu nghĩa → bỏ qua, dòng đầu thắng."""
    out: dict[tuple[str, str], str] = {}
    if not OVERRIDE_FILE.exists():
        return out
    with open(OVERRIDE_FILE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            expr = _clean(row.get("expression") or "")
            meaning = (row.get("meaning") or "").strip()
            if expr and meaning:
                out.setdefault((expr, kata_to_hira(_clean(row.get("reading") or ""))), meaning)
    return out


# Sửa tay danh sách Tanos: 日本 chỉ có trong n3.csv (tag cũ JLPT_2 / JLPT_3) dù là từ bài 1 của mọi giáo trình N5
# (CSV còn ghi Genki_Ln.1), còn 日本語 / 日本人 không có trong danh sách nào (wordfreq xếp N3) → học viên dán câu N5 thấy
# 日本 nằm trong lát N3 của thanh cấp độ. Mục ở đây THAY mọi dòng CSV của cùng (expression, reading) và chèn vào đúng
# lượt cấp của nó lúc nạp, nên levelSources vẫn là jlpt_list:<cấp> và thứ tự "cấp dễ → khó" của các chỉ mục giữ nguyên.
_LEVEL_FIXES: dict[tuple[str, str], tuple[str, str]] = {   # (expression, reading) → (cấp, nghĩa EN nếu CSV không có)
    ("日本", "にほん"): ("N5", "Japan"),
    ("日本", "にっぽん"): ("N5", "Japan"),
    ("日本語", "にほんご"): ("N5", "Japanese (language)"),
    ("日本人", "にほんじん"): ("N5", "Japanese (person)"),
}


# B5.3 (26/10 plan): lỗi dữ liệu thô của elzup/jlpt-word-list sửa lúc nạp, không sửa CSV (tải lại bằng build_dicts là mất)
_ROW_FIXES: dict[tuple[str, str], tuple[str, str]] = {   # (expression, reading) sai → đúng
    ("下る", "さがる"): ("下がる", "さがる"),               # n4: さがる là 下がる; 下る đọc くだる (n3)
}
_SURU_PAREN = re.compile(r"\s*[（(]\s*する\s*[)）]\s*$")


def clean_row(expression: str, reading: str) -> tuple[str, str]:
    """Sửa ô expression / reading thô của một dòng CSV JLPT (B5.3): "(する)" thừa ở cách đọc (結婚 けっこん (する)), hai cột
    đảo (あいさつする,挨拶), đuôi する lẫn vào cách đọc của danh từ (運動 うんどうする → うんどう; động từ đọc する như 擦る / 刷る
    giữ nguyên vì cách viết tận cùng る), và vài cặp sai hẳn (_ROW_FIXES). Dòng sạch trả về nguyên văn (đã strip)."""
    from app.extract.jachars import has_kanji  # noqa: PLC0415
    expr, rd = (expression or "").strip(), (reading or "").strip()
    rd = _SURU_PAREN.sub("", rd)
    if rd and has_kanji(rd) and not has_kanji(expr):
        expr, rd = rd, expr
    if rd.endswith("する") and len(rd) > 2 and "する" not in expr and not expr.endswith("る"):
        rd = rd[:-2]
    return _ROW_FIXES.get((expr, rd), (expr, rd))


def _read_rows() -> dict[str, list[tuple[str, str, str]]]:
    """Cấp → các mục (expression, reading hiragana, meaning) theo thứ tự CSV; dòng nhiều biến thể tách thành nhiều mục
    liền nhau cùng cấp, cùng nghĩa (_split_variants). Đã áp _LEVEL_FIXES: mục CSV của một cặp được sửa bị bỏ, mục sửa
    đứng đầu cấp mới (dùng nghĩa CSV của cặp đó nếu có); rồi nghĩa sửa tay (OVERRIDE_FILE) thắng mọi nghĩa khác. Không
    có file CSV nào → bảng rỗng, kể cả mục sửa (để available() vẫn báo thiếu dữ liệu)."""
    rows: dict[str, list[tuple[str, str, str]]] = {level: [] for level in LEVELS}
    fixed_meaning: dict[tuple[str, str], str] = {}
    found = False
    for level in LEVELS:
        path = DATA_DIR / f"{level.lower()}.csv"
        if not path.exists():
            continue
        found = True
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                meaning = (row.get("meaning") or "").strip()
                cell_expr, cell_reading = clean_row(row.get("expression") or "", row.get("reading") or "")
                for expr, reading in _split_variants(cell_expr, cell_reading):
                    if (expr, reading) in _LEVEL_FIXES:
                        if meaning:
                            fixed_meaning.setdefault((expr, reading), meaning)
                        continue
                    rows[level].append((expr, reading, meaning))
    if found:
        overrides = _read_overrides()
        for level in LEVELS:
            fixes = [(expr, reading, fixed_meaning.get((expr, reading)) or meaning)
                     for (expr, reading), (lv, meaning) in _LEVEL_FIXES.items() if lv == level]
            rows[level] = [(expr, reading, overrides.get((expr, reading), meaning))
                           for expr, reading, meaning in fixes + rows[level]]
    return rows


def _load() -> None:
    global _by_pair, _by_expr, _by_reading, _meaning, _entries, _idx_expr, _idx_reading, _idx_char
    if _by_pair is not None:
        return
    with _lock:
        if _by_pair is not None:   # thread khác vừa nạp xong trong lúc chờ khoá
            return
        # Dựng vào biến cục bộ rồi gán module một lượt ở cuối: chỉ mục _entries / _idx_* là list append, không
        # idempotent như các set → hai lần nạp chồng nhau (health + extract đến cùng lúc) là mỗi mục bị nhân đôi
        by_pair: dict[tuple[str, str], set[str]] = defaultdict(set)
        by_expr: dict[str, set[str]] = {}
        by_reading: dict[str, set[str]] = {}
        meaning_of: dict[str, str] = {}
        entries: list[tuple[str, str, str, str]] = []
        idx_expr: dict[str, list[int]] = {}
        idx_reading: dict[str, list[int]] = {}
        idx_char: dict[str, list[int]] = {}
        for level, rows in _read_rows().items():
            for expr, reading, meaning in rows:
                if (expr, reading) not in by_pair:
                    i = len(entries)
                    entries.append((expr, reading, meaning, level))
                    idx_expr.setdefault(expr, []).append(i)
                    if reading:
                        idx_reading.setdefault(reading, []).append(i)
                    for ch in dict.fromkeys(expr):  # mỗi chữ một lần dù lặp trong từ (人々, 日々)
                        if is_kanji(ch):
                            idx_char.setdefault(ch, []).append(i)
                by_pair[(expr, reading)].add(level)
                by_expr.setdefault(expr, set()).add(level)
                if reading:
                    by_reading.setdefault(reading, set()).add(level)
                if meaning:
                    meaning_of.setdefault(expr, meaning)
                    if reading:
                        meaning_of.setdefault(reading, meaning)
        _by_expr, _by_reading, _meaning = by_expr, by_reading, meaning_of
        _entries, _idx_expr, _idx_reading, _idx_char = entries, idx_expr, idx_reading, idx_char
        _by_pair = dict(by_pair)   # gán cuối cùng: cờ "đã nạp" chỉ bật khi mọi bảng đã sẵn sàng


def available() -> bool:
    _load()
    return bool(_by_expr)


# ----------------------------------------------------------------------------- tra cứu cho distractors (C2/C3)

def entries_of(expression: str) -> list[tuple[str, str, str]]:
    """Các mục JLPT có đúng ``expression`` → [(reading, meaning, level)] theo cấp dễ → khó; không có → []."""
    _load()
    return [_entries[i][1:] for i in _idx_expr.get(_clean(expression), [])]


def homophones_jlpt(reading: Optional[str]) -> list[tuple[str, str, str]]:
    """Mọi từ JLPT đọc là ``reading`` (kể cả chính từ đang xét; caller tự loại) → [(expression, meaning, level)],
    cấp dễ → khó, mỗi expression một lần. Không có cách đọc / không có dữ liệu → []."""
    _load()
    out: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for i in _idx_reading.get(kata_to_hira(_clean(reading or "")), []):
        expr, _, meaning, level = _entries[i]
        if expr not in seen:
            seen.add(expr)
            out.append((expr, meaning, level))
    return out


def entries_containing(ch: str) -> list[tuple[str, str, str, str]]:
    """Mọi từ JLPT chứa chữ Hán ``ch`` → [(expression, reading, meaning, level)], cấp dễ → khó.
    Dùng để ước lượng "độ dễ" của một chữ (cấp dễ nhất của từ chứa nó) và cho mẹo nhớ về sau."""
    _load()
    return [_entries[i] for i in _idx_char.get(ch, [])]


def jlpt_kanji_set() -> frozenset[str]:
    """Tập chữ Hán xuất hiện trong 5 danh sách JLPT (~2 000 chữ): kho ứng viên cho kanji giống hình."""
    _load()
    return frozenset(_idx_char)


def _resolve(levels: set[str]) -> tuple[str, float, list[str]]:
    ordered = sorted(levels, key=level_index)
    return ordered[0], 1.0 / len(ordered), [f"jlpt_list:{lv}" for lv in ordered]


_freq_dict: dict[str, float] | None = None


def _zipf(lemma: str) -> float:
    """Tra thẳng bảng tần suất của wordfreq (không qua tokenizer vì nhánh 'ja' cần MeCab)."""
    global _freq_dict
    if _freq_dict is None:
        try:
            from wordfreq import get_frequency_dict
            _freq_dict = get_frequency_dict("ja")
        except Exception:
            _freq_dict = {}
    f = _freq_dict.get(lemma, 0.0)
    return math.log10(f) + 9.0 if f > 0 else 0.0


def _wordfreq_band(lemma: str) -> Optional[str]:
    try:
        z = _zipf(lemma)
    except Exception:
        return None
    if z >= 5.5:
        return "N4"
    if z >= 4.5:
        return "N3"
    if z >= 3.5:
        return "N2"
    if z >= 2.5:
        return "N1"
    return None


def classify(lemma: str, reading: Optional[str], is_kana_only: bool) -> tuple[Optional[str], float, list[str]]:
    _load()
    reading = kata_to_hira(reading or "")
    levels = _by_pair.get((lemma, reading)) if reading else None
    if not levels:
        levels = _by_expr.get(lemma)
    if not levels and is_kana_only:
        levels = _by_reading.get(reading or lemma)
    if levels:
        return _resolve(levels)
    band = _wordfreq_band(lemma)
    if band:
        return band, 0.4, [f"wordfreq:{band}"]
    return None, 0.0, []


def meaning_hint(lemma: str, reading: Optional[str] = None) -> Optional[str]:
    """Nghĩa EN từ cột meaning của CSV JLPT (fallback khi JMdict không có)."""
    _load()
    return _meaning.get(lemma) or (_meaning.get(kata_to_hira(reading)) if reading else None)


def phrase_level(words: list[tuple[str, Optional[str]]]) -> tuple[Optional[str], float, list[str]]:
    """Cấp của một cụm = cấp **khó nhất** trong các từ nội dung (lemma, reading); confidence = min × 0.8.
    levelSources mở đầu bằng ``phrase:<từ quyết định>`` rồi tới nguồn của từ đó. Không từ nào có cấp → (None, 0.0, [])."""
    from app.extract.jachars import is_kana_only
    best: Optional[tuple[int, str, float, list[str]]] = None
    confs: list[float] = []
    for lemma, reading in words:
        level, conf, sources = classify(lemma, reading, is_kana_only(lemma))
        if level is None:
            continue
        confs.append(conf)
        if best is None or level_index(level) > best[0]:
            best = (level_index(level), lemma, conf, sources)
    if best is None:
        return None, 0.0, []
    return LEVELS[best[0]], round(min(confs) * 0.8, 3), [f"phrase:{best[1]}", *best[3]]
