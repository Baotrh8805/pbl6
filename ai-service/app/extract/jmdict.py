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
    out = {"kanji": row[0], "kana": row[1], "gloss": row[2], "common": bool(row[3]), "jlpt": row[4]}
    from app.extract import overrides  # noqa: PLC0415 (ghi đè gloss của admin, D22)
    if overrides.count():
        from app.extract import dictionary  # noqa: PLC0415
        key = dictionary.key_for(row[0] or row[1], row[1])
        gloss = overrides.word(key, "meaning_en") if key else None
        if gloss:
            out["gloss"] = gloss
    return out


# ----------------------------------------------------------------------------- distractors (C3 đồng âm)

def homophones(reading: str, exclude_kanji: Optional[str] = None, limit: int = 10) -> list[tuple[str, str, bool]]:
    """Từ viết bằng kanji đọc đúng là ``reading`` (trừ ``exclude_kanji``) → [(kanji, gloss, common)],
    phổ biến trước rồi theo mã kanji; mỗi kanji một lần. Thiếu sqlite / không có cách đọc → [].

    Thử cả hiragana lẫn katakana vì Sudachi trả katakana còn JMdict ghi từ ngoại lai bằng katakana."""
    conn = _connect()
    if conn is None or not reading:
        return []
    forms = tuple(dict.fromkeys((kata_to_hira(reading), hira_to_kata(reading))))
    sql = ("SELECT kanji, gloss, common FROM entries WHERE kana IN (%s) AND kanji IS NOT NULL AND kanji<>? "
           "ORDER BY common DESC, kanji" % ",".join("?" * len(forms)))
    with _lock:
        rows = conn.execute(sql, (*forms, exclude_kanji or "")).fetchall()
    out: list[tuple[str, str, bool]] = []
    seen: set[str] = set()
    for kanji, gloss, common in rows:
        if kanji in seen:
            continue
        seen.add(kanji)
        out.append((kanji, gloss or "", bool(common)))
        if len(out) >= limit:
            break
    return out


def readings_of(kanji: str) -> list[str]:
    """Mọi cách đọc kana của ``kanji`` trong JMdict, cách đọc của entry phổ biến trước; thiếu sqlite → []."""
    conn = _connect()
    if conn is None or not kanji:
        return []
    with _lock:
        rows = conn.execute("SELECT kana, MAX(common) AS c FROM entries WHERE kanji=? GROUP BY kana ORDER BY c DESC, kana",
                            (kanji,)).fetchall()
    return [r[0] for r in rows]
