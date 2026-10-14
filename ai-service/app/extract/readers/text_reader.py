"""Đọc văn bản thuần: decode UTF-8 (fallback charset-normalizer cho Shift_JIS…), chuẩn hoá,
tách furigana trong ngoặc 漢字（かんじ） thành ruby."""
from __future__ import annotations

import re
import unicodedata

from app.extract.jachars import is_kanji
from app.extract.readers import Block, ReaderError, TextResult

# Xoá ký tự điều khiển trừ \n \t
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# 漢字（かんじ） / 漢字(かんじ): base là run kanji (có thể kèm okurigana) ngay trước ngoặc
_PAREN_RUBY_RE = re.compile(
    r"([一-鿿㐀-䶿々]+[ぁ-ゖ]{0,2})[（(]([ぁ-ゖァ-ヺー]+)[）)]"
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_RE.sub("", text)
    return text


def decode(data: bytes) -> str:
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    try:
        from charset_normalizer import from_bytes
        best = from_bytes(data).best()
        if best is not None:
            return str(best)
    except Exception:
        pass
    raise ReaderError("Không xác định được bảng mã của file văn bản")


def extract_paren_rubies(text: str) -> tuple[str, list[dict]]:
    """Tách mẫu 漢字（かんじ）→ text không ngoặc + rubies. Chỉ nhận khi base có kanji."""
    rubies: list[dict] = []

    def repl(m: re.Match) -> str:
        base, reading = m.group(1), m.group(2)
        if any(is_kanji(c) for c in base):
            rubies.append({"base": base, "reading": reading})
            return base
        return m.group(0)

    return _PAREN_RUBY_RE.sub(repl, text), rubies


def read_text(text: str, source_type: str = "text") -> TextResult:
    text = normalize(text)
    text, rubies = extract_paren_rubies(text)
    # NFKC biến （ thành ( nên mẫu ngoặc nửa rộng cũng được bắt ở trên
    blocks = [Block(text=text, page=1, rubies=rubies)]
    return TextResult(text=text, source_type=source_type, engine="text", blocks=blocks, pages=1)


def read_bytes(data: bytes, source_type: str = "txt") -> TextResult:
    return read_text(decode(data), source_type=source_type)
