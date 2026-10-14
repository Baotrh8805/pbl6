from app.extract.furigana import align, apply_rubies, reading_from_rubies


def test_two_kanji_split():
    assert align("勉強", "べんきょう") == [{"kanji": "勉", "kana": "べん"}, {"kanji": "強", "kana": "きょう"}]


def test_okurigana_is_own_segment():
    assert align("食べる", "たべる") == [{"kanji": "食", "kana": "た"}, {"kanji": "べる", "kana": "べる"}]


def test_ateji_single_segment():
    assert align("大人", "おとな") == [{"kanji": "大人", "kana": "おとな"}]


def test_mixed_runs():
    assert align("取り扱い", "とりあつかい") == [
        {"kanji": "取", "kana": "と"},
        {"kanji": "り", "kana": "り"},
        {"kanji": "扱", "kana": "あつか"},
        {"kanji": "い", "kana": "い"},
    ]


def test_sokuon_and_rendaku():
    assert align("学校", "がっこう") == [{"kanji": "学", "kana": "がっ"}, {"kanji": "校", "kana": "こう"}]
    assert align("人々", "ひとびと") == [{"kanji": "人", "kana": "ひと"}, {"kanji": "々", "kana": "びと"}]


def test_katakana_reading_accepted():
    assert align("勉強", "ベンキョウ") == [{"kanji": "勉", "kana": "べん"}, {"kanji": "強", "kana": "きょう"}]


def test_no_kanji_returns_none():
    assert align("とても", "とても") is None
    assert align("勉強", None) is None


def test_unalignable_falls_back_to_single_segment():
    assert align("食べる", "のむ") == [{"kanji": "食べる", "kana": "のむ"}]


def test_source_rubies_preferred():
    rubies = [{"base": "漢字", "reading": "かんじ"}]
    assert reading_from_rubies("漢字", rubies) == "かんじ"
    assert apply_rubies("漢字", rubies) == [{"kanji": "漢", "kana": "かん"}, {"kanji": "字", "kana": "じ"}]
    assert apply_rubies("勉強", rubies) is None
