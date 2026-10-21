"""Endpoint nội bộ cho backend: trích xuất tài liệu tiếng Nhật (contract §B).

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY; khi env rỗng (dev) bỏ kiểm tra.
"""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import require_internal_key
from app.extract import (conflicts, distractors, gemini, han_viet, han_viet_graph, jmdict, kanji_cards, kanjidata,
                         radicals, sentence_mining, tokenizer)
from app.extract.grammar import available as grammar_available
from app.extract.jlpt import available as jlpt_available
from app.extract.pipeline import analyze
from app.extract.readers import FileTooLarge, OcrOverloaded, OcrUnavailable, ReaderError, read_source
from app.extract.jachars import has_japanese
from app.extract.readers import image_reader

MAX_MEANING_CHARS = 120
MAX_EXAMPLE_CHARS = 500
MAX_DISTRACTOR_ITEMS = 1000   # một lô distractor; backend gửi theo bộ thẻ (≤ 600 từ + 100 mẫu)
MAX_CONFLICT_ITEMS = 1000     # một lô kiểm tra lại mâu thuẫn (F2) cho job cũ; cùng cỡ một bộ thẻ


router = APIRouter(prefix="/extract", tags=["Trích xuất tài liệu"], dependencies=[Depends(require_internal_key)])


class ReferenceEntry(BaseModel):
    """Mục tham chiếu quản trị (F2): ghi đè từ điển cho đúng ``term`` đó; trường nào None thì không có ý kiến về trường đó.
    ``sourceId`` là id bản ghi phía backend (Long) hoặc mã chuỗi → trả lại trong ``source`` = admin:<sourceId>."""
    term: str = Field(..., min_length=1)
    reading: Optional[str] = None
    meaning: Optional[str] = None       # EN hoặc VI; so với nghĩa cùng ngôn ngữ của thẻ
    level: Optional[str] = None
    sourceId: Optional[Union[str, int]] = None


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
    splitChapters: bool = False         # tách chương trước khi trích từ
    # F2: cảnh báo mâu thuẫn tài liệu ↔ từ điển / mục tham chiếu quản trị (item.conflicts, stats.conflicts)
    warnConflicts: bool = True
    conflictMinConfidence: float = Field(default=0.6, ge=0.0, le=1.0)
    references: list[ReferenceEntry] = Field(default_factory=list)
    docLevel: Optional[str] = None      # cấp JLPT tài liệu tự khai ("N4"); tag trên dòng danh sách ghi đè


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
    # Model Gemini chính backend chọn (Admin > Cấu hình > ai_model_primary); ngoài danh sách cho phép / rỗng → GEMINI_MODEL
    geminiModel: Optional[str] = None


class DistractorItem(BaseModel):
    ref: str
    term: str = Field(..., min_length=1)
    reading: Optional[str] = None
    meaning: Optional[str] = None     # nghĩa của thẻ (EN hoặc VI) bổ sung bộ lọc cùng nghĩa; ai-service luôn tra thêm gloss EN từ điển
    level: Optional[str] = None


class DistractorRequest(BaseModel):
    items: list[DistractorItem] = Field(default_factory=list)
    kinds: list[str] = Field(default_factory=lambda: list(distractors.KINDS))   # kanji_lookalike | homophone
    minConfidence: float = Field(default=0.6, ge=0.0, le=1.0)
    k: int = Field(default=3, ge=1, le=10)


class ConflictItem(BaseModel):
    """Thẻ cũ cần kiểm tra lại (F2). ``docReading`` / ``docMeaningEn`` ba trạng thái như analyze trả về: KHÔNG gửi →
    ``reading`` / ``meaningEn`` của thẻ được coi là của tài liệu (job cũ chưa lưu khai báo); gửi ``null`` → tài liệu không
    khai báo gì → không so (cách đọc Sudachi của thẻ không bị đổ cho tài liệu); gửi giá trị → đó là khai báo của tài liệu.
    ``docLevel`` = cấp tài liệu khai cho thẻ này; ``docLevelScope`` "document" khi đó là cấp chung của cả tài liệu (chỉ
    từ khó hơn hẳn mới đáng ngờ), "item" khi là tag riêng trên dòng của thẻ.

    Item của /analyze luôn mang docReading / docMeaningEn / docLevel (null khi tài liệu không ghi; docLevel là tag trên
    dòng → scope "item" mặc định) nên backend gửi nguyên item đã lưu (thêm ``ref``) là được kết quả như lúc analyze với
    cùng references / ngưỡng — khoá thừa (position, conflicts, exampleSegments…) bị bỏ qua. docLevel TUỲ CHỌN của
    analyze (cấp chung tài liệu) không nằm trong item: thẻ không có tag dòng muốn kiểm lại theo cấp chung thì backend tự
    gửi docLevel đó kèm docLevelScope "document"."""
    ref: str
    term: str = Field(..., min_length=1)
    kind: str = "vocab"                 # vocab | grammar
    reading: Optional[str] = None
    meaningEn: Optional[str] = None
    meaningVi: Optional[str] = None
    level: Optional[str] = None
    readingSegments: Optional[list[dict[str, Any]]] = None
    rubies: Optional[list[dict[str, Any]]] = None
    docReading: Optional[str] = None
    docMeaningEn: Optional[str] = None
    docLevel: Optional[str] = None
    docLevelScope: Literal["item", "document"] = "item"

    def as_item(self) -> dict:
        """dict cho conflicts.check_items: bỏ ``ref``; docReading / docMeaningEn chỉ có mặt khi backend gửi (kể cả null)."""
        d = self.model_dump(exclude={"ref"})
        for key in ("docReading", "docMeaningEn"):
            if key not in self.model_fields_set:
                d.pop(key)
        return d


class ConflictRequest(BaseModel):
    items: list[ConflictItem] = Field(default_factory=list)
    references: list[ReferenceEntry] = Field(default_factory=list)
    minConfidence: float = Field(default=0.6, ge=0.0, le=1.0)   # cùng mặc định với conflictMinConfidence của /analyze


@router.post("/text")
async def extract_text(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
    ocr_mode: str = Form(default="auto"),
    # Ngưỡng mean conf Tesseract (0..1) dưới đó nhờ Gemini chép lại (ảnh + PDF scan); backend chỉnh theo từng request.
    # Ngoài [0, 1] (hay NaN / không phải số) → 422; không gửi → settings.OCR_FALLBACK_CONFIDENCE
    ocr_fallback_confidence: Optional[float] = Form(default=None, ge=0.0, le=1.0, allow_inf_nan=False),
    # Model Gemini chính cho lượt chép lại OCR, gửi theo từng request như ngưỡng trên. Tên ngoài danh sách cho phép
    # (gemini.allowed_models) không 422: bị bỏ qua, dùng GEMINI_MODEL — cấu hình gõ sai không được làm hỏng lượt bóc tách
    gemini_model: Optional[str] = Form(default=None),
) -> dict:
    data = await file.read() if file is not None else None
    filename = file.filename if file is not None else None
    if not data and not (text and text.strip()):
        raise HTTPException(status_code=400, detail="Cần gửi file hoặc text")
    threshold = settings.OCR_FALLBACK_CONFIDENCE if ocr_fallback_confidence is None else ocr_fallback_confidence
    try:
        result = read_source(filename, data or None, text, ocr_mode, ocr_fallback_confidence=threshold,
                             gemini_model=gemini_model)
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ReaderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OcrOverloaded:
        # Gemini quá tải và không có bản Tesseract dùng được: backend đọc "code" để FAILED không tính lượt hạn mức
        return JSONResponse(status_code=503, content={"detail": "Dịch vụ AI đang quá tải, hãy thử lại sau vài phút.",
                                                      "code": "aiOverloaded"})
    except OcrUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc) or "OCR engine unavailable") from exc
    out = result.to_dict()
    # Luôn trả lại ngưỡng đã dùng (kể cả nguồn không qua OCR) để backend ghi vào job / đối chiếu khi soát lỗi
    out["meta"]["ocrFallbackConfidence"] = threshold
    return out


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
        raw = gemini.translate_items([it.model_dump() for it in req.items], req.targetLang, model=req.geminiModel)
    except gemini.GeminiError as exc:
        return {"enriched": False, "items": [], "reason": exc.reason}
    items = filter_enriched(raw, {it.ref for it in req.items})
    return {"enriched": True, "items": items, "reason": None}


@router.post("/distractors")
def extract_distractors(req: DistractorRequest) -> dict:
    """Phương án gây nhiễu C2/C3 cho một lô thẻ; thiếu dữ liệu → danh sách rỗng (backend không coi là lỗi)."""
    if len(req.items) > MAX_DISTRACTOR_ITEMS:
        raise HTTPException(status_code=400, detail=f"Tối đa {MAX_DISTRACTOR_ITEMS} mục mỗi lần")
    unknown = sorted(set(req.kinds) - set(distractors.KINDS))
    if unknown:
        raise HTTPException(status_code=400, detail=f"kinds không hợp lệ: {', '.join(unknown)}")
    items = distractors.build([it.model_dump() for it in req.items], tuple(req.kinds), req.minConfidence, req.k)
    return {
        "items": items,
        "stats": {
            "withLookalike": sum(1 for it in items if it["kanjiLookalike"]),
            "withHomophone": sum(1 for it in items if it["homophones"]),
        },
    }


@router.post("/conflicts")
def extract_conflicts(req: ConflictRequest) -> dict:
    """F2: kiểm tra lại mâu thuẫn cho một lô thẻ cũ (vd. khi quản trị thêm mục tham chiếu) — cùng luật với /analyze.
    Thiếu dữ liệu / từ lạ → danh sách rỗng, không phải lỗi."""
    if len(req.items) > MAX_CONFLICT_ITEMS:
        raise HTTPException(status_code=400, detail=f"Tối đa {MAX_CONFLICT_ITEMS} mục mỗi lần")
    refs = [r.model_dump() for r in req.references]
    lists = conflicts.check_items([it.as_item() for it in req.items], refs, req.minConfidence)
    return {
        "items": [{"ref": it.ref, "conflicts": found} for it, found in zip(req.items, lists)],
        "stats": {"items": len(req.items), **conflicts.summarize(lists)},
    }


@router.get("/health")
def extract_health() -> dict:
    kanji_data = kanjidata.availability()
    return {
        "sudachi": tokenizer.available(),
        "jmdict": jmdict.available(),
        "jlpt": jlpt_available(),
        "unihan": han_viet.available(),
        "grammar": grammar_available(),
        "tesseract": image_reader.available(),
        "gemini": gemini.available(),
        # model Gemini mặc định + các model backend được chọn theo request (Admin > Cấu hình > Model AI chính); không phải
        # cờ boolean nên dashboard admin (chỉ giữ cờ boolean) bỏ qua, để soát cấu hình bằng tay
        "geminiModel": gemini.MODEL,
        "geminiModels": gemini.allowed_models(),
        # dữ liệu chữ Hán cho lộ trình (LP-17): radicals / kradfile / kanjivg / pitch
        **kanji_data,
        # distractors C2/C3 sinh được khi có JMdict hoặc danh sách JLPT (kradfile chỉ nâng chất lượng giống hình)
        "distractors": distractors.available(),
        # luyện viết E2 (/kanji/score) cần nét mẫu KanjiVG = cờ kanjivg; đồ thị Hán-Việt F1 / thẻ chữ Hán C5
        # (/kanji-info/*) chạy trên bảng Unihan đã commit; quiz chia động từ C7 (/grammar/*) thuần quy tắc, không cần
        # dữ liệu (Sudachi chỉ nâng nhận diện nhóm — xem cờ sudachi) nên luôn true
        "kanjiStrokes": kanji_data["kanjivg"],
        "hanVietGraph": han_viet_graph.available(),
        "kanjiCards": kanji_cards.available(),
        "conjugation": True,
        # F2 mâu thuẫn tài liệu ↔ tham chiếu (item.conflicts, /extract/conflicts): cần ít nhất danh sách JLPT hoặc JMdict
        "conflicts": conflicts.available(),
        # C4 thẻ bộ thủ (/radicals/*): bảng radicals_214.csv đã commit → true (cờ `radicals` ở trên là unihan_rs.csv);
        # C6 khai thác câu i+1 (/mining/*): chỉ cần Sudachi
        "radicalCards": radicals.available(),
        "mining": sentence_mining.available(),
    }
