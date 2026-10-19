import time

import pytest

import app.extract.chapters as chapters
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


# --- Bỏ phần đầu/cuối sách, mục lục, tiêu đề lặp -------------------------------------------------------------------

from app.extract.chapters import split_chapters_ex


def test_toc_cluster_and_front_matter_dropped():
    text = (
        "みんなの日本語\n目次\n第1課 あいさつ ...... 1\n第2課 買い物 ...... 5\n第3課 週末 ...... 9\n\n"
        "はじめに\nこの本は日本語を学ぶ人のための教科書です。\n本書の使い方\n毎日一課ずつ勉強してください。\n\n"
        "第1課 あいさつ\nこんにちは。\n第2課 買い物\nこれはいくらですか。\n第3課 週末\n映画を見ます。"
    )
    r = split_chapters_ex(text, None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 買い物", "第3課 週末"]
    assert r.chapters[0].text == "こんにちは。"
    assert all("この本は" not in c.text and "目次" not in c.text for c in r.chapters)
    assert "目次" in r.skipped and "はじめに" in r.skipped and "本書の使い方" in r.skipped


def test_running_page_header_duplicates_merge_into_first():
    # PDF: tiêu đề bài lặp ở đầu mỗi trang -> chỉ lần đầu mở chương, các lần sau nhập vào thân
    text = "第1課 あいさつ\nこんにちは。\n第1課 あいさつ\nおはよう。\n第2課 買い物\nいくらですか。\n第2課 買い物\nたかいです。"
    chapters, detected = split_chapters(text, None)
    assert detected is True
    assert [c.title for c in chapters] == ["第1課 あいさつ", "第2課 買い物"]
    assert chapters[0].text == "こんにちは。\nおはよう。"
    assert chapters[1].text == "いくらですか。\nたかいです。"


def test_vietnamese_front_matter_dropped_but_plain_intro_kept():
    text = "Lời nói đầu\nSách này dành cho người mới.\nMục lục\nBài 1 ... 3\nBài 2 ... 9\nBài 3 ... 15\n\nBài 1\nこんにちは。\nBài 2\nさようなら。\nBài 3\nまたね。"
    r = split_chapters_ex(text, None)
    assert [c.title for c in r.chapters] == ["Bài 1", "Bài 2", "Bài 3"]
    assert "Lời nói đầu" in r.skipped and "Mục lục" in r.skipped
    # không có dấu hiệu phần đầu sách -> đoạn mở đầu có tiếng Nhật vẫn thành chương "Mở đầu" như trước
    text2 = "きょうは いい てんきです。\n第1課\nこんにちは。\n第2課\nさようなら。"
    chapters, _ = split_chapters(text2, None)
    assert chapters[0].title == "Mở đầu"


def test_back_matter_cut_from_last_chapter():
    text = "第1課\nこんにちは。\n第2課\nさようなら。\n付録\n動詞の活用表\n索引\nあ\nい"
    r = split_chapters_ex(text, None)
    assert [c.title for c in r.chapters] == ["第1課", "第2課"]
    assert r.chapters[1].text == "さようなら。"
    assert "付録" in r.skipped


def test_docx_front_matter_heading_dropped():
    blocks = [{"text": "はじめに", "heading": 1}, {"text": "第1課", "heading": 1}, {"text": "第2課", "heading": 1}]
    text = "はじめに\nこの本について。\n第1課\nこんにちは。\n第2課\nさようなら。"
    r = split_chapters_ex(text, blocks)
    assert [c.title for c in r.chapters] == ["第1課", "第2課"]
    assert "はじめに" in r.skipped


def test_soumatome_day_units_and_week_header():
    # Nihongo Soumatome: tuần (第1週) chỉ là nhóm, bài học = N日目; header "第1週 ..." lặp đầu mỗi trang
    lines = ["第1週 楽しく暮らしていますか?", "1日目 アパートを探しています", "チラシ flyer", "第1週 楽しく暮らしていますか?",
             "練習 正しいほうに", "2日目 引っ越しは大変です", "段ボール cardboard", "第1週 楽しく暮らしていますか?",
             "3日目 友人を招きました", "招く invite"]
    r = split_chapters_ex(chr(10).join(lines), None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["1日目 アパートを探しています", "2日目 引っ越しは大変です", "3日目 友人を招きました"]
    assert r.chapters[0].text == "チラシ flyer" + chr(10) + "第1週 楽しく暮らしていますか?" + chr(10) + "練習 正しいほうに"
    # chỉ có tuần (không có ngày) -> tách theo tuần
    r2 = split_chapters_ex(chr(10).join(["第1週 あ", "x", "第2週 い", "y", "第3週 う", "z"]), None)
    assert [c.title for c in r2.chapters] == ["第1週 あ", "第2週 い", "第3週 う"]
    assert heading_title("１日目　買い物") == "１日目　買い物"
    assert heading_title("3日目に行きます。") is None


def test_ocr_toc_two_entries_per_line_without_page_numbers():
    # Mục lục OCR từ scan: 2 mục một dòng, không số trang, xen dòng nhiễu; phần "cách dùng sách" nằm SAU mục lục
    lines = ["目次", "1日目アパートを探しています2日目引っ越しは大変です", "3日目友人を招きました4日目家事は大変です",
             "5日目夏休み6日目お金", "7日目実戦問題", "この本の使い方", "毎日一課ずつ勉強してください。",
             "テストで確認しましょう。", "1日目アパートを探しています", "チラシ flyer", "家賃 rent", "2日目引っ越しは大変です",
             "段ボール cardboard", "3日目友人を招きました", "招く invite"]
    r = split_chapters_ex(chr(10).join(lines), None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["1日目アパートを探しています", "2日目引っ越しは大変です", "3日目友人を招きました"]
    assert all("勉強してください" not in c.text for c in r.chapters)
    assert "目次" in r.skipped and "この本の使い方" in r.skipped
    # nhãn phần bỏ qua rút gọn về từ khoá khi dòng OCR có đuôi rác
    r2 = split_chapters_ex(chr(10).join(["How to use this book本志的使用方法0|科", "第1課", "あ", "第2課", "い"]), None)
    assert r2.skipped == ["How to use"]


def test_leading_chapter_with_toc_like_title_dropped():
    lines = ["1日目-6日目 7日目", "学習の流れ", "テスト", "1日目 アパート", "チラシ", "家賃", "2日目 引っ越し", "段ボール", "3日目 友人", "招く"]
    r = split_chapters_ex(chr(10).join(lines), None)
    assert [c.title for c in r.chapters] == ["1日目 アパート", "2日目 引っ越し", "3日目 友人"]
    assert "1日目-6日目 7日目" in r.skipped


def test_heads_before_first_number_one_are_front_matter():
    # Hộp ví dụ trong trang "cách dùng sách" chứa "5日目 ..." trước khi bài 1 thật bắt đầu -> bỏ
    lines = ["5日目 どんな気持ち・態度ですか?", "彼は明るい人です。", "使い方の説明です。", "1日目 アパートを探しています", "チラシ",
             "家賃", "2日目 引っ越しは大変です", "段ボール", "3日目 友人を招きました", "招く"]
    r = split_chapters_ex(chr(10).join(lines), None)
    assert [c.title for c in r.chapters] == ["1日目 アパートを探しています", "2日目 引っ越しは大変です", "3日目 友人を招きました"]
    assert "5日目 どんな気持ち・態度ですか?" in r.skipped
    # tài liệu bắt đầu giữa sách (không có bài 1) -> giữ nguyên
    r2 = split_chapters_ex(chr(10).join(["第5課 あ", "x", "第6課 い", "y", "第7課 う", "z"]), None)
    assert [c.title for c in r2.chapters] == ["第5課 あ", "第6課 い", "第7課 う"]


# --- Tên bài bắt đầu bằng chữ trùng trợ từ (は, に, が...) ------------------------------------------------------------
def _titles(text):
    return [c.title for c in split_chapters_ex(text, None).chapters]


def _sequence_doc(line, n, fmt):
    """Bài 1..n+2 có tiêu đề chắc chắn theo `fmt`, riêng bài n là `line`."""
    out = []
    for k in range(1, n + 3):
        out += [line if k == n else fmt.format(k, "かいもの"), "ほんぶん%d。" % k]
    return "\n".join(out)


def test_particle_start_title_needs_lesson_sequence():
    # Một dòng riêng lẻ không phân biệt được tên bài "第1課 はじめまして" với câu "第2課 はおもしろかったです" (khoảng trắng /
    # dấu ngăn cũng không chứng minh được) -> heading_title luôn None, chỉ nhận khi đứng đúng chỗ trong dãy số bài
    cases = [("第1課 はじめまして", 1, "第{}課 {}"), ("第1課　はじめまして", 1, "第{}課 {}"),
             ("第2課 にほんの　くらし", 2, "第{}課 {}"), ("第3課：がっこう", 3, "第{}課 {}"),
             ("第4課 はじめてのデート", 4, "第{}課 {}"), ("第2課 のりもの", 2, "第{}課 {}"), ("第3課 でんわ", 3, "第{}課 {}"),
             ("Lesson 1: はじめまして", 1, "Lesson {}: {}"), ("Lesson 1　はじめまして", 1, "Lesson {} {}"),
             ("第1課はじめまして", 1, "第{}課{}")]
    for line, n, fmt in cases:
        assert heading_title(line) is None, line
        assert _titles(_sequence_doc(line, n, fmt)) == [line if k == n else fmt.format(k, "かいもの")
                                                        for k in range(1, n + 3)], line
    assert heading_title("第3課では…") is None
    assert heading_title("第2回目の授業で") is None
    # Các chốt khác vẫn loại hẳn, kể cả khi đứng đúng chỗ trong dãy
    for line in ["第1課 はじめまして。", "第1課 は、あいさつです", "第1課 は" + "あ" * 50, "第1課 は あいさつです",
                 "第1課では つぎの ことを"]:
        assert heading_title(line) is None, line
        assert _titles(_sequence_doc(line, 1, "第{}課 {}")) == ["Mở đầu", "第2課 かいもの", "第3課 かいもの"], line


def test_three_lessons_with_particle_titles_no_intro():
    # Trước đây "第1課 はじめまして" bị loại -> bài 1 thành "Mở đầu" và mất tên bài
    text = ("第1課 はじめまして\nわたしは マイクです。\n第2課 にほんの　くらし\nにほんは たのしいです。\n"
            "第3課　がっこう\nがっこうへ いきます。")
    r = split_chapters_ex(text, None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["第1課 はじめまして", "第2課 にほんの　くらし", "第3課　がっこう"]
    assert r.chapters[0].text == "わたしは マイクです。"
    assert (r.chapters[0].start_line, r.chapters[0].end_line) == (0, 2)
    # Chỉ bài 1 bắt đầu bằng chữ trùng trợ từ: trước đây bài 2, 3 vẫn tách được nhưng bài 1 thành "Mở đầu"
    r1 = split_chapters_ex("第1課 はじめまして\nこんにちは。\n第2課 かいもの\nいくらですか。\n第3課 しゅうまつ\nえいがを みます。", None)
    assert [c.title for c in r1.chapters] == ["第1課 はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
    # Mục lục cùng các tên bài đó giờ cũng khớp mẫu tiêu đề -> vẫn bị bỏ theo cụm, không sinh chương rỗng
    toc = "目次\n第1課 はじめまして ...... 1\n第2課 にほんの　くらし ...... 5\n第3課　がっこう ...... 9\n\n"
    r2 = split_chapters_ex(toc + text, None)
    assert [c.title for c in r2.chapters] == ["第1課 はじめまして", "第2課 にほんの　くらし", "第3課　がっこう"]
    assert r2.chapters[0].text == "わたしは マイクです。"
    assert "目次" in r2.skipped


def test_particle_phrases_stay_rejected_even_when_separated():
    # Latin + chữ Nhật vốn có khoảng trắng nửa cỡ -> khoảng trắng đó không chứng minh được gì
    for line in ["Lesson 1 の練習", "Unit 3 の目標", "Chapter 2 のまとめ", "Lesson 5 の宿題", "Unit 3 で学んだこと",
                 "Lesson 3 はどうでしたか?", "Lesson 1 はじめまして"]:
        assert heading_title(line) is None, line
    # を / 目 không mở đầu tên bài; の / で chỉ là cụm "của bài N" / "ở bài N"; は+kanji, は+khoảng trắng là trợ từ
    for line in ["第1課 を復習しましょう", "第2回 目の授業で", "第1課 の復習", "第3課 で習った表現を使って",
                 "第1課 が終わったら", "1日目 は休みです", "第1課 は あいさつです"]:
        assert heading_title(line) is None, line


def test_particle_phrase_does_not_split_or_drop_lessons():
    # "Lesson N の練習" sau tiêu đề bài N: không thành chương riêng
    text = ("Lesson 1 あいさつ\nおはようございます。\nLesson 1 の練習\nれいのように いいましょう。\n"
            "Lesson 2 かいもの\nいくらですか。\nLesson 2 の練習\nこれを ください。\n"
            "Lesson 3 しゅうまつ\nえいがを みます。\nLesson 3 の練習\nなにを しますか。")
    r = split_chapters_ex(text, None)
    assert [c.title for c in r.chapters] == ["Lesson 1 あいさつ", "Lesson 2 かいもの", "Lesson 3 しゅうまつ"]
    assert "Lesson 1 の練習" in r.chapters[0].text
    # Trích giữa sách có hộp ôn bài 1 trong bài 6: "bài 1" giả không được làm mất bài 5, 6 như phần đầu sách
    for h in ("Lesson {} ".format, "第{}課 ".format):
        text = (h(5) + "なつやすみ\nうみへ いきました。\n" + h(6) + "わたしのすきなもの\nおんがくが すきです。\n"
                + h(1) + "の復習\nはじめまして。\n" + h(7) + "かぞく\nあねが います。\n" + h(8) + "しごと\nかいしゃいんです。")
        r = split_chapters_ex(text, None)
        assert [c.title for c in r.chapters] == [h(5) + "なつやすみ", h(6) + "わたしのすきなもの", h(7) + "かぞく",
                                                 h(8) + "しごと"]
        assert r.skipped == []
    # Câu hướng dẫn "第1課 を復習しましょう" không tách bài 2
    r = split_chapters_ex("第1課 あいさつ\nおはようございます。\n第2課 かいもの\nいくらですか。\n第1課 を復習しましょう\n"
                          "こんにちは。\n第3課 しゅうまつ\nえいがを みます。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 しゅうまつ"]


def test_glued_particle_title_accepted_when_it_fills_lesson_sequence():
    # OCR Tesseract nối chữ Nhật không khoảng trắng: "第1課 はじめまして" trên trang -> "第1課はじめまして"
    ocr = "第1課はじめまして\nわたしはマイクです。\n第2課かいもの\nいくらですか。\n第3課しゅうまつ\nえいがをみます。"
    r = split_chapters_ex(ocr, None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課かいもの", "第3課しゅうまつ"]
    assert r.chapters[0].text == "わたしはマイクです。"
    # Latin: "Lesson 1はじめまして" (OCR) và "Lesson 1 はじめまして" (khoảng trắng thường) cũng nhận nhờ dãy số bài
    for sep in ("", " "):
        r = split_chapters_ex(ocr.replace("第", "Lesson ").replace("課", sep), None)
        assert [c.title for c in r.chapters] == ["Lesson 1" + sep + "はじめまして", "Lesson 2" + sep + "かいもの",
                                                 "Lesson 3" + sep + "しゅうまつ"]
    # Hai tiêu đề dính trợ từ liền nhau: dãy 1 → 2 → 3 khớp, neo vào bài 3 chắc chắn (không có tiêu đề hạng nào khác)
    r = split_chapters_ex("第1課はじめまして\nx。\n第2課にほんのくらし\ny。\n第3課しゅうまつ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課にほんのくらし", "第3課しゅうまつ"]
    # Tiêu đề cuối (không có bài sau) chỉ nhận khi có dấu hiệu mạnh: 全角 / dấu ngăn; "第3課のまとめ" cũng là ứng viên bài 3
    # nhưng tiêu đề có dấu tách thắng
    for sep in ("　", "："):
        r = split_chapters_ex("第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課" + sep + "はるやすみ\nz。\n第3課のまとめ\nw", None)
        assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの", "第3課" + sep + "はるやすみ"]
        assert "第3課のまとめ" in r.chapters[2].text
    # ... hoặc có bản ở mục lục (lặp ở lượt khác của dãy số bài)
    r = split_chapters_ex("目次\n第1課あいさつ……1\n第2課かいもの……5\n第3課はるやすみ……9\n\n"
                          "第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課はるやすみ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの", "第3課はるやすみ"]
    assert r.skipped == ["目次"]
    # Lặp trong cùng bài (header đầu trang) không đủ: câu báo trước / tên hộp cũng lặp được như thế -> ở lại trong thân
    # bài 2 (như trước 7f66b34)
    r = split_chapters_ex("第1課 あいさつ\nx。\n第2課 かいもの\ny。\n第3課はなみ\nz。\n第3課はなみ\nw。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの"]
    assert r.chapters[1].text == "y。\n第3課はなみ\nz。\n第3課はなみ\nw。"
    # Bài giữa thì header đầu trang vẫn được gộp: ứng viên duy nhất của bài 2, bản lặp không vào thân
    r = split_chapters_ex("第1課 あいさつ\nx。\n第2課はなみ\nz。\n第2課はなみ\nw。\n第3課 しゅうまつ\nv。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]
    assert r.chapters[1].text == "z。\nw。"
    # Dính liền, không dấu hiệu: không phân biệt được với câu báo trước bài sau -> ở lại trong thân bài 2
    # (như trước 7f66b34)
    r = split_chapters_ex("第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課はるやすみ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの"]
    assert "第3課はるやすみ" in r.chapters[1].text
    # Dãy toàn ứng viên chỉ cách nửa cỡ: không tiêu đề nào neo được dãy -> không tách (như trước 7f66b34)
    r = split_chapters_ex("第1課 はじめまして\nx。\n第2課 にほんのくらし\ny。\n第3課 がっこう\nz。", None)
    assert r.detected is False
    # Mục lục OCR có cùng tiêu đề -> mục lục vẫn bị bỏ theo cụm, bài 1 thật vẫn nhận
    r = split_chapters_ex("目次\n第1課はじめまして……1\n第2課かいもの……5\n第3課しゅうまつ……9\n\n" + ocr, None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課かいもの", "第3課しゅうまつ"]
    assert "目次" in r.skipped
    # Câu "第1課は…" trong phần cách dùng sách (trước bài 1 thật): "第2課はかいもの" trùng số bài 2 đã có -> bỏ; bài 1 có
    # hai ứng viên, tiêu đề có khoảng trắng 全角 (dấu hiệu tiêu đề, câu dính liền thì không) thắng
    r = split_chapters_ex("この本の使い方\n第1課はあいさつ\n第2課はかいもの\n" + ocr.replace("課", "課　"), None)
    assert [c.title for c in r.chapters] == ["第1課　はじめまして", "第2課　かいもの", "第3課　しゅうまつ"]
    assert r.skipped == ["この本の使い方"]


# --- Second review 7f66b34: các ca từng tách sai / làm chậm ---------------------------------------------------------
def test_particle_sentences_with_existing_lesson_number_do_not_split_lessons():
    # (1) は/に/が + hiragana sau khoảng trắng / dấu ngăn từng được nhận thẳng là tiêu đề, bỏ qua kiểm tra dãy số bài
    for line in ["第3課 がおわったら", "第2課 はおもしろかったです", "第1課 にでてきたことば", "第2回 はお休みです",
                 "Lesson 1: はどうでしたか"]:
        assert heading_title(line) is None, line
    text = ("第1課 あいさつ\nこんにちは。\n第1課 はどうでしたか\nたのしかったです。\n第2課 かいもの\nいくらですか。\n"
            "第2課 はどうでしたか\nたかかったです。\n第3課 しゅうまつ\nえいがをみます。")
    r = split_chapters_ex(text, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "こんにちは。\n第1課 はどうでしたか\nたのしかったです。"
    latin = text.replace("第", "Lesson ").replace("課 は", ": は").replace("課 ", " ")
    assert _titles(latin) == ["Lesson 1 あいさつ", "Lesson 2 かいもの", "Lesson 3 しゅうまつ"]


def test_forward_reference_after_last_lesson_is_not_a_chapter():
    # (2) Câu báo trước bài sau đứng sau bài cuối: trước đây thành bài 4 ôm phần đuôi bài 3
    for kw, ref in (("第{}課 ", "第4課の予習"), ("Lesson {} ", "Lesson 4 の予習"), ("Unit {} ", "Unit 4 の まえに"),
                    ("第{}課 ", "第4課のよしゅう"), ("第{}課 ", "第4課 はどうでしたか"), ("Lesson {} ", "Lesson 4 はなしましょう")):
        lessons = [kw.format(1) + "あいさつ", "こんにちは。", kw.format(2) + "かいもの", "いくらですか。",
                   kw.format(3) + "しゅうまつ", "えいがをみます。"]
        r = split_chapters_ex("\n".join(lessons + [ref, "つぎのことばをおぼえましょう", "たべます", "のみます"]), None)
        assert [c.title for c in r.chapters] == lessons[::2], ref
        assert r.chapters[2].text == "えいがをみます。\n" + ref + "\nつぎのことばをおぼえましょう\nたべます\nのみます", ref


def test_rank1_gap_fill_does_not_replace_valid_rank2_structure():
    # (3) Một tiêu đề hạng 1 + một ứng viên từng thay cấu trúc 第1回/第2回/第3回 hợp lệ
    text = ("第1回 授業の説明\n第3課 文法のまとめ\nたべます。のみます。\n第2回 会話練習\nはなします。ききます。\n"
            "第4課の宿題\nかきます。よみます。\n第3回 まとめ\nみます。")
    assert _titles(text) == ["第1回 授業の説明", "第2回 会話練習", "第3回 まとめ"]
    # Kể cả khi ứng viên khớp dãy hạng 1 (bài 1 ngay trước bài 2): hạng 1 chưa đủ 2 tiêu đề chắc chắn
    # -> hạng 2 như trước
    text = ("第1回 授業の説明\n第1課はじめまして\nわたしはマイクです。\n第2回 会話練習\nはなします。\n第2課 かいもの\n"
            "かいます。\n第3回 まとめ\nみます。")
    assert _titles(text) == ["第1回 授業の説明", "第2回 会話練習", "第3回 まとめ"]
    # Hạng 1 đủ 2 tiêu đề chắc chắn -> vẫn lấp chỗ trống bài 1
    text = ("第1回 授業の説明\n第1課はじめまして\nx。\n第2回 会話練習\n第2課 かいもの\ny。\n第3課 しゅうまつ\nz。\n"
            "第3回 まとめ\nw。")
    assert _titles(text) == ["第1課はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]


def test_ambiguous_lesson_number_does_not_pick_first_candidate():
    # (4) Hai dòng khác nhau cùng ứng viên cho một số bài: trước đây dòng đầu tiên (câu giới thiệu, câu báo trước)
    # cướp chỗ tiêu đề OCR thật. Không biết dòng nào là tiêu đề -> không nhận dòng nào (như trước 7f66b34).
    text = ("本書の使い方\n第1課はあいさつの課です\n第1課はじめまして\nわたしはマイクです。\n第2課 かいもの\nいくらですか。\n"
            "第3課 しゅうまつ\nえいがをみます。")
    r = split_chapters_ex(text, None)
    # Bài 1 không có tiêu đề nhưng nội dung không bị bỏ cùng phần cách dùng sách: chỉ phần trước dòng "第1課…" không đứng sát
    # dòng tiêu đề khác là đầu sách (test_unrecognized_lessons_in_front_matter_are_kept)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課はじめまして\nわたしはマイクです。"
    assert r.skipped == ["本書の使い方"]
    text = ("第1課 あいさつ\nこんにちは。\n第2課のよしゅう\nかいものにいきます\n第2課にほんのくらし\nにほんはたのしいです。\n"
            "第3課 しゅうまつ\nえいがをみます。")
    r = split_chapters_ex(text, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第3課 しゅうまつ"]
    assert "第2課のよしゅう" in r.chapters[0].text and "第2課にほんのくらし" in r.chapters[0].text
    # Trợ từ + kanji ("の予習") không phải ứng viên -> tiêu đề OCR thật là ứng viên duy nhất của bài 2
    assert _titles(text.replace("のよしゅう", "の予習")) == ["第1課 あいさつ", "第2課にほんのくらし", "第3課 しゅうまつ"]
    # Đúng một dòng có dấu hiệu tiêu đề mạnh hơn (全角) -> dòng đó
    assert _titles(text.replace("課にほん", "課　にほん")) == ["第1課 あいさつ", "第2課　にほんのくらし", "第3課 しゅうまつ"]
    # Ứng viên lệch dãy ("第7課のよしゅう" giữa bài 1 và bài 3) không chắn ứng viên đúng chỗ
    text = "第1課 あいさつ\nx。\n第7課のよしゅう\ny。\n第2課はなみ\nz。\n第3課 しゅうまつ\nw。"
    assert _titles(text) == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]


# --- Third review: lặp trong cùng bài, khoảng trắng nửa cỡ, mục lục 2 bài --------------------------------------------
_BOX_TWICE = ("第1課 あいさつ\nx。\n第2課はなみ\nはなみにいきます。\nさくらがきれいです。\n第2課のことば\nさくら\n第2課のことば\n"
              "はな\n第3課 しゅうまつ\nz。")


def test_repetition_inside_one_lesson_is_not_a_heading_signal():
    # Tên hộp "第2課のことば" hai lần trong thân bài 2 từng thắng tiêu đề thật "第2課はなみ" (lặp = dấu hiệu mạnh) và cắt
    # câu mở đầu bài 2 sang bài 1. Hai ứng viên, không dòng nào có dấu hiệu tiêu đề -> không nhận dòng nào (như trước
    # 7f66b34): bài 2 ở lại trong bài 1, không có tiêu đề giả
    r = split_chapters_ex(_BOX_TWICE, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第3課 しゅうまつ"]
    assert r.chapters[0].text == _BOX_TWICE.split("\n", 1)[1].rsplit("\n第3課", 1)[0]
    # Tài liệu 2 bài có phần cách dùng sách: câu mở đầu bài 1 và tiêu đề thật từng bị bỏ như phần đầu sách
    text = ("はじめに\nこの本の使い方をせつめいします\n第1課はなみ\nはなみにいきます。\nさくらがきれいです。\n第1課のことば\n"
            "さくら\nはな\n第1課のことば\nおべんとう\n第2課　ともだち\nともだちとあそびます。")
    r = split_chapters_ex(text, None)
    assert r.detected is False and r.chapters[0].text == text
    # Câu báo trước bài sau lặp hai lần sau bài cuối: không thành bài 4
    lessons = ["Lesson 1: あいさつ", "x。", "Lesson 2: かいもの", "y。", "Lesson 3: しゅうまつ", "z。"]
    tail = ["Lesson 4 のよしゅう", "たべます", "Lesson 4 のよしゅう", "のみます"]
    r = split_chapters_ex("\n".join(lessons + tail), None)
    assert [c.title for c in r.chapters] == lessons[::2]
    assert r.chapters[2].text == "\n".join(["z。"] + tail)
    # Bản ở mục lục (lặp ở lượt khác của dãy số bài) vẫn là dấu hiệu: tiêu đề thật có trong mục lục thắng tên hộp
    r = split_chapters_ex("目次\n第1課 あいさつ……1\n第2課はなみ……5\n第3課 しゅうまつ……9\n\n" + _BOX_TWICE, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]
    assert r.chapters[1].text.startswith("はなみにいきます。\nさくらがきれいです。\n第2課のことば")
    assert r.skipped == ["目次"]
    # "第1課のふくしゅう" (bài 1 đã có tiêu đề) giữa hai bản header của bài cuối không mở lượt mới -> vẫn không đủ
    r = split_chapters_ex("第1課 あいさつ\nx。\n第2課 かいもの\ny。\n第3課はなみ\nz。\n第1課のふくしゅう\nw。\n第3課はなみ\nv。",
                          None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの"]


def test_half_width_space_does_not_break_candidate_tie():
    # Tên hộp gõ tay "第1課 にでてきたことば" (khoảng trắng nửa cỡ) từng thắng tiêu đề thật bị trích dính liền "第1課はなみ"
    # rồi tiêu đề thật + câu mở đầu bài 1 bị bỏ như phần đầu sách. Nửa cỡ không phải dấu hiệu tiêu đề -> hoà, không nhận
    # dòng nào (như trước 7f66b34: không tách, không mất chữ nào)
    text = ("はじめに\nこの本の使い方をせつめいします\n第1課はなみ\nはなみにいきます。\nさくらがきれいです。\n"
            "第1課 にでてきたことば\nさくら　はな\n第2課　ともだち\nともだちとあそびます。")
    r = split_chapters_ex(text, None)
    assert r.detected is False and r.chapters[0].text == text
    # Chiều ngược lại (câu dính liền + tiêu đề cách nửa cỡ) cũng không đoán: bài 1 vào "Mở đầu", không mất nội dung
    body = "第1課 はじめまして\nわたしはマイクです。\n第2課 かいもの\nいくらですか。\n第3課 しゅうまつ\nえいがをみます。"
    r = split_chapters_ex("第1課はあいさつ\n" + body, None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課はあいさつ\n第1課 はじめまして\nわたしはマイクです。"
    # Dấu ngăn / 全角 vẫn phân xử được (câu đứng trước bài 1 vào "Mở đầu" như mọi phần đầu có tiếng Nhật)
    for sep in ("　", "："):
        r = split_chapters_ex("第1課はあいさつ\n" + body.replace("第1課 ", "第1課" + sep), None)
        assert [c.title for c in r.chapters] == ["Mở đầu", "第1課" + sep + "はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
        assert r.chapters[0].text == "第1課はあいさつ"


def test_unrecognized_lessons_in_front_matter_are_kept():
    # Bài 1, 2 không nhận được tiêu đề (mỗi bài hai ứng viên, không dòng nào có dấu hiệu tiêu đề) còn bài 3, 4 nhận được: trước
    # đây cả phần trước bài 3 bị bỏ như phần đầu sách vì có "はじめに" -> mất trắng nội dung bài 1, 2 (trước 7f66b34 không tách)
    head = ["はじめに", "この本は。"]
    lessons = ["Lesson 1 はなみ", "本文1-0。", "Lesson 1 はおもしろかったです", "本文1-1。", "Lesson 2 にでてきたことば",
               "本文1-2。", "Lesson 2 でんわ", "本文2-0。"]
    tail = ["Lesson 3　あいさつ", "本文3-0。", "Lesson 4　はなみ", "本文4-0。"]
    r = split_chapters_ex("\n".join(head + lessons + tail), None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "Lesson 3　あいさつ", "Lesson 4　はなみ"]
    assert r.chapters[0].text == "\n".join(lessons)
    assert (r.chapters[0].start_line, r.chapters[0].end_line) == (2, 10)
    assert r.skipped == ["はじめに"]
    # Có mục lục đủ bài: bản ở mục lục phân xử được hai ứng viên -> đủ 4 bài
    toc = ["目次", "Lesson 1 はなみ……1", "Lesson 2 でんわ……5", "Lesson 3　あいさつ……9", "Lesson 4　はなみ……12", ""]
    r = split_chapters_ex("\n".join(head + toc + lessons + tail), None)
    assert [c.title for c in r.chapters] == ["Lesson 1 はなみ", "Lesson 2 でんわ", "Lesson 3　あいさつ", "Lesson 4　はなみ"]
    assert r.skipped == ["はじめに", "目次"]
    # Mục lục thiếu bài 1, 2: dòng mục lục (mang số trang / đứng sát nhau) không tính là bài -> bỏ cùng phần đầu, chỉ giữ từ
    # bài 1 ở thân sách
    r = split_chapters_ex("\n".join(head + toc[:1] + toc[3:] + lessons + tail), None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "Lesson 3　あいさつ", "Lesson 4　はなみ"]
    assert r.chapters[0].text == "\n".join(lessons)
    assert r.skipped == ["はじめに", "目次"]
    # Không có dòng bài nào trước bài đầu tiên: phần đầu sách vẫn bỏ hẳn như trước
    r = split_chapters_ex("\n".join(head + ["Lesson 1 あいさつ", "本文1-0。", "Lesson 2 かぞく", "本文2-0。"]), None)
    assert [c.title for c in r.chapters] == ["Lesson 1 あいさつ", "Lesson 2 かぞく"]
    assert r.skipped == ["はじめに"]


def test_two_entry_contents_page_is_dropped():
    # Tài liệu 2 bài tự có mục lục: cụm < TOC_MIN_RUN từng không được nhận -> mục lục thành chương 1 rỗng (tiêu đề mang số
    # trang), thân bài 1 dồn vào chương 2. Mục nào cũng có bản ở thân sách phía sau -> vẫn là mục lục
    for h1, h2 in (("第1課はなみ", "第2課はるやすみ"), ("Lesson 1 はなみ", "Lesson 2 はるやすみ"),
                   ("第1課 あいさつ", "第2課 かいもの")):
        text = "\n".join(["目次", h1 + "……1", h2 + "……6", "", h1, "はなみにいきます。", "さくらがきれいです。", h2,
                          "やすみにりょこうします。"])
        r = split_chapters_ex(text, None)
        assert [(c.title, c.text) for c in r.chapters] == [(h1, "はなみにいきます。\nさくらがきれいです。"),
                                                          (h2, "やすみにりょこうします。")], h1
        assert r.skipped == ["目次"], h1
    # Mục lục không số trang, không dòng "目次"
    r = split_chapters_ex("第1課 あいさつ\n第2課 かいもの\n第1課 あいさつ\nx。\n第2課 かいもの\ny。", None)
    assert [(c.title, c.text) for c in r.chapters] == [("第1課 あいさつ", "x。"), ("第2課 かいもの", "y。")]
    # Hai tiêu đề liền nhau không có thân mà không xuất hiện lại: không phải mục lục, giữ như trước
    r = split_chapters_ex("第1課 あいさつ\n第2課 かいもの\n\n第3課 しゅうまつ\nx。\n第4課 かぞく\ny。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 しゅうまつ", "第4課 かぞく"]


# 998 tiêu đề dính trợ từ + 1 tiêu đề chắc chắn; chuỗi 150 bài rồi 2 000 dòng "第1課のふくしゅう" không được nhận;
# 999 ứng viên không neo (loại lan truyền suốt dãy)
_PERF_CASES = {
    "glued_chain": ([x for k in range(1, 999) for x in ("第%d課はじめ" % k, "ほんぶん。")] + ["第999課 おわり", "ほんぶん。"],
                    999),
    "chain_plus_noise": ([x for k in range(1, 151) for x in ("第%d課はじめ" % k, "ほんぶん。")] + ["第151課 おわり"]
                         + ["第1課のふくしゅう"] * 2000, 151),
    "unanchored": ([x for k in range(1, 1000) for x in ("第%d課はじめ" % k, "ほんぶん。")], 1),
    # 699 bài mỗi bài hai ứng viên (không nhận) sau "はじめに": phần đầu giữ thành "Mở đầu" (_first_unrecognized_lesson)
    "front_ambiguous": (["はじめに"] + [x for k in range(1, 700) for x in ("第%d課はじめ" % k, "ほんぶん。", "第%d課のよしゅう" % k,
                                                                         "ほんぶん。")]
                        + ["第700課 おわり", "ほんぶん。", "第701課 おわり", "ほんぶん。"], 3),
}


@pytest.mark.parametrize("case", list(_PERF_CASES))
def test_particle_gap_filling_is_linear(case, monkeypatch):
    # (5) Trước đây lặp tới khi ổn định, mỗi vòng quét lại mọi tiêu đề: O(C²·H), ~30 s cho ca glued_chain
    lines, expected = _PERF_CASES[case]
    text = "\n".join(lines)
    # Đếm số lần đọc số bài: độc lập với tốc độ máy và dừng ngay khi thuật toán thành bậc hai
    # (thay vì chờ hàng chục giây)
    real, calls = chapters._head_number, [0]

    def counted(line):
        calls[0] += 1
        assert calls[0] <= 4 * len(lines), "_head_number bị gọi quá nhiều lần: thuật toán không còn tuyến tính"
        return real(line)

    monkeypatch.setattr(chapters, "_head_number", counted)
    assert len(split_chapters_ex(text, None).chapters) == expected
    monkeypatch.undo()
    # Đồng hồ: ngưỡng rộng (~20 lần thời gian thật) và lấy lần nhanh nhất trong 3 để laptop chậm / GC
    # không làm test chập chờn
    best = float("inf")
    for _ in range(3):
        start = time.perf_counter()
        split_chapters_ex(text, None)
        best = min(best, time.perf_counter() - start)
        if best < 1.0:
            break
    assert best < 1.0, "%s: %.2f s cho %d dòng" % (case, best, len(lines))
