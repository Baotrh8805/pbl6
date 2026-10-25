"""Rà soát rủi ro 25/10 (docs/Plan/reports/2026-10-25-ra-soat-rui-ro.md): O1 handler OCR không chặn event loop, O2 giới hạn
điểm ảnh / cỡ upload, O3 khoá nội bộ khi chưa đặt AI_SERVICE_KEY."""
import asyncio
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import extract_router, ocr_router
from app.core.config import settings
from app.extract.readers import FileTooLarge, MAX_FILE_BYTES, ReaderError, image_reader, read_upload
from app.extract.readers.pdf_reader import MAX_RENDER_PIXELS, RENDER_DPI, _render_scale
from app.main import app


def _png(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("L", (w, h), 255).save(buf, format="PNG")
    return buf.getvalue()


# ---------- O3: khoá nội bộ ----------

def test_without_key_only_localhost_may_call(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "")
    body = {"text": "日本語"}
    remote = TestClient(app, client=("203.0.113.7", 50000))
    assert remote.post("/api/extract/text", data=body).status_code == 401
    local = TestClient(app, client=("127.0.0.1", 50000))
    assert local.post("/api/extract/text", data=body).status_code == 200


def test_with_key_header_is_required_even_from_localhost(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "s3cret")
    local = TestClient(app, client=("127.0.0.1", 50000))
    assert local.post("/api/extract/text", data={"text": "日本語"}).status_code == 401
    assert local.post("/api/extract/text", data={"text": "日本語"}, headers={"X-Internal-Key": "s3cre"}).status_code == 401
    remote = TestClient(app, client=("203.0.113.7", 50000))
    assert remote.post("/api/extract/text", data={"text": "日本語"},
                       headers={"X-Internal-Key": "s3cret"}).status_code == 200


# ---------- O1: OCR chạy trong threadpool ----------

def test_ocr_handlers_are_sync_so_fastapi_runs_them_in_threadpool():
    assert not asyncio.iscoroutinefunction(extract_router.extract_text)
    assert not asyncio.iscoroutinefunction(ocr_router.process_japanese_image)


# ---------- O2: cỡ upload / điểm ảnh ----------

def test_read_upload_stops_after_the_limit():
    assert read_upload(io.BytesIO(b"x" * MAX_FILE_BYTES)) == b"x" * MAX_FILE_BYTES
    with pytest.raises(FileTooLarge):
        read_upload(io.BytesIO(b"x" * (MAX_FILE_BYTES + 1)))


def test_oversized_upload_is_413():
    client = TestClient(app)
    big = b"%PDF" + b"0" * MAX_FILE_BYTES
    r = client.post("/api/extract/text", files={"file": ("a.pdf", big, "application/pdf")})
    assert r.status_code == 413


def test_image_over_pixel_cap_is_rejected_before_decoding(monkeypatch):
    monkeypatch.setattr(image_reader, "MAX_PIXELS", 100 * 100)
    with pytest.raises(ReaderError, match="quá lớn"):
        image_reader._preprocess(_png(200, 100))


def test_large_image_is_downscaled_by_area_keeping_long_strips_readable(monkeypatch):
    monkeypatch.setattr(image_reader, "WORK_PIXELS", 400 * 4000)
    img, _ = image_reader._preprocess(_png(500, 5000))  # 2,5 MP > 1,6 MP -> co ~0,8, không ép cạnh dài về 4000/… quá mức
    assert img.width * img.height <= 400 * 4000 * 1.01
    assert img.width >= 390  # cạnh ngắn giữ ~400 px chứ không bị bóp còn ~50 px


def test_pdf_render_scale_is_capped_for_huge_pages():
    a4 = _render_scale(595, 842)
    assert a4 == RENDER_DPI / 72  # trang thường giữ 200 dpi
    huge = _render_scale(200 * 72, 200 * 72)  # trang 200×200 inch
    assert (200 * 72 * huge) ** 2 <= MAX_RENDER_PIXELS * 1.001


def test_analyze_rejects_oversized_text():
    client = TestClient(app)
    assert client.post("/api/extract/analyze", json={"text": "あ" * 200_001}).status_code == 422
