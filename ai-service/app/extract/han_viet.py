"""Âm Hán-Việt theo Unihan kVietnamese (UC-10). Dữ liệu: data/unihan_vietnamese.csv."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from app.extract.jachars import is_kanji

DATA_FILE = Path(__file__).parent / "data" / "unihan_vietnamese.csv"
# Unihan kVietnamese thiếu nhiều chữ thông dụng (酒, 薬, 郵…) và ghi âm Nôm trước / thay cho âm Hán-Việt ở rất nhiều
# chữ (予 nhừ, 猫 mèo, 角 góc, 冷 lạnh…) → bảng sửa tay phủ mọi chữ Hán trong từ vựng JLPT N5–N1, ưu tiên hơn Unihan.
# Dòng có ``reading`` rỗng = chữ không có âm Hán-Việt (quốc tự 畑 mà Unihan ghi âm Nôm) → xoá giá trị Unihan.
OVERRIDE_FILE = Path(__file__).parent / "data" / "han_viet_overrides.csv"
_table: dict[str, str] | None = None


def _read_csv(path: Path, table: dict[str, str], allow_remove: bool = False) -> None:
    if not path.exists():
        return
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch, reading = (row.get("char") or "").strip(), (row.get("reading") or "").strip()
            if ch and reading:
                table[ch] = reading.upper()
            elif ch and allow_remove:
                table.pop(ch, None)


def _load() -> dict[str, str]:
    global _table
    if _table is None:
        table: dict[str, str] = {}
        _read_csv(DATA_FILE, table)
        _read_csv(OVERRIDE_FILE, table, allow_remove=True)
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
