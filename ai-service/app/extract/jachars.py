"""Tiện ích nhận diện ký tự tiếng Nhật dùng chung cho các module extract."""
from __future__ import annotations

import re

# 々 coi như kanji vì luôn đứng sau kanji và nhận cách đọc riêng (人々)
KANJI_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿々〆ヶ]")
KANA_RE = re.compile(r"[ぁ-ゖァ-ヺーㇰ-ㇿー]")
JA_RE = re.compile(r"[ぁ-ゖァ-ヺー一-鿿㐀-䶿々〆ヶ]")


def is_kanji(ch: str) -> bool:
    return bool(KANJI_RE.fullmatch(ch))


def is_kana(ch: str) -> bool:
    return bool(KANA_RE.fullmatch(ch))


def has_japanese(s: str) -> bool:
    return bool(JA_RE.search(s))


def has_kanji(s: str) -> bool:
    return bool(KANJI_RE.search(s))


def is_kana_only(s: str) -> bool:
    return bool(s) and all(is_kana(c) for c in s)


def kata_to_hira(s: str) -> str:
    """Katakana → hiragana bằng dịch mã (0x60), giữ nguyên ー và ký tự khác."""
    return "".join(chr(ord(c) - 0x60) if 0x30A1 <= ord(c) <= 0x30F6 else c for c in s)


def hira_to_kata(s: str) -> str:
    return "".join(chr(ord(c) + 0x60) if 0x3041 <= ord(c) <= 0x3096 else c for c in s)

