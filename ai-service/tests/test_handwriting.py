"""Vẽ chữ Hán để tra (app/extract/handwriting.py + POST /dict/handwriting), cải tiến từ điển 26/10.

Phần chính dùng bộ nét giả nhỏ (ghi vào tmp_path rồi trỏ kanjidata.STROKES_FILE tới đó) nên chạy được trên CI không có
kanji_strokes.json; một test cuối dùng dữ liệu KanjiVG thật và tự bỏ qua khi máy không có tệp.
"""
from __future__ import annotations

import json
import random

import pytest
from fastapi.testclient import TestClient

from app.extract import handwriting, kanjidata


def _line(x0, y0, x1, y1, n=32):
    return [[x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)] for i in range(n)]


# Nét mẫu giả theo đúng thứ tự viết (hộp 0..1): đủ để phân biệt 一 二 三 十 口 土 工 王
GLYPHS = {
    "一": [_line(0.0, 0.5, 1.0, 0.5)],
    "二": [_line(0.15, 0.25, 0.85, 0.25), _line(0.0, 0.75, 1.0, 0.75)],
    "三": [_line(0.1, 0.1, 0.9, 0.1), _line(0.2, 0.5, 0.8, 0.5), _line(0.0, 0.9, 1.0, 0.9)],
    "十": [_line(0.0, 0.45, 1.0, 0.45), _line(0.5, 0.0, 0.5, 1.0)],
    "口": [_line(0.1, 0.1, 0.1, 0.9), _line(0.1, 0.1, 0.9, 0.1) + _line(0.9, 0.1, 0.9, 0.9)[1:], _line(0.1, 0.9, 0.9, 0.9)],
    "土": [_line(0.15, 0.4, 0.85, 0.4), _line(0.5, 0.0, 0.5, 1.0), _line(0.0, 1.0, 1.0, 1.0)],
    "工": [_line(0.1, 0.0, 0.9, 0.0), _line(0.5, 0.0, 0.5, 1.0), _line(0.0, 1.0, 1.0, 1.0)],
    "王": [_line(0.1, 0.0, 0.9, 0.0), _line(0.2, 0.5, 0.8, 0.5), _line(0.5, 0.0, 0.5, 1.0), _line(0.0, 1.0, 1.0, 1.0)],
}
for ch, strokes in GLYPHS.items():   # nét 口 thứ hai ghép hai đoạn: lấy lại đúng 32 điểm
    GLYPHS[ch] = [[list(p) for p in __import__("app.extract.stroke_score", fromlist=["resample"]).resample(s, 32)] for s in strokes]


@pytest.fixture
def fake_strokes(tmp_path, monkeypatch):
    path = tmp_path / "kanji_strokes.json"
    path.write_text(json.dumps(GLYPHS, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(kanjidata, "STROKES_FILE", path)
    kanjidata.reset()
    handwriting._model.cache_clear()
    yield
    kanjidata.reset()
    handwriting._model.cache_clear()


def _drawn(ch, scale=(240.0, 200.0), offset=(30.0, 50.0), noise=0.0, seed=0):
    """Nét mẫu như người vẽ: phóng to vào khung vẽ (toạ độ pixel, tỉ lệ ngang / dọc khác nhau) + nhiễu tay."""
    rnd = random.Random(seed)
    return [[(offset[0] + x * scale[0] + rnd.gauss(0, noise * scale[0]), offset[1] + y * scale[1] + rnd.gauss(0, noise * scale[1]))
             for x, y in s] for s in GLYPHS[ch]]


def top(strokes, n=1):
    return [c["char"] for c in handwriting.recognize(strokes, 10)][:n]


def test_recognizes_each_glyph_drawn_in_any_frame(fake_strokes):
    # khung vẽ dời chỗ và phóng to (pixel); tỉ lệ khác nhau được kiểm ở test dữ liệu thật (chữ giả 王 / 三 quá giống nhau)
    assert handwriting.available() and handwriting.size() == len(GLYPHS)
    for ch in GLYPHS:
        assert top(_drawn(ch, scale=(220.0, 220.0), noise=0.02, seed=ord(ch) % 97)) == [ch], ch


def test_wrong_direction_and_swapped_order_still_find_the_char(fake_strokes):
    reversed_strokes = [list(reversed(s)) for s in _drawn("十")]
    assert top(reversed_strokes) == ["十"]
    swapped = _drawn("土")
    swapped[0], swapped[1] = swapped[1], swapped[0]
    assert "土" in top(swapped, 2)


def test_missing_or_extra_stroke_keeps_the_char_near_the_top(fake_strokes):
    missing = _drawn("王")[:3] + []   # thiếu nét ngang cuối
    assert "王" in top(missing, 3)
    extra = _drawn("一") + [[(100, 60), (110, 70)]]
    assert "一" in top(extra, 3)


def test_scores_are_sorted_and_limit_respected(fake_strokes):
    res = handwriting.recognize(_drawn("三"), 3)
    assert len(res) == 3 and [r["score"] for r in res] == sorted(r["score"] for r in res)
    assert res[0]["char"] == "三"


def test_empty_input_or_missing_data(fake_strokes, tmp_path, monkeypatch):
    assert handwriting.recognize([]) == []
    assert handwriting.recognize([[]]) == []
    monkeypatch.setattr(kanjidata, "STROKES_FILE", tmp_path / "khong-co.json")
    kanjidata.reset()
    handwriting._model.cache_clear()
    assert not handwriting.available() and handwriting.recognize(_drawn("一")) == []


def test_router_handwriting(fake_strokes):
    from app.main import app
    client = TestClient(app)
    body = {"strokes": [[{"x": x, "y": y} for x, y in s] for s in _drawn("二")], "limit": 2}
    res = client.post("/api/dict/handwriting", json=body)
    assert res.status_code == 200 and res.json()["candidates"][0]["char"] == "二"
    assert len(res.json()["candidates"]) == 2
    assert client.post("/api/dict/handwriting", json={"strokes": []}).status_code == 422
    too_many = {"strokes": [[{"x": 0, "y": 0}]] * (handwriting.MAX_STROKES + 1)}
    assert client.post("/api/dict/handwriting", json=too_many).status_code == 422


def test_router_503_without_data(tmp_path, monkeypatch):
    from app.main import app
    monkeypatch.setattr(kanjidata, "STROKES_FILE", tmp_path / "khong-co.json")
    kanjidata.reset()
    handwriting._model.cache_clear()
    res = TestClient(app).post("/api/dict/handwriting", json={"strokes": [[{"x": 0, "y": 0}, {"x": 1, "y": 1}]]})
    assert res.status_code == 503 and res.json()["detail"] == "handwritingUnavailable"
    kanjidata.reset()
    handwriting._model.cache_clear()


@pytest.mark.skipif(not kanjidata.STROKES_FILE.exists(), reason="cần kanji_strokes.json thật (build_dicts.py --only kanjivg)")
def test_real_kanjivg_sample_top1():
    """Dữ liệu thật: 40 chữ ngẫu nhiên vẽ lại từ nét mẫu + nhiễu 3 % → ≥ 38 chữ đúng hạng 1 (đo lúc chỉnh: 120/120)."""
    kanjidata.reset()
    handwriting._model.cache_clear()
    rnd = random.Random(5)
    chars = rnd.sample(sorted(kanjidata._table("kanjivg")), 40)
    ok = 0
    for ch in chars:
        user = [[(30 + x * 300 + rnd.gauss(0, 9), 50 + y * 240 + rnd.gauss(0, 7)) for x, y in s] for s in kanjidata.strokes(ch)]
        ok += top(user) == [ch]
    assert ok >= 38, ok
