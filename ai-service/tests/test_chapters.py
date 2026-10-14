from app.extract.chapters import heading_title, split_chapters


def _split(text, blocks=None):
    return split_chapters(text, blocks)


def test_heading_title_patterns():
    for line in ["第1課", "第２章 かいもの", "第三課", "Lesson 3 Greetings", "Bài 1: Chào hỏi", "Unit 2"]:
        assert heading_title(line) == line
    assert heading_title("Chapter 12 - Food") == "Chapter 12 - Food"


def test_not_headings():
    assert heading_title("第1課で勉強します。") is None
    assert heading_title("1.") is None
    assert heading_title("１．") is None
    assert heading_title("こんにちは") is None


def test_single_heading_not_detected():
    text = "第1課\nこんにちは。\nさようなら。"
    chapters, detected = _split(text)
    assert detected is False
    assert len(chapters) == 1
    assert chapters[0].text == text
    assert chapters[0].title is None
    assert (chapters[0].start_line, chapters[0].end_line) == (0, 3)


def test_split_basic_and_heading_removed():
    text = "第1課 あいさつ\nこんにちは。\n第2課 かいもの\nこれはいくらですか。\nたかいです。"
    chapters, detected = _split(text)
    assert detected is True
    assert [c.index for c in chapters] == [1, 2]
    assert chapters[0].title == "第1課 あいさつ"
    assert chapters[0].text == "こんにちは。"
    assert chapters[1].text == "これはいくらですか。\nたかいです。"
    assert all("第" not in c.text for c in chapters)
    assert (chapters[1].start_line, chapters[1].end_line) == (2, 5)


def test_preamble_japanese_becomes_intro_chapter():
    text = "はじめに、この本は。\n第1課\nあ。\n第2課\nい。"
    chapters, detected = _split(text)
    assert detected
    assert [c.title for c in chapters] == ["Mở đầu", "第1課", "第2課"]
    assert [c.index for c in chapters] == [1, 2, 3]
    assert chapters[0].text == "はじめに、この本は。"
    assert (chapters[0].start_line, chapters[0].end_line) == (0, 1)


def test_preamble_without_japanese_merged():
    text = "Intro words\n第1課\nあ。\n第2課\nい。"
    chapters, _ = _split(text)
    assert [c.index for c in chapters] == [1, 2]
    assert chapters[0].text == "Intro words\nあ。"
    assert chapters[0].start_line == 0


def test_docx_heading_blocks():
    text = "あいさつ\nこんにちは。\nかいもの\nいくら。"
    blocks = [{"text": "あいさつ", "heading": 1}, {"text": "こんにちは。", "heading": None},
              {"text": "かいもの", "heading": 1}, {"text": "いくら。", "heading": None}]
    chapters, detected = _split(text, blocks)
    assert detected
    assert [c.title for c in chapters] == ["あいさつ", "かいもの"]


def test_blocks_robust():
    text = "あ。\nい。"
    assert _split(text, None)[1] is False
    assert _split(text, [{"text": "あ。"}])[1] is False


def test_too_long_line_not_heading():
    assert heading_title("第1課 " + "あ" * 80) is None
    assert heading_title("第1課 " + "あ" * 50) is not None
