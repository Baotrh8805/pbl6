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
# Tên bài cũng hay mở đầu bằng chữ trùng trợ từ + hiragana (はじめまして, にほんの くらし, がっこう, のりもの, でんわ) nhưng
# một dòng riêng lẻ không phân biệt được với câu "第1課はあいさつの課です", "第2課 はどうでしたか" (khoảng trắng / dấu ngăn
# cũng không chứng minh được) -> chỉ là ứng viên, nhận khi khớp dãy số bài (_fill_particle_gaps). を / 目,
# trợ từ + kanji / khoảng trắng ("第1課の復習", "1日目 は休みです", "第1課 は あいさつです") và trợ từ kép (では, には...)
# không mở đầu tên bài -> bỏ hẳn như trước.
_CANDIDATE_START = tuple("はにがので")
_PARTICLE_PAIRS = ("では", "には", "でも", "にも", "での")
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


def _classify(line: str) -> Optional[tuple[int, str, bool, bool]]:
    """(hạng, từ khoá, chắc chắn, dấu ngăn mạnh) nếu dòng khớp mẫu tiêu đề, ngược lại None. chắc chắn=False: phần đuôi
    mở đầu bằng chữ trùng trợ từ + hiragana -> chỉ nhận khi khớp dãy số bài (_fill_particle_gaps); dấu ngăn mạnh: xem
    _strong_sep."""
    line = line.strip()
    if not _basic_ok(line) or "、" in line or "。" in line:
        return None
    for rx, rank1 in ((_RE_JA, _RANK1_JA), (_RE_LATIN, _RANK1_LATIN)):
        m = rx.match(line)
        if m:
            kw, trailing = _kw_trailing(m)
            if len(trailing) > MAX_TRAILING_LEN:
                return None
            rank = 1 if kw.lower() in rank1 else 2
            if not trailing.startswith(_PARTICLE_START):
                return rank, kw.lower(), True, False
            if not (trailing.startswith(_CANDIDATE_START) and "ぁ" <= trailing[1:2] <= "ゖ"
                    and not trailing.startswith(_PARTICLE_PAIRS)):
                return None
            return rank, kw.lower(), False, _strong_sep(m, trailing)
    return None


def _heading_rank(line: str) -> Optional[int]:
    """1 hoặc 2 nếu dòng chắc chắn là tiêu đề theo mẫu (hạng của họ từ khoá), ngược lại None."""
    c = _classify(line)
    return c[0] if c and c[2] else None


def _kw_trailing(m: "re.Match[str]") -> tuple[str, str]:
    """(từ khoá, phần đuôi) của một match tiêu đề; _RE_JA có hai nhánh nên từ khoá ở group 1 hoặc 2."""
    groups = [g for g in m.groups() if g is not None]
    return groups[0], groups[-1].strip()


def _strong_sep(m: "re.Match[str]", trailing: str) -> bool:
    """Ứng viên có dấu ngăn hoặc khoảng trắng 全角 giữa từ khoá+số và tên bài ("第3課：がっこう", "第3課　がっこう",
    "Lesson 1: はじめまして"): lối dàn trang tiêu đề, câu văn không viết thế -> dấu hiệu để phân xử hai ứng viên cùng số
    bài và xác nhận tiêu đề cuối; không bao giờ đủ để nhận một dòng ngoài dãy số bài.
    Khoảng trắng nửa cỡ không tính: câu văn / tên hộp gõ tay cũng có ("第2課 はどうでしたか", "第1課 にでてきたことば")
    trong khi tiêu đề thật hay bị trích dính liền (OCR, PDF nối chữ cỡ lớn), nên "第1課 にでてきたことば" không được thắng
    "第1課はなみ"; chữ Latin cạnh chữ Nhật thì vốn có khoảng trắng ("Lesson 1 の練習"). Câu hỏi ("…ですか?") không tính.
    Regex đã nuốt khoảng trắng / dấu ngăn nên xét đoạn ngay trước nhóm đuôi."""
    if trailing[-1] in "?？":
        return False
    start = m.start(m.lastindex)
    gap = ""
    while start > 0 and (m.string[start - 1].isspace() or m.string[start - 1] in _HEAD_SEP):
        start -= 1
        gap = m.string[start] + gap
    return any(ch in _HEAD_SEP for ch in gap) or "　" in gap


def _in_gap(n: int, a: Optional[int], b: Optional[int]) -> bool:
    """Số n có chen được giữa hai tiêu đề chắc chắn kề bên mang số a, b (None = đầu / cuối tài liệu) mà không phá thứ tự
    tăng không: a < n < b; khi dãy bắt đầu lại (a ≥ b: mục lục rồi thân sách) thì n nối tiếp a hoặc mở đầu dãy mới
    trước b."""
    if a is None or b is None:
        return (a is None or n > a) and (b is None or n < b)
    return a < n < b if a < b else (n > a or n < b)


def _toc_cluster(lines: list[str], order: list[int], num: dict[int, Optional[int]]) -> set[int]:
    """Các dòng tiêu đề (trong `order`, theo thứ tự dòng) nằm trong cụm mục lục: ≥ 2 dòng liên tiếp không có chữ nào giữa
    dòng này và dòng tiêu đề kế tiếp (hoặc mang số trang, _toc_like), số bài tăng dần. Hộp từ vựng / header đầu trang
    lặp lại thì có thân bài theo sau; câu báo trước đứng sát tiêu đề thật chỉ là một dòng hoặc cùng số bài."""
    filled = [0]  # filled[i] = số dòng có chữ trong lines[:i]
    for ln in lines:
        filled.append(filled[-1] + bool(ln.strip()))
    out: set[int] = set()
    run: list[int] = []
    for k, i in enumerate(order):
        nxt = order[k + 1] if k + 1 < len(order) else len(lines)
        thin = filled[nxt] - filled[i + 1] == 0 or _toc_like(lines[i])
        if thin and run and num[i] is not None and num[run[-1]] is not None and num[i] > num[run[-1]]:
            run.append(i)
            continue
        if len(run) >= 2:
            out.update(run)
        run = [i] if thin else []
    if len(run) >= 2:
        out.update(run)
    return out


def _toc_and_body(copies: list[int], in_toc: set[int]) -> bool:
    """Tiêu đề có bản trong cụm mục lục và một bản khác ở thân sách (ngoài cụm) phía sau nó."""
    first = min((i for i in copies if i in in_toc), default=None)
    return first is not None and any(j > first and j not in in_toc for j in copies)


def _fill_particle_gaps(lines: list[str], cls: list, rank: int) -> list[int]:
    """Tiêu đề chắc chắn của hạng `rank`, cộng ứng viên dính trợ từ khớp đúng dãy số bài cùng từ khoá. OCR (Tesseract)
    nối chữ Nhật không khoảng trắng nên "第1課 はじめまして" thành "第1課はじめまして" — không phân biệt được với câu
    "第1課は…", chỉ vị trí trong dãy 第1課 → 第2課 → 第3課 mới cho biết đó là tiêu đề. Nhận ứng viên số n khi:
    - chưa tiêu đề chắc chắn nào cùng từ khoá mang số n ("第1課 はどうでしたか" trong bài 1 không tách bài 1) và n chen
      được giữa các tiêu đề chắc chắn kề bên (_in_gap; "第1課のふくしゅう" giữa bài 6 và 7 không chắn đường ứng viên khác);
    - chỉ một dòng ứng với số n (một tiêu đề, kể cả bản lặp ở mục lục / đầu trang). Hai dòng khác nhau ("第1課はあいさつの
      課です" ở phần cách dùng sách, "第2課のよしゅう" cuối bài 1, hộp "第2課のことば") thì không biết dòng nào là tiêu đề
      -> không nhận dòng nào, trừ khi đúng một dòng có dấu hiệu tiêu đề: dấu ngăn / 全角 (_strong_sep) hoặc có bản trong
      cụm mục lục và bản ở thân sách phía sau (_toc_cluster). Lặp trong thân bài (header đầu trang, hộp từ vựng hai lần,
      câu báo trước lặp lại) không tính: câu văn / tên hộp cũng lặp được như thế;
    - kề trước là bài n-1 (hoặc đầu tài liệu khi n = 1) và kề sau là bài n+1. Tiêu đề cuối (không có bài sau) cần
      dấu hiệu tiêu đề như trên vì câu báo trước bài sau ("第4課のよしゅう" cuối bài 3, kể cả lặp hai lần) đứng đúng chỗ đó;
    - ứng viên kề bên mà nó dựa vào không bị loại. Loại lan truyền một chiều (không nhận lại) nên kết quả không phụ
      thuộc thứ tự xét; mỗi dòng được xét một số lần cố định -> tuyến tính theo số dòng tiêu đề."""
    idx = [i for i, c in enumerate(cls) if c and c[0] == rank]
    num = {i: _head_number(lines[i]) for i in idx}
    heads = [i for i in idx if cls[i][2]]
    taken = {(cls[h][1], num[h]) for h in heads}
    # số của tiêu đề chắc chắn cùng từ khoá liền trước / liền sau mỗi ứng viên
    near: dict[int, list[Optional[int]]] = {}
    for order, side in ((idx, 0), (idx[::-1], 1)):
        last: dict[str, int] = {}
        for i in order:
            if cls[i][2]:
                last[cls[i][1]] = num[i]
            else:
                near.setdefault(i, [None, None])[side] = last.get(cls[i][1])
    slot_at: dict[int, tuple[str, int]] = {}
    for i, (a, b) in near.items():
        slot = (cls[i][1], num[i])
        if slot[1] is not None and slot not in taken and _in_gap(slot[1], a, b):
            slot_at[i] = slot
    in_toc = _toc_cluster(lines, [i for i in idx if cls[i][2] or i in slot_at], num)
    by_slot: dict[tuple[str, int], dict[str, list[int]]] = {}
    for i, slot in slot_at.items():
        by_slot.setdefault(slot, {}).setdefault(_norm_title(lines[i]), []).append(i)
    occ: dict[tuple[str, int], list[int]] = {}
    strong: dict[tuple[str, int], bool] = {}
    for slot, keys in by_slot.items():
        # dấu hiệu tiêu đề: dấu ngăn / 全角, hoặc có bản ở mục lục và bản khác ở thân sách phía sau
        signal = {k: any(cls[i][3] for i in ii) or _toc_and_body(ii, in_toc) for k, ii in keys.items()}
        top = [k for k, s in signal.items() if s]
        if len(keys) == 1:
            occ[slot], strong[slot] = next(iter(keys.values())), top != []
        elif len(top) == 1:  # đúng một dòng có dấu hiệu tiêu đề -> dòng đó; còn lại (kể cả hoà) không nhận dòng nào
            occ[slot], strong[slot] = keys[top[0]], True
    if not occ:
        return heads
    slot_of = {i: slot for slot, ii in occ.items() for i in ii}
    # Dãy theo thứ tự dòng của từng từ khoá: (số, slot ứng viên | None = chắc chắn); bản lặp liền nhau của cùng ứng viên
    # (header đầu trang) gộp một để láng giềng luôn là bài khác.
    seq: dict[str, list[tuple[int, Optional[tuple[str, int]]]]] = {}
    for i in idx:
        s = slot_of.get(i)
        if cls[i][2] or s is not None:
            lst = seq.setdefault(cls[i][1], [])
            if s is None or not lst or lst[-1][1] != s:
                lst.append((num[i], s))
    nodes: list[tuple[int, Optional[tuple[str, int]]]] = []
    nb: list[tuple[int, int]] = []  # chỉ số nút kề trước / kề sau trong cùng từ khoá, -1 = đầu / cuối
    for lst in seq.values():
        base = len(nodes)
        nodes.extend(lst)
        nb.extend((base + k - 1 if k else -1, base + k + 1 if k + 1 < len(lst) else -1) for k in range(len(lst)))
    ok = [False] * len(nodes)
    fits = dict.fromkeys(occ, 0)  # số nút còn khớp của mỗi ứng viên (mục lục + thân: chỉ cần một chỗ khớp)
    at: dict[tuple[str, int], list[int]] = {}
    for k, (n, s) in enumerate(nodes):
        if s is None:
            continue
        at.setdefault(s, []).append(k)
        p, q = nb[k]
        before = nodes[p][0] == n - 1 if p >= 0 else n == 1
        after = nodes[q][0] == n + 1 if q >= 0 else strong[s]
        if before and after:
            ok[k] = True
            fits[s] += 1
    dropped = [s for s, f in fits.items() if f == 0]
    while dropped:
        for k in at[dropped.pop()]:
            for j in nb[k]:
                if j >= 0 and ok[j]:  # nút kề dựa vào ứng viên vừa bị loại -> không còn khớp
                    ok[j] = False
                    sj = nodes[j][1]
                    fits[sj] -= 1
                    if fits[sj] == 0:
                        dropped.append(sj)
    return sorted(heads + [i for i, s in slot_of.items() if fits[s] > 0])


def heading_title(line: str) -> Optional[str]:
    """Trả tiêu đề (đã strip) nếu dòng khớp mẫu tiêu đề, ngược lại None. Dòng có tên bài mở đầu bằng chữ trùng trợ từ
    ("第1課 はじめまして") chỉ phân định được nhờ dãy số bài quanh nó (_fill_particle_gaps) nên xét riêng một dòng là None."""
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
    """Bỏ cụm mục lục (≥ TOC_MIN_RUN tiêu đề liên tiếp hầu như không có thân, hoặc ≥ 2 tiêu đề như thế mà tiêu đề nào
    cũng xuất hiện lại phía sau) và tiêu đề lặp (mục lục sót, header chạy đầu trang PDF): chỉ lần xuất hiện đầu tiên
    mở chương. Trả (heads còn lại, có cụm mục lục không, chỉ số các dòng tiêu đề lặp cần bỏ khỏi thân)."""
    n = len(lines)
    body_lines = []
    for k, h in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else n
        body_lines.append(sum(1 for ln in lines[h + 1:end] if ln.strip()))
    is_toc = [False] * len(heads)
    toc_like = [_toc_like(lines[h]) for h in heads]
    keys = [_norm_title(lines[h]) for h in heads]
    last_at = {key: k for k, key in enumerate(keys)}  # lần xuất hiện cuối của mỗi tiêu đề
    run_start = 0
    for k in range(len(heads) + 1):
        thin = k < len(heads) and (body_lines[k] == 0 or toc_like[k])
        if not thin:
            # cụm mục lục: >= TOC_MIN_RUN tiêu đề liên tiếp không có thân hoặc mang dấu hiệu mục lục (số trang, 2 mục/dòng);
            # mục lục 2 bài (tài liệu 2 bài tự có mục lục) chỉ nhận khi mọi mục đều có bản ở thân sách phía sau — nếu
            # không, các mục thành chương đầu rỗng và thân thật bị bỏ như tiêu đề lặp
            size = k - run_start
            if size >= TOC_MIN_RUN or (size >= 2 and all(last_at[keys[j]] >= k for j in range(run_start, k))):
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
        key = keys[k]
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
    # Họ tiêu đề do tiêu đề chắc chắn quyết định như trước (hạng cao nhất có ≥ 2 lần); ứng viên dính trợ từ chỉ lấp chỗ
    # trống trong họ đó -> một tiêu đề hạng 1 + một ứng viên không thay được cấu trúc hạng 2 hợp lệ (第1回/第2回/第3回).
    for rank in (1, 2):
        sure = _drop_toc_and_duplicates(lines, [i for i, c in enumerate(cls) if c and c[0] == rank and c[2]])
        if len(sure[0]) >= 2:
            filled = _drop_toc_and_duplicates(lines, _fill_particle_gaps(lines, cls, rank))
            return filled if len(filled[0]) >= 2 else sure
    # Không hạng nào đủ 2 tiêu đề chắc chắn (trước đây: không tách) -> thử dãy có ứng viên ("第1課はじめまして",
    # "第2課にほんのくらし", "第3課しゅうまつ"); dãy vẫn phải neo vào tiêu đề chắc chắn hoặc tiêu đề cuối có dấu hiệu mạnh.
    for rank in (1, 2):
        heads, had_toc, dup = _drop_toc_and_duplicates(lines, _fill_particle_gaps(lines, cls, rank))
        if len(heads) >= 2:
            return heads, had_toc, dup
    return [], False, set()


def split_chapters(text: str, blocks: Optional[list[dict]]) -> tuple[list[Chapter], bool]:
    r = split_chapters_ex(text, blocks)
    return r.chapters, r.detected


_TOC_MARKERS = ("目次", "mục lục", "contents", "table of contents")


def _front_markers(pre_lines: list[str], had_toc: bool) -> list[str]:
    """Tên các phần đầu sách (はじめに, Mục lục...) có trong phần trước chương đầu; đã bỏ cụm mục lục thì kèm "目次"."""
    out: list[str] = []
    for ln in pre_lines:
        m = _marker(ln, _FRONT_MATTER)
        if m and m not in out:
            out.append(m)
    if had_toc and not any(m.lower() in _TOC_MARKERS for m in out):
        out.append("目次")
    return out


def _first_unrecognized_lesson(lines: list[str], first: int) -> Optional[int]:
    """Dòng đầu tiên trước tiêu đề chương đầu (`first`) trông như tiêu đề cùng họ (cùng hạng, cùng từ khoá) mà số bài nhỏ hơn
    và không thuộc mục lục (không mang số trang, không đứng sát một dòng tiêu đề khác): bài ấy có thật trong tài liệu nhưng
    tiêu đề không nhận được. None nếu không có. Duyệt ngược một lượt -> tuyến tính."""
    c0 = _classify(lines[first])
    n0 = _head_number(lines[first]) if c0 else None
    if n0 is None:
        return None
    found = None
    next_is_head = True  # dòng có chữ kế tiếp là dòng tiêu đề (ban đầu: chính tiêu đề chương đầu)
    for i in range(first - 1, -1, -1):
        if not lines[i].strip():
            continue
        c = _classify(lines[i])
        if c and c[:2] == c0[:2] and not next_is_head and not _toc_like(lines[i]):
            k = _head_number(lines[i])
            if k is not None and k < n0:
                found = i
        next_is_head = c is not None
    return found


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
    front = _front_markers(pre_lines, had_toc)
    if before_one and not front:
        front.append(lines[before_one[0]].strip()[:MAX_TITLE_LEN])  # đã bỏ tiêu đề giả trước bài 1 -> phần trước là đầu sách
    # Phần đầu còn chứa bài trước bài đầu tiên nhận được (tiêu đề không nhận vì hai ứng viên cùng số bài, dạng câu...): chỉ phần
    # trước dòng tiêu đề ấy là đầu sách, từ dòng ấy là nội dung bài -> giữ như phần đầu thường ("Mở đầu"), không bỏ mất cả bài
    keep = _first_unrecognized_lesson(lines, heads[0]) if front else None
    if keep is not None:
        front = _front_markers(lines[:keep], had_toc)
        if front:
            pre_lines = lines[keep:heads[0]]
    pre_start = heads[0] - len(pre_lines)
    preamble = "\n".join(pre_lines)
    merge_pre = False
    # dòng tiêu đề của họ khác (vd. trang bìa tuần "第1週 ..." trước "1日目") không phải nội dung
    pre_content = chr(10).join(ln for ln in pre_lines if _heading_rank(ln) is None)
    if front:
        skipped.extend(m for m in front if m not in skipped)
    if front and keep is None:
        pass  # phần đầu sách -> bỏ hẳn
    elif not pre_content.strip():
        pass  # chỉ có trang bìa / tiêu đề nhóm -> bỏ
    else:
        merge_pre = not has_japanese(pre_content)
        if heads[0] > pre_start and has_japanese(pre_content):
            chapters.append(Chapter(1, INTRO_TITLE, preamble, pre_start, heads[0]))

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
            start = pre_start
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
