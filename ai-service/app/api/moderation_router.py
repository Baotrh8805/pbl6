"""Kiểm duyệt văn bản tiếng Việt (spec 2026-10-27 §6.1). Nội bộ cho backend (X-Internal-Key); quy tắc quyết định nằm ở backend.

POST /api/moderation/check {items: [{ref, text}], spans?: true} → {items: [{ref, label, labelName, probs, score, spans, spanModel,
empty}], models: {vihsd, vihos}}. Thiếu model 3 lớp (npz / pyvi) → 503 moderationUnavailable; thiếu PhoBERT → spans rỗng.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.moderation import preprocess, vihos, vihsd

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/moderation", tags=["Kiểm duyệt"], dependencies=[Depends(require_internal_key)])

MAX_ITEMS = 20
MAX_CHARS = 2000


class Item(BaseModel):
    ref: str = Field(max_length=120)
    text: str = Field(max_length=MAX_CHARS)


class CheckRequest(BaseModel):
    items: list[Item] = Field(min_length=1, max_length=MAX_ITEMS)
    spans: bool = True


def _vihsd() -> vihsd.Vihsd:
    m = vihsd.get() if preprocess.available() else None
    if m is None:
        raise HTTPException(status_code=503, detail="moderationUnavailable")
    return m


def check_one(m: vihsd.Vihsd, text: str, want_spans: bool) -> dict:
    cleaned = preprocess.preprocess(text)
    if cleaned:
        probs = [round(float(p), 4) for p in m.predict_proba(preprocess.to_sequence(cleaned))]
        label = max(range(3), key=lambda i: probs[i])
    else:
        probs, label = [1.0, 0.0, 0.0], 0     # chỉ emoji / chữ Nhật / stopword: model không có gì để xét
    span_model = vihos.get() if want_spans else None
    spans: list[dict] = []
    if span_model is not None:
        try:
            spans = span_model.predict(text)
        except Exception:  # noqa: BLE001 — lỗi PhoBERT không được làm hỏng nhãn 3 lớp
            _log.exception("PhoBERT lỗi khi đánh dấu từ")
    return {"label": label, "labelName": vihsd.LABELS[label], "probs": probs, "score": probs[label], "spans": spans,
            "spanModel": span_model is not None, "empty": not cleaned}


@router.get("/info")
def moderation_info() -> dict:
    m = vihsd.get() if preprocess.available() else None
    return {
        "vihsd": {"ready": m is not None, "vocab": m.vocab if m else None, "testAccuracy": 0.8437},
        "vihos": {"ready": vihos.available(), "loaded": vihos.get() is not None if vihos.enabled() else False,
                  "enabled": vihos.enabled(), "threshold": vihos.THRESHOLD},
        "preprocess": {"ready": preprocess.available()},
    }


@router.post("/check")
def moderation_check(req: CheckRequest) -> dict:
    m = _vihsd()
    items = [{"ref": it.ref, **check_one(m, it.text, req.spans)} for it in req.items]
    return {"items": items, "models": {"vihsd": True, "vihos": any(i["spanModel"] for i in items)}}
