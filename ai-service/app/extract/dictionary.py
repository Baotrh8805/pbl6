"""Từ điển Nhật → (Việt do backend ghép) + Anh trên các bảng mới của jmdict.sqlite (spec 2026-10-26-tu-dien-design §4.2).

Bảng do scripts/build_dicts.write_jmdict dựng: words (mục từ, forms / senses dạng JSON), word_forms (dạng viết → mục), word_gloss_fts
(FTS5 trên mọi gloss tiếng Anh; sqlite thiếu FTS5 → bảng word_gloss + LIKE), examples (câu Tatoeba gắn đúng nghĩa), tags.
jmdict.sqlite cũ (chỉ có bảng entries) → available() = False, router trả 503 dictUnavailable; bóc tách vẫn chạy như trước.

Khoá mục từ: "w:<id JMdict>" (id ổn định giữa các bản JMdict); chữ Hán là "k:<chữ>" (dữ liệu ở kanji_cards). Lớp ghi đè của admin
(overrides.py) áp ở đây: cách đọc, gloss tiếng Anh, câu ví dụ (sửa / ẩn); nghĩa tiếng Việt KHÔNG ở ai-service (backend ghép).
"""
from __future__ import annotations

import json
import re
import sqlite3
from functools import lru_cache
from typing import Optional

from app.extract import han_viet, jmdict, kanji_cards, kanji_meanings, overrides, pitch
from app.extract.jachars import has_japanese, hira_to_kata, is_kanji, kata_to_hira

MAX_QUERY_CHARS = 64
MAX_LIMIT = 50
MAX_OFFSET = 500
TOTAL_CAP = 500
MAX_EXAMPLES = 20
MAX_TOKENIZE_CHARS = 300
_LEVEL_RANK = "CASE w.jlpt WHEN 'N5' THEN 0 WHEN 'N4' THEN 1 WHEN 'N3' THEN 2 WHEN 'N2' THEN 3 WHEN 'N1' THEN 4 ELSE 5 END"
_EN_TOKEN_RE = re.compile(r"[A-Za-z0-9']+")


class DictUnavailable(RuntimeError):
    """jmdict.sqlite chưa dựng lại bằng bản có bảng words (scripts/build_dicts.py --only jmdict)."""


def _conn() -> sqlite3.Connection:
    conn = jmdict._connect()
    if conn is None or not _has_table("words"):
        raise DictUnavailable("dictUnavailable")
    return conn


@lru_cache(maxsize=16)
def _has_table(name: str) -> bool:
    conn = jmdict._connect()
    if conn is None:
        return False
    with jmdict._lock:
        return conn.execute("SELECT 1 FROM sqlite_master WHERE name=?", (name,)).fetchone() is not None


def available() -> bool:
    return _has_table("words")


def has_examples() -> bool:
    if not available():
        return False
    with jmdict._lock:
        return jmdict._connect().execute("SELECT 1 FROM examples LIMIT 1").fetchone() is not None


def has_fts() -> bool:
    return _has_table("word_gloss_fts")


def _rows(sql: str, params: tuple = ()) -> list[tuple]:
    conn = _conn()
    with jmdict._lock:
        return conn.execute(sql, params).fetchall()


def clear_cache() -> None:
    entry.cache_clear()
    _tag_labels.cache_clear()


# ----------------------------------------------------------------------------- tìm kiếm

def _summary(row: tuple) -> dict:
    wid, head_kanji, head_kana, gloss_short, common, jlpt, n_ex = row
    key = f"w:{wid}"
    reading = overrides.word(key, "reading") or head_kana
    return {"id": wid, "key": key, "headKanji": head_kanji, "headKana": head_kana, "reading": reading,
            "glossShort": overrides.word(key, "meaning_en") or gloss_short, "common": bool(common), "jlpt": jlpt,
            "nExamples": n_ex}


_SUMMARY_COLS = "w.id, w.head_kanji, w.head_kana, w.gloss_short, w.common, w.jlpt, w.n_examples"


def _search_ja(q: str, limit: int, offset: int) -> dict:
    variants = tuple(dict.fromkeys((q, kata_to_hira(q), hira_to_kata(q))))
    exact_in = ",".join("?" * len(variants))
    ranges = " OR ".join("(f.form >= ? AND f.form < ?)" for _ in variants)
    range_params = tuple(p for v in variants for p in (v, v + "￿"))
    where = f"(f.form IN ({exact_in}) OR {ranges})"
    sql = (f"SELECT {_SUMMARY_COLS}, MIN(CASE WHEN f.form IN ({exact_in}) THEN 0 ELSE 1 END) AS exact, "
           f"MIN(length(f.form)) AS flen FROM word_forms f JOIN words w ON w.id = f.word_id WHERE {where} "
           f"GROUP BY w.id ORDER BY exact, w.common DESC, {_LEVEL_RANK}, flen, CAST(w.id AS INTEGER) LIMIT ? OFFSET ?")
    rows = _rows(sql, variants + variants + range_params + (limit, offset))
    total = _rows(f"SELECT COUNT(*) FROM (SELECT DISTINCT f.word_id FROM word_forms f WHERE {where} LIMIT {TOTAL_CAP})",
                  variants + range_params)[0][0]
    return {"items": [_summary(r[:7]) for r in rows], "total": total}


def _fts_query(q: str) -> Optional[str]:
    toks = _EN_TOKEN_RE.findall(q.lower())
    if not toks:
        return None
    quoted = [f'"{t}"' for t in toks]
    quoted[-1] += "*"
    return " ".join(quoted)


def _search_en(q: str, limit: int, offset: int) -> dict:
    ql = q.strip().lower()
    if has_fts():
        match = _fts_query(q)
        if not match:
            return {"items": [], "total": 0}
        hits = _rows("SELECT word_id, bm25(word_gloss_fts), gloss FROM word_gloss_fts WHERE word_gloss_fts MATCH ? "
                     "ORDER BY bm25(word_gloss_fts) LIMIT ?", (match, TOTAL_CAP))
    else:
        like = f"%{ql}%"
        hits = [(w, 0.0, g) for w, g in _rows("SELECT word_id, gloss FROM word_gloss WHERE lower(gloss) LIKE ? LIMIT ?",
                                               (like, TOTAL_CAP))]
    if not hits:
        return {"items": [], "total": 0}
    ids = [h[0] for h in hits]
    meta = {r[0]: r for r in _rows(f"SELECT {_SUMMARY_COLS} FROM words w WHERE w.id IN ({','.join('?' * len(ids))})",
                                   tuple(ids))}

    def rank(h: tuple) -> tuple:
        wid, score, gloss = h
        glosses = [g.strip().lower() for g in (gloss or "").split(";")]
        exact = any(g == ql or g == f"to {ql}" for g in glosses)
        m = meta.get(wid)
        level = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}.get(m[5] if m else None, 5)
        return (not exact, not (m and m[4]), level, score)

    ordered = sorted((h for h in hits if h[0] in meta), key=rank)
    page = ordered[offset:offset + limit]
    return {"items": [_summary(meta[h[0]]) for h in page], "total": len(ordered)}


# Loại từ Sudachi được coi là "từ nội dung" khi đưa dạng chia về dạng gốc; trợ từ, trợ động từ, ký hiệu, hậu tố bỏ qua.
_CONTENT_POS = frozenset({"動詞", "形容詞", "形状詞", "名詞", "代名詞", "副詞", "連体詞", "感動詞", "接続詞"})
MAX_LEMMAS = 5


def _lemma_candidates(q: str) -> list[str]:
    """Dạng gốc của các từ nội dung trong q theo thứ tự xuất hiện (食べました → 食べる, 高かった → 高い, 勉強しています → 勉強).
    Động từ "phụ" (非自立可能: する, いる, くる…) đứng sau một từ nội dung khác bị bỏ: trong 勉強しています từ cần tra là 勉強,
    không phải する / いる; còn đứng đầu (行かなかった, 見られる) thì vẫn là từ chính. Chuỗi toàn katakana mà Sudachi không nhận ra
    (タベマシタ) được thử lại ở dạng hiragana. Bỏ dạng trùng với chính q (đã tìm rồi)."""
    from app.extract import tokenizer  # noqa: PLC0415 (Sudachi nạp chậm, chỉ nạp khi cần)
    out: list[str] = []
    for text in dict.fromkeys((q, kata_to_hira(q))):
        found_content = False
        for t in tokenizer.tokenize(text, "C"):
            if t.pos1 not in _CONTENT_POS or t.oov or not has_japanese(t.surface):
                continue
            if found_content and t.pos1 == "動詞" and t.pos2 == "非自立可能":
                continue
            found_content = True
            if t.lemma and t.lemma != q and t.lemma not in out:
                out.append(t.lemma)
        if out:
            break
    return out[:MAX_LEMMAS]


def _exact_ja(form: str) -> list[dict]:
    """Mục có dạng viết trùng hẳn form (kana ↔ katakana), phổ biến / JLPT dễ trước."""
    variants = tuple(dict.fromkeys((form, kata_to_hira(form), hira_to_kata(form))))
    rows = _rows(f"SELECT DISTINCT {_SUMMARY_COLS} FROM word_forms f JOIN words w ON w.id = f.word_id "
                 f"WHERE f.form IN ({','.join('?' * len(variants))}) "
                 f"ORDER BY w.common DESC, {_LEVEL_RANK}, CAST(w.id AS INTEGER) LIMIT {MAX_LIMIT}", variants)
    return [_summary(r) for r in rows]


def _has_exact(q: str) -> bool:
    variants = tuple(dict.fromkeys((q, kata_to_hira(q), hira_to_kata(q))))
    return bool(_rows(f"SELECT 1 FROM word_forms WHERE form IN ({','.join('?' * len(variants))}) LIMIT 1", variants))


def _search_deinflected(q: str, limit: int, offset: int) -> Optional[dict]:
    """Dự phòng khi q không trùng hẳn dạng viết nào: mục của dạng gốc từng từ nội dung (theo thứ tự trong câu) đứng đầu, sau đó
    mới tới kết quả tìm theo tiền tố của chính q (読んで → 読む rồi 読んで字のごとく). None khi không tách được (Sudachi lỗi /
    thiếu) hoặc không dạng gốc nào có trong từ điển — khi đó tìm như thường."""
    try:
        lemmas = _lemma_candidates(q)
    except Exception:  # noqa: BLE001 — thiếu SudachiDict hay lỗi tách từ không được làm hỏng tìm kiếm thường
        return None
    items: list[dict] = []
    used: list[str] = []
    seen: set[str] = set()
    for lemma in lemmas:
        hits = [h for h in _exact_ja(lemma) if h["key"] not in seen]
        if hits:
            used.append(lemma)
            for h in hits:
                seen.add(h["key"])
                items.append(h)
    if not items:
        return None
    lemma_count = len(items)
    prefix = _search_ja(q, offset + limit, 0)
    dup = 0
    for h in prefix["items"]:
        if h["key"] in seen:
            dup += 1
        else:
            items.append(h)
    total = min(TOTAL_CAP, lemma_count + prefix["total"] - dup)
    return {"items": items[offset:offset + limit], "total": total, "deinflected": {"query": q, "lemmas": used}}


def search(q: str, mode: str = "ja", limit: int = 20, offset: int = 0) -> dict:
    """{items: [{id, key, headKanji, headKana, reading, glossShort, common, jlpt, nExamples}], total (≤ 500)}.
    mode ja: dạng viết đúng (kana ↔ katakana) trước rồi tiền tố; phổ biến, JLPT dễ, dạng ngắn trước. q không trùng hẳn dạng viết
    nào thì mục của dạng gốc lên đầu (食べました → 食べる, 読んで → 読む): kết quả thêm deinflected = {query, lemmas} để giao diện
    ghi "kết quả cho dạng gốc".
    mode en: FTS trên gloss tiếng Anh, gloss trùng hẳn trước, rồi mục phổ biến, rồi bm25."""
    q = (q or "").strip()[:MAX_QUERY_CHARS]
    if not q:
        return {"items": [], "total": 0}
    limit = max(1, min(limit, MAX_LIMIT))
    offset = max(0, min(offset, MAX_OFFSET))
    if mode == "en":
        return _search_en(q, limit, offset)
    if has_japanese(q) and not _has_exact(q):
        merged = _search_deinflected(q, limit, offset)
        if merged:
            return merged
    return _search_ja(q, limit, offset)


# ----------------------------------------------------------------------------- mục từ

@lru_cache(maxsize=256)
def _tag_labels() -> dict[str, str]:
    return dict(_rows("SELECT code, label FROM tags"))


def key_for(term: str, reading: Optional[str] = None) -> Optional[str]:
    """Khoá "w:<id>" của mục JMdict khớp (dạng viết, cách đọc): khớp cách đọc trước, phổ biến trước. Không có → None."""
    if not term or not available():
        return None
    rd = kata_to_hira(reading) if reading else ""
    rows = _rows("SELECT f.word_id, f.reading FROM word_forms f JOIN words w ON w.id = f.word_id WHERE f.form = ? "
                 "ORDER BY w.common DESC, f.common DESC, CAST(w.id AS INTEGER) LIMIT 20", (term,))
    if not rows:
        return None
    if rd:
        for wid, r in rows:
            if r and kata_to_hira(r) == rd:
                return f"w:{wid}"
    return f"w:{rows[0][0]}"


def _pitch(word: str, reading: Optional[str]) -> Optional[dict]:
    if not reading:
        return None
    accent = pitch.accent_type(word, reading)
    if accent is None:
        return None
    moras = pitch.mora_split(kata_to_hira(reading))
    return {"accentType": accent, "kind": pitch.accent_kind(len(moras), accent), "moras": moras,
            "hl": pitch.reference_hl(len(moras), accent)}


def _kanji_chars(text: Optional[str]) -> list[dict]:
    out, seen = [], set()
    for ch in text or "":
        if is_kanji(ch) and ch not in seen and ch not in "々〆ヶ":
            seen.add(ch)
            out.append({"char": ch, "hanViet": han_viet.han_viet(ch), "meaningEn": kanji_meanings.meaning(ch)})
    return out


@lru_cache(maxsize=2048)
def entry(word_id: str) -> Optional[dict]:
    """Mục từ đầy đủ (spec §6.5 phần gốc) hoặc None. Đã áp lớp ghi đè của admin; ví dụ bị ẩn vẫn trả kèm hidden=True
    (backend lọc cho người học, admin vẫn thấy)."""
    rows = _rows("SELECT id, forms, senses, common, jlpt, head_kanji, head_kana, gloss_short, n_examples FROM words "
                 "WHERE id = ?", (str(word_id),))
    if not rows:
        return None
    wid, forms, senses, common, jlpt, head_kanji, head_kana, gloss_short, n_ex = rows[0]
    key = f"w:{wid}"
    labels = _tag_labels()
    sense_list = json.loads(senses)
    for s in sense_list:
        s["posText"] = [labels.get(p, p) for p in s.get("pos", [])]
        s["miscText"] = [labels.get(m, m) for m in s.get("misc", [])]
    reading_override = overrides.word(key, "reading")
    gloss_override = overrides.word(key, "meaning_en")
    examples = []
    for tid, form, jpn, eng, si in _rows("SELECT tatoeba_id, form, jpn, eng, sense_idx FROM examples WHERE word_id = ? "
                                         "ORDER BY sense_idx, id LIMIT ?", (wid, MAX_EXAMPLES)):
        ov = overrides.example(key, tid)
        examples.append({"id": tid, "form": form, "jpn": ov["jpn"] or jpn, "eng": ov["eng"] or eng, "senseIndex": si,
                         "hidden": ov["hidden"]})
    reading = reading_override or head_kana
    word = head_kanji or head_kana
    hv = han_viet.han_viet(head_kanji) if head_kanji else None
    related = []
    if head_kana:
        for kanji, gloss, _ in jmdict.homophones(head_kana, exclude_kanji=head_kanji, limit=5):
            rk = key_for(kanji, head_kana)
            if rk and rk != key:
                related.append({"key": rk, "headKanji": kanji, "reading": head_kana, "glossShort": gloss})
    return {
        "id": wid, "key": key, "kind": "word",
        "forms": json.loads(forms), "headKanji": head_kanji, "headKana": head_kana,
        "reading": reading, "readingOverridden": bool(reading_override), "readingOriginal": head_kana,
        "hanViet": hv, "hanVietChars": [{"char": c["char"], "reading": c["hanViet"]} for c in _kanji_chars(head_kanji)],
        "jlpt": jlpt, "common": bool(common), "pitch": _pitch(word, reading),
        "senses": sense_list, "glossShort": gloss_override or gloss_short, "glossOverridden": bool(gloss_override),
        "glossOriginal": gloss_short, "examples": examples, "nExamples": n_ex,
        "kanjiChars": _kanji_chars(head_kanji), "relatedSameReading": related,
    }


def entries(ids: list[str]) -> list[dict]:
    """Lô mục từ (≤ MAX_LIMIT), giữ thứ tự gửi lên, bỏ id không có."""
    out = []
    for i in ids[:MAX_LIMIT]:
        e = entry(str(i))
        if e:
            out.append(e)
    return out


def kanji(ch: str) -> Optional[dict]:
    """Thẻ chữ Hán (kanji_cards.card) + exampleWords (≤ 10 từ JMdict chứa chữ, phổ biến / JLPT dễ trước)."""
    if len(ch) != 1 or not is_kanji(ch) or ch in "々〆ヶ":
        return None
    card = kanji_cards.card(ch)
    card["key"] = f"k:{ch}"
    card["hanVietOverridden"] = bool(overrides.han_viet(ch))
    card["meaningEnOverridden"] = bool(overrides.kanji_meaning(ch))
    words = []
    if available():
        rows = _rows(f"SELECT DISTINCT {_SUMMARY_COLS} FROM word_forms f JOIN words w ON w.id = f.word_id "
                     f"WHERE f.is_kana = 0 AND f.form LIKE ? AND w.common = 1 ORDER BY {_LEVEL_RANK}, "
                     f"length(w.head_kanji), CAST(w.id AS INTEGER) LIMIT 10", (f"%{ch}%",))
        words = [_summary(r) for r in rows]
    card["exampleWords"] = words
    return card


def tokenize(text: str) -> list[dict]:
    """Tách câu thành token cho popup tra nhanh: [{surface, lemma, reading, key | None}] (key chỉ cho token có chữ Nhật)."""
    from app.extract import tokenizer  # noqa: PLC0415 (Sudachi nạp chậm, chỉ nạp khi cần)
    out = []
    for t in tokenizer.tokenize((text or "")[:MAX_TOKENIZE_CHARS], "C"):
        key = key_for(t.lemma, t.reading) if has_japanese(t.surface) else None
        out.append({"surface": t.surface, "lemma": t.lemma, "reading": t.reading, "key": key})
    return out
