"""Luyện trọng âm cao thấp (E4): mẫu H/L chuẩn của một từ và chấm đường F0 người học gửi lên.

Trình duyệt tự ước lượng F0 bằng WebAudio (frontend/src/lib/pitch.ts) nên ai-service KHÔNG nhận file âm thanh —
chỉ nhận đường (t, f0) tối đa 2 000 điểm (3 s × 50 điểm/s = 150, dư nhiều) và chấm bằng đúng thuật toán của trình
duyệt (app/extract/pitch.py). Route mock /evaluate-pitch (Praat) cũ đã bỏ; giữ prefix /audio để backend không đổi
URL gốc. Kiểu trọng âm tra kanjium qua kanjidata.pitch_accent: chưa có dữ liệu → 404, trừ khi client gửi accentType
(frontend có bảng trọng âm riêng cho bài học hoặc người dùng tự nhập).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import pitch
from app.extract.jachars import is_kana_only

router = APIRouter(prefix="/audio", tags=["Pitch Accent"], dependencies=[Depends(require_internal_key)])

MAX_CONTOUR_POINTS = 2000
MAX_WORD_LEN = 64
NO_ACCENT_DATA = "Chưa có dữ liệu trọng âm cho từ này"


class ContourPoint(BaseModel):
    # Không chặn NaN / Infinity ở đây: FastAPI không serialize được body 422 có echo NaN (→ 500); pitch._voiced coi
    # điểm không hữu hạn là khung không có thanh.
    t: float                    # giây kể từ lúc bắt đầu ghi
    f0: Optional[float] = None  # Hz; None = khung không có thanh


class PitchScoreRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=MAX_WORD_LEN)
    reading: Optional[str] = Field(default=None, max_length=MAX_WORD_LEN)
    accentType: Optional[int] = Field(default=None, ge=0, le=MAX_WORD_LEN)   # ghi đè tra cứu kanjium
    contour: list[ContourPoint] = Field(..., min_length=1, max_length=MAX_CONTOUR_POINTS)


class MoraLevel(BaseModel):
    mora: str
    level: str


class PitchReferenceResponse(BaseModel):
    word: str
    reading: str
    accentType: int
    moras: list[MoraLevel]


class PitchScoreResponse(BaseModel):
    word: str
    reading: str
    accentType: int
    pct: int
    userHL: list[Optional[str]]
    refHL: list[str]
    wrongMora: list[int]
    voicedRatio: float
    feedback: str


def _resolve_reading(word: str, reading: Optional[str]) -> str:
    """Cách đọc hiragana để chia mora, làm sạch như pitch.mora_split / moraSplit bên frontend (NFKC, bỏ dấu câu và
    khoảng trắng: "にほん。", "ｶﾞｯｺｳ", "ニュー・ヨーク" đều nhận) rồi mới đòi toàn kana — trình duyệt chấm được gì thì backend
    phải lưu lại được điểm cho cái đó. Thiếu cách đọc thì chỉ chấp nhận khi từ toàn kana (lấy chính từ); từ có kanji
    mà không có cách đọc → 400 vì không đếm được mora (không đoán qua JMdict: nhiều cách đọc, mỗi cách một trọng âm)."""
    given = pitch.normalize_reading(reading or "")
    if given:
        if not is_kana_only(given):
            raise HTTPException(status_code=400, detail="Cách đọc phải là kana")
        return given
    own = pitch.normalize_reading(word)
    if own and is_kana_only(own):
        return own
    raise HTTPException(status_code=400, detail="Cần cách đọc (kana) của từ để chia mora")


def _resolve_accent(word: str, reading: str, override: Optional[int]) -> int:
    if override is not None:
        return override
    accent = pitch.accent_type(word, reading)
    if accent is None:
        raise HTTPException(status_code=404, detail=NO_ACCENT_DATA)
    return accent


@router.get("/pitch-reference", response_model=PitchReferenceResponse)
def pitch_reference(word: str = Query(..., min_length=1, max_length=MAX_WORD_LEN),
                    reading: Optional[str] = Query(default=None, max_length=MAX_WORD_LEN)):
    """Mẫu trọng âm chuẩn của từ: kiểu kanjium và mức H/L từng mora. 404 khi chưa có dữ liệu cho từ."""
    word = word.strip()
    r = _resolve_reading(word, reading)
    accent = _resolve_accent(word, r, None)
    return {"word": word, "reading": r, "accentType": accent, "moras": pitch.reference_contour(r, accent)}


@router.post("/pitch-score", response_model=PitchScoreResponse)
def pitch_score(req: PitchScoreRequest):
    """Chấm đường F0 (t, f0|null) của người học với mẫu chuẩn; accentType gửi kèm sẽ thay cho tra cứu kanjium."""
    word = req.word.strip()
    r = _resolve_reading(word, req.reading)
    accent = _resolve_accent(word, r, req.accentType)
    return {"word": word, "reading": r, "accentType": accent, **pitch.score(req.contour, r, accent)}


def available() -> bool:
    """Cờ health cho /extract/health (đăng ký ở bước gộp): đã có dữ liệu trọng âm kanjium hay chưa."""
    return pitch.available()
