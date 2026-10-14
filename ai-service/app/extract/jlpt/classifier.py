"""Gán cấp JLPT cho một từ (plan §4.8).

Nguồn 1: 5 file CSV data/jlpt/n5..n1.csv (expression,reading,meaning,tags).
  Tra (expression, reading) → expression → reading (chỉ khi từ toàn kana).
  Nhiều cấp → chọn cấp dễ nhất, confidence = 1/số cấp, sources liệt kê hết.
Nguồn 2 (fallback): wordfreq zipf_frequency(lemma, 'ja') → N4/N3/N2/N1, confidence 0.4.
Không có → (None, 0.0, []).
"""
from __future__ import annotations

import csv
import math
from collections import defaultdict
from pathlib import Path
from typing import Optional

from app.extract.jachars import kata_to_hira

LEVELS = ["N5", "N4", "N3", "N2", "N1"]  # dễ → khó
DATA_DIR = Path(__file__).parent.parent / "data" / "jlpt"

_by_pair: dict[tuple[str, str], set[str]] | None = None
_by_expr: dict[str, set[str]] = {}
_by_reading: dict[str, set[str]] = {}
_meaning: dict[str, str] = {}


def level_index(level: Optional[str]) -> int:
    """Chỉ số độ khó (N5=0 … N1=4); None → 5 (xếp sau cùng)."""
    return LEVELS.index(level) if level in LEVELS else len(LEVELS)


def _clean(s: str) -> str:
    return s.strip().replace("～", "").replace("〜", "")


def _load() -> None:
    global _by_pair
    if _by_pair is not None:
        return
    by_pair: dict[tuple[str, str], set[str]] = defaultdict(set)
    for level in LEVELS:
        path = DATA_DIR / f"{level.lower()}.csv"
        if not path.exists():
            continue
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                expr = _clean(row.get("expression", ""))
                reading = kata_to_hira(_clean(row.get("reading", "")))
                if not expr:
                    continue
                by_pair[(expr, reading)].add(level)
                _by_expr.setdefault(expr, set()).add(level)
                if reading:
                    _by_reading.setdefault(reading, set()).add(level)
                meaning = (row.get("meaning") or "").strip()
                if meaning:
                    _meaning.setdefault(expr, meaning)
                    if reading:
                        _meaning.setdefault(reading, meaning)
    _by_pair = dict(by_pair)


def available() -> bool:
    _load()
    return bool(_by_expr)


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
