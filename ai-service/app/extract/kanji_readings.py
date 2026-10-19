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


# ----------------------------------------------------------------------------- tách on / kun (thẻ chữ Hán, đồ thị Hán-Việt)

_raw_table: dict[str, str] | None = None


def _load_raw() -> dict[str, str]:
    """Trường kJapanese nguyên văn ("ガク カク まなぶ おしえる"): _load() đã đổi hết sang hiragana nên mất dấu vết
    on (katakana) / kun (hiragana); đọc lại file một lần nữa thay vì sửa _load() để không đụng furigana."""
    global _raw_table
    if _raw_table is None:
        table: dict[str, str] = {}
        if DATA_FILE.exists():
            with open(DATA_FILE, encoding="utf-8", newline="") as fh:
                for row in csv.DictReader(fh):
                    ch, raw = (row.get("char") or "").strip(), (row.get("readings") or "").strip()
                    if ch and raw:
                        table[ch] = raw
        _raw_table = table
    return _raw_table


def _is_katakana(ch: str) -> bool:
    return 0x30A1 <= ord(ch) <= 0x30FA or ch == "ー"


def readings_split(ch: str) -> dict[str, list[dict]]:
    """Cách đọc tách on / kun theo bảng chữ Unihan dùng: on ghi katakana, kun ghi hiragana.

    on:  [{"reading": "ガク", "hiragana": "がく"}, …]            — giữ katakana để hiển thị, kèm hiragana để so khớp
    kun: [{"reading": "まなぶ", "hiragana": "まなぶ", "okurigana": ""}, …]
         Unihan gốc có thể đánh dấu okurigana bằng '.' ("まな.ぶ"): cắt sau dấu chấm → reading là phần gốc,
         okurigana giữ riêng; dữ liệu đã dựng hiện không có dấu này nên okurigana thường rỗng.
    Giữ thứ tự Unihan (cách đọc chính trước), bỏ trùng; không có dữ liệu → {"on": [], "kun": []}.
    readings() cũ giữ nguyên cho furigana."""
    on: list[dict] = []
    kun: list[dict] = []
    for tok in _load_raw().get(ch, "").split():
        if _is_katakana(tok[0]):
            item = {"reading": tok, "hiragana": kata_to_hira(tok)}
            if item not in on:
                on.append(item)
        else:
            stem, _, okurigana = tok.partition(".")
            if not stem:
                continue
            item = {"reading": stem, "hiragana": kata_to_hira(stem), "okurigana": okurigana}
            if item not in kun:
                kun.append(item)
    return {"on": on, "kun": kun}
