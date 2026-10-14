"""Đọc nguồn (text / .txt / .docx / .pdf / ảnh) → văn bản + blocks (contract §B1).

Điểm mở rộng cho OCR (giai đoạn 2): image_reader.read_image và pdf_reader khi needs_ocr.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

MAX_TEXT_CHARS = 50_000
MAX_FILE_BYTES = 15 * 1024 * 1024


class ReaderError(ValueError):
    """Input không hỗ trợ / rỗng / hỏng → router trả 400."""


class FileTooLarge(ReaderError):
    """→ 413."""


class OcrUnavailable(RuntimeError):
    """Chưa có engine OCR cho ảnh / PDF scan → router trả 503."""


@dataclass
class Block:
    text: str
    page: int = 1
    is_vertical: Optional[bool] = None
    rubies: list[dict] = field(default_factory=list)  # [{"base": "漢字", "reading": "かんじ"}]
    lines: list[dict] = field(default_factory=list)   # [{"text": "...", "conf": 0.87}] từng dòng OCR (chỉ Tesseract)
    heading: Optional[int] = None                     # cấp tiêu đề DOCX (1-9), None nếu là đoạn thường

    def to_dict(self) -> dict:
        return {"text": self.text, "page": self.page, "isVertical": self.is_vertical, "rubies": self.rubies,
                "lines": self.lines, "heading": self.heading}


@dataclass
class TextResult:
    text: str
    source_type: str                     # text|txt|docx|pdf|image
    engine: str                          # text|docx|pdf-text|tesseract|gemini
    blocks: list[Block] = field(default_factory=list)
    pages: int = 1
    mean_confidence: Optional[float] = None
    is_vertical: Optional[bool] = None
    low_confidence: bool = False
    truncated: bool = False
    needs_ocr: bool = False              # PDF scan: page_images chờ OCR
    gemini_error: Optional[str] = None   # quota | error | ...: OCR kém nhưng Gemini không chép lại được
    page_images: list[bytes] = field(default_factory=list)  # PNG từng trang (khi needs_ocr)

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "meta": {
                "sourceType": self.source_type,
                "engine": self.engine,
                "meanConfidence": self.mean_confidence,
                "isVertical": self.is_vertical,
                "pages": self.pages,
                "lowConfidence": self.low_confidence,
                "truncated": self.truncated,
                # chỉ có khi Gemini lỗi, để meta của các lượt bình thường không đổi
                **({"geminiError": self.gemini_error} if self.gemini_error else {}),
            },
            "blocks": [b.to_dict() for b in self.blocks],
        }


def truncate(result: TextResult) -> TextResult:
    """Cắt văn bản > 50 000 ký tự thay vì từ chối (contract §B1)."""
    if len(result.text) > MAX_TEXT_CHARS:
        result.text = result.text[:MAX_TEXT_CHARS]
        result.truncated = True
    return result


def _sniff(filename: Optional[str], data: bytes) -> str:
    """Xác định loại nguồn theo magic bytes trước, đuôi file sau."""
    head = data[:8]
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"\x89PNG") or head.startswith(b"\xff\xd8\xff") or head[:4] == b"RIFF":
        return "image"
    ext = (filename or "").rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    if head.startswith(b"PK\x03\x04") and ext == "docx":
        return "docx"
    if ext in ("txt", "md", "text"):
        return "txt"
    if ext == "pdf":
        return "pdf"
    if ext == "docx":
        return "docx"
    if ext in ("png", "jpg", "jpeg", "webp"):
        return "image"
    raise ReaderError(f"Định dạng không hỗ trợ: {filename or 'unknown'}")


def read_source(filename: Optional[str], data: Optional[bytes], text: Optional[str],
                ocr_mode: str = "auto") -> TextResult:
    from app.extract.readers import docx_reader, image_reader, pdf_reader, text_reader

    if data is not None and len(data) > MAX_FILE_BYTES:
        raise FileTooLarge("File vượt quá 15 MB")
    if data:
        kind = _sniff(filename, data)
        if kind == "txt":
            result = text_reader.read_bytes(data, source_type="txt")
        elif kind == "docx":
            result = docx_reader.read_docx(data)
        elif kind == "pdf":
            result = pdf_reader.read_pdf(data, ocr_mode)
            if result.needs_ocr:
                # Điểm cắm OCR giai đoạn 2: image_reader.ocr_pages(result.page_images, ocr_mode)
                result = image_reader.ocr_pages(result, ocr_mode)
        elif kind == "image":
            result = image_reader.read_image(data, ocr_mode)
        else:  # pragma: no cover
            raise ReaderError("Định dạng không hỗ trợ")
    elif text is not None and text.strip():
        result = text_reader.read_text(text, source_type="text")
    else:
        raise ReaderError("Cần gửi file hoặc text")
    if not result.text.strip():
        raise ReaderError("Không trích được văn bản nào từ nguồn")
    return truncate(result)
