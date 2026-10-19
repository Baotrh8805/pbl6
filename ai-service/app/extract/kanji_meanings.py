"""Nghĩa EN của **từng chữ Hán** (thẻ chữ Hán C5, thẻ bộ thủ C4, mẹo nhớ mẫu).

Không lấy từ JMdict: JMdict là từ điển *từ*, entry đầu có kanji đúng bằng chữ thường là một từ một chữ với nghĩa hẹp
(日 にち "Sunday; nth day (of the month)", 字 あざ "section of village") chứ không phải nghĩa của chữ. Hai nguồn, theo
thứ tự ưu tiên:
  kanji_meaning_overrides.csv  (commit, sửa tay)  nghĩa tiếng Nhật của ~270 chữ JLPT mà định nghĩa Unihan (viết cho
                                                  tiếng Trung) gây hiểu nhầm: 町 "raised path between fields" → town,
                                                  駅 "relay station" → station, 私 "private" → I, me…
  unihan_definitions.csv       (commit, dựng bằng  Unihan kDefinition của ~8 600 chữ JIS có âm Nhật; ghi chú Trung văn
                                build_dicts.py)    (bộ Khang Hi, nhị thập bát tú, họ, quẻ, tiếng Quảng Đông…) lọc lúc nạp
                                                  bằng clean_definition để sửa luật không phải dựng lại file.
Thiếu cả hai → None; kanji_cards._meaning_en khi đó mới rơi về JMdict / cột meaning JLPT. Bảng nạp lười một lần.
"""
from __future__ import annotations

import csv
import re
import threading
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"
DEFINITIONS_FILE = DATA_DIR / "unihan_definitions.csv"
OVERRIDE_FILE = DATA_DIR / "kanji_meaning_overrides.csv"

_table: dict[str, str] | None = None
_lock = threading.Lock()

# Một nghĩa (giữa hai dấu ";") là ghi chú tra cứu tiếng Trung, không phải nghĩa của chữ → bỏ cả nghĩa đó
_DROP_SENSE_RE = re.compile(
    r"^(?:(?:a )?(?:simplified )?form of )?kangxi radical \d+"   # "Kangxi radical 72", "a form of Kangxi radical 211"
    r"|^(?:rad\.(?: no\.)?|radical number) \d+"                 # "rad. no. 108", "rad. 91", "radical number 94"
    r"|^\d+(?:st|nd|rd|th) (?:lunar mansion|heavenly stem|earthly branch)"  # nhị thập bát tú / thiên can / địa chi
    r"|^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (?:heavenly stem|earthly branch)"
    r"|^(?:hexagram|trigram)\b"                                 # "hexagram ䷮", "trigram ☳"
    r"|^(?:a )?surname\b|^one's family name$|^(?:a )?name$"     # "surname", "surname of the Yellow Emperor"
    r"|^used in (?:japanese )?(?:names|transliteration)"
    r"|^translit(?:eration|\.)"
    r"|^\(cant\.\)"                                              # nghĩa tiếng Quảng Đông
    r"|^(?:final )?particle\b|^particle of "                    # hư từ Hán văn ("final particle", "particle of …")
    r"|^[a-z]+ province$",                                      # địa danh Trung Quốc ("Yunnan province")
    re.IGNORECASE,
)
# Ghi chú đầu nghĩa, giữ phần sau: "(same as 單) single" → "single", "(J) priest's residence" → "priest's residence"
_LEADING_NOTE_RE = re.compile(r"^\((?:same as|variant of|simplified form of|non-classical form of|J)\b[^)]*\)\s*",
                              re.IGNORECASE)
_BRACKET_RE = re.compile(r"\s*\[[^\]]*\]")  # "sell; [NOT casing, shell, husk]"
_COUNTER_RE = re.compile(r"\bnumerary adjunct\b", re.IGNORECASE)  # thuật ngữ Trung văn của trợ số từ (counter)


def clean_definition(definition: Optional[str]) -> Optional[str]:
    """kDefinition → nghĩa gọn cho người học: bỏ nghĩa là ghi chú Trung văn (xem _DROP_SENSE_RE), bỏ ghi chú "(same as
    X)" / "(J)" đầu nghĩa và chú thích trong ngoặc vuông, "numerary adjunct" → "counter", nối lại bằng "; ".
    Không còn nghĩa nào → None.
    "woman, girl; feminine; Kangxi radical 38; 10th lunar mansion, …" → "woman, girl; feminine"."""
    if not definition:
        return None
    kept: list[str] = []
    for sense in str(definition).split(";"):
        sense = _BRACKET_RE.sub("", _LEADING_NOTE_RE.sub("", sense.strip())).strip(" ,")
        sense = _COUNTER_RE.sub("counter", sense)
        if sense and not _DROP_SENSE_RE.search(sense) and sense not in kept:
            kept.append(sense)
    return "; ".join(kept) or None


def _read(path: Path, column: str, table: dict[str, str], clean: bool) -> None:
    if not path.exists():
        return
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch = (row.get("char") or "").strip()
            text = (row.get(column) or "").strip()
            if clean:
                text = clean_definition(text) or ""
            if ch and text:
                table[ch] = text


def _load() -> dict[str, str]:
    global _table
    if _table is None:
        with _lock:
            if _table is None:
                table: dict[str, str] = {}
                _read(DEFINITIONS_FILE, "definition", table, clean=True)
                _read(OVERRIDE_FILE, "meaning", table, clean=False)  # sửa tay thắng Unihan
                _table = table
    return _table


def reset() -> None:
    """Xoá bảng đã nạp (test đổi đường dẫn file rồi gọi)."""
    global _table
    _table = None


def available() -> bool:
    return bool(_load())


def meaning(ch: str) -> Optional[str]:
    """Nghĩa EN của một chữ Hán ("存" → "exist, live, be; survive; remain"); không có dữ liệu → None."""
    return _load().get(ch) if ch else None
