"""Phương án gây nhiễu có căn cứ cho quiz (UC-20, quyết định D11 19/10): kanji giống hình (C2) và từ đồng âm (C3).

Mỗi ứng viên mang ``confidence`` để backend / admin lọc (`distractor_min_confidence` trong app_settings) và để ngân
hàng câu hỏi biết câu nào "chắc". Nguồn:
  - kanji giống hình: kanji_similar.lookalike_terms (KRADFILE + Unihan, chỉ giữ từ có thật) — từ toàn kana không có.
  - đồng âm: danh sách JLPT (0.9, đã kiểm duyệt, có cấp) → JMdict phổ biến (0.75) → JMdict khác (0.55);
    loại chính từ đó và dạng thêm / bớt okurigana của nó (待 ↔ 待つ), từ toàn kana, từ cùng nghĩa (biến thể chữ viết
    嘴/觜, 御飯/ご飯) và ứng viên trùng nghĩa nhau.
Nghĩa caller gửi kèm (cột `meaning` của thẻ, thường tiếng Việt) chỉ BỔ SUNG chứ không thay gloss EN từ điển khi so
nghĩa: gloss ứng viên là EN nên so với nghĩa VI thì bộ lọc tắt im lặng (帰る nhận lại 返る "to return" làm đáp án sai).
Thiếu dữ liệu nào thì nguồn đó im lặng; thiếu hết → mọi danh sách rỗng, không ném lỗi (không bao giờ bịa).
"""
from __future__ import annotations

from typing import Iterable, Optional

from app.extract import jmdict, kanji_similar
from app.extract.jachars import has_kanji, is_kana_only, kata_to_hira
from app.extract.jlpt import classifier

KINDS = ("kanji_lookalike", "homophone")
CONF_JLPT, CONF_JMDICT_COMMON, CONF_JMDICT_OTHER = 0.9, 0.75, 0.55
JMDICT_HOMOPHONE_LIMIT = 20   # lấy dư rồi lọc nghĩa / cap k


def available() -> bool:
    """Có ít nhất một nguồn sinh được distractor (JMdict hoặc danh sách JLPT) — cờ ``distractors`` ở /extract/health."""
    return jmdict.available() or classifier.available()


def _reading_of(term: str) -> Optional[str]:
    if is_kana_only(term):
        return kata_to_hira(term)
    entry = kanji_similar.word_entry(term)
    return kata_to_hira(entry["reading"]) if entry and entry["reading"] else None


def _meaning_of(term: str, reading: Optional[str]) -> Optional[str]:
    entry = kanji_similar.word_entry(term, reading)
    return entry["meaning"] if entry else None


def _rank_key(c: dict) -> tuple:
    return (-c["confidence"], classifier.level_index(c["level"]), c["term"])


def _okurigana_variant(a: str, b: str) -> bool:
    """``a`` và ``b`` là cùng một từ viết có / không có okurigana (待 ↔ 待つ, 休 ↔ 休む): thẻ chỉ ghi chữ Hán gốc thì
    word_entry không tra được nghĩa, bộ lọc nghĩa không chạy và chính động từ của nó lọt vào như "đồng âm" 0.9."""
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    return len(short) < len(long_) and has_kanji(short) and long_.startswith(short) and is_kana_only(long_[len(short):])


def homophones(term: str, reading: Optional[str] = None, meaning: Optional[str] = None,
               min_confidence: float = 0.6, k: int = 3) -> list[dict]:
    """Từ khác đọc giống ``term`` → [{term, reading, meaning, level, confidence}] giảm dần theo confidence,
    rồi cấp dễ trước. Không biết cách đọc (không truyền và không tra được) → []."""
    reading = kata_to_hira(reading) if reading else _reading_of(term)
    if not reading or k <= 0:
        return []
    # Nghĩa của CHÍNH từ để loại đồng âm cùng nghĩa: nghĩa caller gửi (có thể tiếng Việt) + gloss EN từ điển (JLPT →
    # JMdict theo kanji) — luôn tra thêm vì gloss ứng viên là EN. Gloss JMdict tra lỏng (rơi về kana: dạng kanji của
    # từ thường viết kana, とても ↔ 迚も) chỉ dùng để loại gloss y hệt, không đưa vào heuristic nghĩa (có thể là của từ khác)
    own_meanings = [m for m in (meaning, _meaning_of(term, reading)) if m]
    own = jmdict.lookup(term, reading)
    own_glosses = set(own_meanings) | ({own["gloss"]} if own and own["gloss"] else set())
    cands: list[dict] = []
    seen = {term}
    for expr, m, level in classifier.homophones_jlpt(reading):
        if expr in seen or is_kana_only(expr):
            continue
        seen.add(expr)
        cands.append({"term": expr, "reading": reading, "meaning": m or None, "level": level, "confidence": CONF_JLPT})
    for kanji, gloss, common in jmdict.homophones(reading, term, limit=JMDICT_HOMOPHONE_LIMIT):
        if kanji in seen:
            continue
        seen.add(kanji)
        level = classifier.classify(kanji, reading, False)[0]
        cands.append({"term": kanji, "reading": reading, "meaning": gloss or None, "level": level,
                      "confidence": CONF_JMDICT_COMMON if common else CONF_JMDICT_OTHER})
    out: list[dict] = []
    for c in sorted(cands, key=_rank_key):
        if c["confidence"] < min_confidence:
            break  # đã sắp giảm dần
        if _okurigana_variant(term, c["term"]):
            continue
        if c["meaning"] in own_glosses or any(kanji_similar.same_meaning(m, c["meaning"]) for m in own_meanings):
            continue
        if any(kanji_similar.same_meaning(c["meaning"], kept["meaning"]) for kept in out):
            continue
        out.append(c)
        if len(out) >= k:
            break
    return out


def build(items: Iterable[dict], kinds: Iterable[str] = KINDS, min_confidence: float = 0.6, k: int = 3) -> list[dict]:
    """Mỗi item {ref, term, reading?, meaning?, level?} → {ref, kanjiLookalike: [...], homophones: [...]}
    (hai khoá luôn có mặt; loại không yêu cầu trong ``kinds`` → []). Mỗi ứng viên {term, reading, meaning, level,
    confidence}, chỉ giữ confidence ≥ ``min_confidence``, tối đa ``k``. Thiếu dữ liệu → danh sách rỗng, không lỗi."""
    wanted = set(kinds)
    out: list[dict] = []
    for it in items:
        term = (it.get("term") or "").strip()
        reading = kata_to_hira((it.get("reading") or "").strip()) or None
        meaning = (it.get("meaning") or "").strip() or None
        level = it.get("level") or None
        row = {"ref": it.get("ref"), "kanjiLookalike": [], "homophones": []}
        if term:
            # `meaning` (nếu có) chỉ bổ sung: lookalike_terms / homophones tự tra thêm gloss EN từ điển của từ
            if "kanji_lookalike" in wanted and has_kanji(term):
                cands = kanji_similar.lookalike_terms(term, reading, level, k=k, meaning=meaning)
                row["kanjiLookalike"] = [c for c in cands if c["confidence"] >= min_confidence][:k]
            if "homophone" in wanted:
                row["homophones"] = homophones(term, reading, meaning, min_confidence, k)
        out.append(row)
    return out
