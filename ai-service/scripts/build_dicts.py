"""Tải và dựng dữ liệu từ điển cho app/extract.

Chạy:  venv/Scripts/python.exe scripts/build_dicts.py [--only jlpt|unihan|unihan_rs|unihan_def|jmdict|kanjivg|kanji_parts|kradfile|pitch]

Tạo ra:
  app/extract/data/jlpt/n1..n5.csv        (commit)
  app/extract/data/unihan_vietnamese.csv  (commit)
  app/extract/data/unihan_japanese.csv    (commit; kJapanese = cách đọc on/kun từng kanji, dùng tách furigana)
  app/extract/data/unihan_rs.csv          (commit; kRSUnicode/kTotalStrokes = bộ thủ + số nét, ~21k chữ, ~250 KB)
  app/extract/data/unihan_definitions.csv (commit; kDefinition = nghĩa EN của từng chữ, chữ JIS có âm Nhật, ~280 KB)
  app/extract/data/jmdict.sqlite          (KHÔNG commit; JMdict đầy đủ + ví dụ Tatoeba, xem write_jmdict)
  app/extract/data/kanji_strokes.json     (KHÔNG commit; nét viết KanjiVG 32 điểm/nét, chỉ kanji trong từ vựng JLPT)
  app/extract/data/kanji_parts.csv        (commit; cây phân rã KanjiVG: con trực tiếp, vị trí, bộ, thành phần chỉ âm kvg:phon,
                                           mọi chữ trong zip, ~6 700 dòng ~250 KB — sơ đồ chữ Hán /graph, spec 2026-10-30)
  app/extract/data/kradfile.csv           (commit từ 10/2026; thành phần cấu tạo kanji theo KRADFILE của EDRDG)
  app/extract/data/pitch_accent.csv       (KHÔNG commit; trọng âm kanjium, chỉ từ vựng JLPT)

Dữ liệu tải về là dữ liệu không tin cậy: chỉ ghi vào thư mục tạm mới,
chỉ parse bằng json/zipfile/csv/regex của stdlib, không bao giờ exec.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
import os
import re
import sqlite3
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "extract" / "data"
JLPT_DIR = DATA_DIR / "jlpt"
CACHE_DIR = ROOT / "scripts" / ".download_cache"  # trong .gitignore

JLPT_URL = "https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n{n}.csv"
UNIHAN_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"
JMDICT_RELEASE_API = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
KANJIVG_RELEASE_API = "https://api.github.com/repos/KanjiVG/kanjivg/releases/latest"
KANJIVG_BRANCH_URL = "https://github.com/KanjiVG/kanjivg/archive/refs/heads/master.zip"  # dự phòng khi API lỗi
# EDRDG: ftp.edrdg.org không có chứng chỉ https hợp lệ; cùng thư mục được phục vụ qua https tại www.edrdg.org
KRADFILE_INFO_URL = "https://www.edrdg.org/krad/kradinf.html"
KRADFILE_DIR_URL = "https://www.edrdg.org/pub/Nihongo/"
KRADFILE_URLS = (KRADFILE_DIR_URL + "kradfile-u.gz", KRADFILE_DIR_URL + "kradfile.gz")  # kradfile-u = bản UTF-8 đầy đủ
PITCH_URL = "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt"


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


def _latest_jmdict_assets() -> dict[str, tuple[str, str]]:
    """Asset jmdict-*.json.zip của release mới nhất: {"examples" | "eng" | "common": (tên, url)}."""
    req = urllib.request.Request(JMDICT_RELEASE_API, headers={"User-Agent": USER_AGENT,
                                                            "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        release = json.load(resp)
    out: dict[str, tuple[str, str]] = {}
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if not name.endswith(".json.zip"):
            continue
        for key, prefix in (("examples", "jmdict-examples-eng-"), ("common", "jmdict-eng-common-"), ("eng", "jmdict-eng-")):
            if name.startswith(prefix) and key not in out:
                out[key] = (name, asset["browser_download_url"])
                break
    if not out:
        raise SystemExit("Không tìm thấy asset jmdict-*.json.zip trong release mới nhất")
    return out


def _gloss_of(sense_list: list) -> str:
    parts = []
    for sense in sense_list[:2]:
        glosses = [g.get("text", "") for g in sense.get("gloss", []) if g.get("lang", "eng") == "eng"]
        glosses = [g for g in glosses if g][:2]
        if glosses:
            parts.append(", ".join(glosses))
    return "; ".join(parts)


def _to_hira(s: str) -> str:
    """Katakana → hiragana (chép từ jachars vì script chạy với -I)."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s or "")


_JLPT_STRIP_RE = re.compile(r"[～〜\s]")
_JLPT_SPLIT_RE = re.compile(r"[;；、,]")
_JLPT_ORDER = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}


def _jlpt_index(jlpt_dir: Path) -> dict[tuple[str, str], str]:
    """(dạng viết, cách đọc hiragana) → cấp JLPT dễ nhất. Biến thể "足; 脚" tách ra; thiếu CSV → {}."""
    idx: dict[tuple[str, str], str] = {}
    for n in (5, 4, 3, 2, 1):
        path = jlpt_dir / f"n{n}.csv"
        if not path.exists():
            continue
        level = f"N{n}"
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                readings = [_to_hira(_JLPT_STRIP_RE.sub("", r)) for r in _JLPT_SPLIT_RE.split(row.get("reading") or "")]
                for expr in _JLPT_SPLIT_RE.split(row.get("expression") or ""):
                    expr = _JLPT_STRIP_RE.sub("", expr)
                    if not expr:
                        continue
                    for rd in readings or [""]:
                        key = (expr, rd)
                        if key not in idx or _JLPT_ORDER[level] < _JLPT_ORDER[idx[key]]:
                            idx[key] = level
    return idx


def _sense_json(sense: dict) -> dict:
    return {
        "pos": sense.get("partOfSpeech", []),
        "misc": sense.get("misc", []),
        "field": sense.get("field", []),
        "dialect": sense.get("dialect", []),
        "info": sense.get("info", []),
        "gloss": [g.get("text", "") for g in sense.get("gloss", []) if g.get("lang", "eng") == "eng" and g.get("text")],
        "appliesToKanji": sense.get("appliesToKanji", ["*"]),
        "appliesToKana": sense.get("appliesToKana", ["*"]),
    }


def _has_fts5(con: sqlite3.Connection) -> bool:
    try:
        con.execute("CREATE VIRTUAL TABLE temp._fts_probe USING fts5(x)")
        con.execute("DROP TABLE temp._fts_probe")
        return True
    except sqlite3.OperationalError:
        return False


def _kana_for(kanji_text: str, kanas: list) -> str | None:
    for r in kanas:
        applies = r.get("appliesToKanji", ["*"])
        if "*" in applies or kanji_text in applies:
            return r["text"]
    return None


def write_jmdict(data: dict, out: Path, jlpt_index: dict[tuple[str, str], str] | None = None,
                 scope: str = "full", fts: bool | None = None) -> dict[str, int]:
    """Dựng jmdict.sqlite từ JSON jmdict-simplified đã parse (hàm theo file, test được không cần mạng).

    `entries` (schema / nội dung như trước: mọi cặp kanji–kana của mục có cờ common) giữ cho bóc tách, đồng âm, đồ thị
    Hán-Việt. Bảng cho từ điển (spec 2026-10-26-tu-dien-design §4.1): words, word_forms, word_gloss_fts (hoặc word_gloss khi
    sqlite không có FTS5), examples (Tatoeba), tags, meta. scope="compact": chỉ mục common, thuộc JLPT hoặc có ví dụ.
    """
    jlpt_index = jlpt_index or {}
    if out.exists():
        out.unlink()
    con = sqlite3.connect(out)
    if fts is None:
        fts = _has_fts5(con)
    con.executescript("""
        CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT);
        CREATE TABLE words (id TEXT PRIMARY KEY, forms TEXT NOT NULL, senses TEXT NOT NULL, common INTEGER NOT NULL,
                            jlpt TEXT, head_kanji TEXT, head_kana TEXT, gloss_short TEXT, n_examples INTEGER NOT NULL);
        CREATE TABLE word_forms (form TEXT NOT NULL, word_id TEXT NOT NULL, is_kana INTEGER NOT NULL,
                                 common INTEGER NOT NULL, reading TEXT);
        CREATE TABLE examples (id INTEGER PRIMARY KEY, word_id TEXT NOT NULL, sense_idx INTEGER NOT NULL,
                               tatoeba_id TEXT, form TEXT, jpn TEXT NOT NULL, eng TEXT);
        CREATE TABLE tags (code TEXT PRIMARY KEY, label TEXT);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    """)
    if fts:
        con.execute("CREATE VIRTUAL TABLE word_gloss_fts USING fts5(gloss, word_id UNINDEXED, tokenize='porter unicode61')")
    else:
        con.execute("CREATE TABLE word_gloss (word_id TEXT NOT NULL, gloss TEXT NOT NULL)")
    entries, words, forms, glosses, examples = [], [], [], [], []
    for word in data.get("words", []):
        senses = word.get("sense", [])
        gloss = _gloss_of(senses)
        if not gloss:
            continue
        kanjis = word.get("kanji", [])
        kanas = word.get("kana", [])
        common = int(any(k.get("common") for k in kanjis + kanas))
        wid = str(word.get("id"))
        n_ex = sum(len(s.get("examples") or []) for s in senses)
        if kanjis:
            pairs = [(k["text"], r["text"]) for k in kanjis for r in kanas
                     if "*" in r.get("appliesToKanji", ["*"]) or k["text"] in r.get("appliesToKanji", [])]
        else:
            pairs = [(None, r["text"]) for r in kanas]
        level = None
        for kt, rt in pairs:
            lv = jlpt_index.get((kt or rt, _to_hira(rt)))
            if lv and (level is None or _JLPT_ORDER[lv] < _JLPT_ORDER[level]):
                level = lv
        if common:
            entries.extend((kt, rt, gloss, common, None) for kt, rt in pairs)
        if scope == "compact" and not (common or level or n_ex):
            continue
        head_kanji = next((k["text"] for k in kanjis if k.get("common")), kanjis[0]["text"] if kanjis else None)
        head_kana = (_kana_for(head_kanji, kanas) if head_kanji else None) or (kanas[0]["text"] if kanas else None)
        form_list = [{"text": k["text"], "kana": False, "common": bool(k.get("common")), "tags": k.get("tags", [])}
                     for k in kanjis]
        form_list += [{"text": r["text"], "kana": True, "common": bool(r.get("common")), "tags": r.get("tags", []),
                       "appliesToKanji": r.get("appliesToKanji", ["*"])} for r in kanas]
        words.append((wid, json.dumps(form_list, ensure_ascii=False),
                      json.dumps([_sense_json(s) for s in senses], ensure_ascii=False),
                      common, level, head_kanji, head_kana, gloss, n_ex))
        for k in kanjis:
            forms.append((k["text"], wid, 0, int(bool(k.get("common"))), _kana_for(k["text"], kanas) or head_kana))
        for r in kanas:
            forms.append((r["text"], wid, 1, int(bool(r.get("common"))), r["text"]))
            hira = _to_hira(r["text"])
            if hira != r["text"]:
                forms.append((hira, wid, 1, int(bool(r.get("common"))), r["text"]))
        all_gloss = "; ".join(x.get("text", "") for s in senses for x in s.get("gloss", [])
                              if x.get("lang", "eng") == "eng" and x.get("text"))
        glosses.append((all_gloss, wid))
        for si, s in enumerate(senses):
            for ex in s.get("examples") or []:
                sents = {x.get("lang"): x.get("text") for x in ex.get("sentences", [])}
                if not sents.get("jpn"):
                    continue
                src = ex.get("source") or {}
                examples.append((wid, si, str(src.get("value") or ""), ex.get("text"), sents["jpn"], sents.get("eng")))
    con.executemany("INSERT INTO entries VALUES (?,?,?,?,?)", entries)
    con.executemany("INSERT INTO words VALUES (?,?,?,?,?,?,?,?,?)", words)
    con.executemany("INSERT INTO word_forms VALUES (?,?,?,?,?)", forms)
    table = "word_gloss_fts" if fts else "word_gloss"
    con.executemany(f"INSERT INTO {table}(gloss, word_id) VALUES (?,?)", glosses)
    con.executemany("INSERT INTO examples(word_id, sense_idx, tatoeba_id, form, jpn, eng) VALUES (?,?,?,?,?,?)", examples)
    con.executemany("INSERT INTO tags VALUES (?,?)", list((data.get("tags") or {}).items()))
    con.executemany("INSERT INTO meta VALUES (?,?)", [("dictDate", str(data.get("dictDate", ""))),
                                                     ("version", str(data.get("version", ""))),
                                                     ("fts", "1" if fts else "0"), ("scope", scope)])
    con.executescript("""
        CREATE INDEX idx_entries_kanji_kana ON entries(kanji, kana);
        CREATE INDEX idx_entries_kana ON entries(kana);
        CREATE INDEX idx_word_forms_form ON word_forms(form);
        CREATE INDEX idx_word_forms_word ON word_forms(word_id);
        CREATE INDEX idx_examples_word ON examples(word_id);
    """)
    con.commit()
    con.execute("VACUUM")
    con.close()
    return {"entries": len(entries), "words": len(words), "forms": len(forms), "examples": len(examples), "fts": int(fts)}


def build_jmdict(scope: str = "full") -> None:
    print("[jmdict]")
    assets = _latest_jmdict_assets()
    key = "examples" if "examples" in assets else "eng"
    if key != "examples":
        print("  CẢNH BÁO: release không có jmdict-examples-eng, dùng jmdict-eng (không có câu ví dụ)")
    name, url = assets[key]
    zpath = _download(url, CACHE_DIR / name)
    with zipfile.ZipFile(zpath) as zf:
        inner = [n for n in zf.namelist() if n.endswith(".json")][0]
        with zf.open(inner) as raw:
            data = json.load(raw)
    out = DATA_DIR / "jmdict.sqlite"
    stats = write_jmdict(data, out, _jlpt_index(JLPT_DIR), scope)
    print(f"  jmdict.sqlite: {stats}, {out.stat().st_size // 1024} KB")


# =============================================================================
# Dữ liệu chữ Hán cho lộ trình học / luyện viết (app/extract/kanjidata.py, spec lộ trình 2 §0.1 LP-17)
# =============================================================================

STROKE_POINTS = 32   # số điểm lấy mẫu mỗi nét: đủ cho DTW, file ~8 MB cho ~2 000 chữ
_CURVE_STEPS = 24    # số đoạn thẳng xấp xỉ một Bezier bậc 3 trước khi lấy mẫu đều theo chiều dài
_CJK_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")  # kanji thật (không tính 々〆ヶ); chép từ jachars vì script chạy với -I
_PATH_TOKEN_RE = re.compile(r"[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_PATH_D_RE = re.compile(r"<path\b[^>]*?\sd=([\"'])(.*?)\1", re.S)
_KANJIVG_NAME_RE = re.compile(r"([0-9a-f]{4,6})\.svg")  # 065e5.svg; biến thể 065e5-Kaisho.svg không khớp → bỏ
# File KRADFILE đặt sẵn trong cache (tải tay) được ưu tiên hơn tải mạng; thứ tự = ưu tiên bản UTF-8 đầy đủ
KRADFILE_CACHE_NAMES = ("kradfile-u.gz", "kradfile-u", "kradfile-u.txt", "kradfile.gz", "kradfile", "kradzip.zip")


def _clean_expr(s: str) -> str:
    return s.strip().replace("～", "").replace("〜", "")


def _jlpt_expressions() -> set[str]:
    """Cột expression của 5 file JLPT đã dựng — bộ lọc để các file không commit chỉ giữ từ dùng đến."""
    words: set[str] = set()
    for path in sorted(JLPT_DIR.glob("n*.csv")):
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                expr = _clean_expr(row.get("expression") or "")
                if expr:
                    words.add(expr)
    if not words:
        raise SystemExit("Chưa có app/extract/data/jlpt/n*.csv — chạy --only jlpt trước")
    return words


def _jlpt_kanji() -> set[str]:
    """Mọi kanji xuất hiện trong từ vựng JLPT (xấp xỉ phủ bảng Jōyō)."""
    return {ch for word in _jlpt_expressions() for ch in word if _CJK_RE.fullmatch(ch)}


# ----------------------------------------------------------------------------- unihan_rs

def parse_unihan_rs(lines: Iterable[str]) -> list[tuple[str, int, int, int]]:
    """Unihan_IRGSources.txt → [(chữ, số bộ thủ, nét ngoài bộ, tổng nét)] cho khối CJK thống nhất U+4E00–9FFF.

    kRSUnicode "bộ.nét" có thể nhiều giá trị (lấy giá trị đầu) và dấu ' sau số bộ (bộ dạng giản thể,
    vd 120'.3) → bỏ dấu. kTotalStrokes cũng có thể nhiều giá trị (TC/JP đếm khác) → lấy giá trị đầu.
    Chữ thiếu một trong hai trường, dòng cụt / không phải số → bỏ.
    """
    rs: dict[int, tuple[int, int]] = {}
    total: dict[int, int] = {}
    for line in lines:
        if line.startswith("#") or "\t" not in line:
            continue
        try:
            code, field, value = line.rstrip("\n").split("\t", 2)
            if field not in ("kRSUnicode", "kTotalStrokes") or not code.startswith("U+"):
                continue
            cp = int(code[2:], 16)
            if not 0x4E00 <= cp <= 0x9FFF:
                continue
            first = value.split()[0]
            if field == "kRSUnicode":
                radical, _, residual = first.partition(".")
                rs[cp] = (int(radical.rstrip("'")), int(residual or 0))
            else:
                total[cp] = int(first)
        except (ValueError, IndexError):
            continue
    return [(chr(cp), rs[cp][0], rs[cp][1], total[cp]) for cp in sorted(rs) if cp in total]


def build_unihan_rs() -> None:
    print("[unihan_rs]")
    zpath = _download(UNIHAN_URL, CACHE_DIR / "Unihan.zip")  # cùng file cache với build_unihan
    with zipfile.ZipFile(zpath) as zf, zf.open("Unihan_IRGSources.txt") as raw:
        rows = parse_unihan_rs(io.TextIOWrapper(raw, encoding="utf-8"))
    out = DATA_DIR / "unihan_rs.csv"
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["char", "radical_no", "residual_strokes", "total_strokes"])
        w.writerows(rows)
    print(f"  {out.name}: {len(rows)} chars")


# ----------------------------------------------------------------------------- unihan_def

def parse_unihan_definitions(readings: Iterable[str], mappings: Iterable[str]) -> list[tuple[str, str]]:
    """Unihan_Readings.txt (kDefinition, kJapanese) + Unihan_OtherMappings.txt (kJis0, kJIS0213) → [(chữ, nghĩa EN)]
    cho chữ khối CJK U+4E00–9FFF có cách đọc tiếng Nhật và nằm trong bảng mã JIS X 0208 / 0213 (~8 600 chữ, đủ cho
    văn bản tiếng Nhật thường gặp, file ~280 KB). Giữ nguyên văn kDefinition: ghi chú Trung văn (bộ Khang Hi, nhị thập
    bát tú, họ…) lọc lúc nạp (kanji_meanings.clean_definition) để sửa luật không phải dựng lại file."""
    defs: dict[int, str] = {}
    ja: set[int] = set()
    jis: set[int] = set()
    for lines, fields in ((readings, ("kDefinition", "kJapanese")), (mappings, ("kJis0", "kJIS0213"))):
        for line in lines:
            if line.startswith("#") or "\t" not in line:
                continue
            try:
                code, field, value = line.rstrip("\n").split("\t", 2)
                if field not in fields or not code.startswith("U+"):
                    continue
                cp = int(code[2:], 16)
            except ValueError:
                continue
            if not 0x4E00 <= cp <= 0x9FFF:
                continue
            if field == "kDefinition":
                defs[cp] = value.strip()
            elif field == "kJapanese":
                ja.add(cp)
            else:
                jis.add(cp)
    return [(chr(cp), defs[cp]) for cp in sorted(defs) if cp in ja and cp in jis and defs[cp]]


def build_unihan_def() -> None:
    print("[unihan_def]")
    zpath = _download(UNIHAN_URL, CACHE_DIR / "Unihan.zip")  # cùng file cache với build_unihan
    with zipfile.ZipFile(zpath) as zf, zf.open("Unihan_Readings.txt") as r1, zf.open("Unihan_OtherMappings.txt") as r2:
        rows = parse_unihan_definitions(io.TextIOWrapper(r1, encoding="utf-8"), io.TextIOWrapper(r2, encoding="utf-8"))
    out = DATA_DIR / "unihan_definitions.csv"
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["char", "definition"])
        w.writerows(rows)
    print(f"  {out.name}: {len(rows)} chars")


# ----------------------------------------------------------------------------- kanjivg

def _cubic(p0: tuple[float, float], c1: tuple[float, float], c2: tuple[float, float], p3: tuple[float, float],
           steps: int = _CURVE_STEPS) -> list[tuple[float, float]]:
    """Bezier bậc 3 → `steps` điểm (không gồm p0, có p3)."""
    out = []
    for k in range(1, steps + 1):
        t = k / steps
        u = 1.0 - t
        a, b, c, d = u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t
        out.append((a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
                    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]))
    return out


def _path_polyline(d: str) -> list[tuple[float, float]]:
    """Thuộc tính d của SVG → đường gấp khúc mịn theo đúng hướng viết.

    KanjiVG chỉ dùng M/m, L/l, C/c, S/s (H/V/Z xử lý thêm cho chắc; Q/T/A không có → dừng). Toạ độ sau M
    là L ngầm; S lấy điểm điều khiển đầu = phản chiếu điểm điều khiển 2 của C/S trước qua điểm hiện tại.
    Dữ liệu cụt hoặc lệnh thiếu số → giữ phần đã đọc được thay vì ném lỗi (dữ liệu tải về không tin cậy).
    """
    tokens = _PATH_TOKEN_RE.findall(d)
    pts: list[tuple[float, float]] = []
    cur = start = (0.0, 0.0)
    prev_ctrl: tuple[float, float] | None = None
    cmd = ""
    i = 0

    def take(k: int) -> list[float]:
        nonlocal i
        vals = tokens[i:i + k]
        i += k
        if len(vals) < k or any(v.isalpha() for v in vals):
            raise ValueError("path cụt")
        return [float(v) for v in vals]

    try:
        while i < len(tokens):
            if tokens[i].isalpha():
                cmd = tokens[i]
                i += 1
                if cmd in "Zz":
                    if cur != start:
                        pts.append(start)
                    cur, prev_ctrl = start, None
                    continue
            if not cmd:
                break
            rel = cmd.islower()
            ox, oy = cur if rel else (0.0, 0.0)
            if cmd in "Mm":
                x, y = take(2)
                cur = start = (ox + x, oy + y)
                pts.append(cur)
                prev_ctrl = None
                cmd = "l" if rel else "L"
            elif cmd in "Ll":
                x, y = take(2)
                cur = (ox + x, oy + y)
                pts.append(cur)
                prev_ctrl = None
            elif cmd in "Hh":
                (x,) = take(1)
                cur = (ox + x, cur[1])
                pts.append(cur)
                prev_ctrl = None
            elif cmd in "Vv":
                (y,) = take(1)
                cur = (cur[0], oy + y)
                pts.append(cur)
                prev_ctrl = None
            elif cmd in "CcSs":
                if cmd in "Cc":
                    x1, y1, x2, y2, x, y = take(6)
                    c1 = (ox + x1, oy + y1)
                else:
                    x2, y2, x, y = take(4)
                    c1 = (2 * cur[0] - prev_ctrl[0], 2 * cur[1] - prev_ctrl[1]) if prev_ctrl else cur
                c2, end = (ox + x2, oy + y2), (ox + x, oy + y)
                pts.extend(_cubic(cur, c1, c2, end))
                cur, prev_ctrl = end, c2
            else:
                break
    except ValueError:
        pass
    return pts


def _resample(poly: list[tuple[float, float]], n: int) -> list[tuple[float, float]]:
    """n điểm cách đều theo chiều dài cung, giữ nguyên điểm đầu / cuối; đường rỗng → [], một điểm → lặp."""
    if not poly:
        return []
    cum = [0.0]
    for (x0, y0), (x1, y1) in zip(poly, poly[1:]):
        cum.append(cum[-1] + math.hypot(x1 - x0, y1 - y0))
    total = cum[-1]
    if total == 0.0:
        return [poly[0]] * n
    out = []
    j = 0
    for k in range(n):
        target = total * k / max(n - 1, 1)
        while j < len(cum) - 2 and cum[j + 1] < target:
            j += 1
        seg = cum[j + 1] - cum[j]
        t = (target - cum[j]) / seg if seg else 0.0
        (x0, y0), (x1, y1) = poly[j], poly[j + 1]
        out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def sample_path(d: str, n: int = STROKE_POINTS) -> list[tuple[float, float]]:
    """Một nét (thuộc tính d) → n điểm cách đều theo chiều dài, đúng hướng viết."""
    return _resample(_path_polyline(d), n)


def parse_kanjivg_svg(text: str, n: int = STROKE_POINTS) -> list[list[tuple[float, float]]]:
    """File SVG KanjiVG → [nét 1, nét 2, …] theo thứ tự viết (= thứ tự <path> trong tài liệu), toạ độ gốc.

    Dùng regex thay vì XML parser: chỉ cần thuộc tính d, và file tải về là dữ liệu không tin cậy.
    """
    strokes = [sample_path(m.group(2), n) for m in _PATH_D_RE.finditer(text)]
    return [s for s in strokes if s]


def normalise_glyph(strokes: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Đưa cả chữ về hộp 0..1: trừ góc trên-trái của bbox mọi nét, chia cho cạnh dài (giữ tỉ lệ để nét
    ngang đơn như 一 không bị kéo thành hình vuông), cạnh ngắn căn giữa. Chữ suy biến (một điểm) → 0.5."""
    xs = [x for s in strokes for x, _ in s]
    ys = [y for s in strokes for _, y in s]
    if not xs:
        return []
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    size = max(maxx - minx, maxy - miny)
    if size == 0:
        return [[(0.5, 0.5) for _ in s] for s in strokes]
    offx = (size - (maxx - minx)) / 2
    offy = (size - (maxy - miny)) / 2
    return [[((x - minx + offx) / size, (y - miny + offy) / size) for x, y in s] for s in strokes]


def extract_kanjivg_zip(zpath: Path, wanted: set[str]) -> dict[str, list[list[list[float]]]]:
    """Zip KanjiVG → {chữ: [[[x, y] × 32] mỗi nét]} làm tròn 3 chữ số, chỉ các chữ trong `wanted`.

    Đọc thẳng từng member trong zip, không giải nén ra đĩa; bỏ file > 1 MB (SVG thật chỉ vài KB).
    """
    out: dict[str, list[list[list[float]]]] = {}
    with zipfile.ZipFile(zpath) as zf:
        for info in zf.infolist():
            m = _KANJIVG_NAME_RE.fullmatch(info.filename.rsplit("/", 1)[-1])
            if not m or info.file_size > 1 << 20:
                continue
            try:
                ch = chr(int(m.group(1), 16))
            except ValueError:
                continue
            if ch not in wanted:
                continue
            strokes = normalise_glyph(parse_kanjivg_svg(zf.read(info).decode("utf-8", "replace")))
            if strokes:
                out[ch] = [[[round(x, 3), round(y, 3)] for x, y in s] for s in strokes]
    return dict(sorted(out.items()))


def _latest_kanjivg_asset() -> tuple[str, str]:
    """(tên, URL) của 'kanjivg-YYYYMMDD-all.zip' trong release mới nhất; API lỗi → zip nhánh master."""
    try:
        req = urllib.request.Request(KANJIVG_RELEASE_API, headers={"User-Agent": USER_AGENT,
                                                                 "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            release = json.load(resp)
        for asset in release.get("assets", []):
            name = asset.get("name", "")
            if re.fullmatch(r"kanjivg-\d{8}-all\.zip", name):
                return name, asset["browser_download_url"]
        print("  release mới nhất không có kanjivg-*-all.zip")
    except (OSError, ValueError, KeyError) as exc:  # URLError / HTTPError là OSError
        print(f"  GitHub API lỗi: {exc}")
    print("  → dùng zip nhánh master")
    return "kanjivg-master.zip", KANJIVG_BRANCH_URL


def build_kanjivg() -> None:
    print("[kanjivg]")
    wanted = _jlpt_kanji()
    name, url = _latest_kanjivg_asset()
    zpath = _download(url, CACHE_DIR / name)
    data = extract_kanjivg_zip(zpath, wanted)
    out = DATA_DIR / "kanji_strokes.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  {out.name}: {len(data)} / {len(wanted)} kanji JLPT có nét viết, {out.stat().st_size // 1024} KB")


# ----------------------------------------------------------------------------- kanji_parts (KanjiVG kvg:element / kvg:phon)

# kvg:radical: "general" (bộ tra từ điển hiện đại) > "tradit" (Khang Hi) > "nelson" > "jis"
_KVG_RADICAL_RANK = {"general": 0, "tradit": 1, "nelson": 2, "jis": 3}
# ký hiệu phụ trong kvg:phon: V = biến thể, T = dạng truyền thống, số = thứ tự, right/left/top/bottom = vị trí
_PHON_MARK_RE = re.compile(r"right|left|top|bottom|[A-Za-z0-9]")
_KVG_ROOT_ID_RE = re.compile(r"kvg:[0-9a-f]{4,6}$")
KANJI_PARTS_COLUMNS = ["kanji", "parts", "originals", "positions", "radical_part", "phon_part", "phon"]


def normalise_phon(raw: str | None) -> str | None:
    """Giá trị kvg:phon → một chữ Hán: '之V' → 之, '厶/弗' → 厶 (ứng viên đầu hợp lệ), '立口/否V' → 否, '3+6+1' → None."""
    if not raw:
        return None
    for token in raw.split("/"):
        t = _PHON_MARK_RE.sub("", token).strip()
        if len(t) == 1 and _CJK_RE.fullmatch(t):
            return t
    return None


def _kvg_attr(el: ET.Element, name: str) -> str | None:
    """Thuộc tính kvg:<name> dù namespace khai báo là http hay https (DOCTYPE và xmlns của KanjiVG lệch nhau)."""
    for k, v in el.attrib.items():
        if k == name or k.endswith("}" + name):
            return v
    return None


def _is_g(el: ET.Element) -> bool:
    return el.tag == "g" or el.tag.endswith("}g")


def _element_groups(parent: ET.Element) -> list[tuple[str, ET.Element]]:
    """[(tên part, nhóm)] cho các con trực tiếp: nhóm có kvg:element lấy element; nhóm không có element nhưng mang kvg:phon
    chuẩn hoá được (氐 trong 低, 臤 trong 堅, 雚 trong 観 — KanjiVG không coi là thành phần chuẩn nên không đặt element) là một
    part mang tên chỉ âm đó; nhóm chỉ gom nét (position="kamae"…) hay phon không ra một chữ (品+木) thì lấy tiếp con của nó."""
    out: list[tuple[str, ET.Element]] = []
    for child in parent:
        if not _is_g(child):
            continue
        element = _kvg_attr(child, "element")
        if element:
            out.append((element, child))
            continue
        phon = normalise_phon(_kvg_attr(child, "phon"))
        if phon:
            out.append((phon, child))
        else:
            out.extend(_element_groups(child))
    return out


def _subtree_best(el: ET.Element, attr: str, rank: dict[str, int] | None = None) -> str | None:
    """Giá trị `attr` tốt nhất trong cây con (chính nó trước): có `rank` thì theo thứ hạng, không thì giá trị đầu gặp."""
    best: tuple[int, str] | None = None
    for node in el.iter():
        v = _kvg_attr(node, attr)
        if not v:
            continue
        if rank is None:
            return v
        r = rank.get(v, len(rank))
        if best is None or r < best[0]:
            best = (r, v)
    return best[1] if best else None


def parse_kanjivg_parts(text: str) -> dict | None:
    """Một file SVG KanjiVG → {kanji, parts, originals, positions, radical_part, phon_part, phon} hoặc None.

    parts = kvg:element của các nhóm con trực tiếp của nhóm gốc (土 / 寸 nằm trong 寺 không phải part của 時), theo thứ tự
    tài liệu = thứ tự viết; originals = kvg:original (扌 → 手) hoặc None; positions = kvg:position hoặc None; radical_part =
    part có kvg:radical tốt nhất trong cây con của nó; phon_part / phon = part mang kvg:phon (chính nó trước) và giá trị đã
    chuẩn hoá. Không có part nào → None (chữ đơn 一). SVG hỏng → None. Chỉ parse bằng ElementTree của stdlib (dữ liệu tải về
    không tin cậy: không entity ngoài, không exec)."""
    if not text:
        return None
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return None
    main = next((g for g in root.iter() if _is_g(g) and _KVG_ROOT_ID_RE.search(g.get("id", ""))
                 and _kvg_attr(g, "element")), None)
    if main is None:
        return None
    named = _element_groups(main)
    if not named:
        return None
    parts = [name for name, _ in named]
    groups = [g for _, g in named]
    radical_part: str | None = None
    radical_rank = len(_KVG_RADICAL_RANK)
    phon_part: str | None = None
    phon: str | None = None
    for g, part in zip(groups, parts):
        rad = _subtree_best(g, "radical", _KVG_RADICAL_RANK)
        if rad is not None and _KVG_RADICAL_RANK.get(rad, len(_KVG_RADICAL_RANK)) < radical_rank:
            radical_rank = _KVG_RADICAL_RANK.get(rad, len(_KVG_RADICAL_RANK))
            radical_part = part
        if phon_part is None:
            raw = _kvg_attr(g, "phon") or _subtree_best(g, "phon")
            if raw:
                phon_part, phon = part, normalise_phon(raw)
    return {
        "kanji": _kvg_attr(main, "element"),
        "parts": parts,
        "originals": [_kvg_attr(g, "original") for g in groups],
        "positions": [_kvg_attr(g, "position") for g in groups],
        "radical_part": radical_part,
        "phon_part": phon_part,
        "phon": phon,
    }


def extract_kanji_parts_zip(zpath: Path) -> list[dict]:
    """Zip KanjiVG → hàng kanji_parts cho mọi chữ có ít nhất một part, xếp theo mã Unicode; bỏ biến thể font (-Kaisho…)."""
    rows: dict[str, dict] = {}
    with zipfile.ZipFile(zpath) as zf:
        for info in zf.infolist():
            m = _KANJIVG_NAME_RE.fullmatch(info.filename.rsplit("/", 1)[-1])
            if not m or info.file_size > 1 << 20:
                continue
            row = parse_kanjivg_parts(zf.read(info).decode("utf-8", "replace"))
            if row and row["kanji"]:
                rows[row["kanji"]] = row
    return [rows[k] for k in sorted(rows)]


def write_kanji_parts(rows: list[dict], out: Path) -> None:
    """CSV `kanji,parts,originals,positions,radical_part,phon_part,phon`; danh sách cách nhau bằng khoảng trắng, '-' = không có."""
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(KANJI_PARTS_COLUMNS)
        for r in rows:
            w.writerow([r["kanji"], " ".join(r["parts"]), " ".join(o or "-" for o in r["originals"]),
                        " ".join(p or "-" for p in r["positions"]), r["radical_part"] or "", r["phon_part"] or "",
                        r["phon"] or ""])


def build_kanji_parts() -> None:
    print("[kanji_parts]")
    name, url = _latest_kanjivg_asset()
    zpath = _download(url, CACHE_DIR / name)
    rows = extract_kanji_parts_zip(zpath)
    out = DATA_DIR / "kanji_parts.csv"
    write_kanji_parts(rows, out)
    with_phon = sum(1 for r in rows if r["phon"])
    print(f"  {out.name}: {len(rows)} chữ có cây phân rã, {with_phon} có thành phần chỉ âm, {out.stat().st_size // 1024} KB")


# ----------------------------------------------------------------------------- kradfile

def parse_kradfile(text: str) -> list[tuple[str, str]]:
    """KRADFILE / kradfile-u: mỗi dòng 'chữ : tp1 tp2 …', '#' là chú thích → [(chữ, 'tp1 tp2 …')]."""
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        head, sep, tail = line.partition(":")
        kanji, comps = head.strip(), tail.split()
        if sep and len(kanji) == 1 and comps:
            rows.append((kanji, " ".join(comps)))
    return rows


def decode_kradfile(data: bytes) -> str:
    """kradfile gốc là EUC-JP nén gzip, kradfile-u là UTF-8: giải nén nếu cần, thử UTF-8 rồi EUC-JP."""
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    for enc in ("utf-8", "euc_jp"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("euc_jp", errors="replace")


def _kradfile_texts() -> list[str]:
    """Nội dung KRADFILE: file đặt sẵn trong cache (KRADFILE_CACHE_NAMES) rồi mới thử tải từ EDRDG."""
    for name in KRADFILE_CACHE_NAMES:
        path = CACHE_DIR / name
        if not path.exists() or path.stat().st_size == 0:
            continue
        print(f"  cache: {name}")
        if name.endswith(".zip"):
            with zipfile.ZipFile(path) as zf:
                return [decode_kradfile(zf.read(n)) for n in zf.namelist()
                        if n.rsplit("/", 1)[-1].lower().startswith("kradfile")]
        return [decode_kradfile(path.read_bytes())]
    for url in KRADFILE_URLS:
        try:
            return [decode_kradfile(_download(url, CACHE_DIR / url.rsplit("/", 1)[-1]).read_bytes())]
        except OSError as exc:
            print(f"  không tải được {url}: {exc}")
    return []


def build_kradfile() -> None:
    print("[kradfile]")
    texts = _kradfile_texts()
    if not texts:
        print("  KRADFILE chưa có → bỏ qua. Tải thủ công kradfile-u.gz (UTF-8) hoặc kradzip.zip từ\n"
              f"  {KRADFILE_DIR_URL} (giấy phép & mô tả: {KRADFILE_INFO_URL}), đặt vào\n"
              f"  {CACHE_DIR} với đúng tên file rồi chạy lại:  scripts/build_dicts.py --only kradfile")
        return
    table: dict[str, str] = {}
    for text in texts:
        for kanji, comps in parse_kradfile(text):
            table.setdefault(kanji, comps)  # kradfile-u/kradfile trước kradfile2: bản đầu thắng
    out = DATA_DIR / "kradfile.csv"
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["kanji", "components"])
        w.writerows(sorted(table.items()))
    print(f"  {out.name}: {len(table)} chars")


# ----------------------------------------------------------------------------- pitch

def parse_accents(text: str, keep: set[str] | None = None) -> list[tuple[str, str, int]]:
    """kanjium accents.txt 'từ<TAB>cách đọc<TAB>trọng âm' → [(từ, cách đọc, kiểu)].

    Cách đọc rỗng khi từ đã toàn kana → dùng chính từ. Cột 3 có thể nhiều giá trị ('0,2') kèm từ loại
    ('(副)0,(名)3') → lấy số đầu tiên (kanjium xếp cách đọc phổ biến trước). `keep`: chỉ giữ dòng có từ
    hoặc cách đọc nằm trong tập (từ vựng JLPT) để file không commit nhỏ.
    """
    rows = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        word = parts[0].strip()
        reading = parts[1].strip() or word
        m = re.search(r"\d+", parts[2])
        if not word or not m:
            continue
        if keep is not None and word not in keep and reading not in keep:
            continue
        rows.append((word, reading, int(m.group())))
    return rows


def build_pitch() -> None:
    print("[pitch]")
    keep = _jlpt_expressions()
    src = _download(PITCH_URL, CACHE_DIR / "kanjium_accents.txt")
    rows = parse_accents(src.read_text(encoding="utf-8-sig"), keep)
    out = DATA_DIR / "pitch_accent.csv"
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["word", "reading", "accent_type"])
        w.writerows(rows)
    print(f"  {out.name}: {len(rows)} rows")


# Thứ tự chạy khi không có --only; unihan_rs / unihan_def ngay sau unihan vì dùng chung Unihan.zip trong cache
BUILDERS = {
    "jlpt": build_jlpt,
    "unihan": build_unihan,
    "unihan_rs": build_unihan_rs,
    "unihan_def": build_unihan_def,
    "jmdict": build_jmdict,
    "kanjivg": build_kanjivg,
    "kanji_parts": build_kanji_parts,
    "kradfile": build_kradfile,
    "pitch": build_pitch,
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(BUILDERS))
    ap.add_argument("--dict-scope", choices=["full", "compact"], default="full",
                    help="jmdict: full = mọi mục; compact = chỉ mục common / JLPT / có ví dụ")
    args = ap.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for name, build in BUILDERS.items():
        if args.only in (None, name):
            build(args.dict_scope) if name == "jmdict" else build()
    print("done")


if __name__ == "__main__":
    main()
