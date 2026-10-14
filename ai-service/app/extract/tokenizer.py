"""Bọc SudachiPy: tách từ, lemma (dictionary_form), reading hiragana, POS.

Từ điển `core` nạp một lần (lazy singleton) vì tốn ~1 s và ~100 MB.
Mode C = từ dài nhất (ứng viên từ vựng), mode A = đơn vị ngắn nhất
(thành phần từ ghép, chuỗi token cho matcher ngữ pháp).
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from app.extract.jachars import kata_to_hira

Mode = Literal["A", "B", "C"]


@dataclass(frozen=True, slots=True)
class Token:
    surface: str
    lemma: str            # dictionary_form()
    reading: str          # hiragana
    pos: tuple[str, ...]  # 6 tầng POS của Sudachi
    normalized: str       # normalized_form()
    begin: int
    end: int

    @property
    def pos1(self) -> str:
        return self.pos[0]

    @property
    def pos2(self) -> str:
        return self.pos[1] if len(self.pos) > 1 else "*"

    @property
    def conj_type(self) -> str:
        """活用型 (vd: 五段-カ行)."""
        return self.pos[4] if len(self.pos) > 4 else "*"

    @property
    def conj_form(self) -> str:
        """活用形 (vd: 連用形-一般, 未然形-一般)."""
        return self.pos[5] if len(self.pos) > 5 else "*"


_tokenizer = None
_modes = None


def _load():
    global _tokenizer, _modes
    if _tokenizer is None:
        from sudachipy import dictionary, tokenizer as _t
        _tokenizer = dictionary.Dictionary(dict="core").tokenizer()
        _modes = {"A": _t.Tokenizer.SplitMode.A,
                  "B": _t.Tokenizer.SplitMode.B,
                  "C": _t.Tokenizer.SplitMode.C}
    return _tokenizer, _modes


def available() -> bool:
    try:
        _load()
        return True
    except Exception:
        return False


def tokenize(text: str, mode: Mode = "C") -> list[Token]:
    tok, modes = _load()
    return [
        Token(
            surface=m.surface(),
            lemma=m.dictionary_form(),
            reading=kata_to_hira(m.reading_form()),
            pos=tuple(m.part_of_speech()),
            normalized=m.normalized_form(),
            begin=m.begin(),
            end=m.end(),
        )
        for m in tok.tokenize(text, modes[mode])
    ]


@lru_cache(maxsize=4096)
def reading_of(word: str) -> str:
    """Cách đọc hiragana của một từ độc lập (ghép reading các token mode C)."""
    return "".join(t.reading for t in tokenize(word, "C"))
