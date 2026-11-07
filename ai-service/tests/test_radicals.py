"""radicals.py: bảng 214 bộ thủ đã commit (kiểm tra toàn vẹn), tra bộ / gom chữ / chữ theo bộ trên bảng Unihan và
JLPT tí hon (monkeypatch, không phụ thuộc nội dung CSV thật), mẹo nhớ mẫu xác định và không bao giờ rỗng."""
import unicodedata

import pytest

from app.extract import kanjidata, radicals
from app.extract.jlpt import classifier

RS_CSV = ("char,radical_no,residual_strokes,total_strokes\n海,85,6,9\n湖,85,9,12\n火,86,0,4\n花,140,4,7\n"
          "人,9,0,2\n学,39,5,8\n水,85,0,4\n")
# classifier giả: (expression, reading, meaning, level) cấp dễ → khó như bản thật
JLPT = {
    "海": [("海", "うみ", "sea, beach", "N5"), ("海外", "かいがい", "abroad", "N3")],
    "湖": [("湖", "みずうみ", "lake", "N4")],
    "火": [("火曜日", "かようび", "Tuesday", "N5")],
    "花": [("花", "はな", "flower", "N5")],
    "人": [("人", "ひと", "person", "N5")],
    "学": [("学校", "がっこう", "school", "N5")],
    "水": [("水", "みず", "water", "N5")],
}
TINY_TABLE = ("no,char,unified,strokes,name_vi,meaning_vi,han_viet\n"
              "9,⼈,人,2,nhân,người,NHÂN\n39,⼦,子,3,tử,con cái,TỬ\n85,⽔,水,4,thủy,nước,THỦY\n"
              "86,⽕,火,4,hỏa,lửa,HỎA\n140,⾋,艸,6,thảo,cỏ,THẢO\n")


@pytest.fixture
def data(tmp_path, monkeypatch):
    (tmp_path / "rs.csv").write_text(RS_CSV, encoding="utf-8")
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "rs.csv")
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: list(JLPT.get(ch, [])))
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset(JLPT))
    kanjidata.reset()
    radicals.reset()
    yield tmp_path
    kanjidata.reset()
    radicals.reset()


# ----------------------------------------------------------------------------- bảng đã commit

def test_table_has_214_kangxi_radicals_in_order():
    radicals.reset()
    rows = radicals.table()
    assert len(rows) == 214 and radicals.available()
    assert [r["no"] for r in rows] == list(range(1, 215))
    # bộ có dạng JIS riêng của chính nó trong tập chữ JLPT: bảng ghi dạng JIS (người học gặp 青 chứ không gặp 靑)
    jis = {63: "戸", 174: "青", 199: "麦", 201: "黄", 203: "黒"}
    for r in rows:
        assert r["char"] == chr(0x2F00 + r["no"] - 1)                        # khối Kangxi Radicals theo thứ tự
        nfkc = unicodedata.normalize("NFKC", r["char"])
        assert r["unified"] == jis.get(r["no"], nfkc)                         # chữ CJK thống nhất tương ứng
        assert 0x4E00 <= ord(r["unified"]) <= 0x9FFF
        assert 1 <= r["strokes"] <= 17
        assert radicals.radical_of(nfkc)["no"] == r["no"]                     # dạng NFKC (靑) vẫn tra được
        assert r["name_vi"] and r["meaning_vi"] and r["han_viet"]
        assert r["han_viet"] == r["han_viet"].upper() and r["name_vi"] == r["name_vi"].lower()
        assert r["name_vi"].split()[0] == r["han_viet"].split()[0].lower()   # tên bộ = âm Hán-Việt (儿 "nhân đi")
    by_no = {r["no"]: r for r in rows}
    assert (by_no[1]["unified"], by_no[1]["name_vi"], by_no[1]["meaning_vi"]) == ("一", "nhất", "một")
    assert (by_no[9]["unified"], by_no[9]["name_vi"]) == ("人", "nhân")
    assert (by_no[85]["unified"], by_no[85]["name_vi"], by_no[85]["meaning_vi"], by_no[85]["han_viet"]) == ("水", "thủy", "nước", "THỦY")
    assert (by_no[86]["name_vi"], by_no[140]["name_vi"], by_no[162]["name_vi"]) == ("hỏa", "thảo", "sước")
    # Unihan ghi âm Nôm ở vài bộ (角 GÓC, 貝 BUỔI, 厂 XƯỞNG): bảng dùng âm Hán-Việt đúng của bộ thủ
    assert (by_no[148]["han_viet"], by_no[154]["han_viet"], by_no[27]["han_viet"]) == ("GIÁC", "BỐI", "HÁN")
    assert by_no[174]["unified"] == "青" and by_no[63]["unified"] == "戸"
    assert by_no[114]["strokes"] == 5    # Khang Hi đếm 禸 5 nét (Unihan kTotalStrokes ghi 4) — sửa tay, xem README
    assert radicals.radical(85)["unified"] == "水" and radicals.radical(0) is None and radicals.radical(215) is None
    assert radicals.variants(85) == ("氵", "氺") and radicals.variants(174) == ("靑",) and radicals.variants(1) == ()
    assert radicals.table()[0] is not radicals.table()[0]   # bản sao, caller sửa không đụng cache


needs_real_rs = pytest.mark.skipif(not kanjidata.RS_FILE.exists(), reason="chưa có unihan_rs.csv")


@needs_real_rs
def test_real_data_radical_of_umi_is_water():
    kanjidata.reset()
    radicals.reset()
    r = radicals.radical_of("海")
    assert r["no"] == 85 and r["unified"] == "水" and r["char"] == "⽔" and r["name_vi"] == "thủy"
    assert radicals.radical_of("⽔")["no"] == 85 and radicals.radical_of("水")["no"] == 85   # chính bộ thủ
    assert radicals.radical_of("あ") is None and radicals.radical_of("") is None


def test_missing_table_degrades(tmp_path, monkeypatch):
    monkeypatch.setattr(radicals, "DATA_FILE", tmp_path / "missing.csv")
    radicals.reset()
    assert radicals.available() is False and radicals.table() == [] and radicals.radical(85) is None
    assert radicals.radical_of("海") is None
    assert radicals.template_mnemonic("海", None, "HẢI", "sea")   # mẹo mẫu không cần bảng
    radicals.reset()


def test_parse_skips_bad_rows_and_sorts(tmp_path):
    p = tmp_path / "r.csv"
    p.write_text("no,char,unified,strokes,name_vi,meaning_vi,han_viet\n86,⽕,火,4,hỏa,lửa,hỏa\n"
                 "x,⽔,水,4,thủy,nước,THỦY\n85,⽔,,4,thủy,nước,THỦY\n", encoding="utf-8")
    rows = radicals._parse(p)
    assert [r["no"] for r in rows] == [85, 86]
    assert rows[0]["unified"] == "水" and rows[1]["han_viet"] == "HỎA"   # unified suy từ NFKC, han_viet viết hoa


# ----------------------------------------------------------------------------- tra bộ / gom chữ / chữ theo bộ (fixture)

def test_radical_of_uses_unihan_radical_number(data, monkeypatch):
    (data / "tiny.csv").write_text(TINY_TABLE, encoding="utf-8")
    monkeypatch.setattr(radicals, "DATA_FILE", data / "tiny.csv")
    radicals.reset()
    assert radicals.radical_of("海") == {"no": 85, "char": "⽔", "unified": "水", "strokes": 4, "name_vi": "thủy",
                                        "meaning_vi": "nước", "han_viet": "THỦY"}
    assert radicals.radical_of("花")["name_vi"] == "thảo"
    assert radicals.radical_of("学")["no"] == 39     # bảng tí hon có 子 nên tra được dù JLPT giả không nói gì
    assert radicals.radical_of("龘") is None        # không có trong Unihan giả


def test_group_kanji_orders_groups_by_first_appearance(data, monkeypatch):
    (data / "tiny.csv").write_text(TINY_TABLE, encoding="utf-8")
    monkeypatch.setattr(radicals, "DATA_FILE", data / "tiny.csv")
    radicals.reset()
    groups = radicals.group_kanji(list("火海花龘湖海人"))
    assert [(g["radical"] and g["radical"]["no"], g["kanji"]) for g in groups] == [
        (86, ["火"]), (85, ["海", "湖"]), (140, ["花"]), (None, ["龘"]), (9, ["人"])]
    assert radicals.group_kanji([]) == []


def test_kanji_by_radical_easiest_level_and_level_filter(data):
    water = radicals.kanji_by_radical(85)
    assert water == [{"kanji": "水", "level": "N5", "strokeCount": 4}, {"kanji": "海", "level": "N5", "strokeCount": 9},
                     {"kanji": "湖", "level": "N4", "strokeCount": 12}]   # cấp dễ trước, cùng cấp ít nét trước
    assert radicals.kanji_by_radical(85, ["N4"]) == [{"kanji": "湖", "level": "N4", "strokeCount": 12}]
    assert radicals.kanji_by_radical(85, ["N1"]) == [] and radicals.kanji_by_radical(200) == []
    assert radicals.kanji_by_radical(9) == [{"kanji": "人", "level": "N5", "strokeCount": 2}]
    water[0]["kanji"] = "x"
    assert radicals.kanji_by_radical(85)[0]["kanji"] == "水"   # bản sao


def test_easiest_level_picks_min_over_entries(data, monkeypatch):
    monkeypatch.setattr(classifier, "entries_containing",
                        lambda ch: [("a", "", "", "N2"), ("b", "", "", "N4"), ("c", "", "", "N3")])
    assert radicals._easiest_level("海") == "N4"
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: [])
    assert radicals._easiest_level("海") is None


# ----------------------------------------------------------------------------- mẹo nhớ mẫu

WATER = {"no": 85, "char": "⽔", "unified": "水", "strokes": 4, "name_vi": "thủy", "meaning_vi": "nước", "han_viet": "THỦY"}


def test_template_mentions_radical_han_viet_and_meaning_deterministically():
    m = radicals.template_mnemonic("海", WATER, "HẢI", "sea; ocean")
    assert m and len(m) <= radicals.MAX_MNEMONIC_CHARS
    assert "海" in m and "HẢI" in m and "Thủy" in m and "nước" in m and '"sea"' in m and "ocean" not in m
    assert m == radicals.template_mnemonic("海", WATER, "hải ", "sea; ocean")   # xác định; âm được chuẩn hoá viết hoa
    # nhận cả dạng thẻ (nameVi / meaningVi) mà router giữ
    assert radicals.template_mnemonic("海", {"nameVi": "thủy", "meaningVi": "nước"}, "HẢI", "sea") == \
        radicals.template_mnemonic("海", WATER, "HẢI", "sea")


def test_template_varies_between_kanji_and_degrades_without_data():
    texts = {radicals.template_mnemonic(ch, WATER, "X", "m") for ch in "海湖池河洋汁油波泳深"}
    assert len(texts) >= 3    # nhiều mẫu, chọn theo hash chữ nên một bộ thẻ không đọc giống hệt nhau
    no_rad = radicals.template_mnemonic("海", None, "HẢI", "sea")
    assert "HẢI" in no_rad and "Thủy" not in no_rad and '"sea"' in no_rad
    no_hv = radicals.template_mnemonic("海", WATER, None, "sea")
    assert "Thủy" in no_hv and "None" not in no_hv
    bare = radicals.template_mnemonic("龘", None, None, None)
    assert bare and "龘" in bare and "None" not in bare and '"' not in bare
    for text in (no_rad, no_hv, bare):
        assert 0 < len(text) <= radicals.MAX_MNEMONIC_CHARS


def test_template_never_exceeds_limit_with_long_inputs():
    long_rad = dict(WATER, name_vi="a" * 120, meaning_vi="b" * 120)
    m = radicals.template_mnemonic("海", long_rad, "C" * 80, "d" * 300)
    assert 0 < len(m) <= radicals.MAX_MNEMONIC_CHARS and m.endswith("…")
    short = radicals.template_mnemonic("海", WATER, "HẢI", "x" * 300)
    assert "x" * 39 in short and "x" * 41 not in short    # gloss cắt ở _MEANING_CHARS trước khi ghép câu


def test_clean_meaning_drops_affix_and_counter_senses():
    # nghĩa là phụ tố / lượng từ / kính ngữ không vào câu mẹo: 人 "-ian (e.g. Italian)" → không nghĩa; 回 → nghĩa thật
    assert radicals.clean_meaning("-ian (e.g. Italian), -ite (e.g. Tokyoite); -er (e.g. performer, etc.), person working with ...") is None
    assert radicals.clean_meaning("counter for occurrences; a time, an instance") == "a time, an instance"
    assert radicals.clean_meaning("Our ~ (e.g., Hotel, plane, etc.)") is None
    assert radicals.clean_meaning("honorific/polite/humble prefix") is None and radicals.clean_meaning("~ shop") is None
    assert radicals.clean_meaning("-ical, -ive; -like, -ish") is None and radicals.clean_meaning("counter for people") is None
    assert radicals.clean_meaning("person (same as 人 (ひと))") == "person (same as 人 (ひと))"   # không bỏ gì → nguyên chuỗi
    assert radicals.clean_meaning("sea; ocean") == "sea; ocean" and radicals.clean_meaning(None) is None
    assert radicals.clean_meaning("") is None
    m = radicals.template_mnemonic("人", radicals.radical(9), "NHÂN", "-ian (e.g. Italian), -ite (e.g. Tokyoite)")
    assert "人" in m and "NHÂN" in m and "-ian" not in m and '"' not in m
    m = radicals.template_mnemonic("回", radicals.radical(31), "HỒI", "counter for occurrences; a time, an instance")
    assert 'nghĩa tiếng Anh "a time"' in m and "counter" not in m   # gloss EN được ghi rõ là tiếng Anh
    assert '"person"' in radicals.template_mnemonic("者", radicals.radical(125), "GIẢ", "person (same as 人 (ひと))")


def test_template_for_every_committed_radical():
    radicals.reset()
    for r in radicals.table():
        m = radicals.template_mnemonic(r["unified"], r, r["han_viet"], "meaning")
        assert 0 < len(m) <= radicals.MAX_MNEMONIC_CHARS and r["unified"] in m
