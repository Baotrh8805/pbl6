"""Tra cứu chữ Hán cho người Việt (F1 đồ thị âm Hán-Việt + C5 thẻ chữ Hán) — endpoint nội bộ cho backend.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY (require_internal_key, như mọi router khác).
Dữ liệu thiếu không phải lỗi: âm lạ → nodes rỗng, chữ không có dữ liệu → thẻ với trường None / rỗng; cờ health lấy từ
han_viet_graph.available() / kanji_cards.available() (fix phase gắn vào /extract/health).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import han_viet_graph, kanji_cards
from app.extract.jlpt.classifier import LEVELS

MAX_CARDS = 200          # một bộ thẻ gửi một lần; mỗi thẻ quét ~100 từ JLPT nên 200 chữ vẫn dưới 1 s khi đã nạp
MAX_GRAPH_WORDS = 100    # từ / chữ trong đồ thị (日 có 84 từ); cao hơn là frontend không vẽ nổi
MAX_SUGGEST = 50
MAX_QUERY_CHARS = 32     # âm Hán-Việt dài nhất ~7 ký tự; chặn chuỗi rác

router = APIRouter(prefix="/kanji-info", tags=["Tra cứu chữ Hán"], dependencies=[Depends(require_internal_key)])


class KanjiCardsRequest(BaseModel):
    kanji: list[str] = Field(default_factory=list, max_length=MAX_CARDS)
    userLevel: Optional[str] = None   # N5…N1: ví dụ đúng cấp đang học xếp trước (xem kanji_cards._example_rank)


def _check_level(level: Optional[str], name: str) -> Optional[str]:
    """Chuỗi rỗng coi như không gửi; giá trị ngoài N5…N1 → 400 (không âm thầm bỏ lọc để backend thấy lỗi sớm)."""
    if not level:
        return None
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"{name} không hợp lệ: {level} (chỉ nhận {', '.join(LEVELS)})")
    return level


@router.get("/han-viet-graph")
def get_han_viet_graph(
    reading: str = Query(..., min_length=1, max_length=MAX_QUERY_CHARS, description="Âm Hán-Việt, có hoặc không dấu"),
    level: Optional[str] = Query(default=None, description="N5…N1: chỉ từ ở cấp này hoặc dễ hơn"),
    limit: int = Query(default=30, ge=1, le=MAX_GRAPH_WORDS, description="Số từ tối đa mỗi chữ"),
) -> dict:
    """Đồ thị reading → kanji → word; âm lạ → nodes rỗng (200)."""
    return han_viet_graph.graph(reading, _check_level(level, "level"), limit)


@router.get("/han-viet-suggest")
def get_han_viet_suggest(
    q: str = Query(..., min_length=1, max_length=MAX_QUERY_CHARS, description="Tiền tố âm Hán-Việt, có hoặc không dấu"),
    limit: int = Query(default=10, ge=1, le=MAX_SUGGEST),
) -> dict:
    """Autocomplete âm Hán-Việt: {query, items: [{reading, count, kanji}]}."""
    return {"query": q, "items": han_viet_graph.suggest(q, limit)}


@router.post("/kanji-cards")
def post_kanji_cards(req: KanjiCardsRequest) -> dict:
    """Thẻ chữ Hán cho một lô chữ (≤ MAX_CARDS; quá → 422): {items: [{kanji, hanViet, radical, on, kun, meaningEn,
    strokeCount}]}. Mục không phải một chữ Hán bị bỏ qua, không báo lỗi."""
    return {"items": kanji_cards.cards(req.kanji, _check_level(req.userLevel, "userLevel"))}
