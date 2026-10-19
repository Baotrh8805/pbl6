"""kanji_cards trên bảng Unihan / JLPT tí hon và JMdict giả; furigana.align chạy thật (nó tra kanji_readings đã trỏ
sang fixture). Một test cuối skipif chạy trên dữ liệu đã commit: 学 → on がく có 学校, kun まなぶ có 学ぶ."""
import pytest

from app.extract import han_viet, han_viet_graph, jmdict, kanji_cards, kanji_readings, kanjidata
from app.extract.jlpt import classifier

VIET_CSV = "char,reading\n日,nhật\n学,học\n生,sinh\n校,hiệu\n曜,diệu\n毎,mỗi\n本,bản\n五,ngũ\n大,đại\n"
# ジツ đứng trước ニチ để thấy cách đọc có ví dụ được xếp lên trước dù Unihan liệt kê sau; 大: おお trước おおきい như Unihan
JA_CSV = ("char,readings\n日,ジツ ニチ ひ か\n学,ガク カク まなぶ おしえる\n生,セイ ショウ いきる いかす うまれる はえる はやす なま\n"
          "校,コウ\n曜,ヨウ\n毎,マイ\n本,ホン もと\n五,ゴ いつ\n大,ダイ おお おおきい\n勢,セイ ゼイ いきおい\n科,カ\n問,モン\n"
          "物,ブツ もの\n")
RS_CSV = "char,radical_no,residual_strokes,total_strokes\n日,72,0,4\n学,39,5,8\n生,100,0,5\n"
JLPT = {
    "学": [("学校", "がっこう", "school", "N5"), ("学生", "がくせい", "student", "N5"), ("大学", "だいがく", "university", "N5"),
          ("学ぶ", "まなぶ", "to learn", "N3"), ("科学", "かがく", "science", "N3"), ("学問", "がくもん", "learning", "N2")],
    "日": [("日", "ひ", "day", "N5"), ("日曜日", "にちようび", "Sunday", "N5"), ("毎日", "まいにち", "every day", "N5"),
          ("五日", "いつか", "5th day", "N5"), ("日本", "にほん", "Japan", "N3"), ("大人", "おとな", "adult", "N5")],
    "生": [("生きる", "いきる", "to live", "N4"), ("生かす", "いかす", "to make use of", "N3"), ("生える", "はえる", "to grow", "N3"),
          ("生やす", "はやす", "to grow (hair)", "N3"), ("生き物", "いきもの", "living thing", "N3"),
          ("生まれる", "うまれる", "to be born", "N5"), ("生る", "なる", "to bear fruit", "N1"), ("生", "なま", "raw", "N4")],
    "大": [("大学", "だいがく", "university", "N5"), ("大きい", "おおきい", "big", "N5"), ("大勢", "おおぜい", "crowd", "N4")],
}
JMDICT = {"学": {"kanji": "学", "kana": "がく", "gloss": "learning, scholarship", "common": True, "jlpt": None},
          "生": {"kanji": "生まれ", "kana": "うまれ", "gloss": "birth", "common": True, "jlpt": None}}  # kanji ≠ chữ → bỏ
MEANING_HINT = {"日": "sun, sunshine, day"}
# tần suất giả (zipf) thay wordfreq, cố ý khác thứ tự CSV (大学 > 学生; 毎日 > 日曜日) để thấy ví dụ cùng cấp xếp theo độ thông dụng
FREQ = {"学校": 5.3, "大学": 5.2, "学生": 5.0, "科学": 5.0, "学ぶ": 4.5, "学問": 3.9,
        "日": 6.4, "日本": 6.0, "毎日": 5.1, "日曜日": 4.4, "大人": 5.0,
        "生まれる": 5.0, "生きる": 4.9, "生き物": 4.2, "生かす": 4.0, "生える": 3.5, "生やす": 3.0}


@pytest.fixture
def data(tmp_path, monkeypatch):
    (tmp_path / "viet.csv").write_text(VIET_CSV, encoding="utf-8")
    (tmp_path / "ja.csv").write_text(JA_CSV, encoding="utf-8")
    (tmp_path / "rs.csv").write_text(RS_CSV, encoding="utf-8")
    monkeypatch.setattr(han_viet, "DATA_FILE", tmp_path / "viet.csv")
    monkeypatch.setattr(han_viet, "OVERRIDE_FILE", tmp_path / "missing.csv")
    monkeypatch.setattr(han_viet, "_table", None)
    monkeypatch.setattr(kanji_readings, "DATA_FILE", tmp_path / "ja.csv")
    monkeypatch.setattr(kanji_readings, "_table", None)
    monkeypatch.setattr(kanji_readings, "_raw_table", None)
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "rs.csv")
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: list(JLPT.get(ch, [])))
    monkeypatch.setattr(classifier, "meaning_hint", lambda lemma, reading=None: MEANING_HINT.get(lemma))
    monkeypatch.setattr(jmdict, "lookup", lambda lemma, reading=None: JMDICT.get(lemma))
    monkeypatch.setattr(han_viet_graph, "word_frequency", lambda term: FREQ.get(term, 0.0))
    kanjidata.reset()
    yield tmp_path
    kanjidata.reset()


def _ex(card, kind, reading):
    item = next(r for r in card[kind] if r["reading"] == reading)
    return [e["term"] for e in item["examples"]]


# ----------------------------------------------------------------------------- thẻ đầy đủ

def test_card_structure_and_examples_easiest_first(data):
    (c,) = kanji_cards.cards(["学"])
    assert c["kanji"] == "学" and c["hanViet"] == "HỌC" and c["strokeCount"] == 8
    assert c["radical"] == {"no": 39, "strokes": 3}          # 8 nét tổng − 5 nét ngoài bộ 子
    assert c["meaningEn"] == "learning, scholarship"          # JMdict có entry đúng chữ
    # on ガク: 3 ví dụ dễ nhất (N5), cùng cấp thì thông dụng trước (大学 5.2 > 学生 5.0 dù CSV ghi 学生 trước) —
    # 科学 N3 / 学問 N2 bị cắt; カク không ví dụ xếp sau
    assert [r["reading"] for r in c["on"]] == ["ガク", "カク"]
    assert c["on"][0]["examples"] == [
        {"term": "学校", "reading": "がっこう", "meaning": "school", "level": "N5"},   # がっ ~ がく (促音) khớp lỏng
        {"term": "大学", "reading": "だいがく", "meaning": "university", "level": "N5"},
        {"term": "学生", "reading": "がくせい", "meaning": "student", "level": "N5"},
    ]
    assert c["on"][1]["examples"] == []


def test_examples_without_frequency_keep_jlpt_csv_order(data, monkeypatch):
    # không có wordfreq (mọi từ 0) → cùng cấp giữ nguyên thứ tự CSV JLPT (sort ổn định)
    monkeypatch.setattr(han_viet_graph, "word_frequency", lambda term: 0.0)
    (c,) = kanji_cards.cards(["学"])
    assert _ex(c, "on", "ガク") == ["学校", "学生", "大学"]
    assert c["kun"] == [{"reading": "まなぶ", "okurigana": "", "examples": [
                            {"term": "学ぶ", "reading": "まなぶ", "meaning": "to learn", "level": "N3"}]},
                        {"reading": "おしえる", "okurigana": "", "examples": []}]


def test_card_on_kun_assignment_rendaku_truncation_and_order(data):
    (c,) = kanji_cards.cards(["日"])
    # ニチ có ví dụ nên lên trước ジツ dù Unihan ghi ジツ trước; 日本 (に) là rút gọn của にち; 大人 ateji → không gán
    assert [r["reading"] for r in c["on"]] == ["ニチ", "ジツ"]
    assert _ex(c, "on", "ニチ") == ["毎日", "日曜日", "日本"]   # N5 thông dụng trước (毎日 > 日曜日), rồi N3
    assert _ex(c, "on", "ジツ") == []
    assert _ex(c, "kun", "ひ") == ["日", "日曜日"]     # 日曜日 có 日 thứ hai đọc び (rendaku của ひ)
    assert _ex(c, "kun", "か") == ["五日"]
    assert c["meaningEn"] == "sun, sunshine, day"      # JMdict không có → cột meaning JLPT
    assert c["radical"] == {"no": 72, "strokes": 4} and c["strokeCount"] == 4
    all_terms = [e["term"] for r in c["on"] + c["kun"] for e in r["examples"]]
    assert "大人" not in all_terms


def test_card_kun_picks_reading_matching_following_okurigana(data):
    (c,) = kanji_cards.cards(["生"])
    # đoạn một âm tiết (は / い) chọn kun theo kana đứng sau: 生やす → はやす chứ không phải はえる đứng trước
    assert _ex(c, "kun", "はやす") == ["生やす"] and _ex(c, "kun", "はえる") == ["生える"]
    assert _ex(c, "kun", "いかす") == ["生かす"]
    assert _ex(c, "kun", "いきる") == ["生きる", "生き物"]   # okurigana rút gọn trong từ ghép vẫn về いきる
    assert _ex(c, "kun", "うまれる") == ["生まれる"]
    assert c["meaningEn"] is None                        # entry JMdict trả về kanji khác (生まれ) → không nhận
    assert c["hanViet"] == "SINH" and c["radical"] == {"no": 100, "strokes": 5}


def test_card_kun_checks_okurigana_and_prefers_the_longest_matching_reading(data):
    (c,) = kanji_cards.cards(["生"])
    # 生る = な + る: なま đọc tiếp là ま chứ không phải る → không gán cho なま (trước đây gán vì chỉ so tiền tố 1 kana);
    # không có cách đọc nào khớp → bỏ từ, không bịa
    assert _ex(c, "kun", "なま") == ["生"]
    assert all("生る" not in [e["term"] for e in r["examples"]] for kind in ("on", "kun") for r in c[kind])
    (c,) = kanji_cards.cards(["大"])
    # 大きい: cả おお lẫn おおきい đều là tiền tố của おおきい → lấy cách đọc dài nhất (đúng mục Unihan おお.きい),
    # 大勢 (おお + ぜい) vẫn về おお
    assert _ex(c, "kun", "おおきい") == ["大きい"] and _ex(c, "kun", "おお") == ["大勢"]
    assert _ex(c, "on", "ダイ") == ["大学"]
    # okurigana chia (đuôi る → り): vẫn nhận, như 入り口 → 入る
    assert kanji_cards._match("い", "り", [], [{"reading": "いる", "hiragana": "いる", "okurigana": ""}]) == ("kun", 0)
    assert kanji_cards._match("あ", "け", [], [{"reading": "あかり", "hiragana": "あかり", "okurigana": ""},
                                              {"reading": "あける", "hiragana": "あける", "okurigana": ""}]) == ("kun", 1)
    assert kanji_cards._match("つだ", "う", [], [{"reading": "つたわる", "hiragana": "つたわる", "okurigana": ""},
                                                {"reading": "つたう", "hiragana": "つたう", "okurigana": ""}]) == ("kun", 1)
    assert kanji_cards._match("おそ", "らく", [], [{"reading": "おそれる", "hiragana": "おそれる", "okurigana": ""}]) is None


def test_user_level_prefers_current_level_then_easier_then_harder(data):
    (c,) = kanji_cards.cards(["学"], "N3")
    assert _ex(c, "on", "ガク") == ["科学", "学校", "大学"]   # N3 đúng cấp → N5 dễ hơn (thông dụng trước) → (N2 khó hơn bị cắt)
    (c,) = kanji_cards.cards(["学"], "N2")
    assert _ex(c, "on", "ガク") == ["学問", "学校", "大学"]
    (c,) = kanji_cards.cards(["学"], "N1")                      # không từ nào đúng cấp → dễ → khó như mặc định
    assert _ex(c, "on", "ガク") == ["学校", "大学", "学生"]
    (c,) = kanji_cards.cards(["学"], "N9")                      # cấp lạ ở tầng module → như None (router chặn 400)
    assert _ex(c, "on", "ガク") == ["学校", "大学", "学生"]


def test_cards_skip_non_kanji_dedupe_and_keep_order(data):
    got = kanji_cards.cards(["あ", "学校", "々", "", " 日 ", "学", "学", "日"])
    assert [c["kanji"] for c in got] == ["日", "学"]
    assert kanji_cards.cards([]) == []


def test_card_without_any_data_is_all_empty(data):
    (c,) = kanji_cards.cards(["龘"])
    assert c == {"kanji": "龘", "hanViet": None, "radical": None, "on": [], "kun": [], "meaningEn": None, "strokeCount": None}


def test_available_flags(data, tmp_path, monkeypatch):
    assert kanji_cards.available()
    monkeypatch.setattr(kanji_readings, "DATA_FILE", tmp_path / "missing.csv")
    monkeypatch.setattr(kanji_readings, "_raw_table", None)
    monkeypatch.setattr(classifier, "available", lambda: False)
    assert not kanji_cards.available()


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(not (kanji_readings.DATA_FILE.exists() and (classifier.DATA_DIR / "n5.csv").exists()),
                                reason="chưa có unihan_japanese.csv / jlpt/n5.csv (python scripts/build_dicts.py)")


@needs_real
def test_real_data_gaku():
    (c,) = kanji_cards.cards(["学"])
    assert c["hanViet"] == "HỌC" and c["strokeCount"] == 8 and c["radical"]["no"] == 39
    assert c["on"][0]["reading"] == "ガク" and "学校" in _ex(c, "on", "ガク")
    assert "学ぶ" in _ex(c, "kun", "まなぶ")
    assert all(len(r["examples"]) <= kanji_cards.MAX_EXAMPLES for r in c["on"] + c["kun"])
    assert c["meaningEn"]
    # 生る (なる) không phải cách đọc なま; 大きい phải nằm dưới おおきい (Unihan おお.きい) chứ không phải おお
    (sei,) = kanji_cards.cards(["生"])
    assert "生る" not in _ex(sei, "kun", "なま")
    (dai,) = kanji_cards.cards(["大"])
    assert "大きい" in _ex(dai, "kun", "おおきい") and "大きい" not in _ex(dai, "kun", "おお")
