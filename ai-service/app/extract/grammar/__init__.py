"""Nhận diện mẫu ngữ pháp JLPT trên chuỗi token Sudachi mode A (UC-12)."""
from app.extract.grammar.matcher import available, load_catalog, match_document, match_sentence

__all__ = ["available", "load_catalog", "match_document", "match_sentence"]
