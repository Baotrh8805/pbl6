"""Router /audio (E4): mẫu trọng âm và chấm đường F0 người học; không còn nhận file âm thanh (mock Praat đã bỏ).
Dữ liệu trọng âm giả lập qua kanjidata.PITCH_FILE để không phụ thuộc kanjium thật (chưa commit)."""
import pytest
from fastapi.testclient import TestClient

from app.api import audio_praat_router
from app.api.audio_praat_router import NO_ACCENT_DATA
from app.core.config import settings
from app.extract import kanjidata
from app.main import app

client = TestClient(app)

PITCH_CSV = "word,reading,accent_type\n日本,にほん,2\n日本,にっぽん,2\n雨,あめ,1\n飴,あめ,0\n"


def step_contour(pattern: str) -> list[dict]:
    """Bậc thang 20 mẫu / mora: L = 100 Hz, H = 130 Hz, "_" = mora câm."""
    f0 = {"H": 130.0, "L": 100.0}
    return [{"t": (m * 20 + k) * 0.02, "f0": f0.get(ch)} for m, ch in enumerate(pattern) for k in range(20)]


@pytest.fixture
def no_pitch_data(tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "PITCH_FILE", tmp_path / "missing.csv")
    kanjidata.reset()
    yield
    kanjidata.reset()


@pytest.fixture
def pitch_data(tmp_path, monkeypatch):
    (tmp_path / "pitch_accent.csv").write_text(PITCH_CSV, encoding="utf-8")
    monkeypatch.setattr(kanjidata, "PITCH_FILE", tmp_path / "pitch_accent.csv")
    kanjidata.reset()
    yield
    kanjidata.reset()


# ----------------------------------------------------------------------------- chưa có dữ liệu

def test_reference_404_without_data(no_pitch_data):
    assert audio_praat_router.available() is False
    r = client.get("/api/audio/pitch-reference", params={"word": "日本", "reading": "にほん"})
    assert r.status_code == 404
    assert r.json()["detail"] == "Chưa có dữ liệu trọng âm cho từ này"


def test_score_404_without_data_but_200_with_override(no_pitch_data):
    body = {"word": "日本", "reading": "にほん", "contour": step_contour("LHL")}
    r = client.post("/api/audio/pitch-score", json=body)
    assert r.status_code == 404
    assert r.json()["detail"] == "Chưa có dữ liệu trọng âm cho từ này"

    r = client.post("/api/audio/pitch-score", json={**body, "accentType": 2})
    assert r.status_code == 200, r.text
    assert r.json() == {
        "word": "日本", "reading": "にほん", "accentType": 2,
        "pct": 100, "userHL": ["L", "H", "L"], "refHL": ["L", "H", "L"], "wrongMora": [], "voicedRatio": 1.0,
        "feedback": r.json()["feedback"],
    }
    assert "Đúng mẫu" in r.json()["feedback"]


# ----------------------------------------------------------------------------- có dữ liệu

def test_reference_with_data(pitch_data):
    assert audio_praat_router.available() is True
    r = client.get("/api/audio/pitch-reference", params={"word": "日本", "reading": "にほん"})
    assert r.status_code == 200, r.text
    assert r.json() == {"word": "日本", "reading": "にほん", "accentType": 2, "moras": [
        {"mora": "に", "level": "L"}, {"mora": "ほ", "level": "H"}, {"mora": "ん", "level": "L"}]}
    # cách đọc katakana (Sudachi) → hiragana; từ toàn kana không cần reading
    r = client.get("/api/audio/pitch-reference", params={"word": "雨", "reading": "アメ"})
    assert r.status_code == 200
    assert r.json()["reading"] == "あめ" and r.json()["accentType"] == 1
    assert [m["level"] for m in r.json()["moras"]] == ["H", "L"]
    # あめ: 雨=1 / 飴=0 → không rõ nghĩa nào → 404 như chưa có dữ liệu
    assert client.get("/api/audio/pitch-reference", params={"word": "あめ"}).status_code == 404
    # 日本 không kèm cách đọc: hai cách đọc cùng kiểu 2 → tra được nhưng không chia được mora → 400
    assert client.get("/api/audio/pitch-reference", params={"word": "日本"}).status_code == 400


def test_score_with_lookup_and_wrong_moras(pitch_data):
    r = client.post("/api/audio/pitch-score", json={"word": "日本", "reading": "にほん", "contour": step_contour("LHH")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accentType"] == 2
    assert body["refHL"] == ["L", "H", "L"] and body["userHL"] == ["L", "H", "H"]
    assert body["pct"] == 67 and body["wrongMora"] == [2]
    assert "mora 3 「ん」 cần thấp hơn" in body["feedback"]
    # にっぽん kiểu 2 = LHLL: mora cao là っ không thể có thanh → None, không bị chấm sai; voicedRatio phản ánh điểm không f0
    r = client.post("/api/audio/pitch-score", json={"word": "日本", "reading": "にっぽん", "contour": step_contour("L_LL")})
    assert r.status_code == 200
    assert r.json()["refHL"] == ["L", "H", "L", "L"]
    assert r.json()["userHL"] == ["L", None, "L", "L"] and r.json()["pct"] == 100
    assert r.json()["voicedRatio"] == 0.75


def test_score_without_voice(no_pitch_data):
    r = client.post("/api/audio/pitch-score", json={
        "word": "にほん", "accentType": 0, "contour": [{"t": i * 0.02, "f0": None} for i in range(5)]})
    assert r.status_code == 200
    assert r.json()["pct"] == 0 and r.json()["userHL"] == [] and r.json()["voicedRatio"] == 0.0
    assert "micro" in r.json()["feedback"]


# ----------------------------------------------------------------------------- kiểm tra đầu vào

def test_validation_errors(no_pitch_data):
    ok = {"word": "にほん", "accentType": 0, "contour": step_contour("LHH")}
    # từ có kanji mà không có cách đọc → 400; cách đọc không phải kana → 400
    assert client.post("/api/audio/pitch-score", json={**ok, "word": "日本"}).status_code == 400
    assert client.post("/api/audio/pitch-score", json={**ok, "reading": "nihon"}).status_code == 400
    assert client.get("/api/audio/pitch-reference", params={"word": "日本", "reading": "nihon"}).status_code == 400
    # quá 2 000 điểm, rỗng, accentType âm → 422
    too_many = [{"t": i * 0.001, "f0": 100.0} for i in range(2001)]
    assert client.post("/api/audio/pitch-score", json={**ok, "contour": too_many}).status_code == 422
    assert client.post("/api/audio/pitch-score", json={**ok, "contour": []}).status_code == 422
    assert client.post("/api/audio/pitch-score", json={**ok, "accentType": -1}).status_code == 422
    # NaN (json.loads của Python chấp nhận dù JSON chuẩn không có) → coi như khung không có thanh, không 500
    r = client.post("/api/audio/pitch-score", content='{"word":"にほん","accentType":0,"contour":[{"t":0,"f0":NaN}]}'.encode(),
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 200 and r.json()["userHL"] == [] and r.json()["voicedRatio"] == 0.0
    # đúng 2 000 điểm vẫn nhận
    assert client.post("/api/audio/pitch-score", json={**ok, "contour": too_many[:2000]}).status_code == 200


def test_readings_the_frontend_scores_are_accepted(no_pitch_data):
    """moraSplit bên trình duyệt bỏ dấu câu / khoảng trắng và NFKC kana nửa rộng: backend phải chấm lại được đúng các
    cách đọc đó (trước đây 400 "Cách đọc phải là kana"), trả cách đọc đã làm sạch và cùng số mora."""
    base = {"word": "日本", "accentType": 0, "contour": step_contour("LHH")}
    for reading, clean, moras in [("にほん。", "にほん", 3), ("ニュー・ヨーク", "にゅーよーく", 5), ("ｶﾞｯｺｳ", "がっこう", 4),
                                  ("ﾆﾎﾝ", "にほん", 3), ("に ほん", "にほん", 3), ("ｱ", "あ", 1)]:
        r = client.post("/api/audio/pitch-score", json={**base, "reading": reading})
        assert r.status_code == 200, (reading, r.text)
        assert r.json()["reading"] == clean and len(r.json()["refHL"]) == moras
        r = client.get("/api/audio/pitch-reference", params={"word": "日本", "reading": reading})
        assert r.status_code == 404 and r.json()["detail"] == NO_ACCENT_DATA     # qua cổng kana, chưa có dữ liệu
    # từ toàn kana nửa rộng không kèm cách đọc: lấy chính từ sau NFKC
    r = client.post("/api/audio/pitch-score", json={"word": "ｶﾞｯｺｳ", "accentType": 0, "contour": step_contour("LHHH")})
    assert r.status_code == 200 and r.json()["reading"] == "がっこう" and r.json()["word"] == "ｶﾞｯｺｳ"
    # số / chữ Latin không phải kana: trình duyệt chia mora được nhưng không phải cách đọc tiếng Nhật → vẫn 400
    assert client.post("/api/audio/pitch-score", json={**base, "reading": "１２"}).status_code == 400
    assert client.post("/api/audio/pitch-score", json={**base, "reading": "。 "}).status_code == 400   # rỗng sau làm sạch


def test_internal_key_guards_audio_routes(monkeypatch, no_pitch_data):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    body = {"word": "にほん", "accentType": 0, "contour": step_contour("LHH")}
    assert client.post("/api/audio/pitch-score", json=body).status_code == 401
    assert client.post("/api/audio/pitch-score", json=body, headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.post("/api/audio/pitch-score", json=body, headers={"X-Internal-Key": "secret"}).status_code == 200
    assert client.get("/api/audio/pitch-reference", params={"word": "にほん"}).status_code == 401
    assert client.get("/api/audio/pitch-reference", params={"word": "にほん"},
                      headers={"X-Internal-Key": "secret"}).status_code == 404   # qua khoá, chưa có dữ liệu


def test_mock_evaluate_pitch_removed():
    r = client.post("/api/audio/evaluate-pitch", files={"file": ("a.wav", b"RIFF0000WAVE", "audio/wav")},
                    data={"target_word": "にほんご"})
    assert r.status_code == 404
