"""distractors.build + các hàm tra cứu mới của jmdict / classifier.

JMdict: sqlite tí hon dựng trong tmp_path theo đúng schema của build_dicts (không cần jmdict.sqlite thật).
JLPT: CSV đã commit nên tra thẳng cho các hàm classifier; build() thì giả lập để không lệ thuộc nội dung CSV.
"""
import sqlite3

import pytest

from app.extract import distractors, jmdict, kanjidata, kanji_similar
from app.extract.jlpt import classifier

ROWS = [  # kanji, kana, gloss, common — như scripts/build_dicts.py sinh ra
    ("橋", "はし", "bridge", 1),
    ("箸", "はし", "chopsticks", 1),
    ("端", "はし", "end (e.g. of street), tip; beginning, start", 1),
    ("嘴", "はし", "beak, bill", 0),
    ("觜", "はし", "beak, bill", 0),
    ("迚も", "とても", "very, awfully; (not) at all, by no means", 1),
    (None, "とても", "very, awfully; (not) at all, by no means", 1),
    ("行く", "いく", "to go", 1),
    ("行く", "ゆく", "to go", 0),
    ("待つ", "まつ", "to wait, to await", 1),   # dài hơn mục JLPT "to wait" để không bị loại vì gloss y hệt
    ("松", "まつ", "pine tree", 1),
    ("末", "まつ", "the end of", 0),
    ("コーヒー", "コーヒー", "coffee", 1),
    ("珈琲", "コーヒー", "coffee", 0),
    ("帰る", "かえる", "to return, to go home", 1),
    ("返る", "かえる", "to return, to come back", 1),   # gần nghĩa 帰る → không được làm đáp án sai
    ("変える", "かえる", "to change", 1),
]


@pytest.fixture
def jm(tmp_path, monkeypatch):
    path = tmp_path / "jmdict.sqlite"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT)")
    con.execute("CREATE INDEX idx_entries_kanji_kana ON entries(kanji, kana)")
    con.execute("CREATE INDEX idx_entries_kana ON entries(kana)")
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


# ----------------------------------------------------------------------------- jmdict.homophones / readings_of

def test_jmdict_homophones_orders_common_first_then_kanji(jm):
    got = jmdict.homophones("はし", "橋")
    # common DESC rồi mã kanji (UTF-8): 端 < 箸 trong nhóm phổ biến, 嘴 < 觜 trong nhóm còn lại; không có chính 橋
    assert got == [("端", "end (e.g. of street), tip; beginning, start", True), ("箸", "chopsticks", True),
                   ("嘴", "beak, bill", False), ("觜", "beak, bill", False)]
    assert jmdict.homophones("ハシ", "橋") == got                      # katakana (Sudachi) cũng tra được
    assert [k for k, _, _ in jmdict.homophones("はし", None)][:3] == ["橋", "端", "箸"]
    assert len(jmdict.homophones("はし", "橋", limit=2)) == 2
    assert jmdict.homophones("まつ", "待つ") == [("松", "pine tree", True), ("末", "the end of", False)]
    assert jmdict.homophones("こーひー", "コーヒー") == [("珈琲", "coffee", False)]
    assert jmdict.homophones("", "橋") == [] and jmdict.homophones("ぞんざい", None) == []


def test_jmdict_readings_of(jm):
    assert jmdict.readings_of("行く") == ["いく", "ゆく"]
    assert jmdict.readings_of("橋") == ["はし"]
    assert jmdict.readings_of("無") == [] and jmdict.readings_of("") == []


def test_jmdict_functions_without_sqlite(no_jm):
    assert not jmdict.available()
    assert jmdict.homophones("はし", "橋") == []
    assert jmdict.readings_of("橋") == []


# ----------------------------------------------------------------------------- classifier: chỉ mục JLPT (CSV đã commit)

def test_classifier_homophones_jlpt_from_committed_csv():
    got = classifier.homophones_jlpt("はし")
    assert got[:2] == [("橋", "bridge", "N5"), ("箸", "chopsticks", "N5")]
    assert ("端", "end (e.g., of street), edge, margin", "N3") in got
    assert classifier.homophones_jlpt("ハシ") == got
    assert classifier.homophones_jlpt("ぞんざいしない") == [] and classifier.homophones_jlpt(None) == []


def test_classifier_entries_index_from_committed_csv():
    assert classifier.entries_of("待つ") == [("まつ", "to wait", "N5")]
    assert classifier.entries_of("～待つ") == classifier.entries_of("待つ")
    assert classifier.entries_of("逝得") == []
    containing = classifier.entries_containing("待")
    assert ("待つ", "まつ", "to wait", "N5") in containing
    assert [e[3] for e in containing] == sorted((e[3] for e in containing), key=classifier.level_index)
    kanji = classifier.jlpt_kanji_set()
    assert {"待", "持", "橋"} <= kanji and "あ" not in kanji and len(kanji) > 1500


# ----------------------------------------------------------------------------- distractors.build: đồng âm

JLPT_HOMOPHONES = {
    "はし": [("橋", "bridge", "N5"), ("箸", "chopsticks", "N5"), ("端", "end (e.g., of street), edge, margin", "N3")],
    "まつ": [("待つ", "to wait", "N5"), ("松", "pine tree", "N3")],
    "かえる": [("帰る", "to go back, to return", "N5"), ("変える", "to change", "N4")],
}
JLPT_ENTRIES = {
    "橋": [("はし", "bridge", "N5")],
    "とても": [("とても", "very (much), greatly, exceedingly", "N5")],
    "待つ": [("まつ", "to wait", "N5")],
    "持つ": [("もつ", "to hold, to carry; to possess", "N5")],
    "帰る": [("かえる", "to go back, to return", "N5")],
}


@pytest.fixture
def jlpt_fake(monkeypatch):
    monkeypatch.setattr(classifier, "homophones_jlpt", lambda r: JLPT_HOMOPHONES.get(r or "", []))
    monkeypatch.setattr(classifier, "entries_of", lambda e: JLPT_ENTRIES.get(e, []))
    monkeypatch.setattr(classifier, "classify", lambda lemma, reading, kana_only: (None, 0.0, []))
    # chưa có kradfile → không có kanji giống hình trong các test đồng âm
    monkeypatch.setattr(kanji_similar, "lookalike_terms", lambda *a, **kw: [])


def test_build_homophones_prefers_jlpt_then_jmdict_and_filters_meaning(jm, jlpt_fake):
    [row] = distractors.build([{"ref": "1", "term": "橋", "reading": "はし", "meaning": "bridge", "level": "N5"}])
    assert row["ref"] == "1" and row["kanjiLookalike"] == []
    assert row["homophones"] == [
        {"term": "箸", "reading": "はし", "meaning": "chopsticks", "level": "N5", "confidence": 0.9},
        {"term": "端", "reading": "はし", "meaning": "end (e.g., of street), edge, margin", "level": "N3", "confidence": 0.9},
    ]  # 嘴/觜 (JMdict không phổ biến, 0.55) dưới ngưỡng 0.6
    [row] = distractors.build([{"ref": "1", "term": "橋", "reading": "はし"}], min_confidence=0.5, k=5)
    # không truyền nghĩa → tự tra; 嘴 vào (0.55), 觜 bị loại vì trùng nghĩa với 嘴 đã giữ
    assert [c["term"] for c in row["homophones"]] == ["箸", "端", "嘴"]
    assert row["homophones"][2] == {"term": "嘴", "reading": "はし", "meaning": "beak, bill", "level": None, "confidence": 0.55}


def test_build_kana_only_term_excludes_its_own_kanji_spelling(jm, jlpt_fake):
    [row] = distractors.build([{"ref": "k", "term": "とても"}])
    # 迚も là dạng kanji của chính とても (cùng entry JMdict, gloss y hệt) → không phải đồng âm; toàn kana → không giống hình
    assert row == {"ref": "k", "kanjiLookalike": [], "homophones": []}


def test_build_reading_resolution_and_k_cap(jm, jlpt_fake):
    rows = distractors.build([
        {"ref": "a", "term": "待つ"},                         # không có cách đọc → tra JLPT (まつ)
        {"ref": "b", "term": "待つ", "reading": "マツ"},       # katakana → hiragana
        {"ref": "c", "term": "待つ", "reading": "まつ", "level": "N5"},
    ], k=1)
    for row in rows:
        assert [c["term"] for c in row["homophones"]] == ["松"]   # JLPT 0.9 trước 末 (JMdict, 0.55); cap k=1
        assert row["homophones"][0]["reading"] == "まつ"
    [row] = distractors.build([{"ref": "d", "term": "待つ", "reading": "まつ"}], min_confidence=0.5, k=5)
    assert [(c["term"], c["confidence"]) for c in row["homophones"]] == [("松", 0.9), ("末", 0.55)]


def test_build_supplied_meaning_supplements_dictionary_gloss(jm, jlpt_fake):
    """Backend gửi cột meaning của thẻ (thường tiếng Việt): bộ lọc nghĩa vẫn so với gloss EN từ điển của chính từ →
    返る "to return, to come back" (gần nghĩa 帰る) không bao giờ thành đáp án sai; 変える vẫn là đồng âm hợp lệ."""
    for meaning in (None, "to go home", "trở về, về nhà"):
        [row] = distractors.build([{"ref": "1", "term": "帰る", "reading": "かえる", "meaning": meaning}], k=5)
        assert [(c["term"], c["confidence"]) for c in row["homophones"]] == [("変える", 0.9)], meaning
    # nghĩa truyền vào vẫn có tác dụng BỔ SUNG: tự nói 帰る nghĩa là "to change" thì 変える cũng bị loại
    [row] = distractors.build([{"ref": "1", "term": "帰る", "reading": "かえる", "meaning": "to change"}], k=5)
    assert row["homophones"] == []


def test_build_bare_kanji_card_does_not_get_its_own_okurigana_form(jm, jlpt_fake):
    """Thẻ chỉ ghi 待 (đọc まつ): word_entry không tra được nên bộ lọc nghĩa im lặng; 待つ là chính từ đó viết đủ
    okurigana, không phải đồng âm → loại theo hình thái; 松 / 末 vẫn giữ."""
    [row] = distractors.build([{"ref": "1", "term": "待", "reading": "まつ"}], min_confidence=0.5, k=5)
    assert [(c["term"], c["confidence"]) for c in row["homophones"]] == [("松", 0.9), ("末", 0.55)]
    assert distractors._okurigana_variant("待つ", "待") and distractors._okurigana_variant("休", "休む")
    assert not distractors._okurigana_variant("待つ", "待つ") and not distractors._okurigana_variant("待", "松")
    assert not distractors._okurigana_variant("はし", "はしる")   # không có chữ Hán → không kết luận


def test_build_kinds_filter(jm, jlpt_fake):
    [row] = distractors.build([{"ref": "1", "term": "橋", "reading": "はし", "meaning": "bridge"}], kinds=("kanji_lookalike",))
    assert row["homophones"] == [] and row["kanjiLookalike"] == []
    [row] = distractors.build([{"ref": "1", "term": "橋", "reading": "はし", "meaning": "bridge"}], kinds=())
    assert row == {"ref": "1", "kanjiLookalike": [], "homophones": []}
    assert distractors.build([]) == []
    assert distractors.build([{"ref": "e", "term": "  "}]) == [{"ref": "e", "kanjiLookalike": [], "homophones": []}]


# ----------------------------------------------------------------------------- distractors.build: kanji giống hình

@pytest.fixture
def kdata(tmp_path, monkeypatch):
    (tmp_path / "unihan_rs.csv").write_text(
        "char,radical_no,residual_strokes,total_strokes\n待,60,6,9\n持,64,6,9\n特,93,6,10\n侍,9,6,8\n", encoding="utf-8")
    (tmp_path / "kradfile.csv").write_text(
        "kanji,components\n待,彳 土 寸 寺\n持,扌 土 寸 寺\n特,牛 土 寸 寺\n侍,亻 土 寸 寺\n", encoding="utf-8")
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "unihan_rs.csv")
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "kradfile.csv")
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset("待持特侍"))
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: [])
    monkeypatch.setattr(classifier, "entries_of", lambda e: JLPT_ENTRIES.get(e, []))
    monkeypatch.setattr(classifier, "homophones_jlpt", lambda r: [])
    monkeypatch.setattr(classifier, "classify", lambda lemma, reading, kana_only: (None, 0.0, []))
    kanjidata.reset()
    kanji_similar.reset()
    yield
    kanjidata.reset()
    kanji_similar.reset()


def test_build_lookalikes_with_confidence_filter(no_jm, kdata):
    item = {"ref": "w", "term": "待つ", "reading": "まつ", "level": "N5"}
    [row] = distractors.build([item])
    assert row["homophones"] == []   # không JMdict, JLPT giả không có đồng âm
    assert row["kanjiLookalike"] == [{"term": "持つ", "reading": "もつ", "meaning": "to hold, to carry; to possess",
                                      "level": "N5", "confidence": pytest.approx(0.785, abs=1e-3)}]
    [row] = distractors.build([item], min_confidence=0.8)
    assert row["kanjiLookalike"] == []
    [row] = distractors.build([item], kinds=("homophone",))
    assert row["kanjiLookalike"] == []


def test_build_without_any_data_is_silent(no_jm, tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "missing")
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "missing")
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset())
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: [])
    monkeypatch.setattr(classifier, "entries_of", lambda e: [])
    monkeypatch.setattr(classifier, "homophones_jlpt", lambda r: [])
    monkeypatch.setattr(classifier, "available", lambda: False)
    kanjidata.reset()
    kanji_similar.reset()
    try:
        assert not distractors.available()
        rows = distractors.build([{"ref": "1", "term": "橋", "reading": "はし"}, {"ref": "2", "term": "待つ"},
                                  {"ref": "3", "term": "とても"}])
        assert rows == [{"ref": r, "kanjiLookalike": [], "homophones": []} for r in ("1", "2", "3")]
    finally:
        kanjidata.reset()
        kanji_similar.reset()


def test_available_when_either_source_present(jm, monkeypatch):
    monkeypatch.setattr(classifier, "available", lambda: False)
    assert distractors.available()   # chỉ JMdict


# ----------------------------------------------------------------------------- kiểm tra tuỳ chọn trên dữ liệu thật

needs_real = pytest.mark.skipif(not (jmdict.DATA_FILE.exists() and kanjidata.RS_FILE.exists()),
                                reason="cần jmdict.sqlite + unihan_rs.csv thật (scripts/build_dicts.py)")


@needs_real
def test_real_data_sanity():
    rows = distractors.build([{"ref": "1", "term": "橋", "reading": "はし", "meaning": "bridge", "level": "N5"},
                              {"ref": "2", "term": "機会", "reading": "きかい", "level": "N4"}])
    assert {c["term"] for c in rows[0]["homophones"]} >= {"箸", "端"}
    assert "橋" not in {c["term"] for c in rows[0]["homophones"]}
    assert {c["term"] for c in rows[1]["homophones"]} >= {"機械"}
    for row in rows:
        for c in row["homophones"] + row["kanjiLookalike"]:
            assert set(c) == {"term", "reading", "meaning", "level", "confidence"} and 0 < c["confidence"] <= 1
