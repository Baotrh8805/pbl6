"""Chữ Hán giống hình và từ "dễ nhầm" (distractor C2 — quyết định 19/10: KRADFILE + bộ thủ/số nét Unihan, không IDS).

Độ giống hai chữ = 0.7 × Jaccard(thành phần KRADFILE) + 0.3 × (0.5 × cùng bộ thủ + 0.5 × max(0, 1 − |Δ tổng nét| / 5)).
Thành phần cấu tạo là tín hiệu chính (待/持/特/侍 cùng 土寸寺); bộ thủ + số nét chỉ phân hạng trong nhóm cùng thành
phần. Thiếu KRADFILE (hoặc chữ không có trong đó) thì chỉ còn tín hiệu yếu: giữ chữ **cùng bộ thủ, lệch ≤ 2 nét**,
điểm tối đa 0.3 → confidence hạ theo và distractors.build lọc bớt. Thiếu cả Unihan → không ứng viên.

Từ dễ nhầm (``lookalike_terms``): thay từng chữ Hán trong từ bằng chữ giống hình rồi **chỉ giữ chuỗi là từ có thật**
(danh sách JLPT hoặc JMdict) với nghĩa khác từ gốc — không có thì trả [] chứ không bịa (待つ → 持つ; 期待 → không).
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Iterable, Optional

from app.extract import jmdict, kanjidata
from app.extract.jachars import has_kanji, is_kanji
from app.extract.jlpt import classifier

W_COMPONENTS = 0.7      # trọng số Jaccard thành phần KRADFILE
W_RADICAL = 0.3         # trọng số (cùng bộ thủ + lệch nét) Unihan
STROKE_SPAN = 5         # lệch ≥ 5 nét → điểm nét = 0
FALLBACK_MAX_DELTA = 2  # không có KRADFILE: chỉ giữ chữ cùng bộ thủ lệch ≤ 2 nét
MAX_RANKED = 50         # giữ tối đa bấy nhiêu ứng viên / chữ trong cache
SIMILAR_WINDOW = 8      # số chữ giống hình thử thay ở mỗi vị trí (đa số chuỗi thay ra không phải từ)
# Nguồn xác nhận "từ có thật" → phần tin cậy (confidence = 0.5 × độ giống + 0.5 × phần này)
SOURCE_WEIGHT = {"jlpt": 1.0, "jmdict_common": 0.6, "jmdict": 0.4}
_SKIP_CHARS = frozenset("々〆ヶ")  # jachars coi là kanji nhưng không có bộ thủ / thành phần


# ----------------------------------------------------------------------------- chữ giống hình

def _score(a_comps: frozenset, a_rs: Optional[tuple[int, int]], b_comps: tuple, b_rs: Optional[tuple[int, int]]) -> float:
    jaccard = 0.0
    if a_comps and b_comps:
        bset = frozenset(b_comps)
        jaccard = len(a_comps & bset) / len(a_comps | bset)
    rs = 0.0
    if a_rs and b_rs:
        rs = 0.5 * (a_rs[0] == b_rs[0]) + 0.5 * max(0.0, 1.0 - abs(a_rs[1] - b_rs[1]) / STROKE_SPAN)
    return W_COMPONENTS * jaccard + W_RADICAL * rs


def _easiness(ch: str) -> int:
    """Cấp dễ nhất của từ JLPT chứa chữ (N5=0 … N1=4); chữ không có trong danh sách → 5."""
    levels = [classifier.level_index(e[3]) for e in classifier.entries_containing(ch)]
    return min(levels) if levels else classifier.level_index(None)


def _rank(ch: str, pool: Iterable[str]) -> list[tuple[str, float]]:
    comps = frozenset(kanjidata.components(ch))
    rs = kanjidata.radical_strokes(ch)
    if not comps and rs is None:
        return []
    scored: list[tuple[str, float]] = []
    for cand in pool:
        if cand == ch or len(cand) != 1 or cand in _SKIP_CHARS or not is_kanji(cand):
            continue
        cand_rs = kanjidata.radical_strokes(cand)
        if not comps:  # không có KRADFILE cho chữ này → chỉ nhận tín hiệu mạnh nhất của Unihan
            if rs is None or cand_rs is None or cand_rs[0] != rs[0] or abs(cand_rs[1] - rs[1]) > FALLBACK_MAX_DELTA:
                continue
        s = _score(comps, rs, kanjidata.components(cand), cand_rs)
        if s > 0:
            scored.append((cand, round(s, 4)))
    # điểm giảm dần → chữ "dễ" (gặp ở cấp thấp) trước → mã Unicode: thứ tự ổn định giữa các lần chạy
    scored.sort(key=lambda t: (-t[1], _easiness(t[0]), ord(t[0])))
    return scored[:MAX_RANKED]


@lru_cache(maxsize=4096)
def _rank_default(ch: str) -> tuple[tuple[str, float], ...]:
    return tuple(_rank(ch, classifier.jlpt_kanji_set()))


def reset() -> None:
    """Xoá cache xếp hạng (test đổi dữ liệu kanjidata / JLPT rồi gọi)."""
    _rank_default.cache_clear()


def similar(ch: str, k: int = 3, pool: Optional[Iterable[str]] = None) -> list[tuple[str, float]]:
    """``k`` chữ giống ``ch`` nhất trong ``pool`` (mặc định: chữ Hán của 5 danh sách JLPT) → [(chữ, điểm 0..1)].
    Không tính chính nó; thiếu dữ liệu → []. Kho mặc định được cache theo chữ vì một lô 1 000 từ lặp lại rất nhiều chữ."""
    if not ch or len(ch) != 1 or k <= 0:
        return []
    if pool is None:
        return list(_rank_default(ch)[:k])
    return _rank(ch, pool)[:k]


# ----------------------------------------------------------------------------- nghĩa trùng nhau

_WORD_RE = re.compile(r"\w+", re.UNICODE)
_STOP = frozenset({"to", "a", "an", "the", "of", "in", "on", "at", "for", "and", "or", "be", "etc", "one", "sth", "sb",
                   "esp", "usu", "with", "by", "from", "as", "is", "it", "up", "out"})


def gloss_tokens(gloss: Optional[str]) -> frozenset[str]:
    """Từ nội dung trong chuỗi nghĩa (EN hoặc VI), bỏ từ chức năng và ký tự lẻ như "e.g."."""
    return frozenset(w for w in _WORD_RE.findall((gloss or "").lower()) if len(w) > 1 and w not in _STOP)


def _overlap(ta: frozenset[str], tb: frozenset[str]) -> float:
    return len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0.0


def same_meaning(a: Optional[str], b: Optional[str]) -> bool:
    """Hai chuỗi nghĩa coi là cùng nghĩa khi ≥ 50 % từ nội dung của chuỗi ngắn hơn nằm trong chuỗi kia
    (hệ số chồng lấp, không phải Jaccard, để "bridge" ≈ "bridge; span"), xét trên cả chuỗi **và** trên nghĩa
    đầu tiên (trước dấu ';') vì JMdict liệt kê nhiều nghĩa phụ làm loãng chồng lấp ("very, awfully; (not) at all"
    vs "very (much), greatly"). Thiếu một bên → False (không kết luận được thì không loại)."""
    if not a or not b:
        return False
    if _overlap(gloss_tokens(a), gloss_tokens(b)) >= 0.5:
        return True
    return _overlap(gloss_tokens(a.split(";")[0]), gloss_tokens(b.split(";")[0])) >= 0.5


# ----------------------------------------------------------------------------- từ dễ nhầm

def word_entry(term: str, reading: Optional[str] = None) -> Optional[dict]:
    """``term`` có phải từ thật? Danh sách JLPT trước (ưu tiên mục đúng ``reading``), rồi JMdict theo kanji
    → {reading, meaning, level, source: jlpt | jmdict_common | jmdict}; không nguồn nào có → None."""
    rows = classifier.entries_of(term)
    if rows:
        r = next((row for row in rows if reading and row[0] == reading), rows[0])
        return {"reading": r[0] or None, "meaning": r[1] or None, "level": r[2], "source": "jlpt"}
    entry = jmdict.lookup(term, reading)
    if entry and entry["kanji"] == term:
        level = classifier.classify(term, entry["kana"], False)[0]
        return {"reading": entry["kana"], "meaning": entry["gloss"] or None, "level": level,
                "source": "jmdict_common" if entry["common"] else "jmdict"}
    return None


def lookalike_terms(term: str, reading: Optional[str] = None, level: Optional[str] = None, k: int = 3,
                    meaning: Optional[str] = None) -> list[dict]:
    """Từ có thật chỉ khác ``term`` một chữ Hán giống hình → [{term, reading, meaning, level, confidence}],
    confidence = 0.5 × độ giống chữ + 0.5 × (1 JLPT | 0.6 JMdict phổ biến | 0.4 JMdict khác), giảm dần;
    cùng confidence thì cấp gần ``level`` trước. Loại ứng viên cùng nghĩa với từ gốc (biến thể chữ viết) và
    cùng nghĩa với ứng viên đã giữ; ``meaning`` caller gửi (có thể tiếng Việt) chỉ BỔ SUNG gloss EN từ điển của
    ``term``, không thay thế. Từ toàn kana / không tìm được từ thật → []."""
    if not term or k <= 0 or not has_kanji(term):
        return []
    own = word_entry(term, reading)
    own_meanings = [m for m in (meaning, own["meaning"] if own else None) if m]
    found: dict[str, dict] = {}
    for i, ch in enumerate(term):
        if not is_kanji(ch) or ch in _SKIP_CHARS:
            continue
        for cand_ch, sim in similar(ch, k=max(k, SIMILAR_WINDOW)):
            cand = term[:i] + cand_ch + term[i + 1:]
            if cand == term or cand in found:
                continue
            entry = word_entry(cand)
            if entry is None or any(same_meaning(m, entry["meaning"]) for m in own_meanings):
                continue
            conf = round(0.5 * sim + 0.5 * SOURCE_WEIGHT[entry["source"]], 3)
            found[cand] = {"term": cand, "reading": entry["reading"], "meaning": entry["meaning"],
                           "level": entry["level"], "confidence": conf}
    target = classifier.level_index(level)
    ranked = sorted(found.values(),
                    key=lambda d: (-d["confidence"], abs(classifier.level_index(d["level"]) - target), d["term"]))
    out: list[dict] = []
    for d in ranked:
        if any(same_meaning(d["meaning"], kept["meaning"]) for kept in out):
            continue
        out.append(d)
        if len(out) >= k:
            break
    return out
