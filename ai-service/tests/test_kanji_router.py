"""Router /kanji (nét mẫu + chấm nét) với kanjidata.strokes được monkeypatch bằng glyph tự dựng — không cần
kanji_strokes.json; test cuối chạy trên dữ liệu thật khi có. tests/test_router.py giữ test khoá nội bộ của alias cũ."""
import pytest
from fastapi.testclient import TestClient

from app.api import kanji_dtw_router
from app.core.config import settings
from app.extract import kanjidata
from app.extract import stroke_score as ss
from app.main import app

client = TestClient(app)

RAW = [
    [(20.0, 10.0), (20.0, 90.0)],
    [(20.0, 10.0), (80.0, 10.0), (80.0, 90.0)],
    [(20.0, 50.0), (80.0, 50.0)],
    [(20.0, 90.0), (80.0, 90.0)],
]
REF = ss.normalize_glyph([ss.resample(s) for s in RAW])


def _points(stroke, with_t=False):
    return [{"x": x, "y": y, **({"t": i * 16.0} if with_t else {})} for i, (x, y) in enumerate(stroke)]


@pytest.fixture
def ref_glyph(monkeypatch):
    monkeypatch.setattr(kanjidata, "strokes", lambda ch: [list(s) for s in REF] if ch == "日" else None)


# ----------------------------------------------------------------------------- GET /kanji/{ch}/strokes

def test_get_strokes(ref_glyph):
    r = client.get("/api/kanji/日/strokes")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"kanji", "strokeCount", "strokes"}
    assert body["kanji"] == "日" and body["strokeCount"] == 4
    assert len(body["strokes"]) == 4 and all(len(s) == 32 and len(s[0]) == 2 for s in body["strokes"])
    assert body["strokes"][0][0] == pytest.approx([0.125, 0.0])


def test_get_strokes_404(ref_glyph):
    for ch in ("x", "あ", "日本", "明"):          # không phải chữ Hán / nhiều ký tự / chữ Hán chưa có dữ liệu
        assert client.get(f"/api/kanji/{ch}/strokes").status_code == 404, ch


# ----------------------------------------------------------------------------- POST /kanji/score

def test_score_reference_is_perfect(ref_glyph):
    r = client.post("/api/kanji/score", json={"kanji": "日", "strokes": [_points(s, with_t=True) for s in REF]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"kanji", "totalScore", "isCorrectOrder", "feedback", "perStroke", "missing", "extra", "strokeCount"}
    assert body["kanji"] == "日" and body["totalScore"] == 100.0 and body["isCorrectOrder"] is True
    assert body["perStroke"] == [{"index": i, "score": 100.0, "wrongDirection": False, "expectedIndex": i} for i in range(4)]
    assert body["missing"] == [] and body["extra"] == [] and body["strokeCount"] == 4
    assert body["feedback"]


def test_score_reports_order_direction_missing(ref_glyph):
    swapped = [REF[0], REF[2], REF[1][::-1], REF[3]]
    body = client.post("/api/kanji/score", json={"kanji": "日", "strokes": [_points(s) for s in swapped]}).json()
    assert body["isCorrectOrder"] is False
    assert [p["expectedIndex"] for p in body["perStroke"]] == [0, 2, 1, 3]
    assert [p["wrongDirection"] for p in body["perStroke"]] == [False, False, True, False]
    assert "Thứ tự nét 2 và 3 bị đảo" in body["feedback"] and "Nét 3 vẽ ngược hướng" in body["feedback"]

    body = client.post("/api/kanji/score", json={"kanji": "日", "strokes": [_points(s) for s in REF[:3]]}).json()
    assert body["missing"] == [3] and body["extra"] == [] and body["feedback"].startswith("Thiếu 1 nét")
    assert [p["expectedIndex"] for p in body["perStroke"]] == [0, 1, 2]


def test_score_without_strokes_is_zero(ref_glyph):
    body = client.post("/api/kanji/score", json={"kanji": "日", "strokes": []}).json()
    assert body["totalScore"] == 0.0 and body["missing"] == [0, 1, 2, 3] and body["perStroke"] == []
    assert body["feedback"] == "Không phát hiện nét vẽ nào."


def test_score_404_without_reference(ref_glyph):
    stroke = _points(REF[0])
    assert client.post("/api/kanji/score", json={"kanji": "明", "strokes": [stroke]}).status_code == 404
    assert client.post("/api/kanji/score", json={"kanji": "日本", "strokes": [stroke]}).status_code == 404
    assert client.post("/api/kanji/score", json={"kanji": "a", "strokes": [stroke]}).status_code == 404


def test_score_limits_413_and_validation_422(ref_glyph):
    stroke = _points(REF[0])
    too_many = [stroke] * (kanji_dtw_router.MAX_STROKES + 1)
    assert client.post("/api/kanji/score", json={"kanji": "日", "strokes": too_many}).status_code == 413
    long_stroke = [{"x": i / 1000, "y": 0.5} for i in range(kanji_dtw_router.MAX_POINTS + 1)]
    assert client.post("/api/kanji/score", json={"kanji": "日", "strokes": [long_stroke]}).status_code == 413
    # đúng giới hạn thì vẫn chấm
    exact = [{"x": i / 1000, "y": 0.5} for i in range(kanji_dtw_router.MAX_POINTS)]
    assert client.post("/api/kanji/score", json={"kanji": "日", "strokes": [exact]}).status_code == 200
    assert client.post("/api/kanji/score", json={"kanji": "日", "strokes": [[]]}).status_code == 422     # nét rỗng
    assert client.post("/api/kanji/score", json={"kanji": "", "strokes": [stroke]}).status_code == 422
    assert client.post("/api/kanji/score", json={"strokes": [stroke]}).status_code == 422
    assert client.post("/api/kanji/score", json={"kanji": "日", "strokes": [[{"x": "a", "y": 0}]]}).status_code == 422


def test_score_rejects_non_finite_coordinates(ref_glyph):
    """json.loads của Python nhận NaN / Infinity: trước đây một NaN làm mọi toạ độ thành NaN và từng nét được 100 điểm
    (200). Phải 422, không 500 (Field(allow_inf_nan=False) → FastAPI không serialize được body 422 có NaN)."""
    headers = {"Content-Type": "application/json"}
    for bad in ("NaN", "Infinity", "-Infinity"):
        body = '{"kanji":"日","strokes":[[{"x":%s,"y":0.5},{"x":1,"y":0.5}],[{"x":0,"y":0},{"x":0,"y":1}]]}' % bad
        r = client.post("/api/kanji/score", content=body.encode(), headers=headers)
        assert r.status_code == 422, (bad, r.status_code, r.text)
        assert r.json()["detail"] == "Toạ độ phải là số hữu hạn"
    body = '{"kanji":"日","strokes":[[{"x":0,"y":NaN},{"x":1,"y":0.5}]]}'
    assert client.post("/api/kanji/score", content=body.encode(), headers=headers).status_code == 422
    legacy = ('{"kanji":"日","user_strokes":[{"stroke_index":0,"points":[{"x":Infinity,"y":0.5},{"x":1,"y":0.5}]}]}')
    assert client.post("/api/kanji/score-stroke", content=legacy.encode(), headers=headers).status_code == 422


# ----------------------------------------------------------------------------- alias cũ

def test_legacy_score_stroke_alias(ref_glyph):
    body = {"kanji": "日", "user_strokes": [{"stroke_index": i, "points": _points(s)} for i, s in enumerate(REF)]}
    r = client.post("/api/kanji/score-stroke", json=body)
    assert r.status_code == 200, r.text
    assert r.json() == {"kanji": "日", "total_score": 100.0, "is_correct_order": True,
                        "feedback": "Viết đúng thứ tự và hướng, nét rõ ràng!"}
    # stroke_index quyết định thứ tự, không phải vị trí trong mảng
    body["user_strokes"].reverse()
    assert client.post("/api/kanji/score-stroke", json=body).json()["total_score"] == 100.0
    # nét đảo thứ tự thật sự → ánh xạ is_correct_order / feedback từ kết quả mới
    body = {"kanji": "日", "user_strokes": [{"stroke_index": 0, "points": _points(REF[0])},
                                            {"stroke_index": 1, "points": _points(REF[2])},
                                            {"stroke_index": 2, "points": _points(REF[1])},
                                            {"stroke_index": 3, "points": _points(REF[3])}]}
    out = client.post("/api/kanji/score-stroke", json=body).json()
    assert out["is_correct_order"] is False and out["feedback"] == "Thứ tự nét 2 và 3 bị đảo."
    # giữ hợp đồng cũ: không có nét mẫu vẫn 200, điểm 0
    out = client.post("/api/kanji/score-stroke", json={"kanji": "明", "user_strokes": [{"stroke_index": 0, "points": _points(REF[0])}]})
    assert out.status_code == 200 and out.json()["total_score"] == 0.0 and "明" in out.json()["feedback"]
    assert client.post("/api/kanji/score-stroke", json={"kanji": "日", "user_strokes": []}).json()["total_score"] == 0.0
    too_many = [{"stroke_index": i, "points": _points(REF[0])} for i in range(kanji_dtw_router.MAX_STROKES + 1)]
    assert client.post("/api/kanji/score-stroke", json={"kanji": "日", "user_strokes": too_many}).status_code == 413


# ----------------------------------------------------------------------------- khoá nội bộ / available

def test_internal_key_required_when_set(ref_glyph, monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    body = {"kanji": "日", "strokes": [_points(s) for s in REF]}
    assert client.get("/api/kanji/日/strokes").status_code == 401
    assert client.post("/api/kanji/score", json=body).status_code == 401
    assert client.get("/api/kanji/日/strokes", headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.get("/api/kanji/日/strokes", headers={"X-Internal-Key": "secret"}).status_code == 200
    assert client.post("/api/kanji/score", json=body, headers={"X-Internal-Key": "secret"}).status_code == 200


def test_available_follows_kanjivg_flag(monkeypatch):
    monkeypatch.setattr(kanjidata, "availability", lambda: {"radicals": True, "kanjivg": True})
    assert kanji_dtw_router.available() is True
    monkeypatch.setattr(kanjidata, "availability", lambda: {"radicals": True, "kanjivg": False})
    assert kanji_dtw_router.available() is False
    monkeypatch.setattr(kanjidata, "availability", lambda: {})
    assert kanji_dtw_router.available() is False


# ----------------------------------------------------------------------------- dữ liệu thật

@pytest.mark.skipif(not kanji_dtw_router.available(), reason="chưa build kanji_strokes.json")
def test_real_data_sanity():
    r = client.get("/api/kanji/日/strokes")
    assert r.status_code == 200 and r.json()["strokeCount"] == 4
    ref = r.json()["strokes"]
    body = client.post("/api/kanji/score", json={"kanji": "日", "strokes": [[{"x": x, "y": y} for x, y in s] for s in ref]}).json()
    assert body["totalScore"] == 100.0 and body["isCorrectOrder"] is True and body["strokeCount"] == 4
    # vẽ to trên canvas 300 px, nét 1 ngược hướng
    canvas = [[{"x": 300 * x + 20, "y": 300 * y + 20} for x, y in s] for s in ref]
    canvas[0].reverse()
    body = client.post("/api/kanji/score", json={"kanji": "日", "strokes": canvas}).json()
    assert body["perStroke"][0]["wrongDirection"] is True and "Nét 1 vẽ ngược hướng" in body["feedback"]
    assert all(p["score"] == 100.0 for p in body["perStroke"][1:])
