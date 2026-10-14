"""Tải và dựng dữ liệu từ điển cho app/extract.

Chạy:  venv/Scripts/python.exe scripts/build_dicts.py [--only jlpt|unihan|jmdict]

Tạo ra:
  app/extract/data/jlpt/n1..n5.csv        (commit)
  app/extract/data/unihan_vietnamese.csv  (commit)
  app/extract/data/unihan_japanese.csv    (commit; kJapanese = cách đọc on/kun từng kanji, dùng tách furigana)
  app/extract/data/jmdict.sqlite          (KHÔNG commit, ~30 MB)

Dữ liệu tải về là dữ liệu không tin cậy: chỉ ghi vào thư mục tạm mới,
chỉ parse bằng json/zipfile/csv của stdlib, không bao giờ exec.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sqlite3
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "extract" / "data"
JLPT_DIR = DATA_DIR / "jlpt"
CACHE_DIR = ROOT / "scripts" / ".download_cache"  # trong .gitignore

JLPT_URL = "https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n{n}.csv"
UNIHAN_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"
JMDICT_RELEASE_API = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"


USER_AGENT = "pbl6-build-dicts/1.0"


def _download(url: str, dest: Path) -> Path:
    """Tải về file (cache theo tên) để chạy lại không tốn băng thông."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cache: {dest.name}")
        return dest
    print(f"  GET {url}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
    return dest


def build_jlpt() -> None:
    print("[jlpt]")
    JLPT_DIR.mkdir(parents=True, exist_ok=True)
    for n in range(1, 6):
        src = _download(JLPT_URL.format(n=n), CACHE_DIR / f"jlpt_n{n}.csv")
        raw = src.read_text(encoding="utf-8")
        rows = list(csv.reader(io.StringIO(raw)))
        # Chuẩn hoá: luôn có header expression,reading,meaning,tags
        out = JLPT_DIR / f"n{n}.csv"
        with open(out, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["expression", "reading", "meaning", "tags"])
            for r in rows:
                if not r or r[0] == "expression":
                    continue
                r = (r + ["", "", "", ""])[:4]
                w.writerow(r)
        print(f"  {out.name}: {len(rows)} rows")


def build_unihan() -> None:
    print("[unihan]")
    zpath = _download(UNIHAN_URL, CACHE_DIR / "Unihan.zip")
    viet: dict[str, str] = {}
    ja: list[tuple[str, str]] = []
    variants: dict[str, list[str]] = {}
    with zipfile.ZipFile(zpath) as zf:
        with zf.open("Unihan_Readings.txt") as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8"):
                if line.startswith("#") or "\t" not in line:
                    continue
                code, field, value = line.rstrip("\n").split("\t", 2)
                if field == "kVietnamese":
                    viet[chr(int(code[2:], 16))] = value.split()[0]  # nhiều âm → giữ âm đầu
                elif field == "kJapanese" and 0x4E00 <= int(code[2:], 16) <= 0x9FFF:
                    # Chỉ khối CJK thống nhất (đủ cho tiếng Nhật) để file nhỏ; "ベン メン つとめる": on katakana, kun hiragana
                    ja.append((chr(int(code[2:], 16)), value))
        # Chữ Nhật (shinjitai) thường không có kVietnamese → mượn âm của biến thể phồn thể / đồng nghĩa
        with zf.open("Unihan_Variants.txt") as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8"):
                if line.startswith("#") or "\t" not in line:
                    continue
                code, field, value = line.rstrip("\n").split("\t", 2)
                if field in ("kTraditionalVariant", "kSemanticVariant", "kZVariant", "kSpecializedSemanticVariant"):
                    ch = chr(int(code[2:], 16))
                    for v in value.split():
                        cp = v.split("<", 1)[0]
                        if cp.startswith("U+"):
                            variants.setdefault(ch, []).append(chr(int(cp[2:], 16)))
    borrowed = 0
    for ch, alts in variants.items():
        if ch in viet:
            continue
        for alt in alts:
            if alt in viet:
                viet[ch] = viet[alt]
                borrowed += 1
                break
    with open(DATA_DIR / "unihan_vietnamese.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["char", "reading"])
        w.writerows(sorted(viet.items()))
    print(f"  kVietnamese mượn từ biến thể: {borrowed} chữ")
    with open(DATA_DIR / "unihan_japanese.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["char", "readings"])
        w.writerows(ja)
    print(f"  unihan_vietnamese.csv: {len(viet)} chars; unihan_japanese.csv: {len(ja)} chars")


def _latest_jmdict_asset() -> tuple[str, str]:
    req = urllib.request.Request(JMDICT_RELEASE_API, headers={"User-Agent": USER_AGENT,
                                                            "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        release = json.load(resp)
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if name.startswith("jmdict-eng-common") and name.endswith(".json.zip"):
            return name, asset["browser_download_url"]
    raise SystemExit("Không tìm thấy asset jmdict-eng-common*.json.zip trong release mới nhất")


def _gloss_of(sense_list: list) -> str:
    parts = []
    for sense in sense_list[:2]:
        glosses = [g.get("text", "") for g in sense.get("gloss", []) if g.get("lang", "eng") == "eng"]
        glosses = [g for g in glosses if g][:2]
        if glosses:
            parts.append(", ".join(glosses))
    return "; ".join(parts)


def build_jmdict() -> None:
    print("[jmdict]")
    name, url = _latest_jmdict_asset()
    zpath = _download(url, CACHE_DIR / name)
    out = DATA_DIR / "jmdict.sqlite"
    if out.exists():
        out.unlink()
    con = sqlite3.connect(out)
    con.execute("CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT)")
    rows = []
    with zipfile.ZipFile(zpath) as zf:
        inner = [n for n in zf.namelist() if n.endswith(".json")][0]
        with zf.open(inner) as raw:
            data = json.load(raw)
    for word in data["words"]:
        gloss = _gloss_of(word.get("sense", []))
        if not gloss:
            continue
        kanjis = word.get("kanji", [])
        kanas = word.get("kana", [])
        common = int(any(k.get("common") for k in kanjis + kanas))
        if kanjis:
            for k in kanjis:
                # Chỉ ghép kana áp dụng cho kanji đó (appliesToKanji = ["*"] hoặc danh sách)
                for r in kanas:
                    applies = r.get("appliesToKanji", ["*"])
                    if "*" in applies or k["text"] in applies:
                        rows.append((k["text"], r["text"], gloss, common, None))
        else:
            for r in kanas:
                rows.append((None, r["text"], gloss, common, None))
    con.executemany("INSERT INTO entries VALUES (?,?,?,?,?)", rows)
    con.execute("CREATE INDEX idx_entries_kanji_kana ON entries(kanji, kana)")
    con.execute("CREATE INDEX idx_entries_kana ON entries(kana)")
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"  jmdict.sqlite: {len(rows)} rows, {out.stat().st_size // 1024} KB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["jlpt", "unihan", "jmdict"])
    args = ap.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if args.only in (None, "jlpt"):
        build_jlpt()
    if args.only in (None, "unihan"):
        build_unihan()
    if args.only in (None, "jmdict"):
        build_jmdict()
    print("done")


if __name__ == "__main__":
    main()
