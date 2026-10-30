"""Router /kanji-info: app FastAPI cục bộ (main.py do fix phase đăng ký), tầng module thay bằng hàm giả để chỉ kiểm tra
hợp đồng HTTP — tham số, mã lỗi, khoá nội bộ. Một test cuối skipif đi xuyên tới dữ liệu thật."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import kanji_info_router
from app.core.config import settings
from app.extract import han_viet, han_viet_graph, kanji_cards, kanji_diagram, kanji_readings, kanjidata
from app.extract.jlpt import classifier

app = FastAPI()
app.include_router(kanji_info_router.router, prefix=settings.API_V1_STR)
client = TestClient(app)


@pytest.fixture
def fakes(monkeypatch):
    calls: dict[str, tuple] = {}

    def graph(reading, level=None, limit_words=30):
        calls["graph"] = (reading, level, limit_words)
        return {"query": reading, "nodes": [{"id": "r:X", "type": "reading", "label": "X"}], "edges": []}

    def suggest(prefix, limit=10):
        calls["suggest"] = (prefix, limit)
        return [{"reading": "NHẬT", "count": 1, "kanji": ["日"]}]

    def cards(kanji_list, user_level=None):
        calls["cards"] = (list(kanji_list), user_level)
        return [{"kanji": k} for k in kanji_list]

    def diagram(q, mode="structure"):
        calls["diagram"] = (q, mode)
        if mode not in kanji_diagram.MODES:
            raise ValueError("mode không hợp lệ")
        return {"query": q, "mode": mode, "center": "k:時", "candidates": [], "nodes": [{"id": "k:時", "type": "center"}],
                "edges": [], "detail": {"kanji": "時"}, "stats": {"kanji": 1, "words": 0, "parts": True, "jmdict": False}}

    monkeypatch.setattr(han_viet_graph, "graph", graph)
    monkeypatch.setattr(han_viet_graph, "suggest", suggest)
    monkeypatch.setattr(kanji_cards, "cards", cards)
    monkeypatch.setattr(kanji_diagram, "diagram", diagram)
    return calls


# ----------------------------------------------------------------------------- GET /han-viet-graph

def test_han_viet_graph_params_and_defaults(fakes):
    r = client.get("/api/kanji-info/han-viet-graph", params={"reading": "NHẬT"})
    assert r.status_code == 200, r.text
    assert r.json()["query"] == "NHẬT" and r.json()["nodes"][0]["id"] == "r:X"
    assert fakes["graph"] == ("NHẬT", None, 30)
    assert client.get("/api/kanji-info/han-viet-graph", params={"reading": "nhat", "level": "N4", "limit": 7}).status_code == 200
    assert fakes["graph"] == ("nhat", "N4", 7)
    # level rỗng coi như không gửi
    assert client.get("/api/kanji-info/han-viet-graph", params={"reading": "nhat", "level": ""}).status_code == 200
    assert fakes["graph"] == ("nhat", None, 30)


def test_han_viet_graph_validation(fakes):
    url = "/api/kanji-info/han-viet-graph"
    assert client.get(url).status_code == 422                                        # thiếu reading
    assert client.get(url, params={"reading": ""}).status_code == 422
    assert client.get(url, params={"reading": "x" * 33}).status_code == 422
    assert client.get(url, params={"reading": "NHẬT", "limit": 0}).status_code == 422
    assert client.get(url, params={"reading": "NHẬT", "limit": kanji_info_router.MAX_GRAPH_WORDS + 1}).status_code == 422
    r = client.get(url, params={"reading": "NHẬT", "level": "N9"})
    assert r.status_code == 400 and "level" in r.json()["detail"]
    assert "graph" not in fakes                                                        # chưa gọi tới tầng module


# ----------------------------------------------------------------------------- GET /han-viet-suggest

def test_han_viet_suggest(fakes):
    r = client.get("/api/kanji-info/han-viet-suggest", params={"q": "nh"})
    assert r.status_code == 200, r.text
    assert r.json() == {"query": "nh", "items": [{"reading": "NHẬT", "count": 1, "kanji": ["日"]}]}
    assert fakes["suggest"] == ("nh", 10)
    assert client.get("/api/kanji-info/han-viet-suggest", params={"q": "nh", "limit": 3}).status_code == 200
    assert fakes["suggest"] == ("nh", 3)
    assert client.get("/api/kanji-info/han-viet-suggest").status_code == 422
    assert client.get("/api/kanji-info/han-viet-suggest", params={"q": ""}).status_code == 422
    assert client.get("/api/kanji-info/han-viet-suggest", params={"q": "nh", "limit": kanji_info_router.MAX_SUGGEST + 1}).status_code == 422


# ----------------------------------------------------------------------------- POST /kanji-cards

def test_kanji_cards_body_and_validation(fakes):
    r = client.post("/api/kanji-info/kanji-cards", json={"kanji": ["学", "日"]})
    assert r.status_code == 200, r.text
    assert r.json() == {"items": [{"kanji": "学"}, {"kanji": "日"}]}
    assert fakes["cards"] == (["学", "日"], None)
    assert client.post("/api/kanji-info/kanji-cards", json={"kanji": ["学"], "userLevel": "N3"}).status_code == 200
    assert fakes["cards"] == (["学"], "N3")
    assert client.post("/api/kanji-info/kanji-cards", json={"kanji": [], "userLevel": ""}).json() == {"items": []}
    r = client.post("/api/kanji-info/kanji-cards", json={"kanji": ["学"], "userLevel": "N0"})
    assert r.status_code == 400 and "userLevel" in r.json()["detail"]
    assert client.post("/api/kanji-info/kanji-cards", json={"kanji": ["学"] * (kanji_info_router.MAX_CARDS + 1)}).status_code == 422
    assert client.post("/api/kanji-info/kanji-cards", json={"kanji": "学"}).status_code == 422
    assert client.post("/api/kanji-info/kanji-cards", json={}).json() == {"items": []}


# ----------------------------------------------------------------------------- GET /diagram (sơ đồ chữ Hán, spec 2026-10-30)

def test_diagram_params_and_defaults(fakes):
    r = client.get("/api/kanji-info/diagram", params={"q": "時"})
    assert r.status_code == 200, r.text
    assert r.json()["center"] == "k:時" and r.json()["mode"] == "structure"
    assert fakes["diagram"] == ("時", "structure")
    assert client.get("/api/kanji-info/diagram", params={"q": "thoi", "mode": "compounds"}).status_code == 200
    assert fakes["diagram"] == ("thoi", "compounds")
    assert client.get("/api/kanji-info/diagram", params={"q": "時", "mode": ""}).status_code == 200   # rỗng = mặc định
    assert fakes["diagram"] == ("時", "structure")


def test_diagram_validation(fakes):
    url = "/api/kanji-info/diagram"
    assert client.get(url).status_code == 422                                   # thiếu q
    assert client.get(url, params={"q": ""}).status_code == 422
    assert client.get(url, params={"q": "x" * (kanji_info_router.MAX_QUERY_CHARS + 1)}).status_code == 422
    r = client.get(url, params={"q": "時", "mode": "tree"})
    assert r.status_code == 400 and "mode" in r.json()["detail"]
    assert "diagram" not in fakes                                                 # chặn trước khi gọi tầng module


# ----------------------------------------------------------------------------- khoá nội bộ

def test_internal_key_guards_all_routes(fakes, monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "secret")
    calls = [
        ("get", "/api/kanji-info/han-viet-graph", {"params": {"reading": "NHẬT"}}),
        ("get", "/api/kanji-info/han-viet-suggest", {"params": {"q": "nh"}}),
        ("post", "/api/kanji-info/kanji-cards", {"json": {"kanji": ["学"]}}),
        ("get", "/api/kanji-info/diagram", {"params": {"q": "時"}}),
    ]
    for method, path, kwargs in calls:
        assert getattr(client, method)(path, **kwargs).status_code == 401, path
        assert getattr(client, method)(path, headers={"X-Internal-Key": "wrong"}, **kwargs).status_code == 401, path
        assert getattr(client, method)(path, headers={"X-Internal-Key": "secret"}, **kwargs).status_code == 200, path


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(
    not (han_viet.DATA_FILE.exists() and kanji_readings.DATA_FILE.exists() and (classifier.DATA_DIR / "n5.csv").exists()),
    reason="chưa có unihan_*.csv / jlpt/n5.csv (python scripts/build_dicts.py)")


@needs_real
def test_real_data_end_to_end():
    han_viet_graph.reset()
    try:
        g = client.get("/api/kanji-info/han-viet-graph", params={"reading": "HỌC"}).json()
        ids = {n["id"] for n in g["nodes"]}
        assert {"r:HỌC", "k:学", "w:学校"} <= ids
        s = client.get("/api/kanji-info/han-viet-suggest", params={"q": "ho", "limit": 5}).json()
        assert s["query"] == "ho" and "HỌC" in [it["reading"] for it in s["items"]]
        c = client.post("/api/kanji-info/kanji-cards", json={"kanji": ["学"]}).json()["items"][0]
        gaku = next(r for r in c["on"] if r["reading"] == "ガク")
        assert "学校" in [e["term"] for e in gaku["examples"]]
        assert "学ぶ" in [e["term"] for r in c["kun"] for e in r["examples"]]
        if kanjidata.PARTS_FILE.exists():
            d = client.get("/api/kanji-info/diagram", params={"q": "時"}).json()
            assert d["center"] == "k:時" and {"k:日", "k:寺", "k:持"} <= {n["id"] for n in d["nodes"]}
    finally:
        han_viet_graph.reset()
