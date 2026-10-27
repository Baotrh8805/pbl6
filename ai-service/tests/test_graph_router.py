"""/api/graph/* (spec 2026-10-27 §8) với FakeGraph: 503 graphUnavailable khi Neo4j tắt, status không bao giờ 503, kiểm tra
tham số, build chạy nền, sync 400 khi lô hỏng, ask trả lời mẫu khi không có Gemini."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.extract import gemini
from app.graph import builder, client as graph_client
from tests.graph_support import FakeGraph, node_row

SHOKU = {"char": "食", "hanViet": "THỰC", "strokes": 9, "radicalNo": 184, "jlpt": "N5"}


@pytest.fixture
def api():
    from app.main import app
    builder.reset_state()
    yield TestClient(app)
    graph_client.set_graph(None)
    builder.reset_state()


def _use(fake: FakeGraph) -> FakeGraph:
    graph_client.set_graph(fake)
    return fake


def test_status_reports_down_without_503(api):
    _use(FakeGraph(available=False))
    r = api.get("/api/graph/status")
    assert r.status_code == 200 and r.json()["available"] is False and r.json()["built"] is False


def test_status_counts_when_up(api):
    _use(FakeGraph(lambda c, p: [{"c": 3}] if "count(n)" in c else []))
    body = api.get("/api/graph/status").json()
    assert body["available"] is True and body["counts"]["Word"] == 3 and body["built"] is False   # chưa có Meta


@pytest.mark.parametrize("method, path, body", [
    ("get", "/api/graph/explore?q=食", None), ("get", "/api/graph/path?from=食&to=飯", None),
    ("get", "/api/graph/recommend?userId=7", None), ("get", "/api/graph/conflicts?userId=7", None),
    ("post", "/api/graph/ask", {"question": "食 là gì?"}), ("post", "/api/graph/sync", {"run": "r", "users": [{"id": 1}]}),
    ("post", "/api/graph/sync/finish", {"run": "r"}), ("post", "/api/graph/build", None),
])
def test_every_endpoint_returns_503_when_neo4j_down(api, method, path, body):
    _use(FakeGraph(available=False))
    r = getattr(api, method)(path, json=body) if body is not None else getattr(api, method)(path)
    assert r.status_code == 503 and r.json()["detail"] == "graphUnavailable"


def test_explore_validates_and_passes_user(api):
    fake = _use(FakeGraph(lambda c, p: [node_row("Kanji", SHOKU)] if "(n:Kanji {char: $v})" in c else []))
    r = api.get("/api/graph/explore", params={"q": "食", "userId": 7, "limit": 10})
    assert r.status_code == 200 and r.json()["center"] == "k:食" and r.json()["nodes"][0]["hanViet"] == "THỰC"
    assert any(p.get("uid") == 7 for _, p in fake.calls)
    assert api.get("/api/graph/explore", params={"q": ""}).status_code == 422
    assert api.get("/api/graph/explore", params={"q": "食", "limit": 999}).status_code == 422


def test_path_recommend_conflicts_params(api):
    fake = _use(FakeGraph(lambda c, p: []))
    assert api.get("/api/graph/path", params={"from": "食", "to": "飯"}).json()["found"] is False
    assert api.get("/api/graph/recommend", params={"userId": 7, "level": "N3"}).json() == {"level": "N3", "words": [], "weakKanji": [], "homophones": []}
    assert api.get("/api/graph/recommend").status_code == 422   # userId bắt buộc (backend lấy từ JWT)
    assert api.get("/api/graph/conflicts", params={"userId": 7}).json() == {"items": []}
    assert any(p.get("level") == "N3" for _, p in fake.calls)


def test_build_starts_background_and_reports_running(api, monkeypatch):
    import threading
    gate = threading.Event()

    def slow_build(graph, with_grammar=True, with_similar=True, progress=None):
        gate.wait(5)
        return {"counts": {}, "seconds": 0.0, "written": {}}

    monkeypatch.setattr(builder, "build", slow_build)
    _use(FakeGraph())
    r = api.post("/api/graph/build", params={"withGrammar": "false"})
    assert r.status_code == 202 and r.json() == {"building": True, "started": True}
    r2 = api.post("/api/graph/build")
    assert r2.json()["started"] is False and api.get("/api/graph/status").json()["building"] is True
    gate.set()
    for _ in range(100):
        if not builder.state()["building"]:
            break
        threading.Event().wait(0.02)
    assert builder.state()["building"] is False


def test_sync_rejects_bad_payload_and_accepts_good(api, monkeypatch):
    monkeypatch.setattr("app.extract.dictionary.available", lambda: False)
    fake = _use(FakeGraph())
    bad = api.post("/api/graph/sync", json={"run": "r", "cards": [{"id": "c1"}]})
    assert bad.status_code == 400 and "thiếu term" in bad.json()["detail"]
    ok = api.post("/api/graph/sync", json={"run": "r-1", "users": [{"id": 7, "level": "N5"}],
                                           "decks": [{"id": "d1", "title": "A", "ownerId": 7}]})
    assert ok.status_code == 200 and ok.json()["written"] == {"users": 1, "decks": 1}
    fin = api.post("/api/graph/sync/finish", json={"run": "r-1", "scope": "user", "userId": 7})
    assert fin.status_code == 200 and fin.json()["scope"] == "user"
    assert api.post("/api/graph/sync/finish", json={"run": "r-1", "scope": "user"}).status_code == 400
    assert any("MERGE (m:Meta {id: 'learner'})" in c for c, _ in fake.calls)


def test_ask_template_answer_and_validation(api, monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: False)
    monkeypatch.setattr("app.extract.dictionary.available", lambda: False)
    _use(FakeGraph(lambda c, p: [node_row("Kanji", SHOKU)] if "(n:Kanji {char: $v})" in c else []))
    r = api.post("/api/graph/ask", json={"question": "Chữ 食 nghĩa là gì?", "userId": 7, "level": "N5"})
    body = r.json()
    assert r.status_code == 200 and body["model"] == "template" and body["entities"][0]["id"] == "k:食"
    assert body["sources"][0]["type"] == "kanji" and "[1]" in body["answer"]
    assert api.post("/api/graph/ask", json={"question": ""}).status_code == 422
    assert api.post("/api/graph/ask", json={"question": "x" * 301}).status_code == 422


def test_health_has_graph_flag(api):
    _use(FakeGraph(available=False))
    assert api.get("/api/extract/health").json()["graph"] is False
    _use(FakeGraph())
    assert api.get("/api/extract/health").json()["graph"] is True
