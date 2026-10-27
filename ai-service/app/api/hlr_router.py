"""HLR — xác suất nhớ của thẻ (spec 2026-10-27 §8). Nội bộ cho backend (X-Internal-Key).

POST /api/hlr/predict {items: [{ref, seen, correct, deltaDays}], targetP?} → {items: [{ref, recall, recallRaw, halfLifeDays,
intervalDays, forget}], model}. Tối đa 500 thẻ một lần; thiếu dữ liệu model → 503 hlrUnavailable.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.hlr import model as hlr

router = APIRouter(prefix="/hlr", tags=["HLR"], dependencies=[Depends(require_internal_key)])


class Item(BaseModel):
    ref: str = Field(max_length=120)
    seen: int = Field(ge=0, le=100_000)
    correct: int = Field(ge=0, le=100_000)
    deltaDays: float = Field(ge=0, le=36_500)


class PredictRequest(BaseModel):
    items: list[Item] = Field(min_length=1, max_length=hlr.MAX_BATCH)
    targetP: Optional[float] = Field(default=None, gt=0, lt=1)


def _model() -> hlr.HlrModel:
    m = hlr.get()
    if m is None:
        raise HTTPException(status_code=503, detail="hlrUnavailable")
    return m


@router.get("/info")
def hlr_info() -> dict:
    return _model().info()


@router.post("/predict")
def hlr_predict(req: PredictRequest) -> dict:
    m = _model()
    rows = m.predict([i.seen for i in req.items], [min(i.correct, i.seen) for i in req.items],
                     [i.deltaDays for i in req.items], req.targetP)
    return {"items": [{"ref": it.ref, **r} for it, r in zip(req.items, rows)], "model": m.info()}
