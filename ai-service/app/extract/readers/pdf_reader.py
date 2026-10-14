"""Đọc PDF: pypdf lấy text theo trang; nếu không có text layer (gần như rỗng, < 30 ký tự/trang)
→ coi là scan, render từng trang bằng pypdfium2 (200 dpi, ≤ 20 trang) và
trả needs_ocr=True với page_images để image_reader OCR (giai đoạn 2)."""
from __future__ import annotations

import io

from app.extract.readers import Block, ReaderError, TextResult
from app.extract.readers.text_reader import extract_paren_rubies, normalize

MAX_PAGES = 20
RENDER_DPI = 200
MIN_CHARS_PER_PAGE = 30   # ít hơn mức này (vd. chỉ watermark "Scanned by ...") → coi là scan


def _render_pages(data: bytes, n_pages: int) -> list[bytes]:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(data)
    images: list[bytes] = []
    try:
        for i in range(min(len(pdf), n_pages)):
            page = pdf[i]
            bitmap = page.render(scale=RENDER_DPI / 72)
            pil = bitmap.to_pil()
            buf = io.BytesIO()
            pil.save(buf, format="PNG")
            images.append(buf.getvalue())
            page.close()
    finally:
        pdf.close()
    return images


def read_pdf(data: bytes, ocr_mode: str = "auto") -> TextResult:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise ReaderError("PDF được mã hoá") from exc
        total = len(reader.pages)
    except ReaderError:
        raise
    except Exception as exc:
        raise ReaderError(f"Không đọc được file PDF: {exc}") from exc

    n_pages = min(total, MAX_PAGES)
    blocks: list[Block] = []
    for i in range(n_pages):
        try:
            raw = reader.pages[i].extract_text() or ""
        except Exception:
            raw = ""
        text = normalize(raw).strip()
        if text:
            text, rubies = extract_paren_rubies(text)
            blocks.append(Block(text=text, page=i + 1, rubies=rubies))
    full = "\n".join(b.text for b in blocks)
    truncated = total > MAX_PAGES

    # Chỉ OCR khi text layer gần như rỗng. Không xét tỉ lệ chữ Nhật: PDF tiếng Việt/Anh có chữ thật
    # từng bị coi là scan rồi OCR bằng jpn → văn bản rác khác hẳn file gốc.
    if sum(1 for c in full if not c.isspace()) < MIN_CHARS_PER_PAGE * n_pages:
        return TextResult(text="", source_type="pdf", engine="pdf-text", blocks=[], pages=n_pages,
                          truncated=truncated, needs_ocr=True,
                          page_images=_render_pages(data, n_pages))
    return TextResult(text=full, source_type="pdf", engine="pdf-text", blocks=blocks, pages=n_pages,
                      truncated=truncated)
