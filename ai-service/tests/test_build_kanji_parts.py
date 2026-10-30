"""kanji_parts.csv (spec 2026-10-30 §3.3): parser cây phân rã KanjiVG trong scripts/build_dicts.py trên 4 file SVG thật
(tests/fixtures/kanjivg/, © Ulrich Apel, CC BY-SA 3.0) — con trực tiếp của nhóm gốc, kvg:original, kvg:position,
bộ thủ theo kvg:radical, thành phần chỉ âm theo kvg:phon đã chuẩn hoá. Không cần mạng hay dữ liệu thật."""
import csv
import importlib.util
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIX = Path(__file__).parent / "fixtures" / "kanjivg"


def _load_build_dicts():
    spec = importlib.util.spec_from_file_location("build_dicts", ROOT / "scripts" / "build_dicts.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bd = _load_build_dicts()


def _svg(ch: str) -> str:
    return (FIX / f"{ord(ch):05x}.svg").read_text(encoding="utf-8")


# ----------------------------------------------------------------------------- parse_kanjivg_parts

def test_parts_of_toki_direct_children_only():
    row = bd.parse_kanjivg_parts(_svg("時"))
    assert row["kanji"] == "時"
    assert row["parts"] == ["日", "寺"]            # 土 / 寸 nằm trong 寺 → không phải con trực tiếp
    assert row["originals"] == [None, None]
    assert row["positions"] == ["left", "right"]
    assert row["radical_part"] == "日"
    assert row["phon_part"] == "寺" and row["phon"] == "寺"


def test_parts_of_motsu_keeps_variant_and_original():
    row = bd.parse_kanjivg_parts(_svg("持"))
    assert row["parts"] == ["扌", "寺"]
    assert row["originals"] == ["手", None]
    assert row["radical_part"] == "扌"
    assert row["phon"] == "寺"


def test_parts_of_tera_prefers_tradit_radical_and_normalises_phon():
    row = bd.parse_kanjivg_parts(_svg("寺"))
    assert row["parts"] == ["土", "寸"]
    assert row["positions"] == ["top", "bottom"]
    assert row["radical_part"] == "寸"              # kvg:radical="tradit" thắng "nelson" (土)
    assert row["phon_part"] == "土" and row["phon"] == "之"   # kvg:phon="之V" → 之


def test_parts_of_samurai_two_direct_children():
    row = bd.parse_kanjivg_parts(_svg("侍"))
    assert row["parts"] == ["亻", "寺"]
    assert row["originals"] == ["人", None]
    assert row["phon"] == "寺"


def _svg_of(inner: str, code: str = "04f4e", element: str = "低") -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="https://kanjivg.tagaini.net/">'
            f'<g id="kvg:StrokePaths_{code}"><g id="kvg:{code}" kvg:element="{element}">{inner}</g></g></svg>')


def test_group_with_phon_but_no_element_is_one_part_named_by_phon():
    # 低: KanjiVG không đặt kvg:element cho 氐 (không phải thành phần chuẩn) nhưng đánh dấu nhóm là kvg:phon="氐"
    svg = _svg_of('<g id="kvg:04f4e-g1" kvg:element="亻" kvg:variant="true" kvg:original="人" kvg:position="left" '
                  'kvg:radical="general"><path d="M0,0"/></g>'
                  '<g id="kvg:04f4e-g2" kvg:position="right" kvg:phon="氐">'
                  '<g id="kvg:04f4e-g3" kvg:element="氏" kvg:position="top"><path d="M0,0"/></g>'
                  '<g id="kvg:04f4e-g4" kvg:element="一" kvg:position="bottom"><path d="M0,0"/></g></g>')
    row = bd.parse_kanjivg_parts(svg)
    assert row["parts"] == ["亻", "氐"]
    assert row["positions"] == ["left", "right"]
    assert row["radical_part"] == "亻"
    assert row["phon_part"] == "氐" and row["phon"] == "氐"


def test_group_without_element_and_unusable_phon_is_flattened():
    # 品+木 không ra một chữ → không dựng được part; lấy con của nhóm (品, 木) như trước, không có chỉ âm
    svg = _svg_of('<g id="kvg:0-g1" kvg:phon="品+木"><g id="kvg:0-g2" kvg:element="品"><path d="M0,0"/></g>'
                  '<g id="kvg:0-g3" kvg:element="木"><path d="M0,0"/></g></g>', code="068c6", element="槑")
    row = bd.parse_kanjivg_parts(svg)
    assert row["parts"] == ["品", "木"] and row["phon"] is None


def test_group_without_element_or_phon_is_flattened():
    # 左: nhóm position="kamae" chỉ gom nét → lấy 工 bên trong
    svg = _svg_of('<g id="kvg:05de6-g1" kvg:position="kamae"><path d="M0,0"/>'
                  '<g id="kvg:05de6-g2" kvg:element="工" kvg:radical="general"><path d="M0,0"/></g></g>',
                  code="05de6", element="左")
    row = bd.parse_kanjivg_parts(svg)
    assert row["parts"] == ["工"] and row["radical_part"] == "工" and row["phon"] is None


def test_parts_without_children_returns_none():
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="https://kanjivg.tagaini.net/">'
           '<g id="kvg:StrokePaths_04e00"><g id="kvg:04e00" kvg:element="一">'
           '<path id="kvg:04e00-s1" d="M10,50 L90,50"/></g></g></svg>')
    assert bd.parse_kanjivg_parts(svg) is None


def test_parts_of_broken_svg_returns_none():
    assert bd.parse_kanjivg_parts("<svg><g") is None
    assert bd.parse_kanjivg_parts("") is None


# ----------------------------------------------------------------------------- normalise_phon

@pytest.mark.parametrize("raw, expected", [
    ("寺", "寺"),
    ("之V", "之"),              # V = biến thể
    ("厶/弗", "厶"),            # nhiều ứng viên → đầu tiên hợp lệ
    ("叚V/反", "叚"),
    ("立口/否V", "否"),          # "立口" hai chữ → bỏ, lấy ứng viên sau
    ("攸1", "攸"),
    ("育V1", "育"),
    ("倍right", "倍"),
    ("侵right/帚T＋又", "侵"),
    ("3+6+1", None),
    ("", None),
    (None, None),
])
def test_normalise_phon(raw, expected):
    assert bd.normalise_phon(raw) == expected


# ----------------------------------------------------------------------------- zip → rows → csv

def test_extract_kanji_parts_zip_and_write_csv(tmp_path):
    zpath = tmp_path / "kanjivg.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        for ch in "時持寺侍":
            zf.writestr(f"kanjivg/kanji/{ord(ch):05x}.svg", _svg(ch))
        zf.writestr("kanjivg/kanji/06642-Kaisho.svg", _svg("時"))     # biến thể font → bỏ
        zf.writestr("kanjivg/kanji/04e00.svg", '<svg xmlns="http://www.w3.org/2000/svg"><g id="kvg:04e00" '
                    'kvg:element="一" xmlns:kvg="https://kanjivg.tagaini.net/"><path d="M0,0"/></g></svg>')  # không có part → bỏ
    rows = bd.extract_kanji_parts_zip(zpath)
    assert [r["kanji"] for r in rows] == ["侍", "寺", "持", "時"]       # xếp theo mã Unicode
    out = tmp_path / "kanji_parts.csv"
    bd.write_kanji_parts(rows, out)
    with open(out, encoding="utf-8", newline="") as fh:
        got = list(csv.DictReader(fh))
    assert list(got[0].keys()) == ["kanji", "parts", "originals", "positions", "radical_part", "phon_part", "phon"]
    by = {r["kanji"]: r for r in got}
    assert by["時"] == {"kanji": "時", "parts": "日 寺", "originals": "- -", "positions": "left right",
                        "radical_part": "日", "phon_part": "寺", "phon": "寺"}
    assert by["持"]["originals"] == "手 -"
    assert by["寺"] == {"kanji": "寺", "parts": "土 寸", "originals": "- -", "positions": "top bottom",
                        "radical_part": "寸", "phon_part": "土", "phon": "之"}
