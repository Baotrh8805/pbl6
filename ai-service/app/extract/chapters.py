"""Tách văn bản thành các chương trước khi trích từ vựng (Lộ trình học tập)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.extract.jachars import has_japanese

MAX_HEADING_LEN = 80
MAX_TITLE_LEN = 100
MAX_TRAILING_LEN = 50
INTRO_TITLE = "Mở đầu"

# Hạng 1 = đơn vị bài/chương; hạng 2 = phần/mục bên trong bài. Chỉ tách theo họ hạng cao nhất xuất hiện ≥ 2 lần.
_RANK1_JA = {"課", "章", "単元"}
_RANK1_LATIN = {"lesson", "unit", "chapter", "bài", "chương", "レッスン", "ユニット"}

_RE_JA = re.compile(
    r"^第\s*(?:[0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})\s*(課|章|部|節|回|話|単元)\s*[:：.．\-－~〜]?\s*(.*)$")
_RE_LATIN = re.compile(
    r"^(Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*[0-9０-９]{1,3}\s*[:：.．\-－)]?\s*(.*)$",
    re.IGNORECASE)
# Trợ từ dính ngay sau số (第3章では, 第2回目) → câu văn, không phải tiêu đề
_PARTICLE_START = tuple("でにのはがを目")


@dataclass
class Chapter:
    index: int            # 1-based
    title: Optional[str]  # None khi không nhận dạng được (một chương duy nhất)
    text: str             # đã bỏ dòng tiêu đề
    start_line: int
    end_line: int         # exclusive


def _basic_ok(line: str) -> bool:
    return bool(line) and len(line) <= MAX_HEADING_LEN and line[-1] not in "。！？!?"


def _heading_rank(line: str) -> Optional[int]:
    """1 hoặc 2 nếu dòng là tiêu đề theo mẫu (hạng của họ từ khoá), ngược lại None."""
    line = line.strip()
    if not _basic_ok(line) or "、" in line or "。" in line:
        return None
    for rx, rank1 in ((_RE_JA, _RANK1_JA), (_RE_LATIN, _RANK1_LATIN)):
        m = rx.match(line)
        if m:
            trailing = m.group(2).strip()
            if len(trailing) > MAX_TRAILING_LEN or trailing.startswith(_PARTICLE_START):
                return None
            return 1 if m.group(1).lower() in rank1 else 2
    return None


def heading_title(line: str) -> Optional[str]:
    """Trả tiêu đề (đã strip) nếu dòng khớp mẫu tiêu đề, ngược lại None."""
    return line.strip() if _heading_rank(line) is not None else None


def _docx_heading_set(blocks: Optional[list[dict]]) -> frozenset:
    """Dòng đầu của các heading DOCX ở cấp nhỏ nhất (gần 1 nhất) xuất hiện ≥ 2 lần; cấp sâu hơn ở lại trong thân."""
    by_level: dict[int, list[str]] = {}
    for b in blocks or []:
        if not isinstance(b, dict) or not isinstance(b.get("heading"), int):
            continue
        first = (b.get("text") or "").strip().split("\n")[0].strip()  # block nhiều dòng: chỉ dòng đầu
        if first:
            by_level.setdefault(b["heading"], []).append(first)
    for level in sorted(by_level):
        if len(by_level[level]) >= 2:
            return frozenset(by_level[level])
    return frozenset()


def _find_heads(lines: list[str], blocks: Optional[list[dict]]) -> list[int]:
    docx_set = _docx_heading_set(blocks)
    if docx_set:  # hạng 0: heading DOCX được ưu tiên hơn regex
        heads = [i for i, ln in enumerate(lines) if _basic_ok(ln.strip()) and ln.strip() in docx_set]
        if len(heads) >= 2:
            return heads
    ranked = [(i, _heading_rank(ln)) for i, ln in enumerate(lines)]
    for rank in (1, 2):
        heads = [i for i, r in ranked if r == rank]
        if len(heads) >= 2:
            return heads
    return []


def split_chapters(text: str, blocks: Optional[list[dict]]) -> tuple[list[Chapter], bool]:
    lines = text.split("\n")
    n = len(lines)
    heads = _find_heads(lines, blocks)
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
