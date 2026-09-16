from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/ocr", tags=["OCR Tiếng Nhật Dọc/Ngang"])

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
    mode: str = Form("vertical") # vertical: chữ dọc, horizontal: chữ ngang
):
    """
    Tiếp nhận ảnh chụp tài liệu tiếng Nhật, tiền xử lý và trích xuất chữ.
    Hỗ trợ luồng dự phòng (Fallback): OCR cục bộ -> Nếu confidence thấp chuyển sang Gemini Vision.
    """
    filename = file.filename or "uploaded_image.jpg"
    
    # Mock kết quả OCR mẫu ban đầu
    sample_text = "日本語の勉強はとても面白いです。毎日漢字を練習しましょう。"
    
    return OcrResponse(
        filename=filename,
        full_extracted_text=sample_text,
        detected_blocks=[
            DetectedBlock(text="日本語の勉強はとても面白いです。", confidence=0.92, is_vertical=(mode == "vertical")),
            DetectedBlock(text="毎日漢字を練習しましょう。", confidence=0.88, is_vertical=(mode == "vertical"))
        ]
    )
