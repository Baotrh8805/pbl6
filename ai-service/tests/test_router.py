import io

import docx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def _docx_bytes(text: str) -> bytes:
    d = docx.Document()
    d.add_paragraph(text)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_text_form():
    r = client.post("/api/extract/text", data={"text": "日本語の勉強はとても面白いです。"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"].startswith("日本語")
    assert body["meta"] == {"sourceType": "text", "engine": "text", "meanConfidence": None,
                            "isVertical": None, "pages": 1, "lowConfidence": False, "truncated": False}
    assert body["blocks"][0]["rubies"] == []


def test_txt_upload_and_paren_ruby():
    data = "漢字（かんじ）を勉強する。\r\n".encode("utf-8")
    r = client.post("/api/extract/text", files={"file": ("bai.txt", data, "text/plain")})
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "漢字を勉強する。\n"
    assert body["meta"]["sourceType"] == "txt"
    assert body["blocks"][0]["rubies"] == [{"base": "漢字", "reading": "かんじ"}]


def test_shift_jis_txt_upload():
    data = "日本語の勉強。".encode("shift_jis")
    r = client.post("/api/extract/text", files={"file": ("sjis.txt", data, "text/plain")})
    assert r.status_code == 200
    assert "勉強" in r.json()["text"]


def test_docx_upload():
    r = client.post("/api/extract/text",
                    files={"file": ("bai.docx", _docx_bytes("毎日勉強します。"),
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    assert r.status_code == 200
    assert r.json()["meta"]["engine"] == "docx"
    assert r.json()["text"] == "毎日勉強します。"


def test_missing_input_400_and_unsupported_type_400():
    assert client.post("/api/extract/text", data={}).status_code == 400
    r = client.post("/api/extract/text", files={"file": ("x.exe", b"MZ\x00\x00", "application/octet-stream")})
    assert r.status_code == 400


def _png() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("L", (40, 40), 255).save(buf, format="PNG")
    return buf.getvalue()


def test_image_returns_503_when_tesseract_unavailable(monkeypatch):
    from app.extract.readers import image_reader
    from app.extract import gemini
    monkeypatch.setattr(image_reader, "available", lambda: False)
    monkeypatch.setattr(gemini, "available", lambda: False)
    r = client.post("/api/extract/text", files={"file": ("scan.png", _png(), "image/png")})
    assert r.status_code == 503
    assert r.json()["detail"].startswith("OCR engine unavailable")
    # route OCR cũ cũng dùng chung engine
    r = client.post("/api/ocr/process-image", files={"file": ("scan.png", _png(), "image/png")},
                    data={"mode": "vertical"})
    assert r.status_code == 503


def test_image_upload_uses_image_reader(monkeypatch):
    from app.extract.readers import Block, TextResult, image_reader

    def fake_read(data, ocr_mode="auto", page=1):
        return TextResult(text="日本語", source_type="image", engine="tesseract", pages=1,
                          blocks=[Block(text="日本語", is_vertical=True)], mean_confidence=0.9,
                          is_vertical=True)
    monkeypatch.setattr(image_reader, "read_image", fake_read)
    r = client.post("/api/extract/text", files={"file": ("scan.png", _png(), "image/png")},
                    data={"ocr_mode": "vertical"})
    assert r.status_code == 200
    assert r.json()["meta"] == {"sourceType": "image", "engine": "tesseract", "meanConfidence": 0.9,
                                "isVertical": True, "pages": 1, "lowConfidence": False, "truncated": False}
    r = client.post("/api/ocr/process-image", files={"file": ("scan.png", _png(), "image/png")},
                    data={"mode": "vertical"})
    assert r.status_code == 200
    assert r.json() == {"filename": "scan.png", "full_extracted_text": "日本語",
                        "detected_blocks": [{"text": "日本語", "confidence": 0.9, "is_vertical": True}]}


def test_scanned_pdf_goes_through_ocr_pages(monkeypatch):
    from pypdf import PdfWriter
    from app.extract.readers import Block, TextResult, image_reader

    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)

    def fake_read(data, ocr_mode="auto", page=1):
        assert data.startswith(b"\x89PNG") and ocr_mode == "auto"
        return TextResult(text=f"trang{page}", source_type="image", engine="tesseract", pages=1,
                          blocks=[Block(text=f"trang{page}")], mean_confidence=0.9, is_vertical=False)
    monkeypatch.setattr(image_reader, "read_image", fake_read)
    r = client.post("/api/extract/text", files={"file": ("scan.pdf", buf.getvalue(), "application/pdf")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"] == "trang1\n\ntrang2"
    assert body["meta"]["sourceType"] == "pdf" and body["meta"]["engine"] == "tesseract"
    assert body["meta"]["pages"] == 2 and body["meta"]["meanConfidence"] == 0.9
    assert [b["page"] for b in body["blocks"]] == [1, 2]


def test_analyze():
    r = client.post("/api/extract/analyze", json={
        "text": "毎日漢字を勉強します。食べなければならない。",
        "blocks": None,
        "options": {"userLevel": "N5", "levelFilter": "all", "includeGrammar": True},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"items", "stats", "truncated"}
    kinds = {it["kind"] for it in body["items"]}
    assert kinds == {"vocab", "grammar"}
    item = body["items"][0]
    assert set(item) == {"kind", "position", "term", "surface", "reading", "readingSegments", "hanViet", "pos",
                         "meaningEn", "meaningVi", "level", "levelConfidence", "levelSources", "frequency",
                         "example", "exampleVi", "suspect"}


def test_enrich_without_key(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": [{"ref": "1", "term": "勉強"}]})
    assert r.status_code == 200
    assert r.json() == {"enriched": False, "items": [], "reason": "no_api_key"}


def test_health():
    r = client.get("/api/extract/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"sudachi", "jmdict", "jlpt", "unihan", "grammar", "tesseract", "gemini"}
    assert body["sudachi"] and body["jlpt"] and body["unihan"] and body["grammar"]
    assert isinstance(body["tesseract"], bool) and isinstance(body["gemini"], bool)


def test_internal_key_required_when_set(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    assert client.get("/api/extract/health").status_code == 401
    assert client.get("/api/extract/health", headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.get("/api/extract/health", headers={"X-Internal-Key": "secret"}).status_code == 200


def test_legacy_nlp_route_still_works():
    r = client.post("/api/nlp/analyze", json={"text": "日本語を勉強する"})
    assert r.status_code == 200
    words = r.json()["words"]
    assert words[0]["original"] == "日本語"
    assert words[0]["furigana"] == "にほんご"
    assert words[0]["romaji"] == "nihongo"
    assert words[0]["han_viet"] == "NHẬT BẢN NGỮ"
    benkyou = next(w for w in words if w["original"] == "勉強")
    assert benkyou["jlpt_hint"] == "N5"


def test_analyze_extract_mode_list():
    r = client.post("/api/extract/analyze", json={"text": "勉強する - học\n学校：trường học\n映画\tbộ phim\n",
                                                  "options": {"extractMode": "list"}})
    assert r.status_code == 200
    assert r.json()["stats"]["layout"] == "list"
    assert r.json()["items"][0]["meaningVi"] == "học"
