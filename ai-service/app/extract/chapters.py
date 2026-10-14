"""Tách văn bản thành các chương trước khi trích từ vựng (Lộ trình học tập)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.extract.jachars import has_japanese

MAX_HEADING_LEN = 80
MAX_TITLE_LEN = 100
INTRO_TITLE = "Mở đầu"

_RE_JA = re.compile(
    r"^第\s*(?:[0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})\s*(?:課|章|部|節|回|話|単元)\s*[:：.．\-－~〜]?\s*(.{0,50})$")
_RE_LATIN = re.compile(
    r"^(?:Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*[0-9０-９]{1,3}\s*[:：.．\-－)]?\s*(.{0,50})$",
    re.IGNORECASE)


@dataclass
class Chapter:
    index: int            # 1-based
    title: Optional[str]  # None khi không nhận dạng được (một chương duy nhất)
    text: str             # đã bỏ dòng tiêu đề
    start_line: int
    end_line: int         # exclusive


def _is_heading(line: str, docx_headings: frozenset = frozenset()) -> bool:
    line = line.strip()
    if not line or len(line) > MAX_HEADING_LEN or line[-1] in "。！？!?":
        return False
    if line in docx_headings:
        return True
    for rx in (_RE_JA, _RE_LATIN):
        m = rx.match(line)
        if m:
            return "。" not in m.group(1)
    return False


def heading_title(line: str) -> Optional[str]:
    """Trả tiêu đề (đã strip) nếu dòng khớp mẫu tiêu đề, ngược lại None."""
    return line.strip() if _is_heading(line) else None


def _docx_heading_set(blocks: Optional[list[dict]]) -> frozenset:
    out = set()
    for b in blocks or []:
        if not isinstance(b, dict) or b.get("heading") is None:
            continue
        first = (b.get("text") or "").strip().split("\n")[0].strip()  # block nhiều dòng: chỉ dòng đầu
        if first:
            out.add(first)
    return frozenset(out)


def split_chapters(text: str, blocks: Optional[list[dict]]) -> tuple[list[Chapter], bool]:
    lines = text.split("\n")
    n = len(lines)
    docx_set = _docx_heading_set(blocks)
    heads = [i for i, ln in enumerate(lines) if _is_heading(ln, docx_set)]
    if len(heads) < 2:
        return [Chapter(1, None, text, 0, n)], False

    chapters: list[Chapter] = []
    preamble = "\n".join(lines[:heads[0]])
    merge_pre = bool(preamble.strip()) and not has_japanese(preamble)
    if heads[0] > 0 and has_japanese(preamble):
        chapters.append(Chapter(1, INTRO_TITLE, preamble, 0, heads[0]))
    for k, h in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else n
        body = "\n".join(lines[h + 1:end])
        start = h
        if k == 0 and merge_pre:
            body = preamble + "\n" + body  # preamble không có tiếng Nhật → dồn vào chương 1
            start = 0
        chapters.append(Chapter(len(chapters) + 1, lines[h].strip()[:MAX_TITLE_LEN], body, start, end))
    return chapters, True
