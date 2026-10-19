from app.extract.furigana import align, apply_rubies, reading_from_rubies, ruby_segments, swap_okurigana


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


def test_swap_okurigana_both_directions():
    # dạng chia → dạng từ điển: giữ cách đọc gốc trong câu, chỉ đổi đuôi kana
    assert swap_okurigana("開い", "あい", "開く") == "あく"
    assert swap_okurigana("辛かっ", "ツラカッ", "辛い") == "つらい"
    assert swap_okurigana("教え", "おしえ", "教える") == "おしえる"
    assert swap_okurigana("取り扱っ", "とりあつかっ", "取り扱う") == "とりあつかう"
    # dạng từ điển → dạng chia (câu ví dụ)
    assert swap_okurigana("辛い", "からい", "辛かっ") == "からかっ"


def test_swap_okurigana_refuses_different_stems():
    assert swap_okurigana("云っ", "いっ", "言う") is None            # gốc khác chữ
    assert swap_okurigana("開店", "かいてん", "開く") is None         # phần khác nhau có kanji
    assert swap_okurigana("開い", "ひらき", "開く") is None           # reading không kết thúc bằng đuôi surface
    assert swap_okurigana("開い", None, "開く") is None and swap_okurigana("", "あ", "開く") is None


def test_ruby_segments_run_level():
    assert ruby_segments("学校", "がっこう") == [{"text": "学校", "reading": "がっこう"}]
    assert ruby_segments("行き", "いき") == [{"text": "行", "reading": "い"}, {"text": "き", "reading": None}]
    assert ruby_segments("取り扱い", "とりあつかい") == [
        {"text": "取", "reading": "と"}, {"text": "り", "reading": None},
        {"text": "扱", "reading": "あつか"}, {"text": "い", "reading": None},
    ]
    assert ruby_segments("へ", "へ") == [{"text": "へ", "reading": None}]
    assert ruby_segments("覆公", "覆公") == [{"text": "覆公", "reading": None}]   # Sudachi OOV: reading = surface
    assert ruby_segments("食べる", "のむ") == [{"text": "食べる", "reading": "のむ"}]
    assert ruby_segments("", "x") == []


def test_literal_small_kana_okurigana_is_plain_text():
    # っ VIẾT RA trong surface là okurigana (促音便 待っ / 行っ, 引っ越し): kanji không được nuốt nó, furigana chỉ trên kanji
    assert ruby_segments("行っ", "いっ") == [{"text": "行", "reading": "い"}, {"text": "っ", "reading": None}]
    assert ruby_segments("待っ", "まっ") == [{"text": "待", "reading": "ま"}, {"text": "っ", "reading": None}]
    assert align("引っ越し", "ひっこし") == [
        {"kanji": "引", "kana": "ひ"}, {"kanji": "っ", "kana": "っ"},
        {"kanji": "越", "kana": "こ"}, {"kanji": "し", "kana": "し"},
    ]
    assert ruby_segments("受け取っ", "うけとっ")[2:] == [{"text": "取", "reading": "と"}, {"text": "っ", "reading": None}]
    # っ chỉ có trong reading (thuộc mora của kanji trước) → không đổi
    assert align("学校", "がっこう") == [{"kanji": "学", "kana": "がっ"}, {"kanji": "校", "kana": "こう"}]
    assert align("切手", "きって") == [{"kanji": "切", "kana": "きっ"}, {"kanji": "手", "kana": "て"}]
