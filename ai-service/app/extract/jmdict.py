"""Tra nghĩa tiếng Anh từ JMdict (SQLite dựng bởi scripts/build_dicts.py).

File jmdict.sqlite không commit; thiếu file → lookup trả None, health báo jmdict=false.
"""
from __future__ import annotations

import sqlite3
import threading
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app.extract.jachars import hira_to_kata, kata_to_hira

DATA_FILE = Path(__file__).parent / "data" / "jmdict.sqlite"
_conn: sqlite3.Connection | None = None
_lock = threading.Lock()
_SELECT = "SELECT kanji,kana,gloss,common,jlpt FROM entries WHERE "
# Ưu tiên entry phổ biến; khi tra theo kana ưu tiên từ thường viết bằng kana (kanji IS NULL)
_ORDER = " ORDER BY common DESC, (kanji IS NULL) DESC LIMIT 1"


def _connect() -> sqlite3.Connection | None:
    global _conn
    if _conn is None and DATA_FILE.exists():
        # check_same_thread=False vì endpoint sync chạy trên threadpool; truy vấn được khoá bằng _lock
        _conn = sqlite3.connect(f"file:{DATA_FILE.as_posix()}?mode=ro", uri=True, check_same_thread=False)
    return _conn


def available() -> bool:
    return _connect() is not None


def _query(where: str, params: tuple) -> Optional[tuple]:
    conn = _connect()
    if conn is None:
        return None
    with _lock:
        return conn.execute(_SELECT + where + _ORDER, params).fetchone()


@lru_cache(maxsize=8192)
def lookup(lemma: str, reading: Optional[str] = None) -> Optional[dict]:
    """Thử (kanji, kana) → kanji → kana. Ưu tiên entry `common`."""
    row = None
    readings = {kata_to_hira(reading), hira_to_kata(reading)} if reading else set()
    for r in readings:
        row = _query("kanji=? AND kana=?", (lemma, r))
        if row:
            break
    if not row:
        row = _query("kanji=?", (lemma,))
    if not row:
        for r in {lemma, hira_to_kata(lemma), kata_to_hira(lemma)}:
            row = _query("kana=?", (r,))
            if row:
                break
    if not row:
        for r in readings:
            row = _query("kana=?", (r,))
            if row:
                break
    if not row:
        return None
    return {"kanji": row[0], "kana": row[1], "gloss": row[2], "common": bool(row[3]), "jlpt": row[4]}
