"""Thêm cột entry_key cho các file nghĩa tiếng Việt dịch sẵn (spec 2026-10-26-tu-dien-design §4.3, kế hoạch A3).

Chạy (sau khi đã dựng jmdict.sqlite mới bằng build_dicts.py --only jmdict):
    venv/Scripts/python.exe -I scripts/map_dict_vi_keys.py [đường dẫn CSV ...]
Mặc định map hai file trong backend-core/src/main/resources/dict/: jlpt_meaning_vi.csv, jmdict_common_meaning_vi.csv.

Khoá: "w:<id JMdict>" khi (dạng viết, cách đọc) có trong word_forms; nhiều mục cùng dạng → ưu tiên mục có gloss_short trùng cột
meaning_en (file JMdict common lấy gloss đúng từ đó), rồi mục phổ biến. Không khớp → "w:jlpt:<dạng viết>|<cách đọc>" (cắt 24 ký tự
mỗi phần như regex khoá của backend). Ghi đè file tại chỗ (giữ thứ tự cột, thêm entry_key vào đầu). Chỉ dùng stdlib.
"""
from __future__ import annotations

import csv
import io
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "app" / "extract" / "data" / "jmdict.sqlite"
DICT_DIR = ROOT.parent / "backend-core" / "src" / "main" / "resources" / "dict"
DEFAULT_FILES = [DICT_DIR / "jlpt_meaning_vi.csv", DICT_DIR / "jmdict_common_meaning_vi.csv"]
_STRIP_RE = re.compile(r"[～〜\s]|\(.*?\)|（.*?）")
_SPLIT_RE = re.compile(r"[;；、,]")


def to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s or "")


def candidates(cell: str) -> list[str]:
    out = []
    for part in _SPLIT_RE.split(cell or ""):
        p = _STRIP_RE.sub("", part)
        if p and p not in out:
            out.append(p)
    return out


def find_key(con: sqlite3.Connection, expression: str, reading: str, gloss: str) -> str | None:
    readings = [to_hira(r) for r in candidates(reading)]
    for form in candidates(expression):
        rows = con.execute("SELECT DISTINCT f.word_id, w.gloss_short, w.common FROM word_forms f JOIN words w "
                           "ON w.id = f.word_id WHERE f.form = ?", (form,)).fetchall()
        if not rows:
            continue
        kana = {wid: {to_hira(k) for (k,) in con.execute(
            "SELECT form FROM word_forms WHERE word_id = ? AND is_kana = 1", (wid,))} for wid, _, _ in rows}

        def reads_ok(wid: str) -> bool:
            return not readings or bool(kana[wid] & set(readings)) or form in kana[wid]

        def score(r):
            wid, gs, common = r
            return (not reads_ok(wid), not (gloss and gs == gloss), not common, int(wid))
        best = min(rows, key=score)
        if not reads_ok(best[0]):
            # dạng viết có trong JMdict nhưng không mục nào đọc như vậy → không ép sai mục
            continue
        return f"w:{best[0]}"
    return None


def fallback_key(expression: str, reading: str) -> str:
    e = (candidates(expression) or [expression.strip() or "?"])[0][:24].replace("|", "")
    r = (candidates(reading) or [""])[0][:24].replace("|", "")
    return f"w:jlpt:{e}|{r}"


def map_file(con: sqlite3.Connection, path: Path) -> tuple[int, int]:
    rows = list(csv.DictReader(io.open(path, encoding="utf-8", newline="")))
    if not rows:
        return 0, 0
    fields = [f for f in rows[0].keys() if f != "entry_key"]
    hit = 0
    for r in rows:
        key = find_key(con, r["expression"], r.get("reading", ""), r.get("meaning_en", ""))
        if key:
            hit += 1
        r["entry_key"] = key or fallback_key(r["expression"], r.get("reading", ""))
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["entry_key", *fields], lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return hit, len(rows)


def main(argv: list[str]) -> None:
    if not DB.exists():
        raise SystemExit(f"Thiếu {DB}: chạy scripts/build_dicts.py --only jmdict trước")
    con = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    if con.execute("SELECT 1 FROM sqlite_master WHERE name='word_forms'").fetchone() is None:
        raise SystemExit("jmdict.sqlite là bản cũ (không có word_forms): dựng lại bằng build_dicts.py --only jmdict")
    for p in [Path(a) for a in argv] or DEFAULT_FILES:
        hit, total = map_file(con, p)
        print(f"{p.name}: {hit}/{total} dòng khớp JMdict, {total - hit} dùng khoá w:jlpt:")
    con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
