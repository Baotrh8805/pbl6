import io

import pytest
from pypdf import PdfWriter

from app.extract.readers import OcrUnavailable, read_source
from app.extract.readers.pdf_reader import read_pdf


def _blank_pdf(pages: int = 2) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_pdf_without_text_layer_is_flagged_for_ocr_with_rendered_pages():
    result = read_pdf(_blank_pdf(2))
    assert result.needs_ocr is True
    assert result.pages == 2
    assert len(result.page_images) == 2
    assert result.page_images[0].startswith(b"\x89PNG")


def test_read_source_raises_ocr_unavailable_for_scanned_pdf(monkeypatch):
    # Không phụ thuộc máy có cài Tesseract / key Gemini hay không
    from app.extract.readers import image_reader
    monkeypatch.setattr(image_reader, "available", lambda: False)
    monkeypatch.setattr(image_reader.gemini, "available", lambda: False)
    with pytest.raises(OcrUnavailable):
        read_source("scan.pdf", _blank_pdf(1), None, "auto")


def test_corrupt_pdf_is_400_style_error():
    from app.extract.readers import ReaderError
    with pytest.raises(ReaderError):
        read_source("bad.pdf", b"%PDF-1.4 garbage", None, "auto")


def _text_pdf(text: str) -> bytes:
    """PDF 1 trang có text layer (font Helvetica chuẩn, chỉ ASCII)."""
    stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Contents 4 0 R"
        b" /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return out


def test_pdf_with_non_japanese_text_layer_keeps_text_instead_of_ocr():
    # PDF tiếng Việt / tiếng Anh có chữ thật: trước đây bị coi là scan và OCR bằng jpn → ra chữ rác
    result = read_pdf(_text_pdf("TRUONG DAI HOC BACH KHOA - CHUONG 1. KHAO SAT BAI TOAN"))
    assert result.needs_ocr is False
    assert "KHAO SAT BAI TOAN" in result.text
