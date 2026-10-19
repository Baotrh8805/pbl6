"""han_viet_graph trên bảng Unihan / JLPT / JMdict tí hon: không phụ thuộc nội dung CSV thật (chỉ một test cuối
skipif chạy trên dữ liệu đã commit để chắc 'NHẬT' → 日 → 日本 và 'HỌC' → 学 → 学校 còn đúng)."""
import sqlite3

import pytest

from app.extract import han_viet, han_viet_graph, jmdict, kanji_readings, kanjidata
from app.extract.jlpt import classifier

# 顔 NHAN: âm không dấu trùng khoá gấp dấu của NHÂN (人) — "nhan" phải ra cả hai
VIET_CSV = "char,reading\n日,nhật\n本,bản\n学,học\n校,chò\n馹,nhật\n一,nhất\n人,nhân\n顔,nhan\n"
OVERRIDE_CSV = "char,reading\n校,HIỆU\n"   # như han_viet_overrides.csv thật: sửa âm Nôm của Unihan
JA_CSV = ("char,readings\n日,ニチ ジツ ひ か\n学,ガク カク まなぶ\n本,ホン もと\n校,コウ\n一,イチ イツ ひと ひと.つ\n"
          "人,ジン ニン ひと\n")
RS_CSV = "char,radical_no,residual_strokes,total_strokes\n日,72,0,4\n学,39,5,8\n本,75,1,5\n校,75,6,10\n一,1,0,1\n人,9,0,2\n"
# classifier.entries_containing giả: (expression, reading, meaning, level) theo cấp dễ → khó như bản thật
JLPT = {
    "日": [("日", "ひ", "day", "N5"), ("一日", "いちにち", "one day", "N5"), ("毎日", "まいにち", "every day", "N5"),
          ("日曜日", "にちようび", "Sunday", "N5"), ("日本", "にほん", "Japan", "N3")],
    "本": [("本", "ほん", "book", "N5"), ("日本", "にほん", "Japan", "N3")],
    "学": [("学校", "がっこう", "school", "N5"), ("学生", "がくせい", "student", "N5"), ("学ぶ", "まなぶ", "to learn", "N3")],
    "校": [("学校", "がっこう", "school", "N5")],
    "一": [("一", "いち", "one", "N5"), ("一つ", "ひとつ", "one thing", "N5"), ("一日", "いちにち", "one day", "N5")],
    "人": [("人", "ひと", "person", "N5")],
}
JMDICT_ROWS = [("日光", "にっこう", "sunlight", 1, None), ("学問", "がくもん", "learning", 1, None),
               ("学校", "がっこう", "school", 1, None), ("本日", "ほんじつ", "today", 1, None),
               ("馹", "じつ", "post horse", 1, None), ("日", "ひ", "day (kana)", 0, None)]   # common=0 → bỏ
# tần suất giả (thang zipf) thay wordfreq: cố ý khác thứ tự CSV (毎日 > 日曜日 > 一日 không có) để thấy khoá phụ có tác dụng
FREQ = {"日": 6.4, "毎日": 5.1, "日曜日": 4.4, "日本": 6.0, "本日": 4.0, "日光": 3.9,
        "一": 5.9, "一つ": 4.8, "人": 6.0, "学校": 5.3, "学生": 5.0, "学ぶ": 4.5, "学問": 3.9}


@pytest.fixture
def data(tmp_path, monkeypatch):
    (tmp_path / "viet.csv").write_text(VIET_CSV, encoding="utf-8")
    (tmp_path / "over.csv").write_text(OVERRIDE_CSV, encoding="utf-8")
    (tmp_path / "ja.csv").write_text(JA_CSV, encoding="utf-8")
    (tmp_path / "rs.csv").write_text(RS_CSV, encoding="utf-8")
    conn = sqlite3.connect(tmp_path / "jmdict.sqlite")
    conn.execute("CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT)")
    conn.executemany("INSERT INTO entries VALUES (?,?,?,?,?)", JMDICT_ROWS)
    conn.commit()
    conn.close()
    monkeypatch.setattr(han_viet, "DATA_FILE", tmp_path / "viet.csv")
    monkeypatch.setattr(han_viet, "OVERRIDE_FILE", tmp_path / "over.csv")
    monkeypatch.setattr(han_viet, "_table", None)
    monkeypatch.setattr(kanji_readings, "DATA_FILE", tmp_path / "ja.csv")
    monkeypatch.setattr(kanji_readings, "_table", None)
    monkeypatch.setattr(kanji_readings, "_raw_table", None)
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "rs.csv")
    monkeypatch.setattr(jmdict, "DATA_FILE", tmp_path / "jmdict.sqlite")
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: list(JLPT.get(ch, [])))
    monkeypatch.setattr(han_viet_graph, "word_frequency", lambda term: FREQ.get(term, 0.0))
    kanjidata.reset()
    han_viet_graph.reset()
    yield tmp_path
    kanjidata.reset()
    han_viet_graph.reset()


def _by_type(g, kind):
    return [n for n in g["nodes"] if n["type"] == kind]


# ----------------------------------------------------------------------------- chuẩn hoá

def test_normalize_and_fold():
    assert han_viet_graph.normalize(" nhật ") == "NHẬT"
    assert han_viet_graph.normalize("Nhật") == "NHẬT"   # NFD gõ rời dấu → NFC
    assert han_viet_graph.fold("NHẬT") == "NHAT" and han_viet_graph.fold("nhat") == "NHAT"
    assert han_viet_graph.fold("Đại") == "DAI" and han_viet_graph.fold("HƯƠNG") == "HUONG"
    assert han_viet_graph.normalize("") == "" and han_viet_graph.fold(None) == ""


def test_word_frequency_wraps_wordfreq_and_degrades_to_zero(monkeypatch):
    monkeypatch.setattr(classifier, "_zipf", lambda lemma: 4.2 if lemma == "日本" else 0.0)
    assert han_viet_graph.word_frequency("日本") == 4.2 and han_viet_graph.word_frequency("馹") == 0.0

    def boom(lemma):
        raise RuntimeError("wordfreq thiếu dữ liệu ja")
    monkeypatch.setattr(classifier, "_zipf", boom)
    assert han_viet_graph.word_frequency("日本") == 0.0   # lỗi tần suất không làm hỏng đồ thị


# ----------------------------------------------------------------------------- readings_split (kanji_readings, add-only)

def test_readings_split_on_kun_and_okurigana_dot(data):
    assert kanji_readings.readings_split("学") == {
        "on": [{"reading": "ガク", "hiragana": "がく"}, {"reading": "カク", "hiragana": "かく"}],
        "kun": [{"reading": "まなぶ", "hiragana": "まなぶ", "okurigana": ""}],
    }
    # "ひと.つ" → gốc ひと (trùng với ひと đã có → không lặp), okurigana つ giữ riêng; readings() cũ không đổi
    one = kanji_readings.readings_split("一")
    assert [r["reading"] for r in one["on"]] == ["イチ", "イツ"]
    assert one["kun"] == [{"reading": "ひと", "hiragana": "ひと", "okurigana": ""},
                          {"reading": "ひと", "hiragana": "ひと", "okurigana": "つ"}]
    assert kanji_readings.readings("学") == ("がく", "かく", "まなぶ")
    assert kanji_readings.readings_split("龘") == {"on": [], "kun": []}


# ----------------------------------------------------------------------------- graph()

def test_graph_reading_kanji_words_and_edges(data):
    g = han_viet_graph.graph("NHẬT")
    assert g["query"] == "NHẬT"
    assert _by_type(g, "reading") == [{"id": "r:NHẬT", "type": "reading", "label": "NHẬT"}]
    kanji = _by_type(g, "kanji")
    assert [k["label"] for k in kanji] == ["日", "馹"]   # chữ có nhiều từ JLPT trước
    assert kanji[0] == {"id": "k:日", "type": "kanji", "label": "日", "hanViet": "NHẬT", "on": ["ニチ", "ジツ"],
                        "kun": ["ひ", "か"], "level": "N5", "strokes": 4, "radical": 72}
    assert kanji[1] == {"id": "k:馹", "type": "kanji", "label": "馹", "hanViet": "NHẬT", "on": [], "kun": [],
                        "level": None, "strokes": None, "radical": None}
    # từ: N5 (JLPT, thông dụng trước: 毎日 5.1 > 日曜日 4.4 > 一日 không tần suất) → N3 → JMdict không cấp (本日 4.0 >
    # 日光 3.9); 日 common=0 trong JMdict bị bỏ và đã có từ JLPT
    words = _by_type(g, "word")
    assert [w["label"] for w in words] == ["日", "毎日", "日曜日", "一日", "日本", "本日", "日光", "馹"]
    assert next(w for w in words if w["label"] == "日本") == {
        "id": "w:日本", "type": "word", "label": "日本", "reading": "にほん", "meaning": "Japan", "level": "N3",
        "hanViet": "NHẬT BẢN"}
    assert next(w for w in words if w["label"] == "日光")["level"] is None
    edges = g["edges"]
    assert edges[:2] == [{"from": "r:NHẬT", "to": "k:日", "type": "has_kanji"},
                         {"from": "k:日", "to": "w:日", "type": "in_word"}]
    assert {"from": "r:NHẬT", "to": "k:馹", "type": "has_kanji"} in edges
    assert {"from": "k:馹", "to": "w:馹", "type": "in_word"} in edges
    assert len(edges) == 2 + 7 + 1   # 2 has_kanji + 7 từ của 日 + 1 từ của 馹
    ids = [n["id"] for n in g["nodes"]]
    assert len(ids) == len(set(ids)) and all(e["from"] in ids and e["to"] in ids for e in edges)


def test_graph_word_order_without_frequency_falls_back_to_short_first(data, monkeypatch):
    # không có wordfreq (mọi từ 0) → cùng cấp xếp từ ngắn trước rồi theo mã Unicode, vẫn N5 → N3 → JMdict
    monkeypatch.setattr(han_viet_graph, "word_frequency", lambda term: 0.0)
    words = _by_type(han_viet_graph.graph("NHẬT"), "word")
    assert [w["label"] for w in words] == ["日", "一日", "毎日", "日曜日", "日本", "日光", "本日", "馹"]


def test_graph_lowercase_and_folded_query_and_shared_word_node(data):
    assert han_viet_graph.graph("nhật")["nodes"] == han_viet_graph.graph("NHẬT")["nodes"]
    g = han_viet_graph.graph("nhat")   # không dấu → mọi âm gấp dấu thành NHAT, mỗi âm một node reading
    assert [r["label"] for r in _by_type(g, "reading")] == ["NHẤT", "NHẬT"]
    assert [k["label"] for k in _by_type(g, "kanji")] == ["一", "日", "馹"]
    assert {"from": "r:NHẤT", "to": "k:一", "type": "has_kanji"} in g["edges"]
    # 一日 chứa cả 一 lẫn 日: một node từ, hai cạnh in_word
    assert [w["label"] for w in _by_type(g, "word")].count("一日") == 1
    assert {"from": "k:一", "to": "w:一日", "type": "in_word"} in g["edges"]
    assert {"from": "k:日", "to": "w:一日", "type": "in_word"} in g["edges"]


def test_graph_level_filter_limit_and_orphans(data):
    g = han_viet_graph.graph("nhat", level="N5", limit_words=2)
    # 馹 không có từ N5 → bỏ; mỗi chữ tối đa 2 từ thông dụng nhất; node reading chỉ còn âm có chữ
    assert [k["label"] for k in _by_type(g, "kanji")] == ["一", "日"]
    assert [w["label"] for w in _by_type(g, "word")] == ["一", "一つ", "日", "毎日"]
    assert [r["label"] for r in _by_type(g, "reading")] == ["NHẤT", "NHẬT"]
    g3 = han_viet_graph.graph("NHẬT", level="N3")
    assert [w["label"] for w in _by_type(g3, "word")] == ["日", "毎日", "日曜日", "一日", "日本"]   # JMdict không cấp bị bỏ
    assert [k["label"] for k in _by_type(g3, "kanji")] == ["日"]
    # lọc cấp bỏ hết chữ của âm → không node reading mồ côi, không lỗi (人 chỉ có từ N5)
    assert han_viet_graph.graph("NHÂN", level="N4")["nodes"] != []
    assert han_viet_graph.graph("XYZ", level="N5") == {"query": "XYZ", "nodes": [], "edges": []}
    # cấp lạ ở tầng module → coi như không lọc (router đã chặn 400)
    assert han_viet_graph.graph("NHẬT", level="N9")["nodes"] == han_viet_graph.graph("NHẬT")["nodes"]
    assert _by_type(han_viet_graph.graph("NHẬT", limit_words=0), "word") == []


def test_graph_unknown_reading_is_empty_not_error(data):
    assert han_viet_graph.graph("XYZZY") == {"query": "XYZZY", "nodes": [], "edges": []}
    assert han_viet_graph.graph("")["nodes"] == [] and han_viet_graph.graph("   ")["nodes"] == []


def test_graph_caps_kanji_count(data, monkeypatch):
    monkeypatch.setattr(han_viet_graph, "MAX_KANJI", 1)
    g = han_viet_graph.graph("NHẬT")
    assert [k["label"] for k in _by_type(g, "kanji")] == ["日"]
    assert all(e["to"] != "k:馹" for e in g["edges"])


def test_words_of_dedupes_jlpt_over_jmdict_and_caps(data, monkeypatch):
    got = han_viet_graph.words_of("学")
    assert [(w["term"], w["source"], w["level"]) for w in got] == [
        ("学校", "jlpt", "N5"), ("学生", "jlpt", "N5"), ("学ぶ", "jlpt", "N3"), ("学問", "jmdict", None)]
    assert han_viet_graph.words_of("龘") == []
    monkeypatch.setattr(han_viet_graph, "JMDICT_PER_KANJI", 1)
    han_viet_graph.reset()
    # 日: JMdict giữ 1 mục ngắn nhất (日 common=0 đã bị loại từ SQL → 日光)
    assert [w["term"] for w in han_viet_graph.words_of("日") if w["source"] == "jmdict"] == ["日光"]


# ----------------------------------------------------------------------------- suggest()

def test_suggest_ranks_by_jlpt_words_and_folds_diacritics(data):
    got = han_viet_graph.suggest("NH")
    # NHẬT (日: 5 từ) > NHẤT (一: 3) > NHÂN (人: 1); kèm số chữ và chữ mẫu (chữ sống trước)
    assert got == [{"reading": "NHẬT", "count": 2, "kanji": ["日", "馹"]},
                   {"reading": "NHẤT", "count": 1, "kanji": ["一"]},
                   {"reading": "NHÂN", "count": 1, "kanji": ["人"]},
                   {"reading": "NHAN", "count": 1, "kanji": ["顔"]}]
    assert [s["reading"] for s in han_viet_graph.suggest("nhat")] == ["NHẬT", "NHẤT"]
    assert [s["reading"] for s in han_viet_graph.suggest("nhan")] == ["NHÂN", "NHAN"]
    # có dấu: khớp đúng dấu trước, rồi mới bù bằng khớp gấp dấu cho đủ limit
    assert [s["reading"] for s in han_viet_graph.suggest("NHẬ")] == ["NHẬT", "NHẤT", "NHÂN", "NHAN"]
    assert [s["reading"] for s in han_viet_graph.suggest("NHẬ", limit=1)] == ["NHẬT"]
    assert [s["reading"] for s in han_viet_graph.suggest("h")] == ["HỌC", "HIỆU"]
    assert han_viet_graph.suggest("") == [] and han_viet_graph.suggest("NH", 0) == [] and han_viet_graph.suggest("zz") == []


def test_kanji_for_without_diacritics_pools_variants_even_when_the_key_is_itself_a_reading(data):
    """"nhan" vừa là âm thật (顔 NHAN) vừa là khoá gấp dấu của NHÂN (人): gõ không dấu → cả hai, âm trùng chuỗi gõ lên
    đầu (trước đây khớp đúng NHAN nuốt mất NHÂN, trong khi suggest("nhan") vẫn gợi ý cả hai). Có dấu → đúng âm đó."""
    assert han_viet_graph.kanji_for("nhan") == [("NHAN", ["顔"]), ("NHÂN", ["人"])]
    assert han_viet_graph.kanji_for("NHAN") == [("NHAN", ["顔"]), ("NHÂN", ["人"])]
    assert han_viet_graph.kanji_for("NHÂN") == [("NHÂN", ["人"])]
    assert han_viet_graph.kanji_for("nhật") == [("NHẬT", ["日", "馹"])]
    assert han_viet_graph.kanji_for("NHẶT") == [("NHẤT", ["一"]), ("NHẬT", ["日", "馹"])]   # có dấu nhưng không có âm → gấp dấu
    assert han_viet_graph.kanji_for("zz") == [] and han_viet_graph.kanji_for(" ") == []
    g = han_viet_graph.graph("nhan")
    assert [r["label"] for r in _by_type(g, "reading")] == ["NHAN", "NHÂN"]
    assert [k["label"] for k in _by_type(g, "kanji")] == ["顔", "人"]
    assert {"from": "r:NHÂN", "to": "k:人", "type": "has_kanji"} in g["edges"]
    assert [s["reading"] for s in han_viet_graph.suggest("nhan")] == [r["label"] for r in _by_type(g, "reading")][::-1] \
        or {s["reading"] for s in han_viet_graph.suggest("nhan")} == {"NHAN", "NHÂN"}   # autocomplete và đồ thị cùng tập âm


# ----------------------------------------------------------------------------- thiếu dữ liệu

def test_without_jmdict_graph_still_has_jlpt_words(data, tmp_path, monkeypatch):
    monkeypatch.setattr(jmdict, "DATA_FILE", tmp_path / "missing.sqlite")
    han_viet_graph.reset()
    g = han_viet_graph.graph("NHẬT")
    assert [w["label"] for w in _by_type(g, "word")] == ["日", "毎日", "日曜日", "一日", "日本"]
    assert [k["label"] for k in _by_type(g, "kanji")] == ["日", "馹"]   # 馹 vẫn là chữ đọc NHẬT dù không có từ
    assert han_viet_graph.available()


def test_without_han_viet_table_everything_is_empty(data, tmp_path, monkeypatch):
    monkeypatch.setattr(han_viet, "DATA_FILE", tmp_path / "missing.csv")
    monkeypatch.setattr(han_viet, "OVERRIDE_FILE", tmp_path / "missing2.csv")
    monkeypatch.setattr(han_viet, "_table", None)
    han_viet_graph.reset()
    assert not han_viet_graph.available()
    assert han_viet_graph.graph("NHẬT") == {"query": "NHẬT", "nodes": [], "edges": []}
    assert han_viet_graph.suggest("NH") == []


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(not (han_viet.DATA_FILE.exists() and (classifier.DATA_DIR / "n5.csv").exists()),
                                reason="chưa có unihan_vietnamese.csv / jlpt/n5.csv (python scripts/build_dicts.py)")


@needs_real
def test_real_data_nhat_and_hoc():
    han_viet_graph.reset()
    try:
        # 日 có hơn 80 từ JLPT; với limit mặc định 30 thì 日本 (CSV thật xếp N3, sau 26 từ N5 + 日記 N4) vẫn phải có mặt
        # vì trong cấp N3 nó thông dụng nhất (wordfreq) — không được rơi vào đuôi bị cắt như khi xếp a-b-c
        g = han_viet_graph.graph("NHẬT")
        day = next(k for k in _by_type(g, "kanji") if k["label"] == "日")
        assert day["level"] == "N5" and day["strokes"] == 4 and day["radical"] == 72 and "ニチ" in day["on"]
        japan = next(w for w in _by_type(g, "word") if w["label"] == "日本")
        assert japan["level"] in ("N5", "N4", "N3") and japan["hanViet"] == "NHẬT BẢN"
        assert {"from": "k:日", "to": "w:日本", "type": "in_word"} in g["edges"]
        day_words = [e["to"] for e in g["edges"] if e["from"] == "k:日"]
        assert day_words[0] == "w:日" and day_words.index("w:今日") < day_words.index("w:七日")   # thông dụng trước
        g = han_viet_graph.graph("HỌC")
        assert "k:学" in [k["id"] for k in _by_type(g, "kanji")]
        school = next(w for w in _by_type(g, "word") if w["label"] == "学校")
        assert school["level"] == "N5" and school["hanViet"] == "HỌC HIỆU"
        # không dấu → gộp cả HÓC (旭) lẫn HỌC: đồ thị là tập cha của đồ thị HỌC
        assert {n["id"] for n in g["nodes"]} <= {n["id"] for n in han_viet_graph.graph("hoc")["nodes"]}
        assert han_viet_graph.suggest("hoc")[0]["reading"] == "HỌC"
        # "nhan" là âm thật của 顔 nhưng gõ không dấu vẫn phải ra 人 (NHÂN); "hoa" (花) vẫn ra 和 / 化; "tam" (三) ra 心
        for query, expect in [("nhan", "人"), ("hoa", "和"), ("hoa", "化"), ("tam", "心"), ("dong", "動")]:
            ids = {n["id"] for n in han_viet_graph.graph(query)["nodes"]}
            assert f"k:{expect}" in ids, (query, expect)
        readings = {r["label"] for r in _by_type(han_viet_graph.graph("nhan"), "reading")}
        assert {"NHAN", "NHÂN"} <= readings and readings <= {s["reading"] for s in han_viet_graph.suggest("nhan", 50)}
    finally:
        han_viet_graph.reset()


@needs_real
def test_real_data_multi_variant_rows_are_separate_words():
    """LC-11: n4.csv gộp "高校; 高等学校" / "こうこう; こうとうがっこう" trong một dòng → đồ thị từng vẽ một node
    "高校; 高等学校" không có âm Hán-Việt. Sau khi tách, mỗi cách viết là một node riêng với cách đọc và Hán-Việt của nó;
    中学校 mang nghĩa sửa tay (CSV ghi "junior high school pupil")."""
    han_viet_graph.reset()
    try:
        words = {n["label"]: n for n in _by_type(han_viet_graph.graph("HỌC", limit_words=100), "word")}
        senior = words["高等学校"]
        assert senior["reading"] == "こうとうがっこう" and senior["level"] == "N4" and senior["hanViet"] == "CAO ĐẲNG HỌC HIỆU"
        middle = words["中学校"]
        assert middle["meaning"] == "junior high school" and middle["hanViet"] == "TRUNG HỌC HIỆU"
        # 高校 không chứa 学 nên nằm dưới 校 (HIỆU), cạnh 高等学校 — hai node riêng, không còn node gộp
        g = han_viet_graph.graph("HIỆU", limit_words=100)
        words = {n["label"]: n for n in _by_type(g, "word")}
        assert words["高校"]["reading"] == "こうこう" and words["高校"]["hanViet"] == "CAO HIỆU"
        assert words["高等学校"]["reading"] == "こうとうがっこう"
        assert {"from": "k:校", "to": "w:高校", "type": "in_word"} in g["edges"]
        assert {"from": "k:校", "to": "w:高等学校", "type": "in_word"} in g["edges"]
        assert not [label for label in words if ";" in label or "；" in label or "、" in label]
    finally:
        han_viet_graph.reset()
