"""HLR numpy khớp bản torch của notebook (fixtures/hlr_reference.json sinh từ best-halflife-portable.pt) + router."""
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import hlr_router
from app.core.config import settings
from app.hlr import model as hlr

REF = json.loads((Path(__file__).parent / "fixtures" / "hlr_reference.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def model():
    m = hlr.get()
    assert m is not None, "thiếu app/hlr/data/hlr_portable.json"
    return m


def test_matches_torch_reference(model):
    rows = model.predict([r["seen"] for r in REF], [r["correct"] for r in REF], [r["deltaDays"] for r in REF])
    for ref, row in zip(REF, rows):
        assert row["recallRaw"] == pytest.approx(ref["pRaw"], abs=2e-4), ref
        assert row["recall"] == pytest.approx(ref["pCal"], abs=2e-4), ref
        assert row["halfLifeDays"] == pytest.approx(ref["halfLife"], rel=1e-3), ref
        assert row["intervalDays"] == pytest.approx(ref["interval"], abs=0.02, rel=1e-3), ref


def test_forget_flag_and_monotonic_in_accuracy(model):
    rows = model.predict([5, 5, 5], [0, 3, 5], [1, 1, 1])
    assert rows[0]["forget"] and not rows[2]["forget"]
    assert rows[0]["recall"] < rows[1]["recall"] < rows[2]["recall"]


def test_recall_decreases_with_time(model):
    rows = model.predict([3, 3, 3], [3, 3, 3], [0.01, 30, 270])
    assert rows[0]["recallRaw"] > rows[1]["recallRaw"] > rows[2]["recallRaw"]


def test_delta_floor_and_correct_clamped(model):
    a = model.predict([2], [5], [0])[0]      # correct > seen → kẹp = seen; delta 0 → 1 phút
    b = model.predict([2], [2], [1 / 1440])[0]
    assert a == b


def _client(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "")
    app = FastAPI()
    app.include_router(hlr_router.router, prefix=settings.API_V1_STR)
    return TestClient(app)


def test_router_predict_and_info(monkeypatch):
    c = _client(monkeypatch)
    r = c.post("/api/hlr/predict", json={"items": [{"ref": "c1", "seen": 3, "correct": 3, "deltaDays": 3},
                                                    {"ref": "c2", "seen": 5, "correct": 0, "deltaDays": 0.5}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [i["ref"] for i in body["items"]] == ["c1", "c2"]
    assert body["items"][0]["recall"] == pytest.approx(REF[3]["pCal"], abs=2e-4)
    assert body["items"][1]["forget"] is True
    assert body["model"]["threshold"] == pytest.approx(0.8235, abs=1e-4)
    assert c.get("/api/hlr/info").json()["key"] == "port_logistic"


def test_router_validates(monkeypatch):
    c = _client(monkeypatch)
    assert c.post("/api/hlr/predict", json={"items": []}).status_code == 422
    too_many = [{"ref": str(i), "seen": 1, "correct": 1, "deltaDays": 1} for i in range(hlr.MAX_BATCH + 1)]
    assert c.post("/api/hlr/predict", json={"items": too_many}).status_code == 422


def test_router_503_without_model(monkeypatch):
    c = _client(monkeypatch)
    old = hlr.get()
    hlr.set_model(None)
    monkeypatch.setattr(hlr, "DATA_FILE", Path("/nonexistent/hlr.json"))
    try:
        r = c.post("/api/hlr/predict", json={"items": [{"ref": "x", "seen": 1, "correct": 1, "deltaDays": 1}]})
        assert r.status_code == 503 and r.json()["detail"] == "hlrUnavailable"
    finally:
        hlr.set_model(old)
