"""conflicts.check_item / check_items (F2): tài liệu so với danh sách JLPT (CSV đã commit), JMdict (sqlite tí hon dựng trong
tmp_path như test_distractors — CI không có jmdict.sqlite), Unihan, danh mục ngữ pháp, Sudachi và mục tham chiếu quản trị.
Không gọi Gemini: F2 thuần quy tắc."""
import sqlite3

import pytest

from app.extract import conflicts, jmdict
from app.extract.conflicts import check_item, check_items, parse_level, summarize

ROWS = [  # kanji, kana, gloss, common — như scripts/build_dicts.py sinh ra
    ("珈琲", "コーヒー", "coffee", 0),       # không có trong danh sách JLPT → nguồn jmdict
    ("橋", "はし", "bridge", 1),
    ("学校", "がっこう", "school", 1),
    ("行く", "いく", "to go", 1),
    ("行く", "ゆく", "to go", 0),
    ("上田", "じょうでん", "upper rice field", 1),   # danh từ thường trùng mặt chữ họ Ueda
]


@pytest.fixture
def jm(tmp_path, monkeypatch):
    path = tmp_path / "jmdict.sqlite"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT)")
    con.executemany("INSERT INTO entries VALUES (?,?,?,?,NULL)", ROWS)
    con.commit()
    con.close()
    monkeypatch.setattr(jmdict, "DATA_FILE", path)
    monkeypatch.setattr(jmdict, "_conn", None)   # monkeypatch trả lại kết nối thật khi test xong
    jmdict.lookup.cache_clear()
    yield path
    if jmdict._conn is not None:
        jmdict._conn.close()   # Windows: không đóng thì tmp_path không xoá được
    jmdict.lookup.cache_clear()


@pytest.fixture
def no_jm(tmp_path, monkeypatch):
    monkeypatch.setattr(jmdict, "DATA_FILE", tmp_path / "missing.sqlite")
    monkeypatch.setattr(jmdict, "_conn", None)
    jmdict.lookup.cache_clear()
    yield
    jmdict.lookup.cache_clear()


def _one(item: dict, refs=()) -> dict:
    found = check_item(item, refs)
    assert len(found) == 1, found
    return found[0]


def _keys(w: dict) -> set:
    return set(w)


# ----------------------------------------------------------------------------- reading

def test_reading_conflict_from_jlpt_list(no_jm):
    w = _one({"term": "学校", "reading": "がくこう"})
    assert _keys(w) == {"field", "document", "reference", "source", "confidence", "note_vi"}
    assert w["field"] == "reading" and w["document"] == "がくこう" and w["reference"] == "がっこう"
    # thiếu JMdict: tập cách đọc chấp nhận chỉ có một cách / mục JLPT → 0.75 thay vì 0.9 (vẫn trên ngưỡng mặc định)
    assert w["source"] == "jlpt_list" and w["confidence"] == conflicts.CONF_READING_JLPT_ONLY == 0.75
    assert "がくこう" in w["note_vi"] and "がっこう" in w["note_vi"] and "JLPT" in w["note_vi"]
    # katakana / khoảng trắng trong cột kana OCR vẫn là cùng cách đọc
    assert check_item({"term": "学校", "reading": "ガッコウ"}) == []
    assert check_item({"term": "学校", "reading": "がっ こう"}) == []


def test_jlpt_source_outranks_jmdict_when_both_know_the_word(jm):
    w = _one({"term": "学校", "reading": "がくこう"})
    assert w["source"] == "jlpt_list" and w["confidence"] == 0.9


def test_valid_alternative_reading_is_not_a_conflict(jm):
    # 日本 có cả にっぽん lẫn にほん trong danh sách JLPT; 行く có ゆく chỉ trong JMdict → hợp mọi cách đọc được chấp nhận
    assert check_item({"term": "日本", "reading": "にっぽん"}) == []
    assert check_item({"term": "日本", "reading": "にほん"}) == []
    assert check_item({"term": "行く", "reading": "ゆく"}) == []
    assert check_item({"term": "行く", "reading": "いく"}) == []
    # ぢ / づ và じ / ず là cùng cách đọc (近々 ちかぢか / ちかじか)
    assert check_item({"term": "近々", "reading": "ちかじか"}) == [] and check_item({"term": "近々", "reading": "ちかぢか"}) == []


def test_numerals_and_names_are_not_checked_against_dictionaries(jm):
    # số đếm + lượng từ biến âm (十分 じゅっぷん "mười phút" bên cạnh じゅうぶん "đủ"; 一分 いっぷん; 五月 さつき): từ điển chỉ ghi
    # một phần → không so; 一緒 / 一番 bắt đầu bằng 一 nhưng Sudachi không coi là số đếm → vẫn so
    for term, reading in [("十分", "じゅっぷん"), ("一分", "いっぷん"), ("五月", "さつき"), ("4時", "よじ"), ("1本", "いっぽん")]:
        assert check_item({"term": term, "reading": reading}) == [], term
    assert _one({"term": "一緒", "reading": "いっしょう"})["reference"] == "いっしょ"
    # tên riêng (Sudachi 固有名詞) ngoài danh sách JLPT: 上田 うえだ không phải danh từ じょうでん của JMdict; không đoán
    # bằng Sudachi (山崎 やまさき / やまざき đều có). 日本 cũng là 固有名詞 nhưng có trong JLPT → vẫn so
    assert check_item({"term": "上田", "reading": "うえだ"}) == [] and check_item({"term": "山崎", "reading": "やまさき"}) == []
    assert _one({"term": "日本", "reading": "にほむ"})["source"] == "jlpt_list"
    # mục quản trị vẫn quyết định cho số đếm / tên riêng
    assert _one({"term": "上田", "reading": "うえだ"}, [{"term": "上田", "reading": "うえた", "sourceId": 1}])["source"] == "admin:1"


def test_unknown_term_is_never_a_conflict(no_jm):
    # không nguồn nào biết 覆公 (OOV cả với Sudachi) → im lặng dù tài liệu khai đủ thứ
    assert check_item({"term": "覆公", "reading": "ふくこう", "meaningEn": "cover", "docLevel": "N5"}) == []
    assert check_item({"term": "", "reading": "x"}) == [] and check_item({}) == []
    # từ toàn kana / katakana: không có gì để so cách đọc
    assert check_item({"term": "とても", "reading": "とても"}) == []
    assert check_item({"term": "コーヒー", "reading": "コーヒー"}) == []


def test_jmdict_reading_source_when_jlpt_lacks_the_word(jm):
    w = _one({"term": "珈琲", "reading": "こうひい"})
    assert (w["field"], w["source"], w["confidence"], w["reference"]) == ("reading", "jmdict", 0.8, "こーひー")
    assert check_item({"term": "珈琲", "reading": "コーヒー"}) == []


def test_unihan_reading_for_single_kanji_outside_both_dictionaries(no_jm):
    # 麒 không có trong danh sách JLPT lẫn JMdict → chỉ còn cách đọc on/kun của Unihan (き / ぎ)
    w = _one({"term": "麒", "reading": "ぎん"})
    assert (w["field"], w["source"], w["confidence"]) == ("reading", "unihan", 0.6)
    assert set(w["reference"].split(" / ")) == {"き", "ぎ"}
    assert check_item({"term": "麒", "reading": "き"}) == []


def test_document_reading_cell_with_alternatives_and_notes(jm):
    # ô cách đọc liệt kê vài cách / kèm ghi chú như cột kana giáo trình hay CSV JLPT: mọi cách đọc đều phải đúng
    assert check_item({"term": "行く", "reading": "いく; ゆく"}) == []
    assert check_item({"term": "行く", "reading": "いく・ゆく"}) == [] and check_item({"term": "何", "reading": "なん／なに"}) == []
    assert check_item({"term": "勉強", "reading": "べんきょう (する)"}) == []
    assert check_item({"term": "十", "reading": "(を) とお"}) == []
    w = _one({"term": "学校", "reading": "がくこう・がっこう"})
    assert w["document"] == "がくこう / がっこう" and w["reference"] == "がっこう"
    # ô ghi lại chính chữ Hán (không phải kana) → không có cách đọc tài liệu → im lặng
    assert check_item({"term": "増し", "reading": "増し"}) == []
    # Sudachi: cách đọc của nó phải nằm trong các cách tài liệu liệt kê
    assert check_item({"term": "銀行口座", "reading": "ぎんこうこうざ・ぎんこうごうざ"}) == []


def test_document_reading_precedence(no_jm):
    # khoá docReading do pipeline truyền: None = tài liệu không khai → không so dù reading của thẻ sai
    assert check_item({"term": "学校", "reading": "がくこう", "docReading": None}) == []
    assert _one({"term": "学校", "reading": "がっこう", "docReading": "がくこう"})["document"] == "がくこう"
    # không có khoá: ruby có base đúng bằng từ > reading của thẻ > ghép readingSegments
    assert _one({"term": "学校", "reading": "がっこう", "rubies": [{"base": "学校", "reading": "がくこう"}]})["document"] == "がくこう"
    assert _one({"term": "学校", "readingSegments": [{"kanji": "学", "kana": "がく"}, {"kanji": "校", "kana": "こう"}]})["document"] == "がくこう"
    assert check_item({"term": "学校"}) == []


# ----------------------------------------------------------------------------- furigana (Sudachi khi từ điển im lặng)

def test_furigana_vs_sudachi_only_for_terms_no_dictionary_knows(no_jm):
    # 銀行口座 không có trong JLPT / JMdict nhưng là một mục SudachiDict → cách đọc tài liệu khác Sudachi → 0.5 (dưới
    # ngưỡng mặc định: Sudachi đọc sai ~2 % từ đứng một mình, quản trị hạ ngưỡng mới thấy)
    w = _one({"term": "銀行口座", "reading": "ぎんこうごうざ"})
    assert (w["field"], w["source"], w["confidence"]) == ("furigana", "sudachi", conflicts.CONF_FURIGANA)
    assert conflicts.CONF_FURIGANA < 0.6
    assert w["document"] == "ぎんこうごうざ" and w["reference"] == "ぎんこうこうざ" and "Sudachi" in w["note_vi"]
    assert check_item({"term": "銀行口座", "reading": "ぎんこうこうざ"}) == []
    # từ điển đã có ý kiến → không bao giờ hỏi Sudachi (một lỗi một cảnh báo, nguồn đáng tin hơn)
    fields = [w["field"] for w in check_item({"term": "学校", "reading": "がくこう"})]
    assert fields == ["reading"]
    # OOV với Sudachi (覆公) → không đoán
    assert check_item({"term": "覆公", "reading": "ふっこう"}) == []
    # nhiều token (何曜日 → なんようひ, 今日中 → きょうなか: ghép cách đọc không mô hình biến âm), số đếm (4時 → よんじ),
    # tên riêng (山崎 → やまざき) → im lặng
    for term, reading in [("何曜日", "なんようび"), ("今日中", "きょうじゅう"), ("4時", "よじ"), ("9時", "くじ"), ("山崎", "やまさき")]:
        assert check_item({"term": term, "reading": reading}) == [], term


def test_furigana_silent_without_sudachi(no_jm, monkeypatch):
    import app.extract.tokenizer as tokenizer
    monkeypatch.setattr(tokenizer, "tokenize", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no sudachi")))
    assert check_item({"term": "銀行口座", "reading": "ぎんこうごうざ"}) == []


# ----------------------------------------------------------------------------- meaning (chỉ tiếng Anh)

def test_meaning_mismatch_english_gloss_low_confidence(no_jm):
    w = _one({"term": "橋", "reading": "はし", "meaningEn": "school"})
    assert (w["field"], w["source"], w["confidence"]) == ("meaning", "jlpt_list", 0.5)
    assert w["document"] == "school" and w["reference"] == "bridge"
    # chỉ cần chung một từ nội dung; số nhiều / mạo từ / dấu câu không tính
    assert check_item({"term": "橋", "reading": "はし", "meaningEn": "a bridge"}) == []
    assert check_item({"term": "橋", "reading": "はし", "meaningEn": "Bridges, overpass."}) == []
    # nghĩa tiếng Việt KHÔNG so với từ điển; gloss không có từ nội dung cũng bỏ qua
    assert check_item({"term": "橋", "reading": "はし", "meaningVi": "trường học"}) == []
    assert check_item({"term": "橋", "reading": "はし", "meaningEn": "the"}) == []
    # khoá docMeaningEn = None: nghĩa EN của thẻ là do từ điển điền, không phải của tài liệu
    assert check_item({"term": "橋", "reading": "はし", "meaningEn": "school", "docMeaningEn": None}) == []
    # từ toàn kana: nghĩa của mọi từ JLPT cùng cách đọc đều được chấp nhận (はし = 橋 / 箸 / 端)
    assert check_item({"term": "はし", "meaningEn": "chopsticks"}) == []
    assert _one({"term": "はし", "meaningEn": "school"})["field"] == "meaning"


def test_meaning_mismatch_against_jmdict_gloss(jm):
    w = _one({"term": "珈琲", "reading": "コーヒー", "meaningEn": "tea"})
    assert (w["source"], w["reference"], w["confidence"]) == ("jmdict", "coffee", 0.5)
    assert check_item({"term": "珈琲", "reading": "コーヒー", "meaningEn": "coffee (drink)"}) == []


# ----------------------------------------------------------------------------- level / grammar

def test_level_mismatch_needs_two_levels_and_confident_classifier(no_jm):
    w = _one({"term": "学校", "reading": "がっこう", "docLevel": "N3"})
    assert (w["field"], w["source"], w["confidence"], w["document"], w["reference"]) == ("level", "jlpt_list", 0.6, "N3", "N5")
    assert "lệch 2 cấp" in w["note_vi"]
    assert check_item({"term": "学校", "reading": "がっこう", "docLevel": "N4"}) == []      # lệch 1 cấp: bình thường
    assert check_item({"term": "学校", "reading": "がっこう", "docLevel": "n5"}) == []      # viết thường vẫn hiểu
    assert check_item({"term": "学校", "reading": "がっこう"}) == []                       # tài liệu không khai cấp
    # こと nằm trong hai danh sách (confidence 0.5) → classifier không chắc → không cảnh báo
    assert check_item({"term": "こと", "reading": "こと", "docLevel": "N1"}) == []
    # cấp tài liệu lấy từ item.level của chính thẻ? không — level của thẻ là của classifier, chỉ docLevel mới là của tài liệu
    assert check_item({"term": "学校", "reading": "がっこう", "level": "N1"}) == []
    # docLevelScope "document" (cấp chung của tài liệu): từ dễ hơn trong tài liệu khó là thường (学校 N5 trong tài liệu N3 / N1),
    # chỉ từ khó hơn hẳn mới đáng ngờ (政策 N1 trong tài liệu tự nhận N5)
    assert check_item({"term": "学校", "reading": "がっこう", "docLevel": "N3", "docLevelScope": "document"}) == []
    assert check_item({"term": "学校", "reading": "がっこう", "docLevel": "N1", "docLevelScope": "document"}) == []
    w = _one({"term": "政策", "reading": "せいさく", "docLevel": "N5", "docLevelScope": "document"})
    assert (w["field"], w["document"], w["reference"], w["confidence"]) == ("level", "N5", "N1", 0.6)
    assert "khó hơn 4 cấp" in w["note_vi"]
    assert check_item({"term": "政策", "reading": "せいさく", "docLevel": "N2", "docLevelScope": "document"}) == []   # lệch 1
    # giá trị lạ → hành vi "item" (đối xứng) như cũ
    assert _one({"term": "学校", "reading": "がっこう", "docLevel": "N3", "docLevelScope": "bogus"})["field"] == "level"


def test_grammar_pattern_level_gap(no_jm):
    item = {"kind": "grammar", "term": "〜なければならない", "level": "N4", "docLevel": "N1"}
    w = _one(item)
    assert (w["field"], w["source"], w["confidence"], w["document"], w["reference"]) == ("grammar", "grammar", 0.5, "N1", "N4")
    assert "〜なければならない" in w["note_vi"]
    assert check_item({**item, "docLevel": "N3"}) == []
    # không gửi level → tra danh mục theo tên mẫu; mẫu lạ → im lặng
    assert _one({"kind": "grammar", "term": "〜なければならない", "docLevel": "N1"})["reference"] == "N4"
    assert check_item({"kind": "grammar", "term": "〜ほにゃらら", "docLevel": "N1"}) == []
    # item ngữ pháp không bao giờ bị xét cách đọc / nghĩa
    assert check_item({"kind": "grammar", "term": "〜なければならない", "reading": "x", "meaningEn": "y"}) == []
    # scope "document": mẫu N4 trong tài liệu N1 là thường; mẫu N3 trong tài liệu tự nhận N5 thì đáng ngờ
    assert check_item({**item, "docLevelScope": "document"}) == []
    w = _one({"kind": "grammar", "term": "〜てほしい", "docLevel": "N5", "docLevelScope": "document"})
    assert (w["reference"], w["confidence"]) == ("N3", 0.5) and "khó hơn 2 cấp" in w["note_vi"]


# ----------------------------------------------------------------------------- mục tham chiếu quản trị

def test_admin_reference_overrides_dictionaries(no_jm):
    refs = [{"term": "学校", "reading": "がくこう", "sourceId": "ref-7"}]
    assert check_item({"term": "学校", "reading": "がくこう"}, refs) == []          # quản trị bảo đúng → từ điển im
    w = _one({"term": "学校", "reading": "がくこう"}, [{"term": "学校", "reading": "がっこう", "sourceId": 7}])
    assert (w["field"], w["source"], w["confidence"], w["reference"]) == ("reading", "admin:7", 0.95, "がっこう")
    assert "(7)" in w["note_vi"]
    assert _one({"term": "学校", "reading": "がくこう"}, [{"term": "学校", "reading": "がっこう"}])["source"] == "admin:unknown"
    # nhiều mục cho cùng từ: khớp một mục là đủ; mục cho từ khác không ảnh hưởng
    assert check_item({"term": "日本", "reading": "にっぽん"}, [{"term": "日本", "reading": "にほん"}, {"term": "日本", "reading": "にっぽん"}]) == []
    assert _one({"term": "学校", "reading": "がくこう"}, [{"term": "橋", "reading": "はし"}])["source"] == "jlpt_list"
    # mục quản trị không có cách đọc → trường đó về từ điển
    assert _one({"term": "学校", "reading": "がくこう"}, [{"term": "学校", "level": "N5"}])["source"] == "jlpt_list"


def test_admin_reference_meaning_and_level(no_jm):
    # nghĩa tiếng Việt của quản trị so với meaningVi của thẻ (từ điển không có tiếng Việt); chung một từ là khớp
    w = _one({"term": "橋", "meaningVi": "trường học"}, [{"term": "橋", "meaning": "cây cầu", "sourceId": "m1"}])
    assert (w["field"], w["source"], w["confidence"], w["document"], w["reference"]) == ("meaning", "admin:m1", 0.95, "trường học", "cây cầu")
    assert check_item({"term": "橋", "meaningVi": "cầu bắc qua sông"}, [{"term": "橋", "meaning": "cây cầu"}]) == []
    # nghĩa tiếng Anh của quản trị so với gloss EN; thẻ không có nghĩa cùng ngôn ngữ → không so được → về từ điển (0.5)
    assert check_item({"term": "橋", "meaningEn": "a bridge"}, [{"term": "橋", "meaning": "bridge"}]) == []
    assert _one({"term": "橋", "meaningEn": "school"}, [{"term": "橋", "meaning": "cây cầu"}])["confidence"] == 0.5
    # không rõ ngôn ngữ ("xe"): khớp vế nào cũng được
    assert check_item({"term": "橋", "meaningVi": "xe hơi", "meaningEn": "car"}, [{"term": "橋", "meaning": "xe"}]) == []
    # cấp: nguồn quản trị là chuẩn nên lệch 1 cấp cũng là trái; khớp → không hỏi classifier nữa
    w = _one({"term": "学校", "docLevel": "N5"}, [{"term": "学校", "level": "N4", "sourceId": "a"}])
    assert (w["field"], w["source"], w["confidence"], w["reference"]) == ("level", "admin:a", 0.95, "N4")
    assert check_item({"term": "学校", "docLevel": "N3"}, [{"term": "学校", "level": "N3"}]) == []
    # cấp chung của tài liệu (scope document): quản trị xếp từ dễ hơn / khó hơn 1 cấp → thường; khó hơn ≥ 2 cấp → trái
    assert check_item({"term": "学校", "docLevel": "N5", "docLevelScope": "document"}, [{"term": "学校", "level": "N4"}]) == []
    assert check_item({"term": "学校", "docLevel": "N1", "docLevelScope": "document"}, [{"term": "学校", "level": "N5"}]) == []
    w = _one({"term": "学校", "docLevel": "N5", "docLevelScope": "document"}, [{"term": "学校", "level": "N3", "sourceId": "a"}])
    assert (w["source"], w["reference"]) == ("admin:a", "N3") and "khó hơn 2 cấp" in w["note_vi"]
    # ngữ pháp: tên mẫu khớp bỏ qua dấu 〜
    w = _one({"kind": "grammar", "term": "〜なければならない", "docLevel": "N4"}, [{"term": "なければならない", "level": "N3", "sourceId": "g"}])
    assert (w["field"], w["source"], w["confidence"]) == ("grammar", "admin:g", 0.95)


# ----------------------------------------------------------------------------- lô, thống kê, tiện ích

def test_check_items_filters_by_confidence_and_summarize(no_jm):
    items = [{"term": "学校", "reading": "がくこう", "docLevel": "N3"}, {"term": "橋", "meaningEn": "school"},
             {"term": "映画", "reading": "えいが"}, {"kind": "grammar", "term": "〜なければならない", "docLevel": "N1"}]
    lists = check_items(items, min_confidence=0.6)
    assert [[w["field"] for w in lst] for lst in lists] == [["reading", "level"], [], [], []]
    assert summarize(lists) == {"conflicts": 2, "conflictsByField": {"reading": 1, "furigana": 0, "meaning": 0, "level": 1, "grammar": 0}}
    low = check_items(items, min_confidence=0.5)
    assert [[w["field"] for w in lst] for lst in low] == [["reading", "level"], ["meaning"], [], ["grammar"]]
    assert summarize(low)["conflicts"] == 4
    # thuần / xác định: gọi lại cho cùng kết quả; lô rỗng
    assert check_items(items, min_confidence=0.5) == low
    assert check_items([]) == [] and summarize([]) == {"conflicts": 0, "conflictsByField": {f: 0 for f in conflicts.FIELDS}}


def test_parse_level_and_available():
    assert parse_level("N5") == "N5" and parse_level("n4") == "N4" and parse_level("JLPT Ｎ３") == "N3"
    assert parse_level("学校 (N5) school") == "N5" and parse_level(" N1 ") == "N1"
    assert parse_level("N4-N5") is None and parse_level("N6") is None and parse_level("IN1") is None
    assert parse_level(None) is None and parse_level("school") is None and parse_level("") is None
    assert conflicts.available() is True   # danh sách JLPT đã commit là đủ
