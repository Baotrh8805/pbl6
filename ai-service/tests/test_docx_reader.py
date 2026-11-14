import copy
import io

import docx
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

from app.extract.readers import read_source
from app.extract.readers.docx_reader import read_docx

RUBY_XML = (
    '<w:r %s><w:ruby>'
    '<w:rubyPr><w:rubyAlign w:val="distributeSpace"/></w:rubyPr>'
    '<w:rt><w:r><w:t>かんじ</w:t></w:r></w:rt>'
    '<w:rubyBase><w:r><w:t>漢字</w:t></w:r></w:rubyBase>'
    '</w:ruby></w:r>' % nsdecls("w")
)


def _build_docx() -> bytes:
    d = docx.Document()
    p = d.add_paragraph("毎日")
    p._p.append(parse_xml(RUBY_XML))
    p.add_run("を勉強します。")
    d.add_paragraph("")  # paragraph rỗng bị bỏ
    table = d.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "表の中の文。"
    d.add_paragraph("東京（とうきょう）に行く。")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_docx_ruby_and_tables():
    result = read_docx(_build_docx())
    assert result.source_type == "docx"
    assert result.blocks[0].text == "毎日漢字を勉強します。"
    assert result.blocks[0].rubies == [{"base": "漢字", "reading": "かんじ"}]
    assert "かんじ" not in result.text
    assert "表の中の文。" in result.text
    # Furigana trong ngoặc cũng được tách thành ruby và bỏ khỏi text
    last = result.blocks[-1]
    assert last.text == "東京に行く。"
    assert {"base": "東京", "reading": "とうきょう"} in last.rubies


def test_read_source_dispatches_docx_by_extension_and_magic():
    data = _build_docx()
    result = read_source("bai1.docx", data, None, "auto")
    assert result.engine == "docx"
    assert result.to_dict()["meta"]["sourceType"] == "docx"


def test_docx_heading_levels():
    d = docx.Document()
    d.add_heading("第1課 あいさつ", level=1)
    d.add_paragraph("こんにちは。")
    d.add_heading("第2課", level=2)
    buf = io.BytesIO()
    d.save(buf)
    result = read_docx(buf.getvalue())
    assert result.blocks[0].heading == 1
    assert result.blocks[1].heading is None
    assert result.blocks[2].heading == 2
    assert "heading" in result.blocks[0].to_dict()
    assert result.to_dict()["blocks"][1]["heading"] is None
