"""Endpoint nội bộ khai thác câu i+1 (C6): câu trong tài liệu chỉ có đúng một từ người học chưa biết.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY; khi env rỗng (dev) bỏ kiểm tra.
Router chỉ kiểm tra đầu vào (độ dài văn bản → 413 như /extract/text, cấp JLPT → 400, cỡ lô → 422 của pydantic)
rồi gọi hàm thuần trong app/extract/sentence_mining.py. Không có câu nào đạt i+1 không phải lỗi: items rỗng / None.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import sentence_mining, tokenizer
from app.extract.jlpt.classifier import LEVELS

MAX_TEXT_CHARS = sentence_mining.MAX_TEXT_CHARS   # cùng ngưỡng với trích xuất (pipeline.MAX_TEXT_CHARS)
MAX_TERMS = 500          # trang trích xuất gửi theo bộ thẻ (≤ 600 từ, cắt 500 mỗi lô)
MAX_KNOWN_LEMMAS = 20_000
MAX_UNKNOWN = 3          # i+1 là mặc định; i+2 / i+3 cho người học muốn câu "khó" hơn
MAX_LIMIT = 1000

router = APIRouter(prefix="/mining", tags=["Khai thác câu i+1"], dependencies=[Depends(require_internal_key)])


def available() -> bool:
    """Cờ health cho khai thác câu (chỉ cần Sudachi)."""
    return sentence_mining.available()


class IPlusOneRequest(BaseModel):
    text: str = Field(..., min_length=1)
    knownLemmas: list[str] = Field(default_factory=list, max_length=MAX_KNOWN_LEMMAS)
    userLevel: Optional[str] = sentence_mining.DEFAULT_LEVEL
    assumeLevelKnown: bool = True
    maxUnknown: int = Field(default=1, ge=1, le=MAX_UNKNOWN)
    limit: int = Field(default=sentence_mining.DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)


class ForTermsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    terms: list[str] = Field(default_factory=list, max_length=MAX_TERMS)
    knownLemmas: list[str] = Field(default_factory=list, max_length=MAX_KNOWN_LEMMAS)
    userLevel: Optional[str] = sentence_mining.DEFAULT_LEVEL
    assumeLevelKnown: bool = True


def _check_text(text: str) -> None:
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=413, detail=f"Văn bản quá dài: tối đa {MAX_TEXT_CHARS} ký tự")


def _check_level(level: Optional[str]) -> str:
    """Rỗng / None → cấp mặc định; giá trị ngoài N5…N1 → 400 (không âm thầm đổi để backend thấy lỗi sớm)."""
    if not level:
        return sentence_mining.DEFAULT_LEVEL
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"userLevel không hợp lệ: {level} (chỉ nhận {', '.join(LEVELS)})")
    return level


@router.post("/i-plus-one")
def i_plus_one(req: IPlusOneRequest) -> dict:
    """{items: [{sentence, target, unknownCount, knownCount, length, score}], stats: {sentences, kept}} —
    ``kept`` đếm trước khi cắt ``limit``."""
    _check_text(req.text)
    return sentence_mining.mine_report(req.text, req.knownLemmas, _check_level(req.userLevel), req.assumeLevelKnown,
                                       req.maxUnknown, req.limit)


@router.post("/for-terms")
def for_terms(req: ForTermsRequest) -> dict:
    """{items: [{term, sentence | null, target | null}]} theo đúng thứ tự ``terms``; từ không có câu i+1 → null."""
    _check_text(req.text)
    return {"items": sentence_mining.mine_for_terms(req.text, req.terms, req.knownLemmas, _check_level(req.userLevel),
                                                    req.assumeLevelKnown)}


@router.get("/health")
def mining_health() -> dict:
    return {"sudachi": tokenizer.available(), "mining": available()}
