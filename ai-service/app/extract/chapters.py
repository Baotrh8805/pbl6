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
# Trợ từ ngay sau số (第3章では, 第2回目, Lesson 1 の練習) → câu văn / cụm danh từ, không phải tiêu đề.
_PARTICLE_START = tuple("でにのはがを目")
# を / 目 không bao giờ mở đầu tên bài -> luôn bỏ, kể cả khi có khoảng trắng ("第1課 を復習しましょう", "第2回 目の授業で")
_NEVER_TITLE_START = tuple("を目")
# Tên bài hay mở đầu bằng は / に / が (はじめまして, にほんの くらし, がっこう). の / で hiếm khi mở đầu tên bài
# nhưng "Lesson 1 の練習", "Unit 3 で学んだこと" lại rất hay gặp -> không nhận thẳng, chỉ nhận khi lấp chỗ trống số bài.
_TITLE_INITIAL = tuple("はにが")
_HEAD_SEP = ":：.．-－~〜)"  # dấu ngăn giữa từ khoá+số và tên bài mà _RE_JA / _RE_LATIN chấp nhận

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


def _classify(line: str) -> Optional[tuple[int, str, bool]]:
    """(hạng, từ khoá, chắc chắn) nếu dòng khớp mẫu tiêu đề, ngược lại None. chắc chắn=False: phần đuôi mở đầu bằng
    chữ trùng trợ từ mà không đủ dấu hiệu tên bài -> chỉ nhận khi lấp đúng chỗ trống số bài (_fill_particle_gaps)."""
    line = line.strip()
    if not _basic_ok(line) or "、" in line or "。" in line:
        return None
    for rx, rank1 in ((_RE_JA, _RANK1_JA), (_RE_LATIN, _RANK1_LATIN)):
        m = rx.match(line)
        if m:
            kw, trailing = _kw_trailing(m)
            if len(trailing) > MAX_TRAILING_LEN or trailing.startswith(_NEVER_TITLE_START):
                return None
            sure = not trailing.startswith(_PARTICLE_START) or _particle_title(m, trailing, rx is _RE_LATIN)
            return 1 if kw.lower() in rank1 else 2, kw.lower(), sure
    return None


def _heading_rank(line: str) -> Optional[int]:
    """1 hoặc 2 nếu dòng chắc chắn là tiêu đề theo mẫu (hạng của họ từ khoá), ngược lại None."""
    c = _classify(line)
    return c[0] if c and c[2] else None


def _kw_trailing(m: "re.Match[str]") -> tuple[str, str]:
    """(từ khoá, phần đuôi) của một match tiêu đề; _RE_JA có hai nhánh nên từ khoá ở group 1 hoặc 2."""
    groups = [g for g in m.groups() if g is not None]
    return groups[0], groups[-1].strip()


def _particle_title(m: "re.Match[str]", trailing: str, latin: bool) -> bool:
    """Phần đuôi mở đầu bằng chữ trùng trợ từ nhưng đủ dấu hiệu là tên bài: là は/に/が, tách khỏi từ khoá+số, chữ kế
    là hiragana (cùng một từ: はじめまして; "は休みです", "は あいさつです" là trợ từ) và không phải câu hỏi
    ("Lesson 3 はどうでしたか?")."""
    nxt = trailing[1:2]
    return (trailing.startswith(_TITLE_INITIAL) and _separated(m, latin) and "ぁ" <= nxt <= "ゖ"
            and trailing[-1] not in "?？")


def _separated(m: "re.Match[str]", latin: bool) -> bool:
    """Phần đuôi có tách khỏi từ khoá+số không. Regex đã nuốt khoảng trắng / dấu ngăn nên xét đoạn ngay trước nhóm đuôi.
    Mẫu Latin: chữ/số Latin cạnh chữ Nhật vốn được chèn khoảng trắng nửa cỡ theo lối trình bày thông thường
    ("Lesson 1 の練習") -> khoảng trắng nửa cỡ không tính, cần dấu ngăn hoặc khoảng trắng 全角."""
    start = m.start(m.lastindex)
    gap = ""
    while start > 0 and (m.string[start - 1].isspace() or m.string[start - 1] in _HEAD_SEP):
        start -= 1
        gap = m.string[start] + gap
    if any(ch in _HEAD_SEP for ch in gap) or "　" in gap:
        return True
    return bool(gap) and not latin


def _fill_particle_gaps(lines: list[str], cls: list, rank: int) -> list[int]:
    """Tiêu đề chắc chắn của hạng `rank`, cộng ứng viên dính trợ từ khớp đúng dãy số bài cùng từ khoá: ngay trước bài
    n+1 (hoặc sau bài n-1 khi là tiêu đề cuối) và kề bên chưa có bài n. OCR (Tesseract) nối chữ Nhật không khoảng
    trắng nên "第1課 はじめまして" trên trang tới đây thành "第1課はじめまして" — một dòng riêng không phân biệt được
    với câu "第1課は…", chỉ vị trí trong dãy 第1課 → 第2課 → 第3課 mới cho biết đó là tiêu đề."""
    heads = [i for i, c in enumerate(cls) if c and c[0] == rank and c[2]]
    cands = [i for i, c in enumerate(cls) if c and c[0] == rank and not c[2]]
    changed = bool(heads)
    while changed and cands:  # lặp tới khi ổn định: ứng viên vừa nhận làm mốc cho ứng viên liền trước / sau
        changed = False
        for i in list(cands):
            kw, n = cls[i][1], _head_number(lines[i])
            same = [h for h in heads if cls[h][1] == kw]
            prv = next((_head_number(lines[h]) for h in reversed(same) if h < i), None)
            nxt = next((_head_number(lines[h]) for h in same if h > i), None)
            if n is None or prv == n or nxt == n:
                continue
            if nxt == n + 1 or (nxt is None and prv == n - 1):
                heads = sorted(heads + [i])
                cands.remove(i)
                changed = True
    return heads


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


_KANJI_NUM = {c: i + 1 for i, c in enumerate("一二三四五六七八九")}
_NUM_RE = re.compile(r"([0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})")


def _head_number(line: str) -> Optional[int]:
    """Số thứ tự của tiêu đề (第3課 -> 3, 1日目 -> 1, Bài 12 -> 12, 第十二課 -> 12); None nếu không đọc được."""
    m = _NUM_RE.search(line.strip())
    if not m:
        return None
    tok = m.group(1)
    if tok[0] in "0123456789０-９" or tok[0].isdigit():
        return int("".join(chr(ord(ch) - 0xFEE0) if "０" <= ch <= "９" else ch for ch in tok))
    total, cur = 0, 0
    for ch in tok:
        if ch == "十":
            total += (cur or 1) * 10
            cur = 0
        elif ch == "百":
            total += (cur or 1) * 100
            cur = 0
        else:
            cur = _KANJI_NUM.get(ch, 0)
    return total + cur


def _drop_before_first_one(lines: list[str], heads: list[int]) -> tuple[list[int], list[int]]:
    """Tiêu đề đứng trước tiêu đề số 1 đầu tiên là phần đầu sách (hộp ví dụ trong "cách dùng sách", mục lục sót).
    Chỉ áp dụng khi có tiêu đề số 1; tài liệu bắt đầu giữa sách (bài 5, 6, 7) giữ nguyên. Trả (heads, heads bị bỏ)."""
    for k, h in enumerate(heads):
        if _head_number(lines[h]) == 1:
            return heads[k:], heads[:k]
    return heads, []


def _find_heads(lines: list[str], blocks: Optional[list[dict]]) -> tuple[list[int], bool, set[int]]:
    docx_set = _docx_heading_set(blocks)
    if docx_set:  # hạng 0: heading DOCX được ưu tiên hơn regex
        heads = [i for i, ln in enumerate(lines) if _basic_ok(ln.strip()) and ln.strip() in docx_set]
        heads, had_toc, dup = _drop_toc_and_duplicates(lines, heads)
        if len(heads) >= 2:
            return heads, had_toc, dup
    cls = [_classify(ln) for ln in lines]
    for rank in (1, 2):
        heads = _fill_particle_gaps(lines, cls, rank)
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
    heads, before_one = _drop_before_first_one(lines, heads)
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
    if before_one and not front:
        front.append(lines[before_one[0]].strip()[:MAX_TITLE_LEN])  # đã bỏ tiêu đề giả trước bài 1 -> phần trước là đầu sách
    merge_pre = False
    # dòng tiêu đề của họ khác (vd. trang bìa tuần "第1週 ..." trước "1日目") không phải nội dung
    pre_content = chr(10).join(ln for ln in pre_lines if _heading_rank(ln) is None)
    if front:
        skipped.extend(m for m in front if m not in skipped)
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
    # Phần đầu sách liền khối ở đầu: mục lục OCR rác, mục nhập cuối của mục lục ôm luôn trang "cách dùng sách"...
    # -> bỏ mọi chương tới chương CUỐI CÙNG còn chứa dòng tên phần đầu sách, miễn sau đó vẫn còn >= 2 chương thật.
    fm = [k for k, c in enumerate(chapters)
          if c.title != INTRO_TITLE and len(chapters) - k - 1 >= 2
          and any(_marker(ln, _FRONT_MATTER) for ln in c.text.split(chr(10)))]
    if fm:
        cut = max(fm) + 1
        for c in chapters[:cut]:
            skipped.append(c.title)
            skipped.extend(m for ln in c.text.split(chr(10)) if (m := _marker(ln, _FRONT_MATTER)) and m not in skipped)
        chapters = chapters[cut:]
    # Chương dẫn đầu có tiêu đề dạng mục lục (chứa mốc thứ hai / số trang, vd. "1日目-6日目 7日目") = sơ đồ / mục lục còn sót
    while len(chapters) > 2 and chapters[0].title != INTRO_TITLE and _toc_like(chapters[0].title):
        skipped.append(chapters.pop(0).title)
    for i, c in enumerate(chapters, start=1):
        c.index = i
    if len(chapters) < 2:
        return SplitResult([Chapter(1, None, text, 0, n)], False, skipped)
    return SplitResult(chapters, True, skipped)
