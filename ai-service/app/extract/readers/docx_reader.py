"""Đọc .docx bằng python-docx, duyệt XML để lấy <w:ruby> (furigana do người soạn gõ).

Mỗi paragraph (cả trong bảng) → một Block. Văn bản chỉ chứa phần base của ruby,
cặp (base, reading) đưa vào blocks[].rubies làm ground truth cho furigana.
"""
from __future__ import annotations

import io
import re
from typing import Optional

from app.extract.readers import Block, ReaderError, TextResult
from app.extract.readers.text_reader import extract_paren_rubies, normalize

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _q(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


def _run_text(run_el) -> str:
    """Nối text của một <w:r>: <w:t>, <w:tab>, <w:br>."""
    parts = []
    for child in run_el.iter():
        if child.tag == _q("t"):
            parts.append(child.text or "")
        elif child.tag == _q("tab"):
            parts.append("\t")
        elif child.tag in (_q("br"), _q("cr")):
            parts.append("\n")
    return "".join(parts)


def _paragraph(p_el) -> tuple[str, list[dict]]:
    """Duyệt con trực tiếp của <w:p>: <w:r> thường hoặc <w:r> chứa <w:ruby>."""
    text_parts: list[str] = []
    rubies: list[dict] = []

    def walk(el) -> None:
        for child in el:
            tag = child.tag
            if tag == _q("ruby"):
                rt = child.find(_q("rt"))
                base = child.find(_q("rubyBase"))
                reading = "".join(_run_text(r) for r in rt.iter(_q("r"))) if rt is not None else ""
                base_text = "".join(_run_text(r) for r in base.iter(_q("r"))) if base is not None else ""
                text_parts.append(base_text)
                if base_text and reading:
                    rubies.append({"base": normalize(base_text), "reading": normalize(reading)})
            elif tag == _q("r"):
                if child.find(_q("ruby")) is not None:
                    walk(child)       # ruby nằm trong <w:r>
                else:
                    text_parts.append(_run_text(child))
            elif tag in (_q("hyperlink"), _q("smartTag"), _q("sdt"), _q("sdtContent"), _q("ins"), _q("fldSimple")):
                walk(child)
    walk(p_el)
    return "".join(text_parts), rubies


_HEADING_NAME = re.compile(r"(?i)(?:heading |見出し )(\d)")


def _heading_level(p_el, para_styles: dict) -> Optional[int]:
    """Cấp tiêu đề của <w:p>: theo tên style (Heading N / 見出し N), không có thì outlineLvl."""
    ppr = p_el.find(_q("pPr"))
    if ppr is None:
        return None
    pstyle = ppr.find(_q("pStyle"))
    style = para_styles.get(pstyle.get(_q("val"))) if pstyle is not None else None
    for _ in range(3):  # style + tối đa 2 cấp base_style
        if style is None:
            break
        m = _HEADING_NAME.fullmatch(style.name or "")
        if m:
            return int(m.group(1))
        style = style.base_style
    outline = ppr.find(_q("outlineLvl"))
    if outline is not None:
        try:
            lvl = int(outline.get(_q("val"))) + 1
        except (TypeError, ValueError):
            return None
        return lvl if 1 <= lvl <= 9 else None
    return None


def read_docx(data: bytes) -> TextResult:
    try:
        import docx
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:  # file hỏng / không phải docx
        raise ReaderError(f"Không đọc được file DOCX: {exc}") from exc

    from docx.enum.style import WD_STYLE_TYPE
    para_styles = {s.style_id: s for s in document.styles if s.type == WD_STYLE_TYPE.PARAGRAPH}
    blocks: list[Block] = []
    body = document.element.body
    # Duyệt mọi <w:p> theo thứ tự tài liệu (gồm cả paragraph trong bảng)
    for p_el in body.iter(_q("p")):
        text, rubies = _paragraph(p_el)
        text = normalize(text).strip()
        if not text:
            continue
        text, paren = extract_paren_rubies(text)
        blocks.append(Block(text=text, page=1, rubies=rubies + paren,
                            heading=_heading_level(p_el, para_styles)))
    full = "\n".join(b.text for b in blocks)
    return TextResult(text=full, source_type="docx", engine="docx", blocks=blocks, pages=1)
