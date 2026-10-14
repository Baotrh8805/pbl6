from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from app.extract.han_viet import han_viet
from app.extract.jachars import has_japanese, is_kana_only
from app.extract.jlpt import classify
from app.extract.romaji import to_romaji
from app.extract.tokenizer import tokenize

router = APIRouter(prefix="/nlp", tags=["NLP & Hán-Việt"])


class AnalyzeTextRequest(BaseModel):
    text: str

class WordAnalysis(BaseModel):
    original: str
    furigana: str
    romaji: str
    han_viet: Optional[str] = None
    jlpt_hint: Optional[str] = None

class AnalyzeTextResponse(BaseModel):
    original_text: str
    words: List[WordAnalysis]

@router.post("/analyze", response_model=AnalyzeTextResponse)
def analyze_japanese_text(request: AnalyzeTextRequest):
    """
    Tách từ (SudachiPy mode C), sinh Furigana, romaji, âm Hán-Việt (Unihan) và cấp JLPT.
    """
    words = []
    for tok in tokenize(request.text, "C"):
        reading = tok.reading if has_japanese(tok.surface) else tok.surface
        level = None
        if has_japanese(tok.lemma) and tok.pos1 not in ("助詞", "助動詞", "補助記号", "記号"):
            level, _, _ = classify(tok.lemma, None, is_kana_only(tok.lemma))
        words.append(WordAnalysis(
            original=tok.surface,
            furigana=reading,
            romaji=to_romaji(reading) if has_japanese(reading) else reading,
            han_viet=han_viet(tok.surface),
            jlpt_hint=level,
        ))
    return AnalyzeTextResponse(original_text=request.text, words=words)
