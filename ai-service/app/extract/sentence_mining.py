"""Khai thác câu i+1 (C6, sentence mining): tìm trong tài liệu những câu mà người học chỉ gặp ĐÚNG một từ chưa biết.

Ý tưởng (Krashen i+1): câu dễ nhất để học một từ mới là câu mà mọi từ còn lại đều đã biết — người học suy nghĩa từ
ngữ cảnh thay vì tra từng từ. Với mỗi câu: tách từ Sudachi mode C → giữ từ nội dung (danh / động / tính / phó từ,
cùng bộ lọc POS với pipeline để "từ vựng" ở trang trích xuất và ở đây là một khái niệm) → mỗi từ là *đã biết* khi
người dùng khai báo (``knownLemmas``, từ backend: thẻ đã học) hoặc, khi ``assumeLevelKnown``, cấp JLPT của nó
(classifier.classify: danh sách JLPT, fallback wordfreq) không khó hơn cấp người học; từ không có cấp coi như chưa biết.
Câu có đúng ``max_unknown`` từ chưa biết thì giữ, từ chưa biết là ``target``.

Điểm xếp hạng (0..1) ưu tiên câu ngắn (câu mẫu vừa đọc), từ đích có trong danh sách JLPT (đã kiểm duyệt, có cấp chắc)
và từ thông dụng (wordfreq) — không phải thước đo tuyệt đối, chỉ để câu tốt lên đầu khi tài liệu dài.

``mine_for_terms`` là mặt còn lại của cùng câu hỏi: với từng từ vựng trang trích xuất đưa ra, câu nào trong tài liệu
chứa nó mà KHÔNG còn từ lạ nào khác (bất kể cấp của chính từ đó — người học đang học nó).

Chuỗi OOV của Sudachi (覆公, rác OCR) không bao giờ làm từ đích: không ai nên học nó, nên câu chứa nó bị bỏ.
Thiếu JMdict chỉ làm ``meaningEn`` rơi về cột meaning của CSV JLPT / None; thiếu wordfreq chỉ làm điểm tần suất = 0.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional

from app.extract import han_viet_graph, jmdict, tokenizer
from app.extract.furigana import align
from app.extract.jachars import has_japanese, has_kanji, is_kana_only
from app.extract.jlpt import classifier
from app.extract.jlpt.classifier import LEVELS, classify, level_index, meaning_hint
from app.extract.tokenizer import Token, reading_of, tokenize

MAX_TEXT_CHARS = 50_000
# "Câu" dài hơn mức này (văn bản dán không có dấu câu, bảng OCR dính) không phải câu mẫu để học, và Sudachi từ chối
# chuỗi > 49 149 byte → bỏ qua trước khi tách từ thay vì làm hỏng cả lô. Cùng cỡ với pipeline.EXAMPLE_MAX.
MAX_SENTENCE_CHARS = 500
DEFAULT_LIMIT = 200
DEFAULT_LEVEL = "N5"
# Điểm độ dài: câu ≤ IDEAL_LEN ký tự được 1.0, dài hơn giảm dần 1/(1 + (n - IDEAL_LEN) / LEN_DECAY)
IDEAL_LEN = 10
LEN_DECAY = 20
ZIPF_MAX = 7.0   # thang zipf của wordfreq (日本 ≈ 6); chuẩn hoá về 0..1
W_LENGTH, W_LISTED, W_FREQ = 0.5, 0.25, 0.25

# Bản sao của pipeline._SENT_SPLIT_RE cho trường hợp không nạp được pipeline (xem split_sentences)
_SENT_SPLIT_RE = re.compile(r"(?<=[。！？．!?])|\n")

# Cùng bộ lọc từ nội dung với pipeline._is_candidate (không import để không phụ thuộc hàm riêng của module khác):
# POS lớp 1 giữ lại; động từ / tính từ 非自立可能 mang vai trò chức năng thì bỏ.
_KEEP_POS1 = {"名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞"}
_FUNCTIONAL_VERBS = {"する", "なる", "ある", "いる", "できる", "いける", "しれる", "くださる", "なさる",
                     "おる", "ござる", "いたす", "致す", "いう", "言う"}
_FUNCTIONAL_ADJ = {"ない", "無い", "いい", "よい", "良い", "ほしい", "欲しい"}


def available() -> bool:
    """Chỉ cần Sudachi (pip, luôn có); JMdict / wordfreq thiếu chỉ làm nghĩa / điểm kém đi."""
    return tokenizer.available()


# ----------------------------------------------------------------------------- tách câu

def split_sentences(text: str) -> list[str]:
    """Tách câu theo 。！？．!? và xuống dòng, bỏ câu không có kana / kanji — đúng như pipeline.split_sentences.
    Dùng lại hàm của pipeline khi nạp được để hai nơi không lệch nhau (import pipeline nhẹ, không nạp dữ liệu);
    pipeline đổi tên / lỗi nạp → bản sao tại chỗ, khai thác câu vẫn chạy."""
    try:
        from app.extract.pipeline import split_sentences as _pipeline_split
    except Exception:
        _pipeline_split = None
    if _pipeline_split is not None:
        return _pipeline_split(text)
    out: list[str] = []
    for part in _SENT_SPLIT_RE.split(text):
        s = (part or "").strip()
        if s and has_japanese(s):
            out.append(s)
    return out


# ----------------------------------------------------------------------------- tập từ đã biết

def _norm(term: str) -> str:
    return (term or "").strip().replace("～", "").replace("〜", "")


def _level_or_default(level: Optional[str]) -> str:
    return level if level in LEVELS else DEFAULT_LEVEL


def _jlpt_lemmas_at_or_below(level: str) -> set[str]:
    """Mọi expression trong CSV JLPT ở cấp ``level`` hoặc dễ hơn. Đọc thẳng bảng _entries của classifier (mỗi mục ở cấp
    dễ nhất của nó, đúng cách classify chọn cấp) thay vì nạp lại CSV; ~8 000 mục nên không cần cache."""
    classifier._load()
    cut = level_index(level)
    return {expr for expr, _reading, _meaning, lv in classifier._entries if level_index(lv) <= cut}


def _known_forms(term: str) -> set[str]:
    """Dạng khai báo + dạng lemma Sudachi của nó: thẻ ghi theo giáo trình (勉強する, 散歩をする, 静かな) còn Sudachi tách
    する / な thành token riêng và lemma là 勉強 / 散歩 / 静か — không bỏ đuôi thì từ đã học vẫn bị đếm là lạ."""
    x = _norm(term)
    out = {x} if x else set()
    for suf in ("をする", "する", "な"):   # đuôi dài trước, chỉ bỏ một đuôi (散歩をする → 散歩, không thêm 散歩を)
        if x.endswith(suf) and len(x) > len(suf):
            out.add(x[:-len(suf)])
            break
    return out


def known_set(known_lemmas: Iterable[str], user_level: str = DEFAULT_LEVEL, assume_level_known: bool = True) -> set[str]:
    """Tập lemma coi là đã biết: ``known_lemmas`` (đã strip, bỏ rỗng / dấu ～, thêm dạng bỏ đuôi する / な) ∪ (khi
    ``assume_level_known``) mọi từ JLPT ở cấp ≤ ``user_level``. Từ có cấp nhờ wordfreq (không trong CSV) không nằm trong
    tập này — ``mine`` xét thêm bằng cấp của từng token, nên tập này là "những gì chắc chắn đã biết" để client hiển thị /
    kiểm tra."""
    known: set[str] = set()
    for x in known_lemmas or ():
        known |= _known_forms(x)
    if assume_level_known:
        known |= _jlpt_lemmas_at_or_below(_level_or_default(user_level))
    return known


# ----------------------------------------------------------------------------- phân tích từng câu

@dataclass(frozen=True, slots=True)
class _Word:
    tok: Token
    reading: str            # cách đọc của lemma (không phải của dạng đã chia)
    level: Optional[str]
    listed: bool            # có trong danh sách JLPT (không phải chỉ wordfreq)
    known: bool


@dataclass(frozen=True, slots=True)
class _Sentence:
    order: int
    text: str
    words: tuple[_Word, ...]
    # ranh giới (begin / end) của MỌI token Sudachi, kể cả trợ từ: chuỗi con chỉ được coi là "chứa từ" khi khớp đúng
    # ranh giới token — 本 không nằm trong 日本, 学生 không nằm trong 留学生
    starts: frozenset[int] = frozenset()
    ends: frozenset[int] = frozenset()

    @property
    def unknown(self) -> list[_Word]:
        """Từ chưa biết, mỗi (lemma, cách đọc) một lần: câu dùng từ mới hai lần vẫn là câu i+1 (và là câu minh hoạ tốt)."""
        seen: set[tuple[str, str]] = set()
        out: list[_Word] = []
        for w in self.words:
            key = (w.tok.lemma, w.reading)
            if w.known or key in seen:
                continue
            seen.add(key)
            out.append(w)
        return out

    @property
    def known_count(self) -> int:
        return sum(1 for w in self.words if w.known)


def _is_content(tok: Token, prev: Optional[Token]) -> bool:
    """Từ nội dung đáng tính là "biết / chưa biết": bỏ trợ từ, trợ động từ, ký hiệu, số, kana đơn, tên riêng ngoài
    JLPT, gốc trợ động từ (そう / よう / みたい) và động từ / tính từ bổ trợ (て + いる, する, ない…)."""
    p1, p2 = tok.pos1, tok.pos2
    if p1 not in _KEEP_POS1:
        return False
    if not has_japanese(tok.lemma) or not has_japanese(tok.surface):
        return False
    if is_kana_only(tok.lemma) and len(tok.lemma) == 1:
        return False
    if p1 == "名詞" and p2 == "数詞":
        return False
    if p1 == "名詞" and p2 == "固有名詞":
        _, _, sources = classify(tok.lemma, tok.reading, False)
        return any(src.startswith("jlpt_list") for src in sources)
    if p2 == "助動詞語幹":
        return False
    if p1 == "動詞" and p2 == "非自立可能":
        if prev is not None and prev.pos1 == "助詞" and prev.surface in ("て", "で"):
            return False
        if tok.lemma in _FUNCTIONAL_VERBS:
            return False
    if p1 == "形容詞" and p2 == "非自立可能" and tok.lemma in _FUNCTIONAL_ADJ:
        return False
    return True


def _lemma_reading(tok: Token) -> str:
    """Cách đọc của dạng từ điển (見ました → みる), như pipeline._lemma_reading."""
    if tok.surface == tok.lemma:
        return tok.reading
    return reading_of(tok.lemma) or tok.reading


def _is_known(tok: Token, level: Optional[str], known: set[str], user_level: str, assume_level_known: bool) -> bool:
    """Đã biết khi người dùng khai báo (lemma / surface / dạng chuẩn hoá) hoặc, khi assume_level_known, cấp JLPT
    không khó hơn cấp người học. Không có cấp (None → chỉ số 5) luôn là chưa biết: không đoán hộ người học."""
    if tok.lemma in known or tok.surface in known or tok.normalized in known:
        return True
    if not assume_level_known:
        return False
    return level is not None and level_index(level) <= level_index(user_level)


def _analyse(text: str, known: set[str], user_level: str, assume_level_known: bool) -> list[_Sentence]:
    """Tách câu (bỏ trùng, giữ lần xuất hiện đầu; bỏ câu dài quá MAX_SENTENCE_CHARS), tách từ, gắn cấp / cờ đã biết
    cho từng từ nội dung."""
    out: list[_Sentence] = []
    seen: set[str] = set()
    for sent in split_sentences(text[:MAX_TEXT_CHARS]):
        if sent in seen or len(sent) > MAX_SENTENCE_CHARS:
            continue
        seen.add(sent)
        words: list[_Word] = []
        prev: Optional[Token] = None
        toks = tokenize(sent, "C")
        for tok in toks:
            if _is_content(tok, prev):
                reading = _lemma_reading(tok)
                level, _, sources = classify(tok.lemma, reading, is_kana_only(tok.lemma))
                listed = any(s.startswith("jlpt_list") for s in sources)
                words.append(_Word(tok, reading, level, listed,
                                   _is_known(tok, level, known, user_level, assume_level_known)))
            prev = tok
        out.append(_Sentence(len(out), sent, tuple(words), frozenset(t.begin for t in toks), frozenset(t.end for t in toks)))
    return out


# ----------------------------------------------------------------------------- điểm và mô tả từ đích

def _length_term(n: int) -> float:
    return 1.0 / (1.0 + max(0, n - IDEAL_LEN) / LEN_DECAY)


def _score(length: int, lemma: str, listed: bool) -> float:
    """0..1: câu ngắn + từ đích có trong danh sách JLPT + từ thông dụng. wordfreq thiếu → điểm tần suất 0."""
    freq = min(max(han_viet_graph.word_frequency(lemma), 0.0), ZIPF_MAX) / ZIPF_MAX
    return round(W_LENGTH * _length_term(length) + W_LISTED * (1.0 if listed else 0.0) + W_FREQ * freq, 3)


def _meaning(lemma: str, reading: Optional[str]) -> Optional[str]:
    """Nghĩa EN: từ toàn kana tra JMdict theo kana dễ trúng đồng âm → ưu tiên cột meaning JLPT (như pipeline)."""
    hint = meaning_hint(lemma, reading)
    if is_kana_only(lemma) and hint:
        return hint
    entry = jmdict.lookup(lemma, reading)
    return (entry["gloss"] if entry else None) or hint


def _target_info(lemma: str, surface: str, reading: Optional[str], level: Optional[str]) -> dict:
    reading = reading or None
    return {
        "lemma": lemma,
        "surface": surface,
        "reading": reading,
        "level": level,
        "meaningEn": _meaning(lemma, reading),
        "readingSegments": align(lemma, reading) if reading and has_kanji(lemma) else None,
    }


def _word_target(w: _Word) -> dict:
    return _target_info(w.tok.lemma, w.tok.surface, w.reading, w.level)


def _rank_unknown(w: _Word) -> tuple:
    """Khi max_unknown > 1, từ đích là từ chưa biết "đáng học" nhất: có trong JLPT trước, rồi thông dụng hơn."""
    return (0 if w.listed else 1, -han_viet_graph.word_frequency(w.tok.lemma), w.tok.begin)


# ----------------------------------------------------------------------------- API

def mine_report(text: str, known_lemmas: Iterable[str], user_level: str = DEFAULT_LEVEL,
                assume_level_known: bool = True, max_unknown: int = 1, limit: int = DEFAULT_LIMIT) -> dict:
    """{items, stats: {sentences, kept}}: ``sentences`` = số câu tiếng Nhật khác nhau đã xét, ``kept`` = số câu đạt
    i+1 TRƯỚC khi cắt ``limit`` (client biết còn câu nữa). items xếp theo điểm giảm dần, cùng điểm theo thứ tự trong
    tài liệu."""
    user_level = _level_or_default(user_level)
    known = known_set(known_lemmas, user_level, assume_level_known)
    max_unknown = max(1, int(max_unknown))
    sentences = _analyse(text or "", known, user_level, assume_level_known)
    scored: list[tuple[float, int, _Sentence, _Word]] = []
    for s in sentences:
        unknown = s.unknown
        if len(unknown) != max_unknown or any(w.tok.oov for w in unknown):
            continue
        target = min(unknown, key=_rank_unknown)
        scored.append((_score(len(s.text), target.tok.lemma, target.listed), s.order, s, target))
    scored.sort(key=lambda r: (-r[0], r[1]))
    items = [{
        "sentence": s.text,
        "target": _word_target(target),
        "unknownCount": max_unknown,
        "knownCount": s.known_count,
        "length": len(s.text),
        "score": score,
    } for score, _, s, target in scored[:max(0, int(limit))]]
    return {"items": items, "stats": {"sentences": len(sentences), "kept": len(scored)}}


def mine(text: str, known_lemmas: Iterable[str], user_level: str = DEFAULT_LEVEL, assume_level_known: bool = True,
         max_unknown: int = 1, limit: int = DEFAULT_LIMIT) -> list[dict]:
    """Câu i+1 của tài liệu → [{sentence, target: {lemma, surface, reading, level, meaningEn, readingSegments},
    unknownCount, knownCount, length, score}], tốt nhất trước, tối đa ``limit``."""
    return mine_report(text, known_lemmas, user_level, assume_level_known, max_unknown, limit)["items"]


def _locate(s: _Sentence, term: str) -> Optional[tuple[int, int, Optional[_Word]]]:
    """Vị trí của ``term`` trong câu: token nội dung có lemma / surface / dạng chuẩn hoá trùng (bắt cả dạng đã chia:
    見る ↔ 見ました) → (begin, end, từ); không có thì chuỗi con nguyên văn (cụm nhiều token: 勉強する, mẫu ngữ pháp)
    nhưng chỉ khi khớp đúng ranh giới token — 本 trong 日本 hay 学生 trong 留学生 không phải là từ đó → (begin, end, None).
    Không chứa → None."""
    for w in s.words:
        if term in (w.tok.lemma, w.tok.surface, w.tok.normalized):
            return w.tok.begin, w.tok.end, w
    idx = s.text.find(term)
    while idx >= 0:
        end = idx + len(term)
        if idx in s.starts and end in s.ends:
            return idx, end, None
        idx = s.text.find(term, idx + 1)
    return None


def mine_for_terms(text: str, terms: Iterable[str], known_lemmas: Iterable[str], user_level: str = DEFAULT_LEVEL,
                   assume_level_known: bool = True) -> list[dict]:
    """Với từng ``term`` (theo thứ tự gửi): câu tốt nhất trong tài liệu chứa nó mà mọi từ nội dung KHÁC đều đã biết →
    [{term, sentence | None, target | None}]. Cấp của chính ``term`` không xét (người học đang học nó); từ nằm trong
    khoảng ký tự của term (cụm nhiều token) không tính là "từ khác". Không có câu nào → sentence / target None."""
    user_level = _level_or_default(user_level)
    known = known_set(known_lemmas, user_level, assume_level_known)
    sentences = _analyse(text or "", known, user_level, assume_level_known)
    # Chỉ mục lemma / surface / dạng chuẩn hoá → câu, dựng một lần (O(tổng token)): với 500 từ × ~3 000 câu, quét từng
    # từ nội dung của mọi câu cho mỗi term mất ~6 s; giờ mỗi cặp chỉ còn một phép ``in`` trên chuỗi (C) + tra set
    by_word: dict[str, set[int]] = {}
    for s in sentences:
        for w in s.words:
            for key in (w.tok.lemma, w.tok.surface, w.tok.normalized):
                by_word.setdefault(key, set()).add(s.order)
    out: list[dict] = []
    for raw in terms or ():
        term = _norm(raw)
        best: Optional[tuple[float, int, _Sentence, dict]] = None
        if term:
            listed_in = by_word.get(term, frozenset())
            for s in sentences:
                if s.order not in listed_in and term not in s.text:
                    continue
                hit = _locate(s, term)
                if hit is None:
                    continue
                begin, end, word = hit
                others = [w for w in s.unknown if w.tok.end <= begin or w.tok.begin >= end]
                if others:
                    continue
                if word is not None:
                    listed, lemma = word.listed, word.tok.lemma
                else:
                    _, _, sources = classify(term, None, is_kana_only(term))
                    listed, lemma = any(src.startswith("jlpt_list") for src in sources), term
                score = _score(len(s.text), lemma, listed)
                if best is None or (score, -s.order) > (best[0], -best[1]):
                    if word is not None:
                        target = _word_target(word)
                    else:
                        reading = reading_of(term) if has_japanese(term) else None
                        level, _, _ = classify(term, reading, is_kana_only(term))
                        target = _target_info(term, s.text[begin:end], reading, level)
                    best = (score, s.order, s, target)
        out.append({"term": raw, "sentence": best[2].text if best else None, "target": best[3] if best else None})
    return out
