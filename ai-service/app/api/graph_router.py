"""Đồ thị tri thức Neo4j + GraphRAG (UC-34 / UC-35, spec docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md §8).

Endpoint nội bộ cho backend (X-Internal-Key). Neo4j không nối được → 503 {"detail": "graphUnavailable"}; /graph/status
không bao giờ 503 (trả available: false) để backend health gọi được. userId luôn do backend lấy từ JWT rồi truyền sang.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.graph import builder, client, queries, rag, sync

router = APIRouter(prefix="/graph", tags=["Đồ thị tri thức"], dependencies=[Depends(require_internal_key)])


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=rag.MAX_QUESTION)
    userId: Optional[int] = None
    level: Optional[str] = None
    geminiModel: Optional[str] = None


class SyncFinish(BaseModel):
    run: str = Field(min_length=1, max_length=64)
    scope: str = "all"
    userId: Optional[int] = None


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail="graphUnavailable")


@router.get("/status")
def status() -> dict:
    g = client.get_graph()
    if not g.available():
        st = builder.state()
        return {"available": False, "built": False, "building": st["building"], "error": st["error"]}
    try:
        return queries.status(g)
    except client.GraphUnavailable:
        return {"available": False, "built": False, "building": False}


@router.post("/build", status_code=202)
def build(withGrammar: bool = Query(True), withSimilar: bool = Query(True)) -> dict:
    g = client.get_graph()
    if not g.available():
        raise _unavailable(RuntimeError("down"))
    started = builder.start_build(g, with_grammar=withGrammar, with_similar=withSimilar)
    return {"building": True, "started": started}


@router.post("/sync")
def sync_apply(payload: dict = Body(...)) -> dict:
    try:
        return {"written": sync.apply(client.get_graph(), payload)}
    except sync.SyncError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.post("/sync/finish")
def sync_finish(body: SyncFinish) -> dict:
    try:
        return sync.finish(client.get_graph(), body.run, body.scope, body.userId)
    except sync.SyncError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.get("/explore")
def explore(q: str = Query(min_length=1, max_length=64), userId: Optional[int] = None,
            limit: int = Query(queries.DEFAULT_LIMIT, ge=1, le=queries.MAX_LIMIT)) -> dict:
    try:
        return queries.explore(client.get_graph(), q, userId, limit)
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.get("/path")
def path(a: str = Query(alias="from", min_length=1, max_length=64), b: str = Query(alias="to", min_length=1, max_length=64)) -> dict:
    try:
        return queries.path(client.get_graph(), a, b)
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.get("/recommend")
def recommend(userId: int, level: Optional[str] = None, limit: int = Query(8, ge=1, le=30)) -> dict:
    try:
        return queries.recommend(client.get_graph(), userId, level, limit)
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.get("/conflicts")
def conflicts(userId: int, limit: int = Query(50, ge=1, le=200)) -> dict:
    try:
        return queries.conflicts(client.get_graph(), userId, limit)
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)


@router.post("/ask")
def ask(body: AskRequest) -> dict:
    try:
        return rag.ask(client.get_graph(), body.question, body.userId, body.level, body.geminiModel)
    except client.GraphUnavailable as exc:
        raise _unavailable(exc)
