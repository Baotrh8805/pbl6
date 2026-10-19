"""Gán cấp JLPT cho một từ (plan §4.8).

Nguồn 1: 5 file CSV data/jlpt/n5..n1.csv (expression,reading,meaning,tags).
  Tra (expression, reading) → expression → reading (chỉ khi từ toàn kana).
  Nhiều cấp → chọn cấp dễ nhất, confidence = 1/số cấp, sources liệt kê hết.
  Vài từ lõi N5 mà danh sách xếp cao / bỏ sót (日本, 日本語, 日本人) được sửa tay lúc nạp (_LEVEL_FIXES).
Nguồn 2 (fallback): wordfreq zipf_frequency(lemma, 'ja') → N4/N3/N2/N1, confidence 0.4.
Không có → (None, 0.0, []).
"""
from __future__ import annotations

import csv
import math
import threading
from collections import defaultdict
from pathlib import Path
from typing import Optional

from app.extract.jachars import is_kanji, kata_to_hira

LEVELS = ["N5", "N4", "N3", "N2", "N1"]  # dễ → khó
DATA_DIR = Path(__file__).parent.parent / "data" / "jlpt"

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


def _read_rows() -> dict[str, list[tuple[str, str, str]]]:
    """Cấp → các dòng (expression, reading hiragana, meaning) theo thứ tự CSV, đã áp _LEVEL_FIXES: dòng CSV của một cặp
    được sửa bị bỏ, mục sửa đứng đầu cấp mới (dùng nghĩa CSV của cặp đó nếu có). Không có file CSV nào → bảng rỗng, kể
    cả mục sửa (để available() vẫn báo thiếu dữ liệu)."""
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
                expr = _clean(row.get("expression", ""))
                reading = kata_to_hira(_clean(row.get("reading", "")))
                if not expr:
                    continue
                meaning = (row.get("meaning") or "").strip()
                if (expr, reading) in _LEVEL_FIXES:
                    if meaning:
                        fixed_meaning.setdefault((expr, reading), meaning)
                    continue
                rows[level].append((expr, reading, meaning))
    if found:
        for level in LEVELS:
            fixes = [(expr, reading, fixed_meaning.get((expr, reading)) or meaning)
                     for (expr, reading), (lv, meaning) in _LEVEL_FIXES.items() if lv == level]
            rows[level] = fixes + rows[level]
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
