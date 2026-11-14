"""/api/moderation: nhãn 3 lớp + từ đánh dấu với model giả; 503 khi thiếu model; giới hạn."""
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import moderation_router
from app.core.config import settings
from app.moderation import preprocess, vihos, vihsd


class _FakeVihsd:
    vocab = 50000

    def predict_proba(self, seq):
        if seq[0] == 2:
            return np.array([0.05, 0.1, 0.85])
        if seq[0] == 1:
            return np.array([0.3, 0.6, 0.1])
        return np.array([0.98, 0.01, 0.01])


class _FakeVihos:
    def predict(self, text, threshold=0.5):
        return [{"word": "chó", "start": text.find("chó"), "end": text.find("chó") + 3, "score": 0.99}] if "chó" in text else []


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "")
    monkeypatch.setattr(preprocess, "available", lambda: True)
    monkeypatch.setattr(preprocess, "preprocess", lambda t: t.strip().lower())
    monkeypatch.setattr(preprocess, "to_sequence", lambda c: [2 if "chó" in c else 1 if "ngu" in c else 0] + [0] * 139)
    monkeypatch.setattr(vihsd, "get", lambda: _FakeVihsd())
    monkeypatch.setattr(vihos, "get", lambda: _FakeVihos())
    app = FastAPI()
    app.include_router(moderation_router.router, prefix=settings.API_V1_STR)
    return TestClient(app)


def test_check_labels_and_spans(client):
    r = client.post("/api/moderation/check", json={"items": [
        {"ref": "a", "text": "Cảm ơn thầy"}, {"ref": "b", "text": "Đồ ngu"}, {"ref": "c", "text": "Thằng chó"}]})
    assert r.status_code == 200, r.text
    items = {i["ref"]: i for i in r.json()["items"]}
    assert items["a"]["label"] == 0 and items["a"]["labelName"] == "clean" and items["a"]["spans"] == []
    assert items["b"]["label"] == 1 and items["b"]["score"] == pytest.approx(0.6)
    assert items["c"]["label"] == 2 and items["c"]["spans"][0]["word"] == "chó" and items["c"]["spanModel"] is True
    assert r.json()["models"] == {"vihsd": True, "vihos": True}


def test_check_without_spans_or_without_phobert(client, monkeypatch):
    r = client.post("/api/moderation/check", json={"items": [{"ref": "c", "text": "Thằng chó"}], "spans": False})
    assert r.json()["items"][0]["spans"] == [] and r.json()["items"][0]["spanModel"] is False
    monkeypatch.setattr(vihos, "get", lambda: None)
    r = client.post("/api/moderation/check", json={"items": [{"ref": "c", "text": "Thằng chó"}]})
    assert r.json()["items"][0]["label"] == 2 and r.json()["models"]["vihos"] is False


def test_empty_after_preprocess_is_clean(client, monkeypatch):
    monkeypatch.setattr(preprocess, "preprocess", lambda t: "")
    r = client.post("/api/moderation/check", json={"items": [{"ref": "e", "text": "😀😀"}]})
    body = r.json()["items"][0]
    assert body["label"] == 0 and body["empty"] is True and body["probs"] == [1.0, 0.0, 0.0]


def test_phobert_error_does_not_break_label(client, monkeypatch):
    class Boom:
        def predict(self, text, threshold=0.5):
            raise RuntimeError("x")
    monkeypatch.setattr(vihos, "get", lambda: Boom())
    r = client.post("/api/moderation/check", json={"items": [{"ref": "c", "text": "Thằng chó"}]})
    assert r.status_code == 200 and r.json()["items"][0]["label"] == 2 and r.json()["items"][0]["spans"] == []


def test_503_without_vihsd(client, monkeypatch):
    monkeypatch.setattr(vihsd, "get", lambda: None)
    r = client.post("/api/moderation/check", json={"items": [{"ref": "a", "text": "x"}]})
    assert r.status_code == 503 and r.json()["detail"] == "moderationUnavailable"


def test_limits(client):
    assert client.post("/api/moderation/check", json={"items": []}).status_code == 422
    many = [{"ref": str(i), "text": "x"} for i in range(moderation_router.MAX_ITEMS + 1)]
    assert client.post("/api/moderation/check", json={"items": many}).status_code == 422
    assert client.post("/api/moderation/check", json={"items": [{"ref": "a", "text": "x" * 2001}]}).status_code == 422


def test_info(client):
    body = client.get("/api/moderation/info").json()
    assert body["vihsd"]["ready"] is True and body["vihos"]["threshold"] == vihos.THRESHOLD
