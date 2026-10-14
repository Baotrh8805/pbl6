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
_RANK1_JA = {"課", "章", "単元", "日目"}   # 日目 = bài theo ngày (Nihongo Soumatome); 週 = nhóm tuần -> hạng 2
_RANK1_LATIN = {"lesson", "unit", "chapter", "bài", "chương", "レッスン", "ユニット"}

_RE_JA = re.compile(
    r"^(?:第\s*(?:[0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})\s*(課|章|部|節|回|話|単元|週)"
    r"|(?:[0-9０-９]{1,3}|[一二三四五六七八九十]{1,3})\s*(日目))\s*[:：.．\-－~〜]?\s*(.*)$")
_RE_LATIN = re.compile(
    r"^(Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*[0-9０-９]{1,3}\s*[:：.．\-－)]?\s*(.*)$",
    re.IGNORECASE)
# Trợ từ dính ngay sau số (第3章では, 第2回目) → câu văn, không phải tiêu đề
_PARTICLE_START = tuple("でにのはがを目")

# Phần đầu / cuối sách: dòng ngắn đứng riêng khớp các từ khoá này (không phân biệt hoa thường) đánh dấu phần bị bỏ.
_FRONT_MATTER = ("はじめに", "まえがき", "序文", "本書の使い方", "この本の使い方", "教科書の使い方", "目次", "凡例",
                 "学習者の皆さんへ", "lời nói đầu", "lời mở đầu", "cách sử dụng", "hướng dẫn sử dụng", "mục lục",
                 "preface", "introduction", "how to use", "table of contents", "contents")
_BACK_MATTER = ("付録", "索引", "解答", "別冊", "phụ lục", "đáp án", "bảng tra", "appendix", "answer key", "answers",
                "index", "glossary")
MAX_MARKER_LEN = 40
TOC_MIN_RUN = 3        # ≥ 3 dòng mục lục liên tiếp (tiêu đề không có thân, hoặc kết thúc bằng số trang) -> cụm mục lục
# Dòng mục lục: phần sau từ khoá+số kết thúc bằng số trang (dấu chấm dẫn, hoặc chữ rồi khoảng trắng rồi số)
_TOC_PAGE_NO = re.compile(r"(?:[.．…・]{2,}\s*|[^\s\d]\s+)[0-9０-９]{1,4}$")


# Một tiêu đề khác nằm trong phần đuôi (mục lục OCR gộp 2 mục một dòng: "1日目アパート…2日目引っ越し…")
_INLINE_HEAD = re.compile(
    r"(?:第\s*(?:[0-9０-９]{1,3}|[一二三四五六七八九十]{1,3})\s*(?:課|章|週|部|節|回|話|単元)"
    r"|[0-9０-９]{1,2}\s*日目"
    r"|(?:Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục)\s*[0-9０-９]{1,3})", re.IGNORECASE)


def _toc_like(line: str) -> bool:
    line = line.strip()
    for rx in (_RE_JA, _RE_LATIN):
        m = rx.match(line)
        if m:
            trailing = _kw_trailing(m)[1]
            return bool(_TOC_PAGE_NO.search(trailing)) or bool(_INLINE_HEAD.search(trailing))
    return bool(_TOC_PAGE_NO.search(line))


@dataclass
class Chapter:
    index: int            # 1-based
    title: Optional[str]  # None khi không nhận dạng được (một chương duy nhất)
    text: str             # đã bỏ dòng tiêu đề
    start_line: int
    end_line: int         # exclusive


@dataclass
class SplitResult:
    chapters: list[Chapter]
    detected: bool
    skipped: list[str]    # phần đầu / cuối sách, mục lục đã bỏ (để hiện cho người dùng)


def _marker(line: str, keywords: tuple[str, ...]) -> Optional[str]:
    """Dòng ngắn đứng riêng là tên phần đầu/cuối sách (vd. 'はじめに', 'Mục lục', 'Lời nói đầu')."""
    t = line.strip().strip("　:：.．").strip()
    if not t or len(t) > MAX_MARKER_LEN or "、" in t or t.endswith("。"):  # câu văn (はじめに、この本は。) không phải tên phần
        return None
    low = t.lower()
    for kw in keywords:
        if low == kw or low.startswith(kw + " ") or low.startswith(kw + "　") or (has_japanese(kw) and low.startswith(kw)):
            return t[:len(kw)]  # nhãn = từ khoá (bỏ đuôi rác OCR / bản dịch đi kèm)
    return None


def _norm_title(line: str) -> str:
    """Khoá so trùng tiêu đề: giữ từ khoá + số thứ tự, bỏ số trang / dấu chấm dẫn cuối dòng của mục lục và khoảng trắng."""
    line = line.strip()
    for rx in (_RE_JA, _RE_LATIN):
        m = rx.match(line)
        if m:
            trailing_raw = _kw_trailing(m)[1]
            trailing = _TOC_PAGE_NO.sub("", trailing_raw)
            head = line[:len(line) - len(m.group(m.lastindex))] if m.group(m.lastindex) else line
            return re.sub(r"\s+", "", head + trailing).lower()
    return re.sub(r"\s+", "", _TOC_PAGE_NO.sub("", line)).lower()


def _basic_ok(line: str) -> bool:
    return bool(line) and len(line) <= MAX_HEADING_LEN and line[-1] not in "。！!"  # tiêu đề dạng câu hỏi (…ますか?) vẫn hợp lệ


def _heading_rank(line: str) -> Optional[int]:
    """1 hoặc 2 nếu dòng là tiêu đề theo mẫu (hạng của họ từ khoá), ngược lại None."""
    line = line.strip()
    if not _basic_ok(line) or "、" in line or "。" in line:
        return None
    for rx, rank1 in ((_RE_JA, _RANK1_JA), (_RE_LATIN, _RANK1_LATIN)):
        m = rx.match(line)
        if m:
            kw, trailing = _kw_trailing(m)
            if len(trailing) > MAX_TRAILING_LEN or trailing.startswith(_PARTICLE_START):
                return None
            return 1 if kw.lower() in rank1 else 2
    return None


def _kw_trailing(m: "re.Match[str]") -> tuple[str, str]:
    """(từ khoá, phần đuôi) của một match tiêu đề; _RE_JA có hai nhánh nên từ khoá ở group 1 hoặc 2."""
    groups = [g for g in m.groups() if g is not None]
    return groups[0], groups[-1].strip()


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


def _drop_toc_and_duplicates(lines: list[str], heads: list[int]) -> tuple[list[int], bool, set[int]]:
    """Bỏ cụm mục lục (≥ TOC_MIN_RUN tiêu đề liên tiếp hầu như không có thân) và tiêu đề lặp (mục lục sót,
    header chạy đầu trang PDF): chỉ lần xuất hiện đầu tiên mở chương. Trả (heads còn lại, có cụm mục lục không,
    chỉ số các dòng tiêu đề lặp cần bỏ khỏi thân)."""
    n = len(lines)
    body_lines = []
    for k, h in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else n
        body_lines.append(sum(1 for ln in lines[h + 1:end] if ln.strip()))
    is_toc = [False] * len(heads)
    toc_like = [_toc_like(lines[h]) for h in heads]
    run_start = 0
    for k in range(len(heads) + 1):
        thin = k < len(heads) and (body_lines[k] == 0 or toc_like[k])
        if not thin:
            # cụm mục lục: >= TOC_MIN_RUN tiêu đề liên tiếp không có thân hoặc mang dấu hiệu mục lục (số trang, 2 mục/dòng)
            if k - run_start >= TOC_MIN_RUN:
                for j in range(run_start, k):
                    is_toc[j] = True
            run_start = k + 1
    had_toc = any(is_toc)
    seen: set[str] = set()
    kept: list[int] = []
    dup: set[int] = set()
    for k, h in enumerate(heads):
        if is_toc[k]:
            continue
        key = _norm_title(lines[h])
        if key in seen:
            dup.add(h)
            continue
        seen.add(key)
        kept.append(h)
    return kept, had_toc, dup


def _find_heads(lines: list[str], blocks: Optional[list[dict]]) -> tuple[list[int], bool, set[int]]:
    docx_set = _docx_heading_set(blocks)
    if docx_set:  # hạng 0: heading DOCX được ưu tiên hơn regex
        heads = [i for i, ln in enumerate(lines) if _basic_ok(ln.strip()) and ln.strip() in docx_set]
        heads, had_toc, dup = _drop_toc_and_duplicates(lines, heads)
        if len(heads) >= 2:
            return heads, had_toc, dup
    ranked = [(i, _heading_rank(ln)) for i, ln in enumerate(lines)]
    for rank in (1, 2):
        heads = [i for i, r in ranked if r == rank]
        heads, had_toc, dup = _drop_toc_and_duplicates(lines, heads)
        if len(heads) >= 2:
            return heads, had_toc, dup
    return [], False, set()


def split_chapters(text: str, blocks: Optional[list[dict]]) -> tuple[list[Chapter], bool]:
    r = split_chapters_ex(text, blocks)
    return r.chapters, r.detected


_TOC_MARKERS = ("目次", "mục lục", "contents", "table of contents")


def split_chapters_ex(text: str, blocks: Optional[list[dict]]) -> SplitResult:
    lines = text.split("\n")
    n = len(lines)
    heads, had_toc, dup = _find_heads(lines, blocks)
    if len(heads) < 2:
        return SplitResult([Chapter(1, None, text, 0, n)], False, [])

    skipped: list[str] = []
    chapters: list[Chapter] = []

    # Phần đầu sách: có mục lục / はじめに / Lời nói đầu... -> bỏ hẳn; không thì giữ hành vi cũ ("Mở đầu" nếu có tiếng Nhật)
    pre_lines = lines[:heads[0]]
    preamble = "\n".join(pre_lines)
    front: list[str] = []
    for ln in pre_lines:
        m = _marker(ln, _FRONT_MATTER)
        if m and m not in front:
            front.append(m)
    if had_toc and not any(m.lower() in _TOC_MARKERS for m in front):
        front.append("目次")
    merge_pre = False
    # dòng tiêu đề của họ khác (vd. trang bìa tuần "第1週 ..." trước "1日目") không phải nội dung
    pre_content = chr(10).join(ln for ln in pre_lines if _heading_rank(ln) is None)
    if front:
        skipped.extend(front)
    elif not pre_content.strip():
        pass  # chỉ có trang bìa / tiêu đề nhóm -> bỏ
    else:
        merge_pre = not has_japanese(pre_content)
        if heads[0] > 0 and has_japanese(pre_content):
            chapters.append(Chapter(1, INTRO_TITLE, preamble, 0, heads[0]))

    for k, h in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else n
        title = lines[h].strip()[:MAX_TITLE_LEN]
        if _marker(title, _FRONT_MATTER) or _marker(title, _BACK_MATTER):
            skipped.append(title)
            continue
        body_lines = lines[h + 1:end]
        if k == len(heads) - 1:  # chương cuối: cắt phần cuối sách (付録 / 索引 / Phụ lục...)
            for j, ln in enumerate(body_lines):
                m = _marker(ln, _BACK_MATTER)
                if m:
                    skipped.append(m)
                    body_lines = body_lines[:j]
                    end = h + 1 + j
                    break
        if dup:  # tiêu đề lặp (header chạy đầu trang) không phải nội dung
            body_lines = [ln for j, ln in enumerate(body_lines, start=h + 1) if j not in dup]
        body = "\n".join(body_lines)
        start = h
        if k == 0 and merge_pre:
            body = preamble + "\n" + body  # preamble không có tiếng Nhật → dồn vào chương 1
            start = 0
        chapters.append(Chapter(len(chapters) + 1, title, body, start, end))
    # Các chương đứng đầu mà thân còn chứa dòng tên phần đầu sách (mục nhập cuối của mục lục OCR ôm luôn trang
    # "cách dùng sách") cũng là phần đầu sách -> bỏ, dừng ở chương đầu tiên không có dấu hiệu đó.
    while chapters and chapters[0].title != INTRO_TITLE:
        marks = [m for ln in chapters[0].text.split(chr(10)) if (m := _marker(ln, _FRONT_MATTER))]
        if not marks:
            break
        skipped.append(chapters[0].title)
        skipped.extend(m for m in marks if m not in skipped)
        chapters.pop(0)
    for i, c in enumerate(chapters, start=1):
        c.index = i
    if len(chapters) < 2:
        return SplitResult([Chapter(1, None, text, 0, n)], False, skipped)
    return SplitResult(chapters, True, skipped)
