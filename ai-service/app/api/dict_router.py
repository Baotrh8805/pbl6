"""Từ điển Nhật–Việt cộng đồng (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §4.4) — endpoint nội bộ cho backend.

Mọi request mang X-Internal-Key (require_internal_key). ai-service chỉ giữ dữ liệu gốc (JMdict + ví dụ Tatoeba, thẻ chữ Hán) và bản
sao lớp ghi đè của admin; nghĩa tiếng Việt, bình luận, báo cáo nằm ở backend. jmdict.sqlite cũ chưa có bảng words → 503
{"detail": "dictUnavailable"} cho search / entries, để backend báo "chưa có dữ liệu từ điển" thay vì 500.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
import time

from app.extract import dictionary, gemini, handwriting, local_translation, overrides, translate_text
from app.extract.jachars import has_japanese

router = APIRouter(prefix="/dict", tags=["Từ điển"], dependencies=[Depends(require_internal_key)])

_ID_RE = re.compile(r"^\d{1,10}$")
MAX_TRANSLATE_ITEMS = 20
MAX_TRANSLATE_EXAMPLES = 10
MAX_MEANING_CHARS = 200
MAX_EXAMPLE_VI_CHARS = 400
MAX_OVERRIDES = 50_000


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="dictUnavailable")


@router.get("/search")
def dict_search(q: str = Query(..., min_length=1, max_length=dictionary.MAX_QUERY_CHARS),
                mode: str = Query(default="ja", pattern="^(ja|en)$"),
                limit: int = Query(default=20, ge=1, le=dictionary.MAX_LIMIT),
                offset: int = Query(default=0, ge=0, le=dictionary.MAX_OFFSET)) -> dict:
    if not q.strip():
        raise HTTPException(status_code=400, detail="q rỗng")
    try:
        return dictionary.search(q, mode, limit, offset)
    except dictionary.DictUnavailable:
        raise _unavailable()


@router.get("/sentences")
def dict_sentences(q: str = Query(..., min_length=1, max_length=dictionary.MAX_QUERY_CHARS),
                   limit: int = Query(default=20, ge=1, le=dictionary.MAX_LIMIT),
                   offset: int = Query(default=0, ge=0, le=dictionary.MAX_OFFSET)) -> dict:
    """Tab Câu: câu ví dụ chứa cụm q (Nhật / Anh / Việt dịch sẵn)."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="q rỗng")
    try:
        return dictionary.sentences(q, limit, offset)
    except dictionary.DictUnavailable:
        raise _unavailable()


@router.get("/entries/{word_id}")
def dict_entry(word_id: str) -> dict:
    if not _ID_RE.match(word_id):
        raise HTTPException(status_code=404, detail="Không có mục từ")
    try:
        e = dictionary.entry(word_id)
    except dictionary.DictUnavailable:
        raise _unavailable()
    if e is None:
        raise HTTPException(status_code=404, detail="Không có mục từ")
    return e


@router.get("/entries")
def dict_entries(ids: str = Query(..., max_length=1000)) -> dict:
    wanted = [i for i in (x.strip() for x in ids.split(",")) if _ID_RE.match(i)][:dictionary.MAX_LIMIT]
    try:
        return {"items": dictionary.entries(wanted)}
    except dictionary.DictUnavailable:
        raise _unavailable()


@router.get("/kanji/{ch}")
def dict_kanji(ch: str) -> dict:
    card = dictionary.kanji(ch)
    if card is None:
        raise HTTPException(status_code=404, detail="Không phải một chữ Hán")
    return card


@router.get("/key")
def dict_key(term: str = Query(..., min_length=1, max_length=dictionary.MAX_QUERY_CHARS),
             reading: Optional[str] = Query(default=None, max_length=dictionary.MAX_QUERY_CHARS)) -> dict:
    """Khoá mục JMdict cho (dạng viết, cách đọc) — backend map nghĩa dịch sẵn / thẻ sang mục từ."""
    try:
        return {"key": dictionary.key_for(term, reading)}
    except dictionary.DictUnavailable:
        raise _unavailable()


class HwPoint(BaseModel):
    x: float
    y: float


HwStroke = Annotated[list[HwPoint], Field(min_length=1, max_length=handwriting.MAX_POINTS)]


class HandwritingRequest(BaseModel):
    strokes: list[HwStroke] = Field(..., min_length=1, max_length=handwriting.MAX_STROKES)
    limit: int = Field(default=handwriting.DEFAULT_LIMIT, ge=1, le=handwriting.MAX_LIMIT)


@router.post("/handwriting")
def dict_handwriting(req: HandwritingRequest) -> dict:
    """Vẽ chữ Hán để tra: nét theo thứ tự đã vẽ (toạ độ khung vẽ bất kỳ, chỉ cần cùng hệ) → {candidates: [{char, score}]}.
    Chưa có kanji_strokes.json → 503 handwritingUnavailable."""
    if not handwriting.available():
        raise HTTPException(status_code=503, detail="handwritingUnavailable")
    strokes = [[(p.x, p.y) for p in s] for s in req.strokes]
    if any(not (math.isfinite(x) and math.isfinite(y)) for s in strokes for x, y in s):
        raise HTTPException(status_code=422, detail="Toạ độ không hợp lệ")
    return {"candidates": handwriting.recognize(strokes, req.limit)}


class TokenizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=dictionary.MAX_TOKENIZE_CHARS)


@router.post("/tokenize")
def dict_tokenize(req: TokenizeRequest) -> dict:
    return {"tokens": dictionary.tokenize(req.text)}


class TranslateExample(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    jpn: str = Field(..., min_length=1, max_length=500)
    eng: Optional[str] = Field(default=None, max_length=500)


class TranslateItem(BaseModel):
    ref: str = Field(..., min_length=1, max_length=80)
    kind: str = Field(default="word", pattern="^(word|kanji)$")
    forms: str = Field(..., min_length=1, max_length=200)          # "食べる【たべる】" hoặc "食" (chữ Hán)
    glossEn: Optional[str] = Field(default=None, max_length=1000)
    pos: list[str] = Field(default_factory=list, max_length=10)
    examples: list[TranslateExample] = Field(default_factory=list, max_length=MAX_TRANSLATE_EXAMPLES)
    needMeaning: bool = True


class TranslateRequest(BaseModel):
    items: list[TranslateItem] = Field(default_factory=list, max_length=MAX_TRANSLATE_ITEMS)
    geminiModel: Optional[str] = None


def filter_translated(raw: list[dict], req: TranslateRequest) -> list[dict]:
    """Lọc kết quả Gemini: ref lạ / lặp → bỏ; nghĩa rỗng, quá dài, còn chữ Nhật → None; ví dụ id lạ hoặc rỗng → bỏ."""
    by_ref = {it.ref: it for it in req.items}
    out, seen = [], set()
    for d in raw:
        ref = d.get("ref")
        if ref not in by_ref or ref in seen:
            continue
        seen.add(ref)
        meaning = (d.get("meaningVi") or "").strip() or None
        if meaning and (len(meaning) > MAX_MEANING_CHARS or has_japanese(meaning)):
            meaning = None
        if not by_ref[ref].needMeaning:
            meaning = None
        ex_ids = {e.id for e in by_ref[ref].examples}
        exs, ex_seen = [], set()
        for e in d.get("examples") or []:
            vi = (e.get("vi") or "").strip()
            if e.get("id") in ex_ids and e["id"] not in ex_seen and vi and len(vi) <= MAX_EXAMPLE_VI_CHARS:
                ex_seen.add(e["id"])
                exs.append({"id": e["id"], "vi": vi})
        out.append({"ref": ref, "meaningVi": meaning, "examples": exs})
    return out


@router.post("/translate")
def dict_translate(req: TranslateRequest) -> dict:
    """Dịch nghĩa Việt + câu ví dụ cho ≤ 20 mục. Không khoá / hết quota / quá tải → 503 với detail = lý do (như /extract/enrich
    trả reason): no_api_key | quota | aiOverloaded | error."""
    if not req.items:
        return {"items": [], "model": None}
    if not gemini.available():
        raise HTTPException(status_code=503, detail="no_api_key")
    model = gemini.resolve_model(req.geminiModel)
    try:
        raw = gemini.translate_dictionary([it.model_dump() for it in req.items], model=model)
    except gemini.GeminiError as exc:
        raise HTTPException(status_code=503, detail=ai_reason(exc))
    return {"items": filter_translated(raw, req), "model": model}


def ai_reason(exc: gemini.GeminiError) -> str:
    """Lý do Gemini lỗi cho backend (mã như /extract/enrich): no_api_key | quota | aiOverloaded (quá tải / hết hạn chót, thử lại
    được) | error."""
    if exc.reason in ("no_api_key", "quota"):
        return exc.reason
    return "aiOverloaded" if getattr(exc, "retryable", False) else "error"


class TranslateTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=translate_text.MAX_CHARS)
    direction: str = Field(default="auto", pattern="^(auto|ja-vi|vi-ja)$")
    geminiModel: Optional[str] = None
    # Legacy field: local translation always runs, regardless of Gemini quota.
    withAi: bool = True


# The local model may run on CPU. This budget stays below the long HTTP timeout (180s).
REQUEST_BUDGET_S = 150


@router.post("/translate-text")
def dict_translate_text(req: TranslateTextRequest) -> dict:
    """Always run the local fine-tuned model; no online fallback or translation cache."""
    started = time.monotonic()
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text rỗng")
    direction = req.direction if req.direction != "auto" else translate_text.detect_direction(text)
    out: dict = {"direction": direction, "source": text, "translation": None, "literal": None, "alternatives": [],
                 "notes": None, "reading": None, "romaji": None, "readingAgrees": None, "tokens": [], "model": None,
                 "engine": "local", "reason": None}
    def analyse_japanese(sentence: str) -> list[dict]:
        try:
            return translate_text.analyse(sentence)
        except Exception:
            logging.getLogger(__name__).exception("Sentence analysis unavailable")
            return []

    tokens = analyse_japanese(text) if direction == "ja-vi" else []
    try:
        translation = local_translation.translate(text, direction, deadline=started + REQUEST_BUDGET_S)
        if not translation or len(translation) > translate_text.MAX_TRANSLATION_CHARS:
            raise local_translation.TranslationError("invalid_output")
        out["translation"] = translation
        out["model"] = local_translation.MODEL_NAME
        if direction == "vi-ja":
            tokens = analyse_japanese(translation)
            out["reading"] = translate_text.reading_of(tokens)
            out["romaji"] = translate_text.romaji_of(tokens)
    except local_translation.TranslationError as exc:
        out["reason"] = exc.reason
    except Exception:
        # Keep the source analysis usable even if inference fails unexpectedly.
        logging.getLogger(__name__).exception("Local sentence translation failed")
        out["reason"] = "model_error"
    out["tokens"] = tokens
    return out


class OverrideItem(BaseModel):
    key: str = Field(..., min_length=3, max_length=64)
    field: str
    subKey: str = Field(default="", max_length=32)
    value: Optional[str] = Field(default=None, max_length=2000)


class OverridesRequest(BaseModel):
    version: int = Field(..., ge=0)
    items: list[OverrideItem] = Field(default_factory=list, max_length=MAX_OVERRIDES)


@router.post("/overrides")
def dict_overrides(req: OverridesRequest) -> dict:
    """Thay toàn bộ bản sao ghi đè (backend gửi danh sách hiện hành). Trường lạ → 400."""
    try:
        n = overrides.replace([it.model_dump() for it in req.items], req.version)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"version": req.version, "count": n}


@router.get("/overrides/version")
def dict_overrides_version() -> dict:
    return {"version": overrides.version(), "count": overrides.count()}
