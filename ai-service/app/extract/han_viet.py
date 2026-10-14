"""Âm Hán-Việt theo Unihan kVietnamese (UC-10). Dữ liệu: data/unihan_vietnamese.csv."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from app.extract.jachars import is_kanji

DATA_FILE = Path(__file__).parent / "data" / "unihan_vietnamese.csv"
# Unihan thiếu / xếp âm Nôm trước ở nhiều chữ thông dụng (電, 食, 校…) → bảng sửa tay, ưu tiên hơn Unihan
OVERRIDE_FILE = Path(__file__).parent / "data" / "han_viet_overrides.csv"
_table: dict[str, str] | None = None


def _read_csv(path: Path, table: dict[str, str]) -> None:
    if not path.exists():
        return
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch, reading = (row.get("char") or "").strip(), (row.get("reading") or "").strip()
            if ch and reading:
                table[ch] = reading.upper()


def _load() -> dict[str, str]:
    global _table
    if _table is None:
        table: dict[str, str] = {}
        _read_csv(DATA_FILE, table)
        _read_csv(OVERRIDE_FILE, table)
        _table = table
    return _table


def available() -> bool:
    return bool(_load())


def han_viet(term: str) -> Optional[str]:
    """Ghép âm Hán-Việt của từng kanji theo thứ tự, viết hoa, cách bằng khoảng trắng.
    Chữ không có trong bảng thì bỏ qua; không có chữ nào → None."""
    table = _load()
    prev = None
    parts = []
    for ch in term:
        if not is_kanji(ch):
            continue
        key = prev if ch == "々" and prev else ch  # 々 lặp âm chữ trước
        r = table.get(key)
        if r:
            parts.append(r)
        prev = ch
    return " ".join(parts) if parts else None
