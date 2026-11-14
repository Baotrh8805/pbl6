"""kanjidata.parts() / phon_family() trên kanji_parts.csv nhỏ (spec 2026-10-30 §3.3): nạp lười, chỉ số ngược chỉ âm → chữ,
cờ health `kanjiParts`, thiếu file thì None / rỗng."""
from pathlib import Path

import pytest

from app.extract import kanjidata

PARTS_CSV = (
    "kanji,parts,originals,positions,radical_part,phon_part,phon\n"
    "時,日 寺,- -,left right,日,寺,寺\n"
    "持,扌 寺,手 -,left right,扌,寺,寺\n"
    "寺,土 寸,- -,top bottom,寸,土,之\n"
    "明,日 月,- -,left right,日,,\n"
    "低,亻 氐,人 -,left right,亻,氐,氐\n"
    ",日 月,- -,- -,,,\n"          # thiếu chữ → bỏ
    "hỏng\n"                        # dòng cụt → bỏ
)


@pytest.fixture
def parts_file(tmp_path, monkeypatch):
    path = tmp_path / "kanji_parts.csv"
    path.write_text(PARTS_CSV, encoding="utf-8")
    monkeypatch.setattr(kanjidata, "PARTS_FILE", path)
    kanjidata.reset()
    yield path
    kanjidata.reset()


def test_parse_parts_csv_fixture(tmp_path):
    path = tmp_path / "p.csv"
    path.write_text(PARTS_CSV, encoding="utf-8")
    table = kanjidata.parse_parts_csv(path)
    assert set(table) == {"時", "持", "寺", "明", "低"}
    toki = table["時"]
    assert toki.parts == ("日", "寺")
    assert toki.originals == (None, None)
    assert toki.positions == ("left", "right")
    assert toki.radical_part == "日" and toki.phon_part == "寺" and toki.phon == "寺"
    assert table["持"].originals == ("手", None)
    assert table["明"].phon is None and table["明"].phon_part is None
    assert kanjidata.parse_parts_csv(tmp_path / "missing.csv") == {}


def test_parts_lookup(parts_file):
    p = kanjidata.parts("時")
    assert p is not None and p.parts == ("日", "寺") and p.phon == "寺"
    assert kanjidata.parts("一") is None         # chữ đơn không có dòng
    assert kanjidata.parts("") is None


def test_phon_family_reverse_index_sorted(parts_file):
    assert kanjidata.phon_family("寺") == ("持", "時")      # theo mã Unicode; 寺 không tự nằm trong họ của 寺
    assert kanjidata.phon_family("之") == ("寺",)
    assert kanjidata.phon_family("氐") == ("低",)
    assert kanjidata.phon_family("日") == ()
    assert kanjidata.phon_family("") == ()


def test_availability_has_kanji_parts_flag(parts_file):
    assert kanjidata.availability()["kanjiParts"] is True
    parts_file.write_text("", encoding="utf-8")
    assert kanjidata.availability()["kanjiParts"] is False


def test_missing_parts_file_degrades(tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "PARTS_FILE", tmp_path / "missing")
    kanjidata.reset()
    try:
        assert kanjidata.availability()["kanjiParts"] is False
        assert kanjidata.parts("時") is None
        assert kanjidata.phon_family("寺") == ()
    finally:
        kanjidata.reset()
