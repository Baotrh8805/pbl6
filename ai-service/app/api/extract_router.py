"""Endpoint nội bộ cho backend: trích xuất tài liệu tiếng Nhật (contract §B).

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY; khi env rỗng (dev) bỏ kiểm tra.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.config import settings
from app.extract import gemini, han_viet, jmdict, tokenizer
from app.extract.grammar import available as grammar_available
from app.extract.jlpt import available as jlpt_available
from app.extract.pipeline import analyze
from app.extract.readers import FileTooLarge, OcrUnavailable, ReaderError, read_source
from app.extract.jachars import has_japanese
from app.extract.readers import image_reader

MAX_MEANING_CHARS = 120
MAX_EXAMPLE_CHARS = 500


def require_internal_key(x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key")) -> None:
    if settings.AI_SERVICE_KEY and x_internal_key != settings.AI_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")


router = APIRouter(prefix="/extract", tags=["Trích xuất tài liệu"], dependencies=[Depends(require_internal_key)])


class ExtractionOptions(BaseModel):
    userLevel: str = "N5"
    levelFilter: str = "all"            # all | at_or_above | only_unknown_to_me
    includeGrammar: bool = True
    includeFurigana: bool = True
    includeHanViet: bool = True
    meaningLang: str = "vi"
    treatUnknownAs: str = "above"       # above | drop
    minFrequency: int = 1
    ocrMode: str = "auto"
    extractMode: str = "auto"           # auto | list | prose


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    blocks: Optional[list[dict[str, Any]]] = None
    options: ExtractionOptions = Field(default_factory=ExtractionOptions)


class EnrichItem(BaseModel):
    ref: str
    term: str
    reading: Optional[str] = None
    pos: Optional[str] = None
    meaningEn: Optional[str] = None
    example: Optional[str] = None


class EnrichRequest(BaseModel):
    targetLang: str = "vi"
    items: list[EnrichItem] = Field(default_factory=list)


@router.post("/text")
async def extract_text(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
    ocr_mode: str = Form(default="auto"),
) -> dict:
    data = await file.read() if file is not None else None
    filename = file.filename if file is not None else None
    if not data and not (text and text.strip()):
        raise HTTPException(status_code=400, detail="Cần gửi file hoặc text")
    try:
        result = read_source(filename, data or None, text, ocr_mode)
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ReaderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OcrUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc) or "OCR engine unavailable") from exc
    return result.to_dict()


@router.post("/analyze")
def extract_analyze(req: AnalyzeRequest) -> dict:
    return analyze(req.text, req.blocks, req.options.model_dump())


def filter_enriched(raw: list[dict], known_refs: set[str]) -> list[dict]:
    """Generate-then-filter: bỏ nghĩa rỗng / quá dài / còn chữ Nhật / ref lạ; ví dụ xấu → null."""
    out: list[dict] = []
    seen: set[str] = set()
    for d in raw:
        ref = str(d.get("ref", ""))
        meaning = (d.get("meaningVi") or "").strip()
        if ref not in known_refs or ref in seen:
            continue
        if not meaning or len(meaning) > MAX_MEANING_CHARS or has_japanese(meaning):
            continue
        example = (d.get("exampleVi") or "").strip() or None
        if example and (len(example) > MAX_EXAMPLE_CHARS or has_japanese(example)):
            example = None
        seen.add(ref)
        out.append({"ref": ref, "meaningVi": meaning, "exampleVi": example})
    return out


@router.post("/enrich")
def extract_enrich(req: EnrichRequest) -> dict:
    if not gemini.available():
        return {"enriched": False, "items": [], "reason": "no_api_key"}
    if not req.items:
        return {"enriched": True, "items": [], "reason": None}
    try:
        raw = gemini.translate_items([it.model_dump() for it in req.items], req.targetLang)
    except gemini.GeminiError as exc:
        return {"enriched": False, "items": [], "reason": exc.reason}
    items = filter_enriched(raw, {it.ref for it in req.items})
    return {"enriched": True, "items": items, "reason": None}


@router.get("/health")
def extract_health() -> dict:
    return {
        "sudachi": tokenizer.available(),
        "jmdict": jmdict.available(),
        "jlpt": jlpt_available(),
        "unihan": han_viet.available(),
        "grammar": grammar_available(),
        "tesseract": image_reader.available(),
        "gemini": gemini.available(),
    }
