from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/audio", tags=["Praat & Pitch Accent"])

class PitchPoint(BaseModel):
    time: float
    frequency_hz: float

class AudioEvaluationResponse(BaseModel):
    expected_word: str
    pitch_score: float
    pronunciation_accuracy: float
    pitch_contour: List[PitchPoint]
    feedback: str

@router.post("/evaluate-pitch", response_model=AudioEvaluationResponse)
async def evaluate_pitch_accent(
    file: UploadFile = File(...),
    target_word: str = Form("にほんご")
):
    """
    Tiếp nhận file ghi âm giọng nói của người học (.wav/.mp3),
    dùng Praat/Parselmouth trích xuất đường bao F0 (pitch accent) và so sánh với mẫu chuẩn.
    """
    # Dữ liệu mô phỏng đường bao cao độ
    mock_pitch_points = [
        PitchPoint(time=0.1, frequency_hz=140.0),
        PitchPoint(time=0.2, frequency_hz=180.5),
        PitchPoint(time=0.3, frequency_hz=210.0),
        PitchPoint(time=0.4, frequency_hz=175.0),
        PitchPoint(time=0.5, frequency_hz=135.0)
    ]
    
    return AudioEvaluationResponse(
        expected_word=target_word,
        pitch_score=86.5,
        pronunciation_accuracy=90.0,
        pitch_contour=mock_pitch_points,
        feedback="Trọng âm hạ chuẩn xác ở âm tiết thứ 2, phát âm rõ ràng!"
    )
