"""Hiragana → romaji Hepburn (đủ dùng cho /nlp/analyze, thay pykakasi)."""
from __future__ import annotations

from app.extract.jachars import kata_to_hira

_BASE = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o", "ゔ": "vu",
}
_YOUON = {"ゃ": "ya", "ゅ": "yu", "ょ": "yo"}


def to_romaji(kana: str) -> str:
    s = kata_to_hira(kana)
    out: list[str] = []
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if ch == "っ":
            if nxt in _BASE:
                out.append(_BASE[nxt][0] if _BASE[nxt][0] != "c" else "t")
            i += 1
            continue
        if ch == "ー":
            if out and out[-1] and out[-1][-1] in "aiueo":
                out.append(out[-1][-1])
            i += 1
            continue
        if nxt in _YOUON and ch in _BASE and _BASE[ch].endswith("i"):
            head = _BASE[ch][:-1]
            y = _YOUON[nxt]
            if head in ("sh", "ch", "j"):
                out.append(head + y[1:])      # しゃ → sha
            else:
                out.append(head + y)          # きゃ → kya
            i += 2
            continue
        out.append(_BASE.get(ch, ch))
        i += 1
    return "".join(out)
