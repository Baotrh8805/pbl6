"""Bảng / danh sách từ vựng: tách mỗi dòng thành cụm + nghĩa in sẵn, nhận dạng bố cục list / prose
(docs/Plan/specs/2026-10-12-trich-xuat-cum-tu-design.md §2.1, §2.2, §2.4).

Dòng-mục: ``<cụm tiếng Nhật><TAB><nghĩa>``; chấp nhận thêm dấu tách ``｜ | ： : - – —`` và ranh giới chữ viết
(hết chữ Nhật → Latin / Hangul / chữ Hán không có cách đọc tiếng Nhật) cho dòng Tesseract và văn bản dán tay.
Văn bản có thể đã qua NFKC (``＊``→``*``, ``＝``→``=``, ``（N）``→``(N)``), nên mọi mẫu nhận cả hai dạng.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass
from typing import Optional

from app.extract.jachars import has_japanese, is_kana, is_kanji
from app.extract.kanji_readings import readings

GLOSS_MAX_CHARS = 120
LIST_MIN_LINES = 3            # ít hơn → prose
LIST_MAX_MEDIAN_JA = 20       # trung vị độ dài cụm tiếng Nhật đầu dòng
LIST_MAX_SENTENCE_RATIO = 0.2  # tỉ lệ dòng kết thúc bằng 。！？ từ mức này → văn xuôi / hội thoại
LIST_MIN_GLOSS_RATIO = 0.5    # tỉ lệ dòng có nghĩa (hoặc có dấu tách cột) để coi là danh sách

_JA_EXTRA = set("ー々〆ヶ")
_JA_INNER = set("、・「」『』〜～")          # dấu được phép nằm trong cụm (ケース・バイ・ケース, 「はい」と言う)
_VI_CHARS = "ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ"
_VI_RE = re.compile(f"[{_VI_CHARS}{_VI_CHARS.upper()}]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_NOTE_START_RE = re.compile(r"^[＊*※]")
_BULLET_RE = re.compile(r"^(?:[0-9０-９]+[.．)）]|[-•●○◎・↔⇔➔→►▶]+)\s*")
_LABEL_RE = re.compile(r"[(（]\s*(?:N|V|adj|adv|na|exp)\s*[)）]", re.IGNORECASE)
_MARKER_RE = re.compile(r"[↔⇔➔→●○◎►▶※＊*]")
_COLUMN_SPLIT_RE = re.compile(r"[\t｜|]")
_ALT_SPLIT_RE = re.compile(r"[/／]")
_BRACKET_RE = re.compile(r"^(.*?)[\[［{｛](.*)$")
_CLOSE_BRACKETS = "]］}｝」"
_GLOSS_LEAD_RE = re.compile(r"^[\s\-–—:：|｜]+")
_GLOSS_STOP_RE = re.compile(r"[぀-ヿ㐀-鿿가-힯]")  # kana / chữ Hán / Hangul
_WS_RE = re.compile(r"\s+")
_SENT_END = "。！？!?"
# dấu kết câu rồi tới cuối dòng, cho phép đuôi không phải tiếng Nhật (câu ví dụ song ngữ "…です。 I am a student.")
_SENT_END_RE = re.compile(r"[。！？!?][^぀-ヿ㐀-鿿]*$")


@dataclass(frozen=True)
class Entry:
    headwords: tuple[str, ...]
    gloss: Optional[str]
    gloss_lang: Optional[str]   # "en" | "vi" | None
    reading: Optional[str] = None   # cột toàn kana (bảng 3 cột `từ<TAB>cách đọc<TAB>nghĩa`)


def is_japanese_char(ch: str) -> bool:
    """Kana, ký hiệu kéo dài / lặp, hoặc kanji có cách đọc tiếng Nhật trong Unihan (loại 银 账 户 của chữ Trung)."""
    return is_kana(ch) or ch in _JA_EXTRA or (is_kanji(ch) and bool(readings(ch)))


def _ja_run(s: str) -> tuple[str, str]:
    """Cụm tiếng Nhật liền mạch ở đầu chuỗi (kèm dấu trong cụm) và phần còn lại."""
    i = 0
    while i < len(s) and (is_japanese_char(s[i]) or s[i] in _JA_INNER):
        i += 1
    return s[:i].strip("".join(_JA_INNER)), s[i:]


def _first_ja_run(s: str) -> str:
    start = next((i for i, ch in enumerate(s) if is_japanese_char(ch)), len(s))
    return _ja_run(s[start:])[0]


def _split_columns(line: str) -> tuple[str, list[str]]:
    """(cột cụm, các cột còn lại): theo dấu tách cột nếu có (cột cụm = cột đầu tiên có tiếng Nhật, nên
    `nghĩa<TAB>cụm` cũng chạy), không thì theo ranh giới chữ viết."""
    if _COLUMN_SPLIT_RE.search(line):
        cols = [c.strip() for c in _COLUMN_SPLIT_RE.split(line)]
        head_idx = next((i for i, c in enumerate(cols) if has_japanese(c)), 0)
        return cols[head_idx], cols[:head_idx] + cols[head_idx + 1:]
    for i, ch in enumerate(line):
        if ch.isalpha() and not is_japanese_char(ch):   # Latin / Hangul / chữ Hán không phải tiếng Nhật
            return line[:i], [line[i:]]
    return line, []


def _is_kana_column(col: str) -> bool:
    letters = "".join(ch for ch in col if ch.isalpha() or ch in _JA_EXTRA)
    return bool(letters) and all(is_kana(ch) or ch in _JA_EXTRA for ch in letters)


def _ends_sentence(line: str) -> bool:
    """Phần tiếng Nhật của dòng kết thúc bằng 。！？ (sau đó chỉ còn chữ không phải tiếng Nhật, vd. bản dịch)."""
    return _SENT_END_RE.search(line) is not None


def _headwords(head: str) -> tuple[str, ...]:
    head = _MARKER_RE.sub("", _BULLET_RE.sub("", head.strip())).strip()
    m = _BRACKET_RE.match(head)
    if m:
        prefix, inside = m.group(1), m.group(2).rstrip(_CLOSE_BRACKETS)
        candidates = [prefix + alt.strip() for alt in _ALT_SPLIT_RE.split(inside)]
    else:
        candidates = _ALT_SPLIT_RE.split(head)
    out: list[str] = []
    for cand in candidates:
        run = _first_ja_run(cand.strip())
        if has_japanese(run) and run not in out:
            out.append(run)
    return tuple(out)


_WORD_RE = re.compile(r"[A-Za-z]{3,}")
ENGLISH_MIN_ZIPF = 3.0   # wordfreq: ≥ 3 = từ thường gặp (the, pay, account…); rác OCR (el, fd, oo) không đạt


def _looks_english(text: str) -> bool:
    """Có ít nhất một từ ≥ 3 chữ cái là từ tiếng Anh thật — loại phần Latin đọc nhầm trên dòng Tesseract ("el", "OO pm fd 24")."""
    from wordfreq import zipf_frequency
    return any(zipf_frequency(w.lower(), "en") >= ENGLISH_MIN_ZIPF for w in _WORD_RE.findall(text))


def _gloss(rest: str) -> tuple[Optional[str], Optional[str]]:
    text = _GLOSS_LEAD_RE.sub("", rest)
    stop = _GLOSS_STOP_RE.search(text)
    if stop:
        text = text[:stop.start()]
    text = _WS_RE.sub(" ", text).strip(" ,;(（-–—:：")[:GLOSS_MAX_CHARS].strip()
    if _VI_RE.search(text):
        return text, "vi"
    if len(_LATIN_RE.findall(text)) >= 2 and _looks_english(text):
        return text, "en"
    return None, None


def parse_line(line: str) -> Optional[Entry]:
    """Một dòng → Entry; None cho dòng rỗng, chú thích (``*`` / ``※`` đầu dòng, ``=`` trong cụm), dòng không có tiếng Nhật."""
    line = _LABEL_RE.sub("", line.strip())
    if not line or _NOTE_START_RE.match(line):
        return None
    head_raw, others = _split_columns(line)
    if "=" in head_raw or "＝" in head_raw:
        return None
    headwords = _headwords(head_raw)
    if not headwords:
        return None
    reading: Optional[str] = None
    gloss = lang = None
    for col in others:
        if reading is None and _is_kana_column(col):
            reading = "".join(ch for ch in col if is_kana(ch) or ch in _JA_EXTRA)
            continue
        if gloss is None:
            gloss, lang = _gloss(col)
    return Entry(headwords, gloss, lang, reading)


def detect_layout(text: str) -> str:
    """``list`` khi đủ: ≥ 3 dòng tiếng Nhật, trung vị cụm đầu dòng ≤ 20 ký tự, < 20 % dòng kết thúc câu,
    và ≥ 50 % dòng có nghĩa hoặc có dấu tách cột. Còn lại ``prose``."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and has_japanese(ln)]
    if len(lines) < LIST_MIN_LINES:
        return "prose"
    if statistics.median(len(_first_ja_run(ln)) for ln in lines) > LIST_MAX_MEDIAN_JA:
        return "prose"
    n = len(lines)
    if sum(1 for ln in lines if _ends_sentence(ln)) / n >= LIST_MAX_SENTENCE_RATIO:
        return "prose"
    glossed = sum(1 for ln in lines if (e := parse_line(ln)) is not None and e.gloss)
    separated = sum(1 for ln in lines if _COLUMN_SPLIT_RE.search(ln))
    if glossed / n >= LIST_MIN_GLOSS_RATIO or separated / n >= LIST_MIN_GLOSS_RATIO:
        return "list"
    return "prose"
