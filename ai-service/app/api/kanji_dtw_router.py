"""Luyện viết chữ Hán: nét mẫu KanjiVG và chấm nét người dùng bằng DTW (lộ trình LP-17, assignment E2).

GET  /kanji/{ch}/strokes   nét mẫu để frontend vẽ hướng dẫn / animation (32 điểm/nét, hộp 0..1 của cả chữ)
POST /kanji/score          chấm nét người dùng → điểm tổng, từng nét, thứ tự / hướng / thiếu / thừa, nhận xét tiếng Việt
POST /kanji/score-stroke   ĐÃ BỎ bản mock cũ (so nét đầu tiên với một đường ngang cố định, bỏ qua chữ gửi lên). Đường dẫn
                           còn giữ dưới dạng alias deprecated vì tests/test_router.py (dùng chung, không thuộc assignment
                           này) vẫn gọi nó để kiểm tra khoá nội bộ: nhận body cũ (user_strokes + stroke_index), chấm bằng
                           thuật toán mới, trả 4 trường cũ; giữ hợp đồng cũ "luôn 200" (không có nét mẫu → điểm 0 +
                           nhận xét thay vì 404). Client mới dùng /kanji/score; xoá alias khi test_router.py đổi route.

Thuật toán nằm trong app/extract/stroke_score.py (hàm thuần, có test riêng); router chỉ kiểm tra đầu vào (giới hạn
413, toạ độ NaN / Infinity → 422), tra nét mẫu (kanjidata.strokes, nạp lười) và đổi tên khoá sang camelCase như
contract của các route extract.
available() = có kanji_strokes.json (cờ "kanjivg" của kanjidata.availability) — main.py / health dùng cờ này; thiếu dữ
liệu thì mọi chữ đều 404 nhưng service vẫn chạy.
"""
from __future__ import annotations

import math
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import kanjidata, stroke_score
from app.extract.jachars import is_kanji

MAX_STROKES = 40      # chữ nhiều nét nhất trong dữ liệu (鬱) có 29; hơn nữa là rác hoặc tấn công
MAX_POINTS = 500      # một nét vẽ tay ~1–3 s ở 60 Hz ≈ 60–180 điểm

router = APIRouter(prefix="/kanji", tags=["Luyện viết chữ Hán"], dependencies=[Depends(require_internal_key)])


def available() -> bool:
    """Có nét mẫu KanjiVG (kanji_strokes.json) hay không — chỉ stat file, không parse (xem kanjidata.availability)."""
    return bool(kanjidata.availability().get("kanjivg"))


# ----------------------------------------------------------------------------- models

class PointIn(BaseModel):
    x: float
    y: float
    t: Optional[float] = None    # thời điểm (ms) frontend có thể gửi kèm cho sau này (tốc độ bút); hiện chưa dùng


StrokeIn = Annotated[list[PointIn], Field(min_length=1)]


class ScoreRequest(BaseModel):
    kanji: str = Field(..., min_length=1)
    strokes: list[StrokeIn] = Field(default_factory=list)   # theo thứ tự người dùng vẽ


class PerStrokeOut(BaseModel):
    index: int                       # chỉ số nét người dùng (0-based, khớp mảng gửi lên)
    score: float                     # 0..100
    wrongDirection: bool
    expectedIndex: Optional[int]     # nét mẫu (0-based) mà nét này ứng với; None = nét thừa


class ScoreResponse(BaseModel):
    kanji: str
    totalScore: float
    isCorrectOrder: bool
    feedback: str
    perStroke: list[PerStrokeOut]
    missing: list[int]               # chỉ số nét mẫu chưa được vẽ
    extra: list[int]                 # chỉ số nét người dùng không ứng với nét mẫu nào
    strokeCount: int                 # số nét của mẫu


class StrokesResponse(BaseModel):
    kanji: str
    strokeCount: int
    strokes: list[list[list[float]]]   # [[[x, y] × 32] mỗi nét], theo thứ tự viết


class LegacyPoint(BaseModel):
    x: float
    y: float


class LegacyStroke(BaseModel):
    stroke_index: int = 0
    points: list[LegacyPoint] = Field(default_factory=list)


class LegacyScoreRequest(BaseModel):
    kanji: str
    user_strokes: list[LegacyStroke] = Field(default_factory=list)


class LegacyScoreResponse(BaseModel):
    kanji: str
    total_score: float
    is_correct_order: bool
    feedback: str


# ----------------------------------------------------------------------------- helpers

def _reference(ch: str) -> list[stroke_score.Stroke]:
    """Nét mẫu của đúng một chữ Hán; không phải chữ Hán / chưa có dữ liệu → 404 (cùng mã để client xử lý một chỗ)."""
    if len(ch) != 1 or not is_kanji(ch):
        raise HTTPException(status_code=404, detail="Cần đúng một chữ Hán")
    ref = kanjidata.strokes(ch)
    if not ref:
        raise HTTPException(status_code=404, detail=f"Chưa có nét mẫu cho chữ {ch}")
    return ref


def _check_limits(strokes: list) -> None:
    if len(strokes) > MAX_STROKES or any(len(s) > MAX_POINTS for s in strokes):
        raise HTTPException(status_code=413, detail=f"Tối đa {MAX_STROKES} nét, mỗi nét tối đa {MAX_POINTS} điểm")


def _check_finite(strokes: list[list[tuple[float, float]]]) -> None:
    """json.loads của Python nhận NaN / Infinity (JSON chuẩn không có); một NaN lọt vào hộp bao làm mọi toạ độ thành NaN
    và từng nét được 100 điểm → chặn bằng 422. Không dùng Field(allow_inf_nan=False): FastAPI không serialize được body
    422 có echo NaN → 500 (audio_praat_router gặp đúng vấn đề này)."""
    if any(not (math.isfinite(x) and math.isfinite(y)) for s in strokes for x, y in s):
        raise HTTPException(status_code=422, detail="Toạ độ phải là số hữu hạn")


def _to_response(kanji: str, result: dict) -> ScoreResponse:
    return ScoreResponse(
        kanji=kanji,
        totalScore=result["total_score"],
        isCorrectOrder=result["is_correct_order"],
        feedback=result["feedback"],
        perStroke=[PerStrokeOut(index=p["index"], score=p["score"], wrongDirection=p["wrong_direction"],
                                expectedIndex=p["expected_index"]) for p in result["per_stroke"]],
        missing=result["missing"],
        extra=result["extra"],
        strokeCount=result["stroke_count"],
    )


# ----------------------------------------------------------------------------- routes

@router.get("/{ch}/strokes", response_model=StrokesResponse)
def kanji_strokes(ch: str) -> StrokesResponse:
    ref = _reference(ch)
    return StrokesResponse(kanji=ch, strokeCount=len(ref), strokes=[[[x, y] for x, y in s] for s in ref])


@router.post("/score", response_model=ScoreResponse)
def score_kanji(req: ScoreRequest) -> ScoreResponse:
    _check_limits(req.strokes)
    user = [[(p.x, p.y) for p in s] for s in req.strokes]
    _check_finite(user)
    ref = _reference(req.kanji)
    return _to_response(req.kanji, stroke_score.score_strokes(user, ref))


@router.post("/score-stroke", response_model=LegacyScoreResponse, deprecated=True)
def score_kanji_strokes_legacy(request: LegacyScoreRequest) -> LegacyScoreResponse:
    """Alias deprecated của POST /kanji/score (bản mock cố định đã bỏ — xem docstring module): body cũ → chấm bằng thuật
    toán mới → 4 trường cũ. Dùng /kanji/score để có điểm từng nét / thiếu / thừa. Không có nét mẫu → 200 với điểm 0
    (client cũ không xử lý 404)."""
    ordered = sorted(request.user_strokes, key=lambda s: s.stroke_index)   # sort ổn định: cùng index giữ thứ tự gửi
    user = [[(p.x, p.y) for p in s.points] for s in ordered if s.points]
    _check_limits(user)
    _check_finite(user)
    ref = kanjidata.strokes(request.kanji) if len(request.kanji) == 1 and is_kanji(request.kanji) else None
    if not ref:
        return LegacyScoreResponse(kanji=request.kanji, total_score=0.0, is_correct_order=False,
                                   feedback=f"Chưa có nét mẫu cho chữ {request.kanji}.")
    result = stroke_score.score_strokes(user, ref)
    return LegacyScoreResponse(kanji=request.kanji, total_score=result["total_score"],
                               is_correct_order=result["is_correct_order"], feedback=result["feedback"])
