"""OCR ảnh tiếng Nhật (route công khai cũ, giữ nguyên response model) — gọi image_reader thật."""
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.security import require_internal_key
from app.extract.readers import FileTooLarge, OcrUnavailable, ReaderError, image_reader

router = APIRouter(prefix="/ocr", tags=["OCR Tiếng Nhật Dọc/Ngang"], dependencies=[Depends(require_internal_key)])

_MODE = {"vertical": "vertical", "horizontal": "horizontal"}  # còn lại → auto


class DetectedBlock(BaseModel):
    text: str
    confidence: float
    is_vertical: bool


class OcrResponse(BaseModel):
    filename: str
    full_extracted_text: str
    detected_blocks: List[DetectedBlock]


@router.post("/process-image", response_model=OcrResponse)
async def process_japanese_image(
    file: UploadFile = File(...),
    mode: str = Form("vertical"),  # vertical | horizontal | auto
):
    """Tiền xử lý ảnh → Tesseract jpn/jpn_vert; confidence thấp → Gemini Vision (nếu có key)."""
    filename = file.filename or "uploaded_image.jpg"
    data = await file.read()
    try:
        result = image_reader.read_image(data, _MODE.get(mode, "auto"))
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ReaderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OcrUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc) or "OCR engine unavailable") from exc
    conf = result.mean_confidence if result.mean_confidence is not None else 0.0
    return OcrResponse(
        filename=filename,
        full_extracted_text=result.text,
        detected_blocks=[
            DetectedBlock(text=b.text, confidence=conf, is_vertical=bool(b.is_vertical)) for b in result.blocks
        ],
    )
