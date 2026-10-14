"""Cách đọc on/kun của từng kanji (Unihan kJapanese) — dùng để tách furigana trong run nhiều kanji."""
from __future__ import annotations

import csv
from pathlib import Path

from app.extract.jachars import kata_to_hira

DATA_FILE = Path(__file__).parent / "data" / "unihan_japanese.csv"
_table: dict[str, tuple[str, ...]] | None = None


def _load() -> dict[str, tuple[str, ...]]:
    global _table
    if _table is None:
        table: dict[str, tuple[str, ...]] = {}
        if DATA_FILE.exists():
            with open(DATA_FILE, encoding="utf-8", newline="") as fh:
                for row in csv.DictReader(fh):
                    ch = row.get("char", "")
                    readings = tuple(dict.fromkeys(kata_to_hira(r) for r in (row.get("readings") or "").split() if r))
                    if ch and readings:
                        table[ch] = readings
        _table = table
    return _table


def readings(ch: str) -> tuple[str, ...]:
    """Các cách đọc hiragana (on trước, kun sau; kun kèm okurigana, vd "つとめる")."""
    return _load().get(ch, ())
