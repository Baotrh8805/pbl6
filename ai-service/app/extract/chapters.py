"""Tách văn bản thành các chương trước khi trích từ vựng (Lộ trình học tập)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from app.extract import tokenizer
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
# không mở đầu tên bài -> bỏ hẳn. Dòng đọc như câu / lời dặn (_sentence_like) vẫn là ứng viên — tên bài thật cũng có dạng
# đó (でんしゃで, にほんへ, はじめてあったひ, はじめてのかいわ) và giữa dãy 第1課 → 第3課 thì vị trí đã đủ chứng minh — nhưng
# nhường số bài cho dòng đặt tên bài và không đứng được như bài cuối dãy không dấu ngăn (_fill_particle_gaps).
# "にも" không nằm trong trợ từ kép: tên bài にもつ / にもの mở đầu bằng nó, câu "第1課にも…" để dãy số bài lọc như mọi
# ứng viên khác.
_CANDIDATE_START = tuple("はにがので")
_PARTICLE_PAIRS = ("では", "には", "でも", "での")
_HEAD_SEP = ":：.．-－~〜)"  # dấu ngăn giữa từ khoá+số và tên bài mà _RE_JA / _RE_LATIN chấp nhận
# Đuôi câu / lời dặn: câu hỏi (か: …どうでしたか, …ますか), vị ngữ lịch sự / quá khứ (です, ます, でした, ました, ません),
# rủ / dặn (ましょう, ください, よう: おぼえよう, って: にもどって), điều kiện (たら), đuôi thân mật (だ, よ, ね), tính từ
# (しい: はたのしい, はむずかしい), danh từ hoá (こと: でならったこと), động từ thể từ điển hay gặp trong câu báo / lời dặn
# (…にいく, …がはじまる, …する), phỏng đoán (でしょう, だろう: はなんでしょう) và cụm dừng ở trợ từ (のまえに, のあとで,
# …から, …まで). Tên bài mở đầu bằng chữ trùng trợ từ hiếm khi kết thúc như thế (はじめまして, にほんのくらし, がっこう,
# はるやすみ, にもつ); danh sách chỉ phân xử hai dòng cùng số bài và chặn bài cuối dãy, không loại dòng nào khỏi dãy.
_SENTENCE_END = ("か", "です", "ます", "でした", "ました", "ません", "ましょう", "ください", "よう", "って", "たら",
                 "でしょう", "だろう", "だ", "よ", "ね", "しい", "こと", "いく", "くる", "する", "はじまる", "おわる",
                 "つづく", "に", "で", "を", "へ", "から", "まで")
# Động từ chia ở giữa dòng = mệnh đề bổ nghĩa / câu ("第3課 でならったこと", "第2課 にでてくるひと", "第4課がおわった"),
# tên bài không chứa; "はじめまして" chỉ có して nên không dính.
_VERB_INSIDE = ("った", "んだ", "てくる", "てきた", "ている", "ていた")
# Lời dặn chuyển bài: "第1課にもどる / にもどりましょう", "第4課にすすむ".
_INSTRUCTION_START = ("にもど", "にすす")
# Tên phần của một bài ("第4課のよしゅう" báo trước bài sau, "第2課のことば" tên hộp, "第3課 にでてきたことば"): đứng ngay sau
# の hoặc ở cuối dòng thì dòng nói VỀ một bài chứ không đặt tên bài. Bản kanji (の予習, の復習, の練習, の宿題, の目標) vốn đã
# bị loại vì trợ từ + kanji; bản hiragana phải loại y như thế, nếu không "第2課のよしゅう" và "第2課の予習" cho hai kết quả
# khác nhau.
_LESSON_PART = ("よしゅう", "ふくしゅう", "れんしゅう", "しゅくだい", "おさらい", "まとめ", "もくひょう", "ことば", "かんじ",
                "たんご", "ぶんぽう", "ぶんけい", "かいわ", "ぶんしょう", "よみもの", "ききとり", "もんだい", "かくにん")
# Ghi chú lịch học "第4課はらいしゅう" / "第4課はげつようび" (bài 4 học tuần sau / thứ Hai), "第4課はまだ" (chưa học), "第4課は
# なし" (không có bài 4): は / が + từ chỉ thời điểm / trạng thái — lớp từ đóng mà Sudachi đôi khi tách sai (はげ + つ +
# ようび, はまだ = họ Hamada, はなし = 話) nên liệt kê thẳng (_particle_led). なし chỉ khi đứng một mình: はなしあい,
# はなしましょう là tên bài.
_WHEN = ("あした", "あさって", "きょう", "こんど", "つぎ", "らいしゅう", "らいげつ", "らいねん", "げつようび", "かようび",
         "すいようび", "もくようび", "きんようび", "どようび", "にちようび", "まだ")

# Phần đầu / cuối sách: dòng ngắn đứng riêng khớp các từ khoá này (không phân biệt hoa thường) đánh dấu phần bị bỏ.
_FRONT_MATTER = ("はじめに", "まえがき", "序文", "本書の使い方", "この本の使い方", "教科書の使い方", "目次", "凡例",
                 "学習者の皆さんへ", "lời nói đầu", "lời mở đầu", "cách sử dụng", "hướng dẫn sử dụng", "mục lục",
                 "preface", "introduction", "how to use", "table of contents", "contents")
_BACK_MATTER = ("付録", "索引", "解答", "別冊", "phụ lục", "đáp án", "bảng tra", "appendix", "answer key", "answers",
                "index", "glossary")
MAX_MARKER_LEN = 40
TOC_MIN_RUN = 3        # ≥ 3 dòng mục lục liên tiếp (tiêu đề không có thân, hoặc kết thúc bằng số trang) -> cụm mục lục
# Dòng mục lục: phần sau từ khoá+số kết thúc bằng số trang (dấu chấm dẫn, hoặc chữ rồi khoảng trắng rồi số). Chữ đứng
# trước khoảng trắng chỉ được nhìn (lookbehind), không bị xoá cùng số trang: "第2課にもつ 165" (header đầu trang) phải cùng
# khoá _norm_title với "第2課にもつ", không thành "第2課にも" rồi tranh số bài với chính tiêu đề ấy.
_TOC_PAGE_NO = re.compile(r"(?:[.．…・]{2,}\s*|(?<=[^\s\d])\s+)[0-9０-９]{1,4}$")


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


def _classify(line: str) -> Optional[tuple[int, str, bool, bool, Optional[str]]]:
    """(hạng, từ khoá, chắc chắn, dấu ngăn mạnh, kiểu ngăn) nếu dòng khớp mẫu tiêu đề, ngược lại None. chắc chắn=False:
    phần đuôi mở đầu bằng chữ trùng trợ từ + hiragana -> chỉ nhận khi khớp dãy số bài (_fill_particle_gaps); dấu ngăn
    mạnh: xem _strong_sep; kiểu ngăn: xem _sep_style."""
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
                return rank, kw.lower(), True, False, _sep_style(m)
            if not (trailing.startswith(_CANDIDATE_START) and "ぁ" <= trailing[1:2] <= "ゖ"
                    and not trailing.startswith(_PARTICLE_PAIRS)):
                return None
            return rank, kw.lower(), False, _strong_sep(m), _sep_style(m)
    return None


def _sentence_like(trailing: str) -> bool:
    """Phần đuôi dính trợ từ đọc như câu / lời dặn / tên phần của bài. Câu hỏi có dấu ? cũng là câu: tên bài dạng câu
    hỏi chỉ gặp ở tiêu đề chắc chắn ("…ますか?" của Soumatome)."""
    if not trailing:
        return False
    if trailing[-1] in "?？" or trailing.endswith(_SENTENCE_END) or trailing.endswith(_LESSON_PART):
        return True
    return (any(v in trailing for v in _VERB_INSIDE) or trailing.startswith(_INSTRUCTION_START)
            or (trailing[0] == "の" and trailing[1:].startswith(_LESSON_PART)))


@lru_cache(maxsize=4096)
def _particle_led(trailing: str) -> bool:
    """Từ điển (Sudachi) đọc chữ đầu của phần đuôi là trợ từ: "はらいしゅう" = は + らいしゅう, "のこたえ" = の + こたえ,
    "はなんでしょう" = は + なん + でしょう; hoặc phần sau chữ đầu là trọn một từ mà cả cụm thì không ("がさいご" = が +
    さいご). Khi đó "第N課" + phần đuôi là câu nói VỀ bài N (lịch học, câu hỏi, "… của bài N"), không đặt tên bài.
    Danh sách _sentence_like không bao giờ liệt kê hết những câu ấy; từ điển thì biết はなみ, がっこう, にもつ, はるやすみ
    là một từ. Xét riêng phần đuôi (không kèm "第N課"): ngay sau 課 Sudachi ưu tiên tách trợ từ, kể cả "にほんのくらし" ->
    に + ほんの + くらし. Không có Sudachi -> True: không nhận thêm bài cuối nào ngoài lối có dấu ngăn như trước."""
    t = "".join(trailing.split())
    if t[:1] in "はが" and (t[1:].startswith(_WHEN) or t[1:] == "なし"):
        return True
    try:
        if not tokenizer.available():
            return True
        whole = tokenizer.tokenize(t, "C")
        rest = tokenizer.tokenize(t[1:], "C")
    except Exception:  # noqa: BLE001 — từ điển hỏng giữa chừng: an toàn là không nhận
        return True
    if whole and whole[0].surface == t[0] and whole[0].pos1 == "助詞":
        return True
    return len(rest) == 1 and not rest[0].oov and len(whole) > 1


@lru_cache(maxsize=4096)
def _particle_after_kw(trailing: str) -> bool:
    """Ngay sau "第N課" Sudachi đọc chữ đầu của phần đuôi là trợ từ ("第4課でならったことば" = で + ならった…, "第4課は
    おもしろかったです" = は + …; xét riêng phần đuôi thì で / は thành liên từ / cảm thán). Lối đọc này nghiêng về trợ từ — cả
    "にほんのことば" cũng thành に + ほんの + ことば — nên chỉ dùng kèm _sentence_like. Không có Sudachi -> True."""
    t = "".join(trailing.split())
    try:
        if not tokenizer.available():
            return True
        after = [x for x in tokenizer.tokenize("第1課" + t, "C") if x.begin >= 3]
    except Exception:  # noqa: BLE001 — như _particle_led
        return True
    return bool(after) and after[0].surface == t[:1] and after[0].pos1 == "助詞"


def _heading_rank(line: str) -> Optional[int]:
    """1 hoặc 2 nếu dòng chắc chắn là tiêu đề theo mẫu (hạng của họ từ khoá), ngược lại None."""
    c = _classify(line)
    return c[0] if c and c[2] else None


def _kw_trailing(m: "re.Match[str]") -> tuple[str, str]:
    """(từ khoá, phần đuôi) của một match tiêu đề; _RE_JA có hai nhánh nên từ khoá ở group 1 hoặc 2."""
    groups = [g for g in m.groups() if g is not None]
    return groups[0], groups[-1].strip()


def _title_part(line: str) -> str:
    """Phần đuôi (tên bài) của một dòng tiêu đề; "" nếu dòng không khớp mẫu."""
    line = line.strip()
    m = _RE_JA.match(line) or _RE_LATIN.match(line)
    return _kw_trailing(m)[1] if m else ""


def _gap(m: "re.Match[str]") -> str:
    """Đoạn giữa từ khoá+số và tên bài (khoảng trắng / dấu ngăn); regex đã nuốt đoạn này nên xét ngược từ nhóm đuôi."""
    start = end = m.start(m.lastindex)
    while start > 0 and (m.string[start - 1].isspace() or m.string[start - 1] in _HEAD_SEP):
        start -= 1
    return m.string[start:end]


def _strong_sep(m: "re.Match[str]") -> bool:
    """Ứng viên có dấu ngăn giữa từ khoá+số và tên bài ("第3課：がっこう", "Lesson 1: はじめまして"): lối dàn trang tiêu đề,
    câu văn không viết thế -> dấu hiệu để phân xử hai ứng viên cùng số bài và nhận bài cuối của dãy (bài cuối không dấu
    ngăn thì xét qua _sep_style, xem _fill_particle_gaps); không bao giờ đủ để nhận một dòng ngoài dãy số bài.
    Khoảng trắng không tính, kể cả 全角: mọi reader chuẩn hoá NFKC trước khi tách chương nên "　" tới đây đã là " ", mà nửa
    cỡ thì câu văn / tên hộp gõ tay cũng có ("第1課 にでてきたことば") trong khi tiêu đề thật hay bị trích dính liền (OCR, PDF
    nối chữ cỡ lớn); chữ Latin cạnh chữ Nhật thì vốn có khoảng trắng ("Lesson 1 の練習")."""
    return any(ch in _HEAD_SEP for ch in _gap(m))


_STYLE_FOLD = str.maketrans("：．－〜", ":.-~")
_MIXED = "mixed"  # đoạn dãy có tiêu đề dàn lẫn nhiều kiểu ngăn (không trùng kiểu ngăn nào của _sep_style)


def _sep_style(m: "re.Match[str]") -> Optional[str]:
    """Kiểu ngăn sau từ khoá+số: dấu ngăn (":" "." "-" "~" ")", không kể khoảng trắng quanh nó), " " (chỉ cách) hoặc ""
    (dính liền); None khi dòng không có tên bài ("第1課"). Một tài liệu dàn mọi tiêu đề bài cùng một kiểu; câu báo trước /
    tên hộp gõ tay thì không theo kiểu đó -> dùng để xác nhận tiêu đề cuối dãy (_fill_particle_gaps)."""
    if not m.group(m.lastindex).strip():
        return None
    gap = _gap(m)
    seps = [ch for ch in gap if ch in _HEAD_SEP]
    return seps[0].translate(_STYLE_FOLD) if seps else (" " if gap else "")


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
    - chỉ một dòng ứng với số n (một tiêu đề, kể cả bản lặp ở mục lục / đầu trang). Dòng dạng câu / tên phần bài
      (_sentence_like: "第1課はあいさつの課です" ở phần cách dùng sách, "第2課のよしゅう" cuối bài 1, hộp "第2課のことば") và
      trợ từ + câu (_particle_led: "第1課はあいさつ", hộp "第2課のはなし", "第2課はいつ") nhường cho dòng đặt tên bài cùng
      số. Còn hai dòng đều đọc được là tên bài ("第1課はなび" trong hộp ví dụ, hộp "第2課はるのうた") thì không biết
      dòng nào là tiêu đề -> không nhận dòng nào, trừ khi đúng một dòng có dấu hiệu tiêu đề: dấu ngăn (_strong_sep) hoặc
      có bản trong cụm mục lục và bản ở thân sách phía sau (_toc_cluster). Lặp trong thân bài (header đầu trang, hộp từ
      vựng hai lần, câu báo trước lặp lại) không tính: câu văn / tên hộp cũng lặp được như thế;
    - kề trước là bài n-1 (hoặc đầu tài liệu khi n = 1) và kề sau là bài n+1 (giữa dãy thì vị trí là đủ, kể cả tên bài
      dạng câu "第2課 でんしゃで"), hoặc đứng được như bài cuối của dãy (tail_ok). Văn bản dán tay "第1課 はじめまして /
      第2課 にほんのくらし / 第3課 がっこう" (cách nửa cỡ; 全角 cũng thành nửa cỡ sau NFKC) trước đây mất cả ba tên bài chỉ
      vì bài 3 không có bài sau: bài cuối không dấu ngăn giờ nhận được khi dãy dàn cùng một kiểu ngăn (_sep_style) và tên
      bài đọc được là một từ / cụm từ chứ không phải trợ từ + câu. Câu báo trước / ghi chú lịch học đứng đúng chỗ bài cuối
      không được nhận: "第4課の予習", "Unit 4 の まえに" không là ứng viên, "第4課のよしゅう", "第4課 はどうでしたか" đọc
      như câu (_sentence_like), "第4課 はらいしゅう", "第4課 はなんでしょう" là trợ từ + câu (_particle_led), "第4課はなみ"
      dính liền sau "第3課 しゅうまつ" khác kiểu ngăn với dãy;
    - ứng viên kề bên mà nó dựa vào không bị loại. Bài cuối bị loại thì bài liền trước thành bài cuối và chỉ được xét
      lại như bài cuối (không kéo đổ cả dãy). Loại lan truyền một chiều (không nhận lại) nên kết quả không phụ thuộc thứ
      tự xét; mỗi nút bị loại tối đa một lần -> tuyến tính theo số dòng tiêu đề."""
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

    def title_of(copies: list[int]) -> str:
        """Tên bài của một ứng viên, lấy ở bản ngoài mục lục nếu có (bản mục lục mang dấu chấm dẫn / số trang)."""
        i = next((j for j in copies if j not in in_toc), copies[0])
        t = _title_part(lines[i])
        return re.sub(r"[\s.．…・]*[0-9０-９]{1,4}$", "", t) if i in in_toc else t

    occ: dict[tuple[str, int], list[int]] = {}
    for slot, keys in by_slot.items():
        # dòng dạng câu / tên phần bài / trợ từ + câu nhường dòng đặt tên bài; không còn dòng đặt tên bài nào thì xét như
        # mọi ứng viên (giữ dấu hiệu tiêu đề của dòng có dấu ngăn: nó vẫn đỡ bài trước, xem prop)
        if len(keys) > 1:
            keys = {k: ii for k, ii in keys.items()
                    if not (_sentence_like(title_of(ii)) or _particle_led(title_of(ii)))} or keys
        # dấu hiệu tiêu đề: dấu ngăn, hoặc có bản ở mục lục và bản khác ở thân sách phía sau
        top = [k for k, ii in keys.items() if any(cls[i][3] for i in ii) or _toc_and_body(ii, in_toc)]
        if len(keys) == 1:
            occ[slot] = next(iter(keys.values()))
        elif len(top) == 1:  # đúng một dòng có dấu hiệu tiêu đề -> dòng đó; còn lại (kể cả hoà) không nhận dòng nào
            occ[slot] = keys[top[0]]
    if not occ:
        return heads
    slot_of = {i: slot for slot, ii in occ.items() for i in ii}
    toc_body = {s: _toc_and_body(ii, in_toc) for s, ii in occ.items()}
    # Thân bài của ứng viên: có dòng chữ giữa nó và dòng tiêu đề cùng hạng kế tiếp, ở ít nhất một bản
    filled = [0]  # filled[i] = số dòng có chữ trong lines[:i]
    for ln in lines:
        filled.append(filled[-1] + bool(ln.strip()))
    nxt = dict(zip(idx, idx[1:] + [len(lines)]))
    body = {s: any(filled[nxt[i]] - filled[i + 1] > 0 for i in ii) for s, ii in occ.items()}
    title = {s: title_of(ii) for s, ii in occ.items()}  # mọi bản cùng tên bài
    sentence = {s: _sentence_like(t) for s, t in title.items()}
    # Dãy theo thứ tự dòng của từng từ khoá: (số, slot ứng viên | None = chắc chắn, kiểu ngăn); bản lặp liền nhau của
    # cùng ứng viên (header đầu trang) gộp một để láng giềng luôn là bài khác.
    seq: dict[str, list[tuple[Optional[int], Optional[tuple[str, int]], Optional[str]]]] = {}
    for i in idx:
        s = slot_of.get(i)
        if cls[i][2] or s is not None:
            lst = seq.setdefault(cls[i][1], [])
            if s is None or not lst or lst[-1][1] != s:
                lst.append((num[i], s, cls[i][4]))
    nodes: list[tuple[Optional[int], Optional[tuple[str, int]], Optional[str]]] = []
    nb: list[tuple[int, int]] = []  # chỉ số nút kề trước / kề sau trong cùng từ khoá, -1 = đầu / cuối
    for lst in seq.values():
        base = len(nodes)
        nodes.extend(lst)
        nb.extend((base + k - 1 if k else -1, base + k + 1 if k + 1 < len(lst) else -1) for k in range(len(lst)))
    # Đoạn dãy liên tiếp (số tăng đúng 1) đứng ngay trước mỗi nút, tính một lượt theo dãy: kiểu ngăn chung của các tiêu
    # đề có tên bài trong đoạn (None = chưa có tên bài nào, _MIXED = lẫn kiểu), số nút, có tiêu đề chắc chắn không.
    run_style: list[Optional[str]] = [None] * len(nodes)
    run_len = [0] * len(nodes)
    run_sure = [False] * len(nodes)
    for k, (n, _s, _st) in enumerate(nodes):
        p = nb[k][0]
        if p >= 0 and n is not None and nodes[p][0] == n:  # header đầu trang lặp tiêu đề chắc chắn: vẫn là đoạn dãy ấy
            run_style[k], run_len[k], run_sure[k] = run_style[p], run_len[p], run_sure[p]
        elif p >= 0 and n is not None and nodes[p][0] == n - 1:
            pst, prev = nodes[p][2], run_style[p]
            run_style[k] = prev if pst is None or prev == pst else (pst if prev is None else _MIXED)
            run_len[k] = run_len[p] + 1
            run_sure[k] = run_sure[p] or nodes[p][1] is None

    def tail_ok(k: int) -> bool:
        """Ứng viên đứng được như bài cuối của đoạn dãy kết thúc ở nó (không cần bài n+1 phía sau)."""
        s, st = nodes[k][1], nodes[k][2]
        if toc_body[s]:  # có bản ở mục lục và bản ở thân sách: chính tài liệu liệt kê nó là một bài
            return True
        # Bài cuối là bài cuối của một dãy: có bài n-1 ngay trước (dòng lẻ "第1課: …" đứng một mình không phải dãy) và có
        # thân bài.
        if not run_len[k] or not body[s]:
            return False
        if st not in ("", " "):
            # Dấu ngăn (":" "." "-"…) là lối dàn tiêu đề, câu văn không viết "第2課: は…" -> nhận như trước, không so kiểu
            # ngăn với dãy: OCR làm rơi dấu ":" ở tiêu đề trước ("第1課かいもの" rồi "第2課. はじめまして") không được làm mất
            # bài cuối. Trợ từ + câu ("第4課: のよしゅう", "第4課. はおしまい", "第4課: でならったことば") vẫn là câu dù dàn
            # như tiêu đề; tên bài dạng câu mà từ điển đọc là từ ("第4課: にほんへ", "第4課: でんしゃで") thì vẫn nhận.
            return not (_particle_led(title[s]) or (sentence[s] and _particle_after_kw(title[s])))
        # Không dấu ngăn: điều kiện mới (trước đây không bao giờ nhận) nên chặt. "第N課の…" / "第N課 の…" ở chỗ bài cuối hầu
        # như luôn là "… của bài N" (のつづき, のこたえ…) -> tên bài mở đầu bằng の (のりもの) chỉ nhận khi có bài n-1 và n+1
        # hai bên. Đoạn dãy phải neo vào tiêu đề chắc chắn hoặc đủ 3 bài: hai dòng "第1課 は…" / "第2課 は…" liền nhau
        # chưa đủ là một dãy tiêu đề. Kiểu ngăn phải trùng kiểu của mọi tiêu đề có tên bài trước nó trong đoạn (đoạn chỉ
        # có tiêu đề trơn không có kiểu để so -> không nhận). Tên bài không được đọc như câu (_sentence_like) hay trợ từ +
        # câu (_particle_led): "第4課 はらいしゅう" cuối bài 3 cùng kiểu cách với dãy vẫn là ghi chú lịch học.
        if title[s].startswith("の") or not (run_sure[k] or run_len[k] + 1 >= 3) or run_style[k] != st:
            return False
        return not sentence[s] and not _particle_led(title[s])

    tail_memo: dict[int, bool] = {}

    def tail(k: int) -> bool:  # tính khi cần, mỗi nút một lần: chỉ tra từ điển khi dãy đã khớp
        if k not in tail_memo:
            tail_memo[k] = tail_ok(k)
        return tail_memo[k]

    ok = [False] * len(nodes)
    # Bài cuối có dấu ngăn / bản mục lục + thân mà nay không nhận (trợ từ + câu: "第5課: はらいげつ" cuối bài 4, không có
    # thân bài) vẫn là dòng "bài n+1" dàn như tiêu đề ngay sau bài n — trước đây nó được nhận và đỡ bài n như mọi bài sau.
    # Loại nó không được kéo theo bài n: bài n giữ chỗ dựa như trước, chỉ dòng ghi chú không thành chương.
    strong = {s: any(cls[i][3] for i in ii) or toc_body[s] for s, ii in occ.items()}
    prop = [False] * len(nodes)
    fits = dict.fromkeys(occ, 0)  # số nút còn khớp của mỗi ứng viên (mục lục + thân: chỉ cần một chỗ khớp)
    at: dict[tuple[str, int], list[int]] = {}
    for k, (n, s, _st) in enumerate(nodes):
        if s is None:
            continue
        at.setdefault(s, []).append(k)
        p, q = nb[k]
        before = nodes[p][0] == n - 1 if p >= 0 else n == 1
        if before and (q < 0 or nodes[q][0] != n + 1):
            prop[k] = strong[s]
        if before and ((q >= 0 and nodes[q][0] == n + 1) or tail(k)):
            ok[k] = True
            fits[s] += 1
    dropped = [s for s, f in fits.items() if f == 0]
    while dropped:
        for k in at[dropped.pop()]:
            p, q = nb[k]
            # nút sau dựa vào k làm bài n-1 -> mất chỗ dựa; nút trước dựa vào k làm bài n+1 -> giờ là bài cuối của đoạn
            # dãy, chỉ còn nhận khi đứng được như bài cuối (trừ khi k là dòng "bài n+1" dàn như tiêu đề, xem prop)
            for j in (q, p):
                if j >= 0 and ok[j] and (j == q or not (prop[k] or tail(j))):
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


def _continues(a: Optional[str], b: Optional[str]) -> bool:
    """Tiêu đề `b` là bài ngay sau tiêu đề `a` trong cùng họ (cùng hạng, cùng từ khoá): 第1課 … -> 第2課 …"""
    if not a or not b or INTRO_TITLE in (a, b):
        return False
    ca, cb = _classify(a), _classify(b)
    na, nb = _head_number(a), _head_number(b)
    return bool(ca and cb and ca[:2] == cb[:2] and na is not None and nb is not None and na + 1 == nb)


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
    cut = max(fm) + 1 if fm else 0
    # Chương mang số liền trước chương giữ lại đầu tiên (bài n rồi bài n+1, cùng họ tiêu đề) là bài thật của dãy, không phải
    # mục lục sót: dòng "はじめに" / "Cách sử dụng ～です" trong bài 1 là mục nhỏ / ghi chú ngữ pháp của bài -> chỉ cắt phần
    # đứng trước dãy số bài ấy (mục nhập cuối mục lục "7日目…" rồi bài "1日目" thật thì vẫn cắt).
    while cut and _continues(chapters[cut - 1].title, chapters[cut].title):
        cut -= 1
    if cut:
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
