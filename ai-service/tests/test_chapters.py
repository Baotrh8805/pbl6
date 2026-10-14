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


# --- Xếp hạng họ tiêu đề, loại câu văn, quy tắc cấp DOCX ---------------------------------------------------
def test_rank1_wins_over_rank2_sections_stay_in_body():
    text = ("Bài 1: Chào hỏi\nPhần 1: Từ vựng\nこんにちは。\nPhần 2: Ngữ pháp\nさようなら。\n"
            "Bài 2: Mua sắm\nPhần 1: Từ vựng\nいくらですか。")
    chapters, detected = _split(text)
    assert detected
    assert [c.title for c in chapters] == ["Bài 1: Chào hỏi", "Bài 2: Mua sắm"]
    assert "Phần 1: Từ vựng" in chapters[0].text and "Phần 2: Ngữ pháp" in chapters[0].text
    assert "Phần 1: Từ vựng" in chapters[1].text


def test_rank2_fallback_when_no_rank1():
    text = "Phần 1\nあ。\nPhần 2\nい。\nPhần 3\nう。"
    chapters, detected = _split(text)
    assert detected
    assert [c.title for c in chapters] == ["Phần 1", "Phần 2", "Phần 3"]


def test_single_rank1_does_not_fall_back_to_rank2_noise():
    # 1 tiêu đề hạng 1 + 2 tiêu đề hạng 2 → tách theo hạng 2 (hạng 1 chưa đủ 2 lần)
    text = "Bài 1\nPhần 1\nあ。\nPhần 2\nい。"
    chapters, detected = _split(text)
    assert detected
    assert [c.title for c in chapters] == ["Phần 1", "Phần 2"]


def test_section_only_without_rank1():
    text = "Section 2.1 Greetings\nあ。\nSection 2.2 Shopping\nい。"
    chapters, detected = _split(text)
    assert detected and [c.title for c in chapters] == ["Section 2.1 Greetings", "Section 2.2 Shopping"]
    text2 = "Lesson 1\nSection 2.1 Greetings\nあ。\nLesson 2\nSection 2.2 Shopping\nい。"
    chapters2, _ = _split(text2)
    assert [c.title for c in chapters2] == ["Lesson 1", "Lesson 2"]
    assert "Section 2.1 Greetings" in chapters2[0].text


def test_prose_lines_not_headings():
    assert heading_title("第3章では、次のように") is None
    assert heading_title("第2回目の授業で") is None
    assert heading_title("第3章では次のように") is None
    assert heading_title("第1課、あいさつ") is None
    text = "第1課\n第3章では、次のように\nあ。\n第2回目の授業で\n第2課\nい。"
    chapters, _ = _split(text)
    assert [c.title for c in chapters] == ["第1課", "第2課"]


def test_docx_smallest_level_only():
    text = "第1課\n語彙\nあ。\n文法\nい。\n第2課\n語彙\nう。\n文法\nえ。"
    blocks = [{"text": "第1課", "heading": 1}, {"text": "語彙", "heading": 2}, {"text": "あ。", "heading": None},
              {"text": "文法", "heading": 2}, {"text": "い。", "heading": None},
              {"text": "第2課", "heading": 1}, {"text": "語彙", "heading": 2}, {"text": "う。", "heading": None},
              {"text": "文法", "heading": 2}, {"text": "え。", "heading": None}]
    chapters, detected = _split(text, blocks)
    assert detected
    assert [c.title for c in chapters] == ["第1課", "第2課"]
    assert "語彙" in chapters[0].text and "文法" in chapters[1].text


def test_docx_single_h1_uses_h2():
    text = "教科書\n語彙\nあ。\n文法\nい。"
    blocks = [{"text": "教科書", "heading": 1}, {"text": "語彙", "heading": 2}, {"text": "あ。", "heading": None},
              {"text": "文法", "heading": 2}, {"text": "い。", "heading": None}]
    chapters, detected = _split(text, blocks)
    assert detected
    assert [c.title for c in chapters] == ["Mở đầu", "語彙", "文法"]  # H1 chỉ 1 lần → dùng H2; "教科書" thành mở đầu
