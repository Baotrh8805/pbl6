"""Dịch câu / đoạn Nhật ↔ Việt cho tab Dịch của từ điển (spec docs/Plan/specs/2026-10-28-dich-cau-design.md §3, D33).

Hai phần tách bạch, không bao giờ trộn:
- **Phân tích câu Nhật tại chỗ** (Sudachi + JMdict + JLPT + furigana + romaji): luôn chạy, không tốn quota, là lớp hỗ trợ học
  dưới bản dịch — KHÔNG phải bản dịch. Ghép nghĩa từng từ thành câu là điều module này không làm (câu ghép không trôi chảy,
  sai nghĩa; xem spec §2).
- **Bản dịch**: chỉ Gemini dịch cả đoạn (``gemini.translate_text``); ``clean_result`` lọc đầu ra (đúng ngôn ngữ, không quá dài,
  không trùng câu nguồn) rồi gắn nghĩa theo ngữ cảnh của từng từ vào token theo chỉ số ``i`` mà prompt đã gửi, để phần phân
  tích khớp với bản dịch thay vì nghĩa từ điển chung chung.
"""
from __future__ import annotations

import re
from typing import Optional

from app.extract import jmdict
from app.extract.furigana import ruby_segments
from app.extract.jachars import KANA_RE, has_japanese, has_kanji, is_kana_only, kata_to_hira
from app.extract.jlpt import classify, meaning_hint
from app.extract.romaji import to_romaji

MAX_CHARS = 1000               # một đoạn 2–4 câu; dài hơn người học chia nhỏ (backend kiểm cùng trần)
MAX_TOKENS = 400               # 1 000 ký tự Nhật ≈ 350 cụm; trần để response không phình
MAX_AI_WORDS = 150             # số cụm gửi Gemini xin nghĩa theo ngữ cảnh; phần sau dùng nghĩa từ điển / gloss Anh
MAX_MEANING_CHARS = 80         # nghĩa theo ngữ cảnh của một từ
MAX_TRANSLATION_CHARS = 3000   # bản dịch của 1 000 ký tự Nhật hiếm khi quá 2 000 ký tự Việt
MAX_NOTE_CHARS = 300
MAX_ALTERNATIVES = 2
DIRECTIONS = ("ja-vi", "vi-ja")

# POS Sudachi (tầng 1) → nhãn tiếng Việt ngắn cho dòng phân tích
POS_VI = {
    "名詞": "danh từ", "代名詞": "đại từ", "動詞": "động từ", "形容詞": "tính từ -i", "形状詞": "tính từ -na",
    "副詞": "phó từ", "連体詞": "định từ", "接続詞": "liên từ", "感動詞": "thán từ", "助詞": "trợ từ",
    "助動詞": "trợ động từ", "接頭辞": "tiền tố", "接尾辞": "hậu tố", "補助記号": "dấu", "記号": "ký hiệu",
    "空白": "khoảng trắng",
}
_SYMBOL_POS = frozenset({"補助記号", "記号", "空白"})
_PARTICLE_POS = frozenset({"助詞", "助動詞"})
# không xếp bậc JLPT: trợ từ / trợ động từ / dấu / phụ tố (danh sách JLPT là từ vựng nội dung)
_NO_LEVEL_POS = _SYMBOL_POS | _PARTICLE_POS | frozenset({"接頭辞", "接尾辞"})
# Sudachi mode C tách 食べました thành 食べ / まし / た: gom trợ động từ (và て / で nối) theo sau động từ / tính từ thành MỘT cụm
# để người học thấy "食べました → 食べる" thay vì ba mảnh; cách đọc / romaji / rubies tính trên cả cụm.
_MERGE_HEAD_POS = frozenset({"動詞", "形容詞"})
_MERGE_PARTICLES = frozenset({"て", "で"})
_NON_KANA_RE = re.compile(r"[^ぁ-ゖァ-ヺーㇰ-ㇿ]")
_WS_RE = re.compile(r"[ \t　]+")


def detect_direction(text: str) -> str:
    """Có chữ Nhật → Nhật → Việt, không thì Việt → Nhật (văn bản trộn coi là tiếng Nhật)."""
    return "ja-vi" if has_japanese(text) else "vi-ja"


def _gloss_en(lemma: str, reading: Optional[str]) -> Optional[str]:
    """Gloss Anh ngắn làm lớp dự phòng cuối cho một từ (sau nghĩa AI theo ngữ cảnh và nghĩa Việt của từ điển ở backend):
    từ toàn kana ưu tiên cột meaning JLPT (JMdict theo kana dễ trúng đồng âm), như sentence_mining."""
    hint = meaning_hint(lemma, reading)
    if is_kana_only(lemma) and hint:
        return hint
    entry = jmdict.lookup(lemma, reading)
    return (entry["gloss"] if entry else None) or hint


def _attaches(head, tok) -> bool:
    """``tok`` nối vào cụm có token đầu ``head``: trợ động từ sau động từ / tính từ (まし, た, ない, たい…) hoặc て / で nối."""
    if not has_japanese(tok.surface) or head.pos1 not in _MERGE_HEAD_POS:
        return False
    if tok.pos1 == "助動詞":
        return True
    return tok.pos1 == "助詞" and tok.pos2 == "接続助詞" and tok.surface in _MERGE_PARTICLES


def _chunks(toks) -> list[list]:
    out: list[list] = []
    for tok in toks:
        if out and _attaches(out[-1][0], tok):
            out[-1].append(tok)
        else:
            out.append([tok])
    return out


def analyse(text: str) -> list[dict]:
    """Cụm từ (token mode C đã gom trợ động từ) của một câu / đoạn Nhật → dòng phân tích cho giao diện, KHÔNG gọi AI:
    [{i, surface, lemma, reading, romaji, rubies, key, jlpt, pos, posVi, particle, symbol, glossEn, meaning: None}].
    ``key`` là mục JMdict (w:<id>) để bấm tra; ``meaning`` để trống cho ``clean_result`` điền nghĩa theo ngữ cảnh."""
    from app.extract import dictionary, tokenizer  # noqa: PLC0415 (Sudachi nạp chậm, chỉ nạp khi cần)
    out: list[dict] = []
    for i, chunk in enumerate(_chunks(tokenizer.tokenize((text or "")[:MAX_CHARS], "C"))):
        if i >= MAX_TOKENS:
            break
        head = chunk[0]
        surface = "".join(t.surface for t in chunk)
        ja = has_japanese(surface)
        symbol = (not ja) or head.pos1 in _SYMBOL_POS      # số, Latin, dấu câu: chỉ hiện, không tra / không xin nghĩa
        particle = ja and head.pos1 in _PARTICLE_POS
        readings = [kata_to_hira(t.reading) for t in chunk if t.reading]
        reading = "".join(readings) if ja and len(readings) == len(chunk) else None
        kana_reading = reading if reading and is_kana_only(reading) else None   # OOV: Sudachi trả chính surface (có kanji)
        key = None
        if ja and not symbol:
            try:
                key = dictionary.key_for(head.lemma, head.reading)
            except dictionary.DictUnavailable:
                key = None
        level = None
        if ja and head.pos1 not in _NO_LEVEL_POS:
            level, _, _ = classify(head.lemma, head.reading, is_kana_only(head.lemma))
        out.append({
            "i": i,
            "surface": surface,
            "lemma": head.lemma if ja else None,
            "reading": kana_reading,
            "romaji": to_romaji(kana_reading) if kana_reading else None,
            "rubies": ruby_segments(surface, kana_reading) if ja and has_kanji(surface) else None,
            "key": key,
            "jlpt": level,
            "pos": head.pos1,
            "posVi": POS_VI.get(head.pos1),
            "particle": particle,
            "symbol": symbol,
            "glossEn": _gloss_en(head.lemma, head.reading) if ja and not symbol and not particle else None,
            "meaning": None,
        })
    return out


def ai_words(tokens: list[dict]) -> list[dict]:
    """Danh sách cụm gửi Gemini xin nghĩa theo ngữ cảnh (bỏ dấu / số / Latin), tối đa MAX_AI_WORDS, giữ chỉ số ``i``."""
    out = []
    for t in tokens:
        if t.get("symbol"):
            continue
        out.append({"i": t["i"], "surface": t["surface"], "lemma": t.get("lemma") or t["surface"], "reading": t.get("reading")})
        if len(out) >= MAX_AI_WORDS:
            break
    return out


def _clean_str(v, max_chars: int) -> Optional[str]:
    if not isinstance(v, str):
        return None
    s = _WS_RE.sub(" ", v.replace("\r", "")).strip()
    s = re.sub(r"\s*\n\s*", "\n", s)
    if not s or len(s) > max_chars:
        return None
    return s


def _clean_reading(v) -> Optional[str]:
    """Cách đọc hiragana của cả câu Nhật do AI trả: phải có kana và không còn kanji; katakana đổi sang hiragana."""
    s = _clean_str(v, MAX_TRANSLATION_CHARS)
    if not s or has_kanji(s) or not KANA_RE.search(s):
        return None
    return kata_to_hira(s)


def clean_result(raw: dict, direction: str, tokens: list[dict]) -> Optional[dict]:
    """Lọc đầu ra Gemini → {translation, literal, alternatives: [{text, reading, note}], notes, reading}; None khi bản dịch
    không dùng được (rỗng, sai ngôn ngữ, quá dài). Nghĩa theo ngữ cảnh ``words[{i, meaning}]`` được gắn vào ``tokens`` tại chỗ
    (chỉ số lạ, nghĩa rỗng / còn chữ Nhật / quá dài, cụm là dấu → bỏ)."""
    if not isinstance(raw, dict):
        return None
    tr = _clean_str(raw.get("translation"), MAX_TRANSLATION_CHARS)
    if not tr or (direction == "ja-vi" and has_japanese(tr)) or (direction == "vi-ja" and not has_japanese(tr)):
        return None
    literal = None
    if direction == "ja-vi":
        literal = _clean_str(raw.get("literal"), MAX_TRANSLATION_CHARS)
        if literal and (has_japanese(literal) or literal == tr):
            literal = None
    notes = _clean_str(raw.get("notes"), MAX_NOTE_CHARS)
    alts: list[dict] = []
    for a in raw.get("alternatives") or []:
        if isinstance(a, str):
            a = {"text": a}
        if not isinstance(a, dict):
            continue
        text = _clean_str(a.get("text"), MAX_TRANSLATION_CHARS)
        if not text or text == tr or any(x["text"] == text for x in alts):
            continue
        if (direction == "ja-vi" and has_japanese(text)) or (direction == "vi-ja" and not has_japanese(text)):
            continue
        alts.append({
            "text": text,
            "reading": _clean_reading(a.get("reading")) if direction == "vi-ja" else None,
            "note": _clean_str(a.get("note"), MAX_NOTE_CHARS),
        })
        if len(alts) >= MAX_ALTERNATIVES:
            break
    by_i = {t["i"]: t for t in tokens}
    for w in raw.get("words") or []:
        if not isinstance(w, dict):
            continue
        try:
            i = int(w.get("i"))
        except (TypeError, ValueError):
            continue
        t = by_i.get(i)
        m = _clean_str(w.get("meaning"), MAX_MEANING_CHARS)
        if t is None or t.get("symbol") or not m or has_japanese(m):
            continue
        t["meaning"] = m
    return {
        "translation": tr,
        "literal": literal,
        "alternatives": alts,
        "notes": notes,
        "reading": _clean_reading(raw.get("reading")) if direction == "vi-ja" else None,
    }


def romaji_of(tokens: list[dict]) -> Optional[str]:
    """Romaji cả câu Nhật từ cách đọc Sudachi của từng cụm, cách nhau khoảng trắng để đọc được (dấu câu dính vào từ trước)."""
    parts: list[str] = []
    for t in tokens:
        if t.get("romaji"):
            parts.append(t["romaji"])
        elif t.get("symbol") and t["surface"].strip():
            parts.append(t["surface"].strip())
    s = " ".join(parts)
    s = re.sub(r"\s+([。、！？!?,.])", r"\1", s)
    return s or None


def reading_agrees(tokens: list[dict], reading: Optional[str]) -> Optional[bool]:
    """Cách đọc AI trả (hiragana cả câu) có khớp cách đọc Sudachi ghép từ các cụm không (so phần kana, bỏ dấu / khoảng trắng).
    None khi AI không trả cách đọc dùng được hoặc không cụm nào có cách đọc."""
    if not reading:
        return None
    mine = _NON_KANA_RE.sub("", "".join(kata_to_hira(t["reading"]) for t in tokens if t.get("reading")))
    theirs = _NON_KANA_RE.sub("", kata_to_hira(reading))
    if not mine or not theirs:
        return None
    return mine == theirs
