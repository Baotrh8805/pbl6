"""Parser dữ liệu chữ Hán (scripts/build_dicts.py) và loader app/extract/kanjidata.py trên fixture nhỏ,
không cần mạng hay file dữ liệu thật."""
import gzip
import importlib.util
import json
import threading
import time
import zipfile
from pathlib import Path

import pytest

from app.extract import kanjidata

ROOT = Path(__file__).resolve().parent.parent


def _load_build_dicts():
    # scripts/ không phải package → nạp theo đường dẫn; module chỉ import stdlib nên nạp rẻ
    spec = importlib.util.spec_from_file_location("build_dicts", ROOT / "scripts" / "build_dicts.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bd = _load_build_dicts()


# ----------------------------------------------------------------------------- Unihan kRSUnicode / kTotalStrokes

UNIHAN_RS = (
    "# Unihan_IRGSources.txt (trích)\n"
    "U+2F00\tkRSUnicode\t1.0\n"            # bộ thủ Khang Hi, ngoài khối CJK thống nhất → bỏ
    "U+2F00\tkTotalStrokes\t1\n"
    "U+4E00\tkRSUnicode\t1.0\n"
    "U+4E00\tkTotalStrokes\t1\n"
    "U+4E01\tkRSUnicode\t1.1\n"            # thiếu kTotalStrokes → bỏ
    "U+65E5\tkRSUnicode\t72.0\n"
    "U+65E5\tkTotalStrokes\t4\n"
    "U+7EA2\tkRSUnicode\t120'.3\n"         # dấu ' = bộ dạng giản thể → bỏ dấu
    "U+7EA2\tkTotalStrokes\t6\n"
    "U+9FA5\tkRSUnicode\t9.1 12.0\n"       # nhiều giá trị → lấy giá trị đầu
    "U+9FA5\tkTotalStrokes\t12 13\n"
    "U+9FA5\tkIRG_GSource\tG0-5555\n"       # trường khác → bỏ
    "U+9FA6\tkTotalStrokes\n"               # dòng cụt → bỏ, không ném lỗi
)


def test_parse_unihan_rs_fixture():
    rows = bd.parse_unihan_rs(UNIHAN_RS.splitlines(keepends=True))
    assert rows == [("一", 1, 0, 1), ("日", 72, 0, 4), ("红", 120, 3, 6), ("龥", 9, 1, 12)]


# ----------------------------------------------------------------------------- KRADFILE

# chỉ ký tự mã hoá được EUC-JP để kiểm tra cả bản gốc lẫn kradfile-u
KRAD_TEXT = "# KRADFILE\n#\n亜 : ｜ 一 口\n明 : 日 月\nbad line\n"


def test_parse_kradfile_fixture():
    assert bd.parse_kradfile(KRAD_TEXT) == [("亜", "｜ 一 口"), ("明", "日 月")]


def test_decode_kradfile_eucjp_gzip_and_utf8():
    assert bd.decode_kradfile(gzip.compress(KRAD_TEXT.encode("euc_jp"))) == KRAD_TEXT
    assert bd.decode_kradfile(KRAD_TEXT.encode("utf-8")) == KRAD_TEXT


# ----------------------------------------------------------------------------- kanjium accents.txt

ACCENTS = (
    "１\tいち\t2\n"
    "あ\t\t1\n"                        # cách đọc rỗng → dùng chính từ
    "２つ\tふたつ\t(副)0,(名)3\n"        # từ loại + nhiều kiểu → số đầu
    "ちょいと\t\t(副)0,1,(感)1\n"
    "雨\tあめ\t1\n"
    "飴\tあめ\t0\n"
    "事\tこと\t2\n"
    "dòng hỏng\n"
)


def test_parse_accents_fixture_and_filter():
    assert bd.parse_accents(ACCENTS) == [("１", "いち", 2), ("あ", "あ", 1), ("２つ", "ふたつ", 0),
                                         ("ちょいと", "ちょいと", 0), ("雨", "あめ", 1), ("飴", "あめ", 0),
                                         ("事", "こと", 2)]
    # lọc theo từ vựng JLPT: khớp cột từ hoặc cột cách đọc (từ kana trong JLPT nhưng kanjium ghi dạng kanji)
    assert bd.parse_accents(ACCENTS, keep={"あ", "雨", "こと"}) == [("あ", "あ", 1), ("雨", "あめ", 1), ("事", "こと", 2)]


# ----------------------------------------------------------------------------- bộ lấy mẫu đường SVG

def _xs(points):
    return [p[0] for p in points]


def _ys(points):
    return [p[1] for p in points]


def test_sample_path_straight_line_equally_spaced():
    pts = bd.sample_path("M0,0 L10,0")
    assert len(pts) == 32
    assert pts[0] == (0.0, 0.0) and pts[-1] == pytest.approx((10.0, 0.0))
    assert all(y == 0 for y in _ys(pts))
    steps = [b - a for a, b in zip(_xs(pts), _xs(pts)[1:])]
    assert all(s == pytest.approx(10 / 31) for s in steps)


def test_sample_path_relative_and_implicit_lineto():
    # m rồi các cặp toạ độ tiếp theo là l ngầm; '0,2' nối tiếp không cần lệnh
    pts = bd.sample_path("m1,1 l2,0 0,2", n=5)
    assert pts[0] == (1.0, 1.0)
    assert pts[-1] == pytest.approx((3.0, 3.0))
    assert pts[2] == pytest.approx((3.0, 1.0))  # góc gấp đúng giữa đường dài 4


def test_sample_path_cubic_and_smooth_curve():
    pts = bd.sample_path("M0,0 C0,10 10,10 10,0")
    assert len(pts) == 32
    assert pts[0] == (0.0, 0.0) and pts[-1] == pytest.approx((10.0, 0.0))
    assert 7.0 < max(_ys(pts)) <= 7.5 + 1e-9  # đỉnh Bezier tại t=0.5 là y=7.5
    assert _xs(pts) == sorted(_xs(pts))      # đi đúng hướng viết
    # S: điểm điều khiển đầu = phản chiếu điểm điều khiển 2 trước đó → nhánh sau cong xuống đối xứng
    pts = bd.sample_path("M0,0 C0,10 10,10 10,0 S20,-10 20,0")
    assert pts[-1] == pytest.approx((20.0, 0.0))
    assert min(_ys(pts)) == pytest.approx(-max(_ys(pts)), abs=0.3)


def test_sample_path_real_kanjivg_relative_cubics():
    # nét 1 của 日 trong KanjiVG: số âm dính liền ('1.6-0.16') phải tách đúng
    d = "M31.5,24.5c1.12,1.12,1.74,2.75,1.74,4.75c0,1.6-0.16,38.11-0.09,53.5c0.02,3.82,0.05,6.35,0.09,6.75"
    pts = bd.sample_path(d)
    assert pts[0] == (31.5, 24.5)
    assert pts[-1] == pytest.approx((33.24, 89.5))


def test_sample_path_degenerate():
    assert bd.sample_path("") == []
    assert bd.sample_path("M5,5", n=4) == [(5.0, 5.0)] * 4
    assert len(bd.sample_path("M0,0 L10,0 C1", n=8)) == 8  # lệnh cụt → giữ phần đã đọc


SVG = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
<!ATTLIST g xmlns:kvg CDATA #FIXED "http://kanjivg.tagaini.net" >
]>
<svg xmlns="http://www.w3.org/2000/svg" width="109" height="109" viewBox="0 0 109 109">
<g id="kvg:StrokePaths_0ffff" style="fill:none;stroke:#000000;stroke-width:3">
<g id="kvg:0ffff" kvg:element="x">
\t<path id="kvg:0ffff-s1" kvg:type="㇐" d="M10,50 L90,50"/>
\t<path id="kvg:0ffff-s2" kvg:type="㇑" d="M50,10 C60,40 40,70 50,90"/>
</g>
</g>
<g id="kvg:StrokeNumbers_0ffff" style="font-size:8;fill:#808080">
\t<text transform="matrix(1 0 0 1 4.50 56.50)">1</text>
</g>
</svg>
"""


def test_parse_kanjivg_svg_two_strokes_normalised_in_order():
    raw = bd.parse_kanjivg_svg(SVG)
    assert [len(s) for s in raw] == [32, 32]
    assert raw[0][0] == (10.0, 50.0) and raw[0][-1] == pytest.approx((90.0, 50.0))  # nét 1 = đường thẳng
    assert raw[1][0] == (50.0, 10.0)                                                   # nét 2 = đường cong

    norm = bd.normalise_glyph(raw)
    assert [len(s) for s in norm] == [32, 32]
    assert all(0.0 <= v <= 1.0 for s in norm for p in s for v in p)
    # bbox cả chữ 10..90 × 10..90 → nét ngang chạy 0..1 ở y=0.5, nét dọc chạy 0..1 ở x≈0.5; thứ tự giữ nguyên
    assert norm[0][0] == pytest.approx((0.0, 0.5)) and norm[0][-1] == pytest.approx((1.0, 0.5))
    assert norm[1][0] == pytest.approx((0.5, 0.0)) and norm[1][-1] == pytest.approx((0.5, 1.0))


def test_normalise_glyph_keeps_aspect_ratio():
    # một nét ngang đơn (一): cạnh dài = 1, cạnh ngắn căn giữa thay vì kéo dãn thành hình vuông
    norm = bd.normalise_glyph([[(10.0, 50.0), (90.0, 52.0)]])
    assert norm == [[(0.0, pytest.approx(0.4875)), (1.0, pytest.approx(0.5125))]]
    assert bd.normalise_glyph([]) == []
    assert bd.normalise_glyph([[(3.0, 3.0), (3.0, 3.0)]]) == [[(0.5, 0.5), (0.5, 0.5)]]


def test_extract_kanjivg_zip_skips_variants_and_unwanted(tmp_path):
    zpath = tmp_path / "kanjivg-test.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("kanjivg-x/kanji/04e00.svg", SVG)
        zf.writestr("kanjivg-x/kanji/04e00-Kaisho.svg", SVG)  # biến thể → bỏ
        zf.writestr("kanjivg-x/kanji/065e5.svg", SVG)         # không nằm trong tập cần → bỏ
        zf.writestr("kanjivg-x/README", "x")
    data = bd.extract_kanjivg_zip(zpath, wanted={"一", "丁"})
    assert list(data) == ["一"]
    assert len(data["一"]) == 2 and all(len(s) == 32 for s in data["一"])
    assert data["一"][0][0] == [0.0, 0.5] and data["一"][0][-1] == [1.0, 0.5]
    assert all(round(v, 3) == v for s in data["一"] for p in s for v in p)
    assert json.loads(json.dumps(data, ensure_ascii=False)) == data


def test_jlpt_kanji_from_committed_csv():
    kanji = bd._jlpt_kanji()
    assert {"日", "本", "語", "勉", "強"} <= kanji
    assert not any(ch in kanji for ch in "あア々ー")


# ----------------------------------------------------------------------------- loader app/extract/kanjidata.py

@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    (tmp_path / "unihan_rs.csv").write_text(
        "char,radical_no,residual_strokes,total_strokes\n日,72,0,4\n明,72,4,8\n,1,2,3\nx,a,b,c\n", encoding="utf-8")
    (tmp_path / "kradfile.csv").write_text("kanji,components\n明,日 月\n,日\n", encoding="utf-8")
    (tmp_path / "kanji_strokes.json").write_text(json.dumps({
        "日": [[[0.1, 0.2], [0.3, 0.4]], [[0.5, 0.6]]],
        "hỏng": [[["a", 0]]],
    }, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "pitch_accent.csv").write_text(
        "word,reading,accent_type\n雨,あめ,1\n飴,あめ,0\n事,こと,2\n琴,こと,1\nコーヒー,コーヒー,3\n"
        "明日,あした,3\n明日,あす,2\n日本,にほん,2\n日本,にっぽん,2\n学校,がっこう,x\n", encoding="utf-8")
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "unihan_rs.csv")
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "kradfile.csv")
    monkeypatch.setattr(kanjidata, "STROKES_FILE", tmp_path / "kanji_strokes.json")
    monkeypatch.setattr(kanjidata, "PITCH_FILE", tmp_path / "pitch_accent.csv")
    kanjidata.reset()
    yield tmp_path
    kanjidata.reset()


def test_radical_strokes(data_dir):
    assert kanjidata.radical_strokes("日") == (72, 4)
    assert kanjidata.radical_strokes("明") == (72, 8)
    assert kanjidata.radical_strokes("x") is None
    assert kanjidata.radical_strokes("あ") is None


def test_components(data_dir):
    assert kanjidata.components("明") == ("日", "月")
    assert kanjidata.components("日") == ()


def test_strokes_returns_fresh_lists(data_dir):
    s = kanjidata.strokes("日")
    assert s == [[(0.1, 0.2), (0.3, 0.4)], [(0.5, 0.6)]]
    s[0].clear()
    assert kanjidata.strokes("日")[0] == [(0.1, 0.2), (0.3, 0.4)]
    assert kanjidata.strokes("明") is None
    assert kanjidata.strokes("hỏng") is None


def test_pitch_accent(data_dir):
    assert kanjidata.pitch_accent("雨", "あめ") == 1
    assert kanjidata.pitch_accent("飴", "アメ") == 0            # katakana từ Sudachi → hiragana
    assert kanjidata.pitch_accent("明日", "あす") == 2
    assert kanjidata.pitch_accent("明日") is None               # hai cách đọc khác trọng âm, không rõ cách nào
    assert kanjidata.pitch_accent("日本") == 2                  # hai cách đọc cùng trọng âm
    assert kanjidata.pitch_accent("コーヒー") == 3
    assert kanjidata.pitch_accent("にほん") == 2                # từ kana: suy từ mọi từ cùng cách đọc
    assert kanjidata.pitch_accent("こと", "こと") is None       # 事=2 / 琴=1 → mơ hồ
    assert kanjidata.pitch_accent("あめ") is None
    assert kanjidata.pitch_accent("学校", "がっこう") is None   # dòng accent không phải số bị bỏ
    assert kanjidata.pitch_accent("山", "やま") is None


def test_availability_flags(data_dir):
    assert kanjidata.availability() == {"radicals": True, "kradfile": True, "kanjivg": True, "pitch": True}
    assert kanjidata._cache == {}   # /health chỉ stat file, không parse 8 MB (backend chờ 2 s)
    (data_dir / "kanji_strokes.json").write_text("", encoding="utf-8")
    assert kanjidata.availability()["kanjivg"] is False   # file rỗng = chưa build xong


def test_table_parses_once_under_concurrent_first_calls(data_dir, monkeypatch):
    calls: list[Path] = []
    real = kanjidata.parse_strokes_json

    def slow(path: Path):
        calls.append(path)
        time.sleep(0.05)
        return real(path)

    monkeypatch.setitem(kanjidata._SOURCES, "kanjivg", lambda: (kanjidata.STROKES_FILE, slow))
    kanjidata.reset()
    threads = [threading.Thread(target=kanjidata.strokes, args=("日",)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1 and kanjidata.strokes("日") is not None


def test_missing_files_degrade_gracefully(tmp_path, monkeypatch):
    for attr in ("RS_FILE", "KRAD_FILE", "STROKES_FILE", "PITCH_FILE"):
        monkeypatch.setattr(kanjidata, attr, tmp_path / "missing")
    kanjidata.reset()
    try:
        assert kanjidata.availability() == {"radicals": False, "kradfile": False, "kanjivg": False, "pitch": False}
        assert kanjidata.radical_strokes("日") is None
        assert kanjidata.components("日") == ()
        assert kanjidata.strokes("日") is None
        assert kanjidata.pitch_accent("日本", "にほん") is None
    finally:
        kanjidata.reset()
