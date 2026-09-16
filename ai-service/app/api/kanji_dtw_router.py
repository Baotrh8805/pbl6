from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import numpy as np
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

router = APIRouter(prefix="/kanji", tags=["Kanji DTW Scoring"])

class Point(BaseModel):
    x: float
    y: float

class Stroke(BaseModel):
    stroke_index: int
    points: List[Point]

class ScoreKanjiRequest(BaseModel):
    kanji: str
    user_strokes: List[Stroke]

class ScoreKanjiResponse(BaseModel):
    kanji: str
    total_score: float
    is_correct_order: bool
    feedback: str

@router.post("/score-stroke", response_model=ScoreKanjiResponse)
def score_kanji_strokes(request: ScoreKanjiRequest):
    """
    So khớp quỹ đạo nét viết chữ Kanji dựa trên thuật toán DTW (Dynamic Time Warping).
    """
    # Mẫu nét tham chiếu (nét ngang đơn giản từ (0,0) -> (100,0) để minh họa)
    target_stroke = np.array([[i, 50] for i in range(0, 100, 10)])
    
    if not request.user_strokes or len(request.user_strokes) == 0:
        return ScoreKanjiResponse(
            kanji=request.kanji,
            total_score=0.0,
            is_correct_order=False,
            feedback="Không phát hiện nét vẽ nào."
        )
    
    first_stroke = request.user_strokes[0].points
    if len(first_stroke) < 2:
        return ScoreKanjiResponse(
            kanji=request.kanji,
            total_score=20.0,
            is_correct_order=True,
            feedback="Nét vẽ quá ngắn."
        )

    user_pts = np.array([[p.x, p.y] for p in first_stroke])
    
    # Tính khoảng cách DTW
    distance, _ = fastdtw(user_pts, target_stroke, dist=euclidean)
    
    # Quy đổi khoảng cách thành điểm số (0 - 100)
    score = max(0.0, min(100.0, 100.0 - (distance / 5.0)))
    
    feedback = "Nét viết rất đẹp và đúng hướng!" if score >= 80 else "Cần chú ý góc nghiêng và độ dài của nét."

    return ScoreKanjiResponse(
        kanji=request.kanji,
        total_score=round(score, 1),
        is_correct_order=True,
        feedback=feedback
    )
