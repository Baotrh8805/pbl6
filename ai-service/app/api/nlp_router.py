from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import pykakasi

router = APIRouter(prefix="/nlp", tags=["NLP & Hán-Việt"])

# Bảng từ điển âm Hán - Việt mẫu (có thể mở rộng từ SQLite hoặc CSV Unihan)
HAN_VIET_DICT = {
    "日": "NHẬT", "本": "BẢN", "語": "NGỮ", "学": "HỌC", "生": "SINH",
    "先": "TIÊN", "人": "NHÂN", "何": "HÀ", "時": "THỜI", "間": "GIAN",
    "行": "HÀNH", "来": "LAI", "見": "KIẾN", "食": "THỰC", "飲": "ẨM",
    "大": "ĐẠI", "小": "TIỂU", "高": "CAO", "安": "AN", "新": "TÂN",
    "古": "CỔ", "長": "TRƯỜNG", "白": "BẠCH", "黒": "HẮC", "赤": "XÍCH"
}

kks = pykakasi.kakasi()

class AnalyzeTextRequest(BaseModel):
    text: str

class WordAnalysis(BaseModel):
    original: str
    furigana: str
    romaji: str
    han_viet: Optional[str] = None
    jlpt_hint: Optional[str] = "N5"

class AnalyzeTextResponse(BaseModel):
    original_text: str
    words: List[WordAnalysis]

@router.post("/analyze", response_model=AnalyzeTextResponse)
def analyze_japanese_text(request: AnalyzeTextRequest):
    """
    Tách từ, sinh Furigana và tự động tra cứu âm Hán - Việt cho từng chữ Kanji.
    """
    results = kks.convert(request.text)
    words = []
    
    for item in results:
        orig = item['orig']
        # Tra cứu âm Hán Việt cho các ký tự Kanji trong từ
        han_viet_list = [HAN_VIET_DICT.get(char, "") for char in orig if char in HAN_VIET_DICT]
        han_viet_str = " - ".join(filter(None, han_viet_list)) if han_viet_list else None
        
        words.append(WordAnalysis(
            original=orig,
            furigana=item['hira'],
            romaji=item['hepburn'],
            han_viet=han_viet_str,
            jlpt_hint="N5"
        ))
        
    return AnalyzeTextResponse(original_text=request.text, words=words)
