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
                            "isVertical": None, "pages": 1, "lowConfidence": False, "truncated": False,
                            "truncatedPages": 0, "ocrFallbackConfidence": settings.OCR_FALLBACK_CONFIDENCE}
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

    def fake_read(data, ocr_mode="auto", page=1, fallback_confidence=None):
        return TextResult(text="日本語", source_type="image", engine="tesseract", pages=1,
                          blocks=[Block(text="日本語", is_vertical=True)], mean_confidence=0.9,
                          is_vertical=True)
    monkeypatch.setattr(image_reader, "read_image", fake_read)
    r = client.post("/api/extract/text", files={"file": ("scan.png", _png(), "image/png")},
                    data={"ocr_mode": "vertical"})
    assert r.status_code == 200
    assert r.json()["meta"] == {"sourceType": "image", "engine": "tesseract", "meanConfidence": 0.9,
                                "isVertical": True, "pages": 1, "lowConfidence": False, "truncated": False,
                                "truncatedPages": 0, "ocrFallbackConfidence": settings.OCR_FALLBACK_CONFIDENCE}
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

    def fake_read(data, ocr_mode="auto", page=1, fallback_confidence=None):
        assert data.startswith(b"\x89PNG") and ocr_mode == "auto"
        assert fallback_confidence == settings.OCR_FALLBACK_CONFIDENCE   # không gửi → ngưỡng mặc định
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


@pytest.mark.parametrize("value", ["1.5", "-0.1", "abc", "nan", "inf"])
def test_ocr_fallback_confidence_out_of_range_is_422(value):
    r = client.post("/api/extract/text", data={"text": "日本語", "ocr_fallback_confidence": value})
    assert r.status_code == 422, (value, r.text)


def test_ocr_fallback_confidence_reaches_ocr_and_is_echoed(monkeypatch):
    from pypdf import PdfWriter
    from app.extract.readers import Block, TextResult, image_reader
    seen = []

    def fake_read(data, ocr_mode="auto", page=1, fallback_confidence=None):
        seen.append(fallback_confidence)
        return TextResult(text="日本語", source_type="image", engine="tesseract", pages=1,
                          blocks=[Block(text="日本語")], mean_confidence=0.5, is_vertical=False)
    monkeypatch.setattr(image_reader, "read_image", fake_read)

    r = client.post("/api/extract/text", files={"file": ("scan.png", _png(), "image/png")},
                    data={"ocr_fallback_confidence": "0.4"})
    assert r.status_code == 200, r.text
    assert r.json()["meta"]["ocrFallbackConfidence"] == 0.4
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    r = client.post("/api/extract/text", files={"file": ("scan.pdf", buf.getvalue(), "application/pdf")},
                    data={"ocr_fallback_confidence": "0"})          # biên 0 hợp lệ: không bao giờ nhờ Gemini
    assert r.status_code == 200, r.text
    assert r.json()["meta"]["ocrFallbackConfidence"] == 0.0
    assert seen == [0.4, 0.0]                                        # ảnh, rồi trang PDF scan qua ocr_pages
    # nguồn không qua OCR vẫn trả lại ngưỡng đã nhận
    r = client.post("/api/extract/text", data={"text": "日本語", "ocr_fallback_confidence": "1"})
    assert r.json()["meta"]["ocrFallbackConfidence"] == 1.0


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
                         "example", "exampleVi", "suspect", "chapter", "conflicts",
                         "readingNote", "exampleSegments", "docReading", "docMeaningEn", "docLevel"}
    # văn xuôi không ruby: tài liệu không khai báo gì → ba khoá đều null trên mọi item (kể cả ngữ pháp)
    assert all((it["docReading"], it["docMeaningEn"], it["docLevel"]) == (None, None, None) for it in body["items"])


def test_analyze_split_chapters():
    r = client.post("/api/extract/analyze", json={
        "text": "第1課\n私は毎日勉強します。\n第2課\n学校へ行きます。",
        "options": {"levelFilter": "all", "includeGrammar": False, "splitChapters": True},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stats"]["chaptersDetected"] is True
    assert body["items"][0]["chapter"] == 1


def test_enrich_without_key(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": [{"ref": "1", "term": "勉強"}]})
    assert r.status_code == 200
    assert r.json() == {"enriched": False, "items": [], "reason": "no_api_key"}


def test_health():
    r = client.get("/api/extract/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"sudachi", "jmdict", "jlpt", "unihan", "grammar", "tesseract", "gemini",
                         "radicals", "kradfile", "kanjivg", "pitch", "distractors",
                         "kanjiStrokes", "hanVietGraph", "kanjiCards", "conjugation", "conflicts",
                         "radicalCards", "mining"}
    assert body["conflicts"] is True     # F2: danh sách JLPT đã commit là đủ để so cách đọc / nghĩa / cấp
    # C4 thẻ bộ thủ (bảng radicals_214.csv đã commit; `radicals` ở trên là unihan_rs.csv) và C6 khai thác câu (Sudachi)
    assert body["radicalCards"] is True and body["mining"] is True
    assert body["sudachi"] and body["jlpt"] and body["unihan"] and body["grammar"]
    assert isinstance(body["tesseract"], bool) and isinstance(body["gemini"], bool)
    # dữ liệu chữ Hán (LP-17): cờ bool, False khi chưa chạy build_dicts cho nguồn đó
    assert all(isinstance(body[k], bool) for k in ("radicals", "kradfile", "kanjivg", "pitch"))
    assert body["distractors"] is True   # danh sách JLPT đã commit là đủ để sinh đồng âm
    # tính năng LP-17: luyện viết = có nét mẫu KanjiVG; đồ thị Hán-Việt / thẻ chữ Hán chạy trên Unihan đã commit;
    # chia động từ thuần quy tắc nên luôn sẵn sàng
    assert body["kanjiStrokes"] is body["kanjivg"]
    assert body["hanVietGraph"] is True and body["kanjiCards"] is True and body["conjugation"] is True


def test_distractors_endpoint(monkeypatch):
    from app.extract import jmdict, kanji_similar
    from app.extract.jlpt import classifier
    monkeypatch.setattr(classifier, "homophones_jlpt",
                        lambda r: [("橋", "bridge", "N5"), ("箸", "chopsticks", "N5")] if r == "はし" else [])
    monkeypatch.setattr(jmdict, "homophones", lambda reading, exclude_kanji=None, limit=10: [])
    monkeypatch.setattr(kanji_similar, "lookalike_terms", lambda *a, **kw: [])
    body = {"items": [{"ref": "a", "term": "橋", "reading": "はし", "meaning": "bridge", "level": "N5"},
                      {"ref": "b", "term": "とても"}]}
    r = client.post("/api/extract/distractors", json=body)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "items": [
            {"ref": "a", "kanjiLookalike": [],
             "homophones": [{"term": "箸", "reading": "はし", "meaning": "chopsticks", "level": "N5", "confidence": 0.9}]},
            {"ref": "b", "kanjiLookalike": [], "homophones": []},
        ],
        "stats": {"withLookalike": 0, "withHomophone": 1},
    }
    # tuỳ chọn: chỉ một loại, ngưỡng cao hơn → rỗng nhưng vẫn 200
    r = client.post("/api/extract/distractors", json={**body, "kinds": ["kanji_lookalike"], "minConfidence": 0.95, "k": 1})
    assert r.status_code == 200 and r.json()["stats"] == {"withLookalike": 0, "withHomophone": 0}
    assert client.post("/api/extract/distractors", json={"items": []}).json() == {
        "items": [], "stats": {"withLookalike": 0, "withHomophone": 0}}
    # 400: quá 1 000 mục hoặc kind lạ; 422: k / minConfidence ngoài khoảng
    too_many = {"items": [{"ref": str(i), "term": "橋"} for i in range(1001)]}
    assert client.post("/api/extract/distractors", json=too_many).status_code == 400
    assert client.post("/api/extract/distractors", json={**body, "kinds": ["synonym"]}).status_code == 400
    assert client.post("/api/extract/distractors", json={**body, "k": 0}).status_code == 422
    assert client.post("/api/extract/distractors", json={**body, "minConfidence": 1.5}).status_code == 422
    # khoá nội bộ áp dụng như mọi route extract
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    assert client.post("/api/extract/distractors", json=body).status_code == 401


def test_internal_key_required_when_set(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    assert client.get("/api/extract/health").status_code == 401
    assert client.get("/api/extract/health", headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.get("/api/extract/health", headers={"X-Internal-Key": "secret"}).status_code == 200


def test_internal_key_guards_legacy_routers(monkeypatch):
    """nlp / kanji / ocr / audio trước đây mở công khai → nay cùng dependency require_internal_key với extract."""
    from app.extract.readers import Block, TextResult, image_reader
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    monkeypatch.setattr(image_reader, "read_image", lambda data, ocr_mode="auto", page=1: TextResult(
        text="日", source_type="image", engine="tesseract", blocks=[Block(text="日")], mean_confidence=0.9))
    calls = [
        ("/api/nlp/analyze", {"json": {"text": "日本語"}}),
        ("/api/kanji/score-stroke", {"json": {"kanji": "一", "user_strokes": [
            {"stroke_index": 0, "points": [{"x": 0, "y": 50}, {"x": 90, "y": 50}]}]}}),
        ("/api/ocr/process-image", {"files": {"file": ("scan.png", _png(), "image/png")}, "data": {"mode": "auto"}}),
        ("/api/audio/pitch-score", {"json": {"word": "にほん", "accentType": 0, "contour": [
            {"t": 0.0, "f0": 100.0}, {"t": 0.5, "f0": 100.0}, {"t": 0.6, "f0": 150.0}, {"t": 1.1, "f0": 150.0}]}}),
    ]
    for path, kwargs in calls:
        assert client.post(path, **kwargs).status_code == 401, path
        assert client.post(path, headers={"X-Internal-Key": "wrong"}, **kwargs).status_code == 401, path
        assert client.post(path, headers={"X-Internal-Key": "secret"}, **kwargs).status_code == 200, path


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


def test_conflicts_endpoint(monkeypatch):
    """F2: kiểm tra lại thẻ cũ qua POST /extract/conflicts và tuỳ chọn F2 đi qua /analyze."""
    body = {"items": [{"ref": "a", "term": "学校", "reading": "がくこう", "meaningEn": "school"},
                      {"ref": "b", "term": "日本", "reading": "にっぽん"},
                      {"ref": "c", "kind": "grammar", "term": "〜なければならない", "level": "N4", "docLevel": "N1"},
                      {"ref": "d", "term": "橋", "reading": "はし", "meaningEn": "school"},
                      {"ref": "e", "term": "覆公", "reading": "ふくこう"}],
            # mục quản trị ghi đè: にっぽん hợp lệ theo JLPT nhưng quản trị chỉ nhận にほん → 0.95
            "references": [{"term": "日本", "reading": "にほん", "sourceId": 9}]}
    r = client.post("/api/extract/conflicts", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert set(out) == {"items", "stats"} and [it["ref"] for it in out["items"]] == ["a", "b", "c", "d", "e"]
    by = {it["ref"]: it["conflicts"] for it in out["items"]}
    from app.extract import jmdict
    assert [(w["field"], w["source"], w["confidence"], w["document"], w["reference"]) for w in by["a"]] == [
        ("reading", "jlpt_list", 0.9 if jmdict.available() else 0.75, "がくこう", "がっこう")]
    assert [(w["field"], w["source"], w["confidence"]) for w in by["b"]] == [("reading", "admin:9", 0.95)]
    assert by["c"] == [] and by["d"] == [] and by["e"] == []      # 0.5 dưới ngưỡng mặc định 0.6; từ lạ im lặng
    assert out["stats"] == {"items": 5, "conflicts": 2,
                            "conflictsByField": {"reading": 2, "furigana": 0, "meaning": 0, "level": 0, "grammar": 0}}
    low = client.post("/api/extract/conflicts", json={**body, "minConfidence": 0.5}).json()
    by = {it["ref"]: [w["field"] for w in it["conflicts"]] for it in low["items"]}
    assert by == {"a": ["reading"], "b": ["reading"], "c": ["grammar"], "d": ["meaning"], "e": []}
    assert client.post("/api/extract/conflicts", json={"items": []}).json() == {
        "items": [], "stats": {"items": 0, "conflicts": 0,
                               "conflictsByField": {"reading": 0, "furigana": 0, "meaning": 0, "level": 0, "grammar": 0}}}
    # docReading / docMeaningEn ba trạng thái: không gửi → reading của thẻ là của tài liệu (a ở trên); null → tài liệu
    # không khai → im lặng dù reading sai; giá trị → so giá trị đó. docLevelScope "document": từ dễ trong tài liệu khó là thường
    tri = client.post("/api/extract/conflicts", json={"items": [
        {"ref": "null", "term": "学校", "reading": "がくこう", "docReading": None, "meaningEn": "bridge", "docMeaningEn": None},
        {"ref": "val", "term": "学校", "reading": "がっこう", "docReading": "がくこう"},
        {"ref": "doc", "term": "学校", "docLevel": "N1", "docLevelScope": "document"},
        {"ref": "item", "term": "学校", "docLevel": "N1"}], "minConfidence": 0.5}).json()
    by = {it["ref"]: [(w["field"], w["document"]) for w in it["conflicts"]] for it in tri["items"]}
    assert by == {"null": [], "val": [("reading", "がくこう")], "doc": [], "item": [("level", "N1")]}
    assert client.post("/api/extract/conflicts", json={"items": [{"ref": "x", "term": "学校", "docLevelScope": "page"}]}).status_code == 422
    # /analyze nhận cùng tuỳ chọn: references / conflictMinConfidence / warnConflicts / docLevel
    r = client.post("/api/extract/analyze", json={
        "text": "学校：がくこう - school\n橋\tはし\tschool\n映画\tえいが\tmovie\n",
        "options": {"extractMode": "list", "conflictMinConfidence": 0.5,
                    "references": [{"term": "学校", "reading": "がくこう", "sourceId": "ref-1"}]}})
    assert r.status_code == 200, r.text
    by = {it["term"]: it["conflicts"] for it in r.json()["items"]}
    assert by["学校"] == [] and [w["field"] for w in by["橋"]] == ["meaning"] and by["映画"] == []
    assert r.json()["stats"]["conflicts"] == 1
    r = client.post("/api/extract/analyze", json={"text": "学校：がくこう - school\n映画\tえいが\tmovie\n橋\tはし\tbridge\n",
                                                  "options": {"extractMode": "list", "warnConflicts": False}})
    assert r.json()["stats"]["conflicts"] == 0 and all(it["conflicts"] == [] for it in r.json()["items"])
    # warnConflicts tắt vẫn trả khai báo của tài liệu để backend lưu (doc_reading / doc_meaning_en)
    by = {it["term"]: it for it in r.json()["items"]}
    assert (by["学校"]["docReading"], by["学校"]["docMeaningEn"], by["学校"]["docLevel"]) == ("がくこう", "school", None)
    # 400: quá 1 000 mục; 422: minConfidence ngoài khoảng / thiếu term; 401: khoá nội bộ như mọi route extract
    too_many = {"items": [{"ref": str(i), "term": "学校"} for i in range(1001)]}
    assert client.post("/api/extract/conflicts", json=too_many).status_code == 400
    assert client.post("/api/extract/conflicts", json={**body, "minConfidence": 1.5}).status_code == 422
    assert client.post("/api/extract/conflicts", json={"items": [{"ref": "x"}]}).status_code == 422
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    assert client.post("/api/extract/conflicts", json=body).status_code == 401
    assert client.post("/api/extract/conflicts", json=body, headers={"X-Internal-Key": "secret"}).status_code == 200


def test_analyze_items_round_trip_through_conflicts():
    """Item /analyze lưu nguyên (thêm ref) gửi lại POST /extract/conflicts → cùng cảnh báo: docReading / docMeaningEn /
    docLevel cùng tên với ConflictItem, khoá thừa bị bỏ qua. Thiếu ba khoá đó (lỗi cũ: pipeline gỡ `_doc`) thì cách đọc
    chuẩn của thẻ bị coi là của tài liệu → mất cảnh báo 学校 がくこう."""
    opts = {"conflictMinConfidence": 0.5}
    texts = [("学校：がくこう - school\n橋\tはじ\tbridge\n映画\tえいが\tmovie\tN1\n勉強\tべんきょう\thọc\n4時\tよじ\tfour o'clock\n",
              {**opts, "extractMode": "list"}),
             ("漢字（かんし）を書く。毎日勉強します。", opts)]
    for text, options in texts:
        r = client.post("/api/extract/analyze", json={"text": text, "options": options})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert any(it["conflicts"] for it in items)
        stored = [{**it, "ref": str(i)} for i, it in enumerate(items)]
        back = client.post("/api/extract/conflicts", json={"items": stored, "minConfidence": 0.5})
        assert back.status_code == 200, back.text
        assert [it["conflicts"] for it in back.json()["items"]] == [it["conflicts"] for it in items]
    # job cũ chưa lưu khai báo (không có khoá doc*): reading của thẻ được coi là của tài liệu → 学校 がっこう hết cảnh báo
    r = client.post("/api/extract/analyze", json={"text": texts[0][0], "options": texts[0][1]}).json()
    gakkou = next(it for it in r["items"] if it["term"] == "学校")
    assert gakkou["reading"] == "がっこう" and [c["document"] for c in gakkou["conflicts"]] == ["がくこう"]
    legacy = {k: v for k, v in gakkou.items() if k not in ("docReading", "docMeaningEn", "docLevel")}
    back = client.post("/api/extract/conflicts", json={"items": [{**legacy, "ref": "x"}]}).json()
    assert back["items"][0]["conflicts"] == []
