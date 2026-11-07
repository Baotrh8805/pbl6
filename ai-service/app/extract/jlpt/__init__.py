"""Phân tầng JLPT (UC-18): danh sách từ N5–N1 + fallback wordfreq."""
from app.extract.jlpt.classifier import LEVELS, available, classify, level_index, meaning_hint, phrase_level

__all__ = ["LEVELS", "available", "classify", "level_index", "meaning_hint", "phrase_level"]
