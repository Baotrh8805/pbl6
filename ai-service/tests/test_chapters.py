import itertools
import time

import pytest

import app.extract.chapters as chapters
from app.extract.chapters import heading_title, split_chapters_ex
from app.extract.readers.text_reader import normalize


# Mọi reader (văn bản dán, txt, docx, ảnh / PDF qua OCR) chuẩn hoá NFKC trước khi tách chương: "　" (全角) thành " ",
# "：" thành ":", "１" thành "1". Test đi qua đúng bước đó để phản ánh văn bản production thật sự thấy — trước đây test
# đưa thẳng "　" vào split_chapters_ex nên nhánh 全角 của _strong_sep xanh trong test nhưng chết ở production.
def _ex(text, blocks=None):
    return split_chapters_ex(normalize(text), blocks)


def _split(text, blocks=None):
    r = _ex(text, blocks)
    return r.chapters, r.detected


def _head(line):
    return heading_title(normalize(line))


def test_heading_title_patterns():
    for line in ["第1課", "第２章 かいもの", "第三課", "Lesson 3 Greetings", "Bài 1: Chào hỏi", "Unit 2"]:
        assert _head(line) == normalize(line)
    assert _head("第２章 かいもの") == "第2章 かいもの"
    assert _head("Chapter 12 - Food") == "Chapter 12 - Food"


def test_not_headings():
    assert _head("第1課で勉強します。") is None
    assert _head("1.") is None
    assert _head("１．") is None
    assert _head("こんにちは") is None


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
    assert _head("第1課 " + "あ" * 80) is None
    assert _head("第1課 " + "あ" * 50) is not None


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
    assert _head("第3章では、次のように") is None
    assert _head("第2回目の授業で") is None
    assert _head("第3章では次のように") is None
    assert _head("第1課、あいさつ") is None
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


def test_toc_cluster_and_front_matter_dropped():
    text = (
        "みんなの日本語\n目次\n第1課 あいさつ ...... 1\n第2課 買い物 ...... 5\n第3課 週末 ...... 9\n\n"
        "はじめに\nこの本は日本語を学ぶ人のための教科書です。\n本書の使い方\n毎日一課ずつ勉強してください。\n\n"
        "第1課 あいさつ\nこんにちは。\n第2課 買い物\nこれはいくらですか。\n第3課 週末\n映画を見ます。"
    )
    r = _ex(text, None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 買い物", "第3課 週末"]
    assert r.chapters[0].text == "こんにちは。"
    assert all("この本は" not in c.text and "目次" not in c.text for c in r.chapters)
    assert "目次" in r.skipped and "はじめに" in r.skipped and "本書の使い方" in r.skipped


def test_running_page_header_duplicates_merge_into_first():
    # PDF: tiêu đề bài lặp ở đầu mỗi trang -> chỉ lần đầu mở chương, các lần sau nhập vào thân
    text = "第1課 あいさつ\nこんにちは。\n第1課 あいさつ\nおはよう。\n第2課 買い物\nいくらですか。\n第2課 買い物\nたかいです。"
    chapters, detected = _split(text, None)
    assert detected is True
    assert [c.title for c in chapters] == ["第1課 あいさつ", "第2課 買い物"]
    assert chapters[0].text == "こんにちは。\nおはよう。"
    assert chapters[1].text == "いくらですか。\nたかいです。"


def test_vietnamese_front_matter_dropped_but_plain_intro_kept():
    text = "Lời nói đầu\nSách này dành cho người mới.\nMục lục\nBài 1 ... 3\nBài 2 ... 9\nBài 3 ... 15\n\nBài 1\nこんにちは。\nBài 2\nさようなら。\nBài 3\nまたね。"
    r = _ex(text, None)
    assert [c.title for c in r.chapters] == ["Bài 1", "Bài 2", "Bài 3"]
    assert "Lời nói đầu" in r.skipped and "Mục lục" in r.skipped
    # không có dấu hiệu phần đầu sách -> đoạn mở đầu có tiếng Nhật vẫn thành chương "Mở đầu" như trước
    text2 = "きょうは いい てんきです。\n第1課\nこんにちは。\n第2課\nさようなら。"
    chapters, _ = _split(text2, None)
    assert chapters[0].title == "Mở đầu"


def test_back_matter_cut_from_last_chapter():
    text = "第1課\nこんにちは。\n第2課\nさようなら。\n付録\n動詞の活用表\n索引\nあ\nい"
    r = _ex(text, None)
    assert [c.title for c in r.chapters] == ["第1課", "第2課"]
    assert r.chapters[1].text == "さようなら。"
    assert "付録" in r.skipped


def test_docx_front_matter_heading_dropped():
    blocks = [{"text": "はじめに", "heading": 1}, {"text": "第1課", "heading": 1}, {"text": "第2課", "heading": 1}]
    text = "はじめに\nこの本について。\n第1課\nこんにちは。\n第2課\nさようなら。"
    r = _ex(text, blocks)
    assert [c.title for c in r.chapters] == ["第1課", "第2課"]
    assert "はじめに" in r.skipped


def test_soumatome_day_units_and_week_header():
    # Nihongo Soumatome: tuần (第1週) chỉ là nhóm, bài học = N日目; header "第1週 ..." lặp đầu mỗi trang
    lines = ["第1週 楽しく暮らしていますか?", "1日目 アパートを探しています", "チラシ flyer", "第1週 楽しく暮らしていますか?",
             "練習 正しいほうに", "2日目 引っ越しは大変です", "段ボール cardboard", "第1週 楽しく暮らしていますか?",
             "3日目 友人を招きました", "招く invite"]
    r = _ex(chr(10).join(lines), None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["1日目 アパートを探しています", "2日目 引っ越しは大変です", "3日目 友人を招きました"]
    assert r.chapters[0].text == "チラシ flyer" + chr(10) + "第1週 楽しく暮らしていますか?" + chr(10) + "練習 正しいほうに"
    # chỉ có tuần (không có ngày) -> tách theo tuần
    r2 = _ex(chr(10).join(["第1週 あ", "x", "第2週 い", "y", "第3週 う", "z"]), None)
    assert [c.title for c in r2.chapters] == ["第1週 あ", "第2週 い", "第3週 う"]
    assert _head("１日目　買い物") == "1日目 買い物"
    assert _head("3日目に行きます。") is None


def test_ocr_toc_two_entries_per_line_without_page_numbers():
    # Mục lục OCR từ scan: 2 mục một dòng, không số trang, xen dòng nhiễu; phần "cách dùng sách" nằm SAU mục lục
    lines = ["目次", "1日目アパートを探しています2日目引っ越しは大変です", "3日目友人を招きました4日目家事は大変です",
             "5日目夏休み6日目お金", "7日目実戦問題", "この本の使い方", "毎日一課ずつ勉強してください。",
             "テストで確認しましょう。", "1日目アパートを探しています", "チラシ flyer", "家賃 rent", "2日目引っ越しは大変です",
             "段ボール cardboard", "3日目友人を招きました", "招く invite"]
    r = _ex(chr(10).join(lines), None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["1日目アパートを探しています", "2日目引っ越しは大変です", "3日目友人を招きました"]
    assert all("勉強してください" not in c.text for c in r.chapters)
    assert "目次" in r.skipped and "この本の使い方" in r.skipped
    # nhãn phần bỏ qua rút gọn về từ khoá khi dòng OCR có đuôi rác
    r2 = _ex(chr(10).join(["How to use this book本志的使用方法0|科", "第1課", "あ", "第2課", "い"]), None)
    assert r2.skipped == ["How to use"]


def test_leading_chapter_with_toc_like_title_dropped():
    lines = ["1日目-6日目 7日目", "学習の流れ", "テスト", "1日目 アパート", "チラシ", "家賃", "2日目 引っ越し", "段ボール", "3日目 友人", "招く"]
    r = _ex(chr(10).join(lines), None)
    assert [c.title for c in r.chapters] == ["1日目 アパート", "2日目 引っ越し", "3日目 友人"]
    assert "1日目-6日目 7日目" in r.skipped


def test_heads_before_first_number_one_are_front_matter():
    # Hộp ví dụ trong trang "cách dùng sách" chứa "5日目 ..." trước khi bài 1 thật bắt đầu -> bỏ
    lines = ["5日目 どんな気持ち・態度ですか?", "彼は明るい人です。", "使い方の説明です。", "1日目 アパートを探しています", "チラシ",
             "家賃", "2日目 引っ越しは大変です", "段ボール", "3日目 友人を招きました", "招く"]
    r = _ex(chr(10).join(lines), None)
    assert [c.title for c in r.chapters] == ["1日目 アパートを探しています", "2日目 引っ越しは大変です", "3日目 友人を招きました"]
    assert "5日目 どんな気持ち・態度ですか?" in r.skipped
    # tài liệu bắt đầu giữa sách (không có bài 1) -> giữ nguyên
    r2 = _ex(chr(10).join(["第5課 あ", "x", "第6課 い", "y", "第7課 う", "z"]), None)
    assert [c.title for c in r2.chapters] == ["第5課 あ", "第6課 い", "第7課 う"]


# --- Tên bài bắt đầu bằng chữ trùng trợ từ (は, に, が...) ------------------------------------------------------------
def _titles(text):
    return [c.title for c in _ex(text, None).chapters]


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
        assert _head(line) is None, line
        assert _titles(_sequence_doc(line, n, fmt)) == [normalize(line) if k == n else fmt.format(k, "かいもの")
                                                        for k in range(1, n + 3)], line
    assert _head("第3課では…") is None
    assert _head("第2回目の授業で") is None
    # Các chốt khác vẫn loại hẳn, kể cả khi đứng đúng chỗ trong dãy
    for line in ["第1課 はじめまして。", "第1課 は、あいさつです", "第1課 は" + "あ" * 50, "第1課 は あいさつです",
                 "第1課では つぎの ことを"]:
        assert _head(line) is None, line
        assert _titles(_sequence_doc(line, 1, "第{}課 {}")) == ["Mở đầu", "第2課 かいもの", "第3課 かいもの"], line


def test_three_lessons_with_particle_titles_no_intro():
    # Trước đây "第1課 はじめまして" bị loại -> bài 1 thành "Mở đầu" và mất tên bài
    text = ("第1課 はじめまして\nわたしは マイクです。\n第2課 にほんの　くらし\nにほんは たのしいです。\n"
            "第3課　がっこう\nがっこうへ いきます。")
    r = _ex(text, None)
    assert r.detected is True
    assert [c.title for c in r.chapters] == ["第1課 はじめまして", "第2課 にほんの くらし", "第3課 がっこう"]
    assert r.chapters[0].text == "わたしは マイクです。"
    assert (r.chapters[0].start_line, r.chapters[0].end_line) == (0, 2)
    # Chỉ bài 1 bắt đầu bằng chữ trùng trợ từ: trước đây bài 2, 3 vẫn tách được nhưng bài 1 thành "Mở đầu"
    r1 = _ex("第1課 はじめまして\nこんにちは。\n第2課 かいもの\nいくらですか。\n第3課 しゅうまつ\nえいがを みます。", None)
    assert [c.title for c in r1.chapters] == ["第1課 はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
    # Mục lục cùng các tên bài đó giờ cũng khớp mẫu tiêu đề -> vẫn bị bỏ theo cụm, không sinh chương rỗng
    toc = "目次\n第1課 はじめまして ...... 1\n第2課 にほんの　くらし ...... 5\n第3課　がっこう ...... 9\n\n"
    r2 = _ex(toc + text, None)
    assert [c.title for c in r2.chapters] == ["第1課 はじめまして", "第2課 にほんの くらし", "第3課 がっこう"]
    assert r2.chapters[0].text == "わたしは マイクです。"
    assert "目次" in r2.skipped


def test_particle_phrases_stay_rejected_even_when_separated():
    # Latin + chữ Nhật vốn có khoảng trắng nửa cỡ -> khoảng trắng đó không chứng minh được gì
    for line in ["Lesson 1 の練習", "Unit 3 の目標", "Chapter 2 のまとめ", "Lesson 5 の宿題", "Unit 3 で学んだこと",
                 "Lesson 3 はどうでしたか?", "Lesson 1 はじめまして"]:
        assert _head(line) is None, line
    # を / 目 không mở đầu tên bài; の / で chỉ là cụm "của bài N" / "ở bài N"; は+kanji, は+khoảng trắng là trợ từ
    for line in ["第1課 を復習しましょう", "第2回 目の授業で", "第1課 の復習", "第3課 で習った表現を使って",
                 "第1課 が終わったら", "1日目 は休みです", "第1課 は あいさつです"]:
        assert _head(line) is None, line


def test_particle_phrase_does_not_split_or_drop_lessons():
    # "Lesson N の練習" sau tiêu đề bài N: không thành chương riêng
    text = ("Lesson 1 あいさつ\nおはようございます。\nLesson 1 の練習\nれいのように いいましょう。\n"
            "Lesson 2 かいもの\nいくらですか。\nLesson 2 の練習\nこれを ください。\n"
            "Lesson 3 しゅうまつ\nえいがを みます。\nLesson 3 の練習\nなにを しますか。")
    r = _ex(text, None)
    assert [c.title for c in r.chapters] == ["Lesson 1 あいさつ", "Lesson 2 かいもの", "Lesson 3 しゅうまつ"]
    assert "Lesson 1 の練習" in r.chapters[0].text
    # Trích giữa sách có hộp ôn bài 1 trong bài 6: "bài 1" giả không được làm mất bài 5, 6 như phần đầu sách
    for h in ("Lesson {} ".format, "第{}課 ".format):
        text = (h(5) + "なつやすみ\nうみへ いきました。\n" + h(6) + "わたしのすきなもの\nおんがくが すきです。\n"
                + h(1) + "の復習\nはじめまして。\n" + h(7) + "かぞく\nあねが います。\n" + h(8) + "しごと\nかいしゃいんです。")
        r = _ex(text, None)
        assert [c.title for c in r.chapters] == [h(5) + "なつやすみ", h(6) + "わたしのすきなもの", h(7) + "かぞく",
                                                 h(8) + "しごと"]
        assert r.skipped == []
    # Câu hướng dẫn "第1課 を復習しましょう" không tách bài 2
    r = _ex("第1課 あいさつ\nおはようございます。\n第2課 かいもの\nいくらですか。\n第1課 を復習しましょう\n"
            "こんにちは。\n第3課 しゅうまつ\nえいがを みます。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 しゅうまつ"]


def test_glued_particle_title_accepted_when_it_fills_lesson_sequence():
    # OCR Tesseract nối chữ Nhật không khoảng trắng: "第1課 はじめまして" trên trang -> "第1課はじめまして"
    ocr = "第1課はじめまして\nわたしはマイクです。\n第2課かいもの\nいくらですか。\n第3課しゅうまつ\nえいがをみます。"
    r = _ex(ocr, None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課かいもの", "第3課しゅうまつ"]
    assert r.chapters[0].text == "わたしはマイクです。"
    # Latin: "Lesson 1はじめまして" (OCR) và "Lesson 1 はじめまして" (khoảng trắng thường) cũng nhận nhờ dãy số bài
    for sep in ("", " "):
        r = _ex(ocr.replace("第", "Lesson ").replace("課", sep), None)
        assert [c.title for c in r.chapters] == ["Lesson 1" + sep + "はじめまして", "Lesson 2" + sep + "かいもの",
                                                 "Lesson 3" + sep + "しゅうまつ"]
    # Hai tiêu đề dính trợ từ liền nhau: dãy 1 → 2 → 3 khớp, neo vào bài 3 chắc chắn (không có tiêu đề hạng nào khác)
    r = _ex("第1課はじめまして\nx。\n第2課にほんのくらし\ny。\n第3課しゅうまつ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課にほんのくらし", "第3課しゅうまつ"]
    # Tiêu đề cuối (không có bài sau) nhận khi dàn cùng kiểu ngăn với cả dãy; "第3課のまとめ" là tên phần bài
    # (_sentence_like) -> nhường bài 3 cho tiêu đề thật, ở lại trong thân bài 3
    for sep, title in (("", "第3課はるやすみ"), (" ", "第3課 はるやすみ"), ("　", "第3課 はるやすみ"),
                       ("：", "第3課:はるやすみ")):
        doc = "第1課{0}あいさつ\nx。\n第2課{0}かいもの\ny。\n第3課{0}はるやすみ\nz。\n第3課のまとめ\nw".format(sep)
        r = _ex(doc, None)
        assert [c.title for c in r.chapters][2:] == [title], sep
        assert r.chapters[2].text == "z。\n第3課のまとめ\nw", sep
    # Bài cuối không dấu ngăn khác kiểu với dãy (dãy dính liền, bài cuối cách — kể cả 全角, sau NFKC chỉ là cách) -> không
    # nhận, ở lại trong thân bài 2
    for sep in ("　", " "):
        r = _ex("第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課" + sep + "はるやすみ\nz。", None)
        assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの"], sep
        assert r.chapters[1].text == "y。\n" + normalize("第3課" + sep + "はるやすみ") + "\nz。", sep
    # Dấu ngăn là lối dàn tiêu đề -> nhận như trước, kể cả khi OCR làm dính các tiêu đề trước
    assert _titles("第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課：はるやすみ\nz。")[2] == "第3課:はるやすみ"
    # ... hoặc có bản ở mục lục (lặp ở lượt khác của dãy số bài)
    r = _ex("目次\n第1課あいさつ……1\n第2課かいもの……5\n第3課はるやすみ……9\n\n"
            "第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課はるやすみ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの", "第3課はるやすみ"]
    assert r.skipped == ["目次"]
    # Lặp trong cùng bài (header đầu trang) không phải dấu hiệu: tiêu đề dính liền sau dãy cách -> khác kiểu, ở lại
    # trong thân bài 2 dù lặp hai lần (như trước 7f66b34)
    r = _ex("第1課 あいさつ\nx。\n第2課 かいもの\ny。\n第3課はなみ\nz。\n第3課はなみ\nw。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの"]
    assert r.chapters[1].text == "y。\n第3課はなみ\nz。\n第3課はなみ\nw。"
    # Cùng kiểu với dãy -> bài 3; bản lặp (header đầu trang) không vào thân
    r = _ex("第1課 あいさつ\nx。\n第2課 かいもの\ny。\n第3課 はなみ\nz。\n第3課 はなみ\nw。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 はなみ"]
    assert r.chapters[2].text == "z。\nw。"
    # Bài giữa thì header đầu trang vẫn được gộp: ứng viên duy nhất của bài 2, bản lặp không vào thân
    r = _ex("第1課 あいさつ\nx。\n第2課はなみ\nz。\n第2課はなみ\nw。\n第3課 しゅうまつ\nv。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]
    assert r.chapters[1].text == "z。\nw。"
    # Dãy toàn ứng viên (không tiêu đề chắc chắn nào) đủ 3 bài cùng kiểu -> nhận trọn (trước đây không tách: bài 3 thiếu
    # dấu hiệu mạnh rồi kéo đổ bài 2, bài 1)
    for sep in ("", " ", "　"):
        r = _ex("第1課{0}はじめまして\nx。\n第2課{0}にほんのくらし\ny。\n第3課{0}がっこう\nz。".format(sep), None)
        assert [c.title for c in r.chapters] == [normalize("第%d課%s%s" % (k, sep, t)) for k, t in
                                                 ((1, "はじめまして"), (2, "にほんのくらし"), (3, "がっこう"))], sep
    # Chỉ 2 bài, toàn ứng viên, không dấu ngăn: hai dòng "第1課 は…" / "第2課 に…" chưa đủ là dãy tiêu đề -> không tách;
    # có dấu ngăn (lối dàn tiêu đề) thì nhận
    assert _ex("第1課 はじめまして\nx。\n第2課 にほんのくらし\ny。", None).detected is False
    assert _titles("第1課: はじめまして\nx。\n第2課: にほんのくらし\ny。") == ["第1課: はじめまして", "第2課: にほんのくらし"]
    # Mục lục OCR có cùng tiêu đề -> mục lục vẫn bị bỏ theo cụm, bài 1 thật vẫn nhận
    r = _ex("目次\n第1課はじめまして……1\n第2課かいもの……5\n第3課しゅうまつ……9\n\n" + ocr, None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課かいもの", "第3課しゅうまつ"]
    assert "目次" in r.skipped
    # Câu "第1課は…" trong phần cách dùng sách (trước bài 1 thật): "第2課はかいもの" trùng số bài 2 đã có -> bỏ; bài 1 có
    # hai ứng viên, tiêu đề có dấu ngăn (dấu hiệu tiêu đề, câu dính liền thì không) thắng
    r = _ex("この本の使い方\n第1課はあいさつ\n第2課はかいもの\n" + ocr.replace("課", "課："), None)
    assert [c.title for c in r.chapters] == ["第1課:はじめまして", "第2課:かいもの", "第3課:しゅうまつ"]
    assert r.skipped == ["この本の使い方"]
    # 全角 thì không: sau NFKC chỉ là khoảng trắng như câu gõ tay -> hai dòng đọc được là tên bài ("第1課はなび" trong hộp ví
    # dụ) hoà, không nhận dòng nào; bài 1 giữ trong "Mở đầu"
    r = _ex("この本の使い方\n第1課はなび\n第2課はかいもの\n" + ocr.replace("課", "課　"), None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課 はじめまして\nわたしはマイクです。"
    assert r.skipped == ["この本の使い方"]
    # Câu "第1課はあいさつ" (từ điển: は + あいさつ, _particle_led) nhường dòng đặt tên bài -> bài 1 nhận
    r = _ex("この本の使い方\n第1課はあいさつ\n第2課はかいもの\n" + ocr.replace("課", "課　"), None)
    assert [c.title for c in r.chapters] == ["第1課 はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.skipped == ["この本の使い方"]


# --- Second review 7f66b34: các ca từng tách sai / làm chậm ---------------------------------------------------------
def test_particle_sentences_with_existing_lesson_number_do_not_split_lessons():
    # (1) は/に/が + hiragana sau khoảng trắng / dấu ngăn từng được nhận thẳng là tiêu đề, bỏ qua kiểm tra dãy số bài
    for line in ["第3課 がおわったら", "第2課 はおもしろかったです", "第1課 にでてきたことば", "第2回 はお休みです",
                 "Lesson 1: はどうでしたか"]:
        assert _head(line) is None, line
    text = ("第1課 あいさつ\nこんにちは。\n第1課 はどうでしたか\nたのしかったです。\n第2課 かいもの\nいくらですか。\n"
            "第2課 はどうでしたか\nたかかったです。\n第3課 しゅうまつ\nえいがをみます。")
    r = _ex(text, None)
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
        r = _ex("\n".join(lessons + [ref, "つぎのことばをおぼえましょう", "たべます", "のみます"]), None)
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
    # Dòng ở phần cách dùng sách đọc được là tên bài ("第1課はなび", hộp ví dụ) -> không biết dòng nào là tiêu đề
    text = ("本書の使い方\n第1課はなび\n第1課はじめまして\nわたしはマイクです。\n第2課 かいもの\nいくらですか。\n"
            "第3課 しゅうまつ\nえいがをみます。")
    r = _ex(text, None)
    # Bài 1 không có tiêu đề nhưng nội dung không bị bỏ cùng phần cách dùng sách: chỉ phần trước dòng "第1課…" không đứng sát
    # dòng tiêu đề khác là đầu sách (test_unrecognized_lessons_in_front_matter_are_kept)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課はじめまして\nわたしはマイクです。"
    assert r.skipped == ["本書の使い方"]
    # Câu giới thiệu đọc như câu ("第1課はあいさつの課です" — đuôi です, _sentence_like; "第1課はあいさつ" — từ điển đọc は +
    # あいさつ, _particle_led) nhường bài 1 cho dòng đặt tên bài: tiêu đề OCR thật nhận; câu ấy ở phần cách dùng sách nên bỏ
    # cùng phần đầu
    for intro in ("第1課はあいさつの課です", "第1課はあいさつ"):
        r = _ex(text.replace("第1課はなび", intro), None)
        assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課 かいもの", "第3課 しゅうまつ"], intro
        assert r.chapters[0].text == "わたしはマイクです。"
        assert r.skipped == ["本書の使い方"]
    # Hộp "第2課はるのうた" (đọc được là tên) vs tiêu đề OCR thật -> hoà, không nhận dòng nào
    text = ("第1課 あいさつ\nこんにちは。\n第2課はるのうた\nかいものにいきます\n第2課にほんのくらし\nにほんはたのしいです。\n"
            "第3課 しゅうまつ\nえいがをみます。")
    r = _ex(text, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第3課 しゅうまつ"]
    assert "第2課はるのうた" in r.chapters[0].text and "第2課にほんのくらし" in r.chapters[0].text
    # Trợ từ + kanji ("の予習") không phải ứng viên -> tiêu đề OCR thật là ứng viên duy nhất của bài 2; bản hiragana
    # "のよしゅう" (_LESSON_PART) và "… của bài 2" ("のはなし", _particle_led) nhường tiêu đề thật — trước đây hai cách viết
    # của cùng một chữ cho hai kết quả khác nhau
    for ref in ("の予習", "のよしゅう", "のはなし"):
        assert _titles(text.replace("はるのうた", ref)) == ["第1課 あいさつ", "第2課にほんのくらし", "第3課 しゅうまつ"], ref
    # Đúng một dòng có dấu ngăn -> dòng đó; 全角 thì không (sau NFKC chỉ là khoảng trắng như câu gõ tay) -> vẫn hoà
    assert _titles(text.replace("課にほん", "課：にほん")) == ["第1課 あいさつ", "第2課:にほんのくらし", "第3課 しゅうまつ"]
    assert _titles(text.replace("課にほん", "課　にほん")) == ["第1課 あいさつ", "第3課 しゅうまつ"]
    # Ứng viên lệch dãy ("第7課のはなし" giữa bài 1 và bài 3) không chắn ứng viên đúng chỗ
    text = "第1課 あいさつ\nx。\n第7課のはなし\ny。\n第2課はなみ\nz。\n第3課 しゅうまつ\nw。"
    assert _titles(text) == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]


# --- Third review: lặp trong cùng bài, khoảng trắng nửa cỡ, mục lục 2 bài --------------------------------------------
# Tên hộp "第2課はるのうた" (bài hát của bài 2; đọc được là tên bài, không phải câu) lặp hai lần trong thân bài 2
_BOX_TWICE = ("第1課 あいさつ\nx。\n第2課はなみ\nはなみにいきます。\nさくらがきれいです。\n第2課はるのうた\nさくら\n"
              "第2課はるのうた\nはな\n第3課 しゅうまつ\nz。")


def test_repetition_inside_one_lesson_is_not_a_heading_signal():
    # Tên hộp lặp hai lần trong thân bài 2 từng thắng tiêu đề thật "第2課はなみ" (lặp = dấu hiệu mạnh) và cắt câu mở đầu
    # bài 2 sang bài 1. Hai ứng viên, không dòng nào có dấu hiệu tiêu đề -> không nhận dòng nào (như trước 7f66b34): bài
    # 2 ở lại trong bài 1, không có tiêu đề giả
    r = _ex(_BOX_TWICE, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第3課 しゅうまつ"]
    assert r.chapters[0].text == _BOX_TWICE.split("\n", 1)[1].rsplit("\n第3課", 1)[0]
    # Tên hộp là tên phần bài ("第2課のことば", _LESSON_PART) hay "… của bài 2" ("第2課のはなし", _particle_led): nhường số
    # bài cho dòng đặt tên bài -> tiêu đề thật nhận, hộp ở lại trong thân bài 2
    for box in ("のことば", "のはなし"):
        r = _ex(_BOX_TWICE.replace("はるのうた", box), None)
        assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"], box
        assert r.chapters[1].text == "はなみにいきます。\nさくらがきれいです。\n第2課%s\nさくら\n第2課%s\nはな" % (box, box)
    # Tài liệu 2 bài có phần cách dùng sách: câu mở đầu bài 1 và tiêu đề thật từng bị bỏ như phần đầu sách
    text = ("はじめに\nこの本の使い方をせつめいします\n第1課はなみ\nはなみにいきます。\nさくらがきれいです。\n第1課はるのうた\n"
            "さくら\nはな\n第1課はるのうた\nおべんとう\n第2課　ともだち\nともだちとあそびます。")
    r = _ex(text, None)
    assert r.detected is False and r.chapters[0].text == normalize(text)
    # ... với hộp "第1課のことば" thì bài 1 nhận được; chỉ dòng giới thiệu sách bị bỏ như phần đầu
    r = _ex(text.replace("はるのうた", "のことば"), None)
    assert [c.title for c in r.chapters] == ["第1課はなみ", "第2課 ともだち"]
    assert r.chapters[0].text.startswith("はなみにいきます。\nさくらがきれいです。\n第1課のことば")
    assert r.skipped == ["はじめに", "この本の使い方"]
    # Câu báo trước bài sau lặp hai lần sau bài cuối: không thành bài 4
    lessons = ["Lesson 1: あいさつ", "x。", "Lesson 2: かいもの", "y。", "Lesson 3: しゅうまつ", "z。"]
    tail = ["Lesson 4 のよしゅう", "たべます", "Lesson 4 のよしゅう", "のみます"]
    r = _ex("\n".join(lessons + tail), None)
    assert [c.title for c in r.chapters] == lessons[::2]
    assert r.chapters[2].text == "\n".join(["z。"] + tail)
    # Bản ở mục lục (lặp ở lượt khác của dãy số bài) vẫn là dấu hiệu: tiêu đề thật có trong mục lục thắng tên hộp
    r = _ex("目次\n第1課 あいさつ……1\n第2課はなみ……5\n第3課 しゅうまつ……9\n\n" + _BOX_TWICE, None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課はなみ", "第3課 しゅうまつ"]
    assert r.chapters[1].text.startswith("はなみにいきます。\nさくらがきれいです。\n第2課はるのうた")
    assert r.skipped == ["目次"]
    # Ứng viên "第1課のはなし" (bài 1 đã có tiêu đề) giữa hai bản header của bài cuối không mở lượt mới -> vẫn không đủ
    # (bài cuối dính liền sau dãy cách)
    r = _ex("第1課 あいさつ\nx。\n第2課 かいもの\ny。\n第3課はなみ\nz。\n第1課のはなし\nw。\n第3課はなみ\nv。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの"]


def test_half_width_space_does_not_break_candidate_tie():
    # Tên hộp gõ tay "第1課 にでてきたことば" (khoảng trắng nửa cỡ) từng thắng tiêu đề thật bị trích dính liền "第1課はなみ"
    # rồi tiêu đề thật + câu mở đầu bài 1 bị bỏ như phần đầu sách. Nửa cỡ không phải dấu hiệu tiêu đề -> hoà, không nhận
    # dòng nào (như trước 7f66b34: không tách, không mất chữ nào). Hộp ở đây là "第1課 はるのうた" (đọc được là tên bài);
    # chính "にでてきたことば" là mệnh đề / tên phần bài (_sentence_like) nên nhường -> tiêu đề thật nhận
    text = ("はじめに\nこの本の使い方をせつめいします\n第1課はなみ\nはなみにいきます。\nさくらがきれいです。\n"
            "第1課 はるのうた\nさくら　はな\n第2課　ともだち\nともだちとあそびます。")
    r = _ex(text, None)
    assert r.detected is False and r.chapters[0].text == normalize(text)
    r = _ex(text.replace("はるのうた", "にでてきたことば"), None)
    assert [c.title for c in r.chapters] == ["第1課はなみ", "第2課 ともだち"]
    assert r.chapters[0].text == "はなみにいきます。\nさくらがきれいです。\n第1課 にでてきたことば\nさくら はな"
    # Chiều ngược lại (dòng dính liền đọc được là tên + tiêu đề cách nửa cỡ) cũng không đoán: bài 1 vào "Mở đầu", không mất
    # nội dung
    body = "第1課 はじめまして\nわたしはマイクです。\n第2課 かいもの\nいくらですか。\n第3課 しゅうまつ\nえいがをみます。"
    r = _ex("第1課はなび\n" + body, None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課はなび\n第1課 はじめまして\nわたしはマイクです。"
    # 全角 sau NFKC là nửa cỡ -> cũng hoà như trên
    assert _titles("第1課はなび\n" + body.replace("第1課 ", "第1課　")) == ["Mở đầu", "第2課 かいもの", "第3課 しゅうまつ"]
    # Câu "第1課はあいさつ" (は + あいさつ) thì nhường tiêu đề thật
    assert _titles("第1課はあいさつ\n" + body)[:2] == ["Mở đầu", "第1課 はじめまして"]
    # Dấu ngăn vẫn phân xử được (câu đứng trước bài 1 vào "Mở đầu" như mọi phần đầu có tiếng Nhật)
    r = _ex("第1課はあいさつ\n" + body.replace("第1課 ", "第1課："), None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "第1課:はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
    assert r.chapters[0].text == "第1課はあいさつ"


def test_unrecognized_lessons_in_front_matter_are_kept():
    # Bài 1, 2 không nhận được tiêu đề (mỗi bài hai ứng viên, không dòng nào có dấu hiệu tiêu đề) còn bài 3, 4 nhận được: trước
    # đây cả phần trước bài 3 bị bỏ như phần đầu sách vì có "はじめに" -> mất trắng nội dung bài 1, 2 (trước 7f66b34 không tách)
    head = ["はじめに", "この本は。"]
    lessons = ["Lesson 1 はなみ", "本文1-0。", "Lesson 1 はるのうた", "本文1-1。", "Lesson 2 にほんのうた",
               "本文1-2。", "Lesson 2 でんわ", "本文2-0。"]
    tail = ["Lesson 3　あいさつ", "本文3-0。", "Lesson 4　はなみ", "本文4-0。"]
    r = _ex("\n".join(head + lessons + tail), None)
    # bài 4 là bài cuối, cùng kiểu cách với bài 3 chắc chắn (全角 -> nửa cỡ sau NFKC)
    assert [c.title for c in r.chapters] == ["Mở đầu", "Lesson 3 あいさつ", "Lesson 4 はなみ"]
    assert r.chapters[0].text == "\n".join(lessons)
    assert (r.chapters[0].start_line, r.chapters[0].end_line) == (2, 10)
    assert r.skipped == ["はじめに"]
    # Có mục lục đủ bài: bản ở mục lục phân xử được hai ứng viên -> đủ 4 bài
    toc = ["目次", "Lesson 1 はなみ……1", "Lesson 2 でんわ……5", "Lesson 3　あいさつ……9", "Lesson 4　はなみ……12", ""]
    r = _ex("\n".join(head + toc + lessons + tail), None)
    assert [c.title for c in r.chapters] == ["Lesson 1 はなみ", "Lesson 2 でんわ", "Lesson 3 あいさつ", "Lesson 4 はなみ"]
    assert r.skipped == ["はじめに", "目次"]
    # Mục lục thiếu bài 1, 2: dòng mục lục (mang số trang / đứng sát nhau) không tính là bài -> bỏ cùng phần đầu, chỉ giữ từ
    # bài 1 ở thân sách
    r = _ex("\n".join(head + toc[:1] + toc[3:] + lessons + tail), None)
    assert [c.title for c in r.chapters] == ["Mở đầu", "Lesson 3 あいさつ", "Lesson 4 はなみ"]
    assert r.chapters[0].text == "\n".join(lessons)
    assert r.skipped == ["はじめに", "目次"]
    # Không có dòng bài nào trước bài đầu tiên: phần đầu sách vẫn bỏ hẳn như trước
    r = _ex("\n".join(head + ["Lesson 1 あいさつ", "本文1-0。", "Lesson 2 かぞく", "本文2-0。"]), None)
    assert [c.title for c in r.chapters] == ["Lesson 1 あいさつ", "Lesson 2 かぞく"]
    assert r.skipped == ["はじめに"]


def test_two_entry_contents_page_is_dropped():
    # Tài liệu 2 bài tự có mục lục: cụm < TOC_MIN_RUN từng không được nhận -> mục lục thành chương 1 rỗng (tiêu đề mang số
    # trang), thân bài 1 dồn vào chương 2. Mục nào cũng có bản ở thân sách phía sau -> vẫn là mục lục
    for h1, h2 in (("第1課はなみ", "第2課はるやすみ"), ("Lesson 1 はなみ", "Lesson 2 はるやすみ"),
                   ("第1課 あいさつ", "第2課 かいもの")):
        text = "\n".join(["目次", h1 + "……1", h2 + "……6", "", h1, "はなみにいきます。", "さくらがきれいです。", h2,
                          "やすみにりょこうします。"])
        r = _ex(text, None)
        assert [(c.title, c.text) for c in r.chapters] == [(h1, "はなみにいきます。\nさくらがきれいです。"),
                                                          (h2, "やすみにりょこうします。")], h1
        assert r.skipped == ["目次"], h1
    # Mục lục không số trang, không dòng "目次"
    r = _ex("第1課 あいさつ\n第2課 かいもの\n第1課 あいさつ\nx。\n第2課 かいもの\ny。", None)
    assert [(c.title, c.text) for c in r.chapters] == [("第1課 あいさつ", "x。"), ("第2課 かいもの", "y。")]
    # Hai tiêu đề liền nhau không có thân mà không xuất hiện lại: không phải mục lục, giữ như trước
    r = _ex("第1課 あいさつ\n第2課 かいもの\n\n第3課 しゅうまつ\nx。\n第4課 かぞく\ny。", None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 かいもの", "第3課 しゅうまつ", "第4課 かぞく"]


# --- Fourth review: dãy tiêu đề dán tay, bài cuối của dãy, chuẩn hoá NFKC -------------------------------------------
# Văn bản dán ở /learning-paths (đúng như người dùng gõ, khoảng trắng ASCII): trước đây chaptersDetected=false, mất cả
# ba tên bài và chữ trong tiêu đề thành thẻ từ vựng — bài 3 không có bài sau nên cần "dấu hiệu mạnh" (全角 / dấu ngăn),
# mà 全角 không bao giờ tới được đây vì reader đã NFKC; bị loại thì kéo đổ luôn bài 2, bài 1.
_LIVE_TEXTS = {
    ("はじめまして", "にほんのくらし", "がっこう"): " ",
    ("あいさつ", "にほんのくらし", "がっこう"): " ",
    ("あいさつ", "にほんのくらし", "でんしゃ"): " ",
    ("はじめまして", "かいもの", "がっこう"): " ",   # trước đây chỉ 2 chương: bài 3 nuốt vào bài 2
}
_LIVE_BODIES = ("わたしは マイクです。よろしく おねがいします。", "にほんの せいかつは たのしいです。",
                "まいにち がっこうへ いきます。")


def _lesson_doc(titles, fmt, bodies=None):
    lines = []
    for k, t in enumerate(titles, start=1):
        lines += [fmt.format(k, t), bodies[k - 1] if bodies else "これは だい%d かの ほんぶんです。" % k]
    return "\n".join(lines)


def test_live_pasted_lessons_keep_all_titles():
    for titles in _LIVE_TEXTS:
        for fmt in ("第{}課 {}", "第{}課{}", "第{}課　{}", "第{}課：{}"):
            doc = _lesson_doc(titles, fmt, _LIVE_BODIES)
            r = _ex(doc, None)
            assert r.detected is True, (titles, fmt)
            assert [c.title for c in r.chapters] == [normalize(fmt.format(k, t)) for k, t in enumerate(titles, 1)], fmt
            assert [c.text for c in r.chapters] == list(_LIVE_BODIES), (titles, fmt)
            assert r.skipped == []


def test_pasted_lessons_through_reader_and_analyze_endpoints():
    # Đúng đường production: backend gửi văn bản dán qua /extract/text (read_text -> normalize NFKC) rồi gửi văn bản đã
    # chuẩn hoá sang /extract/analyze với splitChapters
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    for titles in _LIVE_TEXTS:
        for fmt in ("第{}課 {}", "第{}課{}"):
            got = client.post("/api/extract/text", data={"text": _lesson_doc(titles, fmt, _LIVE_BODIES)})
            assert got.status_code == 200, got.text
            body = got.json()
            res = client.post("/api/extract/analyze", json={"text": body["text"], "blocks": body["blocks"], "options": {
                "splitChapters": True, "levelFilter": "all", "includeGrammar": False}})
            assert res.status_code == 200, res.text
            stats, items = res.json()["stats"], res.json()["items"]
            assert stats["chaptersDetected"] is True, (titles, fmt)
            assert [c["title"] for c in stats["chapters"]] == [fmt.format(k, t) for k, t in enumerate(titles, 1)]
            # Dòng tiêu đề không còn trong thân chương -> chữ trong tên bài không thành thẻ / câu ví dụ
            assert items and all("課" not in (it.get("example") or "") for it in items), (titles, fmt)
            assert {it["chapter"] for it in items} <= {1, 2, 3}


# Ma trận: mỗi tên bài lấy từ danh sách tên dính trợ từ hoặc tên thường; mọi mẫu dính / thường ở mọi vị trí (2^n), mỗi
# tên của danh sách xuất hiện ở mọi vị trí (xoay vòng), ba kiểu ngăn, hai họ từ khoá
_PARTICLE_TITLES = ("はじめまして", "にほんのくらし", "がっこう", "でんしゃ", "にもつ", "がいこく", "はるやすみ")
_PLAIN_TITLES = ("あいさつ", "かいもの", "しゅうまつ", "旅行", "買い物")
_MATRIX_FORMATS = {"spaced": ("第{}課 {}", "Lesson {} {}"), "glued": ("第{}課{}", "Lesson {}{}"),
                   "colon": ("第{}課：{}", "Lesson {}: {}")}


def _matrix_docs():
    for n in (3, 5):
        for pattern in itertools.product((True, False), repeat=n):  # True = tên bài dính trợ từ
            for shift in range(len(_PARTICLE_TITLES)):
                titles = [(_PARTICLE_TITLES if p else _PLAIN_TITLES)[(shift + k) % len(_PARTICLE_TITLES if p else
                                                                                       _PLAIN_TITLES)]
                          for k, p in enumerate(pattern)]
                for style, fmts in _MATRIX_FORMATS.items():
                    for fmt in fmts:
                        yield style, fmt, titles


def test_lesson_chain_matrix_detects_every_lesson():
    seen = 0
    for style, fmt, titles in _matrix_docs():
        r = _ex(_lesson_doc(titles, fmt), None)
        assert [c.title for c in r.chapters] == [normalize(fmt.format(k, t)) for k, t in enumerate(titles, 1)], \
            (style, fmt, titles)
        assert [c.text for c in r.chapters] == ["これは だい%d かの ほんぶんです。" % k for k in range(1, len(titles) + 1)]
        seen += 1
    assert seen == (2 ** 3 + 2 ** 5) * len(_PARTICLE_TITLES) * 6


_SENTENCE_LINES = ("はどうでしたか", "はどうでしたか?", "はおもしろかったです", "にいきましょう", "がおわったら", "のよしゅう",
                   "のふくしゅう", "のれんしゅう", "のしゅくだい", "のまとめ", "のことば", "にでてきたことば", "でならったこと",
                   "にでてくるひと", "のまえに", "のあとで", "はここまで", "にもどる", "にもどって", "にすすむ", "はたのしい",
                   "がはじまる", "にいく", "はなしましょう", "のもくひょう", "はなんでしょう", "はなんだろう")
# Ghi chú lịch học / câu hỏi / "… của bài N" mà _SENTENCE_LINES không liệt kê (review: danh sách cố định không bao giờ đủ)
_NOTE_LINES = ("はあした", "はらいしゅう", "はあさって", "はげつようび", "はやすみ", "はおやすみ", "はなんでしょう", "はどこ",
               "はだれ", "はいつ", "がたのしみ", "はおわり", "はおしまい", "はつぎのじかん", "はなにをならう", "はどんなはなし",
               "はまだ", "はなし", "はらいげつ", "はしゅうまつ", "はなんだろう", "がさいご", "ははじめて", "のつづき", "のこたえ",
               "のあらすじ", "のかいとう", "がおわり", "はきょう")


def test_sentence_like_lines_stay_candidates():
    # Tên bài dính trợ từ là ứng viên (chắc chắn=False) và đọc được là một từ / cụm từ
    for t in _PARTICLE_TITLES + ("はなみ", "のりもの", "でんわ", "はじめてのデート", "にちようび"):
        for line in ("第3課 " + t, "第3課" + t, "Lesson 3 " + t):
            c = chapters._classify(normalize(line))
            assert c is not None and c[2] is False, line
        assert not chapters._sentence_like(t) and not chapters._particle_led(t), t
    # Câu / lời dặn / tên phần bài vẫn là ứng viên (giữa dãy thì vị trí đủ chứng minh, tên bài thật cũng có dạng câu) nhưng
    # bị nhận ra để nhường số bài và không đứng làm bài cuối không dấu ngăn
    for t in _SENTENCE_LINES:
        for line in ("第4課 " + t, "第4課" + t, "Lesson 4 " + t):
            c = chapters._classify(normalize(line))
            assert c is not None and c[2] is False, line
        assert chapters._sentence_like(normalize(t)), t
    for t in _NOTE_LINES:
        assert chapters._particle_led(t), t
    # Tên bài dạng câu (review: từng bị loại khỏi dãy) — danh sách bắt, nhưng từ điển đọc được là từ chứ không phải trợ từ
    for t in ("でんしゃで", "がっこうで", "にほんへ", "にほんから", "はじめてあったひ", "はじめてのかいわ", "にほんのことば"):
        assert chapters._sentence_like(t) and not chapters._particle_led(t), t


def test_chain_tail_needs_same_format_and_title_like_text():
    spaced = ["第1課 あいさつ", "x。", "第2課 にほんのくらし", "y。", "第3課 しゅうまつ", "z。"]
    glued = [ln.replace("課 ", "課") for ln in spaced]
    # Bài cuối không dấu ngăn khác kiểu với dãy: dính liền sau dãy cách, cách sau dãy dính liền -> ở lại trong thân bài 3
    for lessons, tail in ((spaced, "第4課はなみ"), (glued, "第4課 はなみ")):
        r = _ex("\n".join(lessons + [tail, "w。"]), None)
        assert [c.title for c in r.chapters] == lessons[::2], tail
        assert r.chapters[2].text == "z。\n" + normalize(tail) + "\nw。", tail
    # Dấu ngăn là lối dàn tiêu đề -> nhận như trước 7f66b34, không so kiểu với dãy (OCR làm rơi dấu ở tiêu đề trước)
    for lessons, tail in ((glued, "第4課:はなみ"), (spaced, "第4課：はなみ")):
        assert _titles("\n".join(lessons + [tail, "w。"]))[3] == normalize(tail), tail
    # Đọc như câu / lời dặn / báo trước bài sau / ghi chú lịch học, kể cả cùng kiểu ngăn với dãy (ca xấu nhất) -> ở lại
    # trong thân bài 3. _NOTE_LINES không có trong danh sách _sentence_like: từ điển đọc chữ đầu là trợ từ
    for t in ("はどうでしたか", "のよしゅう", "のまえに", "にでてきたことば", "がおわったら", "にすすみましょう",
              "でならったこと", "はたのしい", "がはじまる") + _NOTE_LINES:
        for lessons, sep in ((spaced, " "), (glued, "")):
            tail = "第4課" + sep + t
            r = _ex("\n".join(lessons + [tail, "しゅくだい:たべます", "のみます"]), None)
            assert [c.title for c in r.chapters] == lessons[::2], tail
            assert r.chapters[2].text == "z。\n" + tail + "\nしゅくだい:たべます\nのみます", tail
    # Có dấu ngăn: trợ từ + câu vẫn là câu ("第4課: はらいしゅう", tên hộp "第4課: でならったことば" dàn như tiêu đề); tên
    # bài dạng câu mà từ điển đọc là từ thì nhận như trước
    for t in ("のよしゅう", "はどうでしたか", "はらいしゅう", "はなんでしょう", "のこたえ", "がさいご", "でならったことば",
              "はおもしろかったです", "はむずかしかった"):
        assert _titles("\n".join(spaced + ["第4課: " + t, "w。"])) == spaced[::2], t
    for t in ("にほんへ", "でんしゃで", "はじめてのかいわ"):
        assert _titles("\n".join(spaced + ["第4課: " + t, "w。"]))[3] == "第4課: " + t, t
    # Tên bài mở đầu bằng の: ở giữa dãy thì nhận; ở cuối dãy không dấu ngăn thì giống "第4課のつづき" -> không nhận; có
    # dấu ngăn (lối dàn tiêu đề) thì nhận
    assert _titles(_lesson_doc(("あいさつ", "のりもの", "しゅうまつ"), "第{}課 {}"))[1] == "第2課 のりもの"
    assert _titles(_lesson_doc(("あいさつ", "かいもの", "のりもの"), "第{}課 {}")) == ["第1課 あいさつ", "第2課 かいもの"]
    assert _titles(_lesson_doc(("あいさつ", "かいもの", "のりもの"), "第{}課: {}"))[2] == "第3課: のりもの"
    # Một bài cuối yếu không kéo đổ cả dãy: bài 4 bị loại thì bài 3 thành bài cuối và vẫn nhận (dãy toàn ứng viên)
    cands = ["第1課 はじめまして", "x。", "第2課 にほんのくらし", "y。", "第3課 がっこう", "z。"]
    for tail in ("第4課はなみ", "第4課 はどうでしたか", "第4課 のつづき"):
        r = _ex("\n".join(cands + [tail, "w。"]), None)
        assert [c.title for c in r.chapters] == cands[::2], tail
        assert r.chapters[2].text == "z。\n" + tail + "\nw。", tail
    # Hai dòng khác nhau cho cùng số bài cuối -> không nhận dòng nào, bài 3 ở lại trong thân bài 2
    r = _ex("\n".join(spaced[:4] + ["第3課 がっこう", "z。", "第3課 はなみ", "w。"]), None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 にほんのくらし"]
    assert r.chapters[1].text == "y。\n第3課 がっこう\nz。\n第3課 はなみ\nw。"
    # Số bài đã có tiêu đề chắc chắn -> ứng viên cùng số không bao giờ được nhận, dù đứng sau bài cuối
    r = _ex("\n".join(spaced + ["第2課 がっこう", "w。"]), None)
    assert [c.title for c in r.chapters] == spaced[::2]
    assert r.chapters[2].text == "z。\n第2課 がっこう\nw。"
    # Bài cuối không có thân bài (dòng cuối tài liệu) -> không nhận
    r = _ex("\n".join(spaced[:4] + ["第3課 がっこう"]), None)
    assert [c.title for c in r.chapters] == ["第1課 あいさつ", "第2課 にほんのくらし"]
    # Dãy tiêu đề trơn ("第1課", "第2課") không có kiểu để so: chỉ nhận bài cuối có dấu ngăn
    assert _titles("第1課\nx。\n第2課\ny。\n第3課: がっこう\nz。") == ["第1課", "第2課", "第3課: がっこう"]
    assert _titles("第1課\nx。\n第2課\ny。\n第3課 がっこう\nz。") == ["第1課", "第2課"]
    # Dòng lẻ (không bài n+1 theo sau, không bài n-1 đứng trước) không phải dãy, kể cả có dấu ngăn
    assert _titles("第1課: はじめまして\nx。\n第3課 しゅうまつ\ny。\n第4課 かぞく\nz。") == ["Mở đầu", "第3課 しゅうまつ",
                                                                                     "第4課 かぞく"]


# --- Fifth review: ghi chú cuối dãy ngoài danh sách, tên bài dạng câu, nhiễu kiểu ngăn, phần đầu sách trong bài 1 -------
def _counted(r):
    return [(c.title, c.text.count("本文")) for c in r.chapters]


def test_unlisted_note_after_chain_is_not_a_chapter():
    # Ghi chú lịch học / câu hỏi không có trong danh sách _sentence_like, cùng kiểu cách với dãy: từng thành bài 4 giả ôm
    # phần bài tập còn lại của bài 3 (HEAD / trước 7f66b34 không có tiêu đề ấy)
    r = _ex("第1課 あいさつ\n本文1。\n第2課 かいもの\n本文2。\n第3課 しゅうまつ\n本文3。\n第4課 はなんでしょう\n"
            "しゅくだい:本文3b。", None)
    assert _counted(r) == [("第1課 あいさつ", 1), ("第2課 かいもの", 1), ("第3課 しゅうまつ", 2)]
    # Dãy dán tay toàn ứng viên + ghi chú: ba bài vẫn nhận, ghi chú ở lại trong thân bài 3
    r = _ex("第1課 はじめまして\n本文1。\n第2課 にほんのくらし\n本文2。\n第3課 がっこう\n本文3。\n第4課 はらいしゅう\n"
            "しゅくだい:本文3b。", None)
    assert _counted(r) == [("第1課 はじめまして", 1), ("第2課 にほんのくらし", 1), ("第3課 がっこう", 2)]
    # Bài giả từng kéo theo luật cắt phần đầu sách ("はじめに" trong bài 1) -> mất trắng bài 1
    r = _ex("第1課 あいさつ\nはじめに\n本文1a。\n本文1b。\n第2課 かいもの\n本文2。\n第3課 はらいしゅう\nしゅくだい:本文2b。",
            None)
    assert _counted(r) == [("第1課 あいさつ", 2), ("第2課 かいもの", 2)] and r.skipped == []
    # Ghi chú dàn có dấu ngăn ngay sau bài n (OCR làm bài n mất dấu ngăn): ghi chú không thành chương nhưng vẫn đỡ bài n
    # như trước — loại nó không được kéo mất bài 4 thật
    r = _ex("Lesson 1: 買い物\n本文1。\nLesson 2: でんわ\n本文2。\nLesson 3: がっこう\n本文3。\nLesson 4 はなみ\n本文4。\n"
            "Lesson 5: はらいげつ\nしゅくだい:本文4b。", None)
    assert [c.title for c in r.chapters] == ["Lesson 1: 買い物", "Lesson 2: でんわ", "Lesson 3: がっこう", "Lesson 4 はなみ"]
    assert r.chapters[3].text == "本文4。\nLesson 5: はらいげつ\nしゅくだい:本文4b。"


def test_sentence_shaped_titles_in_the_middle_of_a_chain_are_kept():
    # Tên bài thật đuôi trợ từ / có động từ chia / đuôi tên phần bài: giữa bài n-1 và n+1 thì vị trí đã đủ chứng minh
    # (như HEAD); từng bị loại khỏi dãy -> bài nhập vào bài trước, dãy toàn ứng viên có dấu ngăn thì mất cả dãy
    for t in ("でんしゃで", "がっこうで", "にほんへ", "はこねへ", "にほんから", "はじめてあったひ", "はじめてのかいわ",
              "はじめてのかんじ", "にほんのことば", "はなしましょう"):
        for fmt in ("第{}課 {}", "第{}課{}", "第{}課: {}", "Lesson {} {}"):
            doc = _lesson_doc(("あいさつ", t, "かいもの"), fmt)
            assert _titles(doc) == [normalize(fmt.format(k, x)) for k, x in enumerate(("あいさつ", t, "かいもの"), 1)], \
                (t, fmt)
    r = _ex("第1課: はじめまして\n本文1。\n第2課: にほんへ\n本文2。\n第3課: がっこう\n本文3。\n第4課: はなみ\n本文4。", None)
    assert [c.title for c in r.chapters] == ["第1課: はじめまして", "第2課: にほんへ", "第3課: がっこう", "第4課: はなみ"]


def test_sentence_shaped_lesson_one_title_is_not_dropped_as_front_matter():
    # _first_unrecognized_lesson nhìn qua _classify: tên bài 1 dạng câu từng vô hình ở đó -> cả bài 1 bị bỏ như phần đầu
    for t in ("はじめてのかいわ", "にほんへ", "はなしましょう"):
        r = _ex("はじめに\nこの本のつかいかた。\n第1課 %s\n本文1a。\n本文1b。\n第2課 かいもの\n本文2。\n第3課 しゅうまつ\n"
                "本文3。" % t, None)
        assert _counted(r) == [("第1課 " + t, 2), ("第2課 かいもの", 1), ("第3課 しゅうまつ", 1)], t
        assert r.skipped == ["はじめに"], t


def test_separator_noise_does_not_drop_punctuated_last_lesson():
    # Một tiêu đề OCR mất dấu ":" từng làm cả đoạn dãy thành "lẫn kiểu" -> bài cuối có dấu ngăn bị loại rồi kéo đổ dãy
    assert _titles("第1課: はじめまして\n本文1。\n第2課 にほんのくらし\n本文2。\n第3課: がっこう\n本文3。\n第4課: はなみ\n"
                   "本文4。") == ["第1課: はじめまして", "第2課 にほんのくらし", "第3課: がっこう", "第4課: はなみ"]
    assert _titles("Lesson 1 はじめまして\n本文1。\nLesson 2: にほんのくらし\n本文2。\nLesson 3: がっこう\n本文3。") == [
        "Lesson 1 はじめまして", "Lesson 2: にほんのくらし", "Lesson 3: がっこう"]
    assert _titles("第1課: あいさつ\n本文1。\n第2課かいもの\n本文2。\n第3課: にほんのくらし\n本文3。") == [
        "第1課: あいさつ", "第2課かいもの", "第3課: にほんのくらし"]
    assert _titles("第1課かいもの\n本文1。\n第2課. はじめまして\n本文2。") == ["第1課かいもの", "第2課. はじめまして"]
    # Header đầu trang lặp tiêu đề chắc chắn (kể cả mang số trang) không cắt đoạn dãy
    assert _titles("はじめに\nこの本は。\n第1課. でんわ\n本文1。\n第2課 かいもの\n本文2。\n第2課 かいもの 12\n第3課 レストラン\n"
                   "本文3。\n第4課. にほんのくらし\n本文4。")[3] == "第4課. にほんのくらし"


def test_running_header_with_page_number_is_the_same_title():
    # "第21課にもつ 165" (header đầu trang) từng ra khoá "第21課にも" (số trang xoá luôn chữ trước nó) rồi hoà với chính
    # "第21課にもつ" -> bài 21 không nhận, bài 22-24 mất chỗ dựa
    lines = ["第20課 旅行", "本文20。", "第21課のよしゅう", "本文20b。", "第21課にもつ", "本文21a。", "第21課にもつ 165",
             "本文21b。", "第22課 はるやすみ", "本文22。", "第23課 はなみ", "本文23。", "第24課 にほんのくらし", "本文24。",
             "第25課 ともだち", "本文25。"]
    r = _ex("\n".join(lines), None)
    assert [c.title for c in r.chapters] == ["第20課 旅行", "第21課にもつ", "第22課 はるやすみ", "第23課 はなみ",
                                             "第24課 にほんのくらし", "第25課 ともだち"]
    assert r.chapters[1].text == "本文21a。\n本文21b。"
    # Một bài duy nhất + header của chính nó: không tách thành hai chương cùng tên
    assert _ex("Lesson 19: かいもの\n本文1。\nLesson 19: かいもの 296\n本文2。", None).detected is False


def test_front_matter_line_inside_lesson_one_keeps_lesson_one():
    # Dãy dán tay nay tách được nên tới luật cắt phần đầu sách: dòng "Cách sử dụng ～です" (ghi chú ngữ pháp) / "はじめに"
    # trong bài 1 từng làm bỏ cả bài 1. Bài 1 rồi bài 2 liền số là bài thật của dãy, không phải mục lục sót
    for note in ("Cách sử dụng ～です", "はじめに"):
        r = _ex("第1課 はじめまして\n本文1。\n%s\n本文1b。\n第2課 にほんのくらし\n本文2。\n第3課 がっこう\n本文3。" % note,
                None)
        assert _counted(r) == [("第1課 はじめまして", 2), ("第2課 にほんのくらし", 1), ("第3課 がっこう", 1)], note
        assert r.skipped == [], note


def test_review_cases_through_reader_and_analyze_endpoints():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    cases = {
        "第1課 はじめまして\nわたしは マイクです。\n第2課 にほんのくらし\nにほんの せいかつは たのしいです。\n第3課 がっこう\n"
        "まいにち がっこうへ いきます。\n第4課 はらいしゅう\nしゅくだい: れんしゅうを してください。":
            ["第1課 はじめまして", "第2課 にほんのくらし", "第3課 がっこう"],
        "第1課: はじめまして\nわたしは マイクです。\n第2課: にほんへ\nひこうきで いきます。\n第3課: がっこう\n"
        "まいにち がっこうへ いきます。\n第4課: はなみ\nさくらが きれいです。":
            ["第1課: はじめまして", "第2課: にほんへ", "第3課: がっこう", "第4課: はなみ"],
    }
    for text, titles in cases.items():
        body = client.post("/api/extract/text", data={"text": text}).json()
        res = client.post("/api/extract/analyze", json={"text": body["text"], "blocks": body["blocks"], "options": {
            "splitChapters": True, "levelFilter": "all", "includeGrammar": False}})
        assert res.status_code == 200, res.text
        assert [c["title"] for c in res.json()["stats"]["chapters"]] == titles


# 998 tiêu đề dính trợ từ + 1 tiêu đề chắc chắn; chuỗi 150 bài rồi 2 000 dòng "第1課のはなし" không được nhận; 999 ứng
# viên cùng kiểu (nhận trọn, bài cuối đứng được như bài cuối dãy); 999 ứng viên xen kẽ dính liền / cách (không bài cuối
# nào khớp kiểu -> loại lan truyền ngược suốt dãy)
_PERF_CASES = {
    "glued_chain": ([x for k in range(1, 999) for x in ("第%d課はじめ" % k, "ほんぶん。")] + ["第999課 おわり", "ほんぶん。"],
                    999),
    "chain_plus_noise": ([x for k in range(1, 151) for x in ("第%d課はじめ" % k, "ほんぶん。")] + ["第151課 おわり"]
                         + ["第1課のはなし"] * 2000, 151),
    "candidate_chain": ([x for k in range(1, 1000) for x in ("第%d課はじめ" % k, "ほんぶん。")], 999),
    "mixed_styles": ([x for k in range(1, 1000) for x in ("第%d課%sはじめ" % (k, " " * (k % 2)), "ほんぶん。")], 1),
    # 699 bài mỗi bài hai ứng viên đọc được là tên (không nhận) sau "はじめに": phần đầu giữ thành "Mở đầu"
    # (_first_unrecognized_lesson)
    "front_ambiguous": (["はじめに"] + [x for k in range(1, 700) for x in ("第%d課はじめ" % k, "ほんぶん。", "第%d課はなび" % k,
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
    assert len(_ex(text, None).chapters) == expected
    monkeypatch.undo()
    # Đồng hồ: ngưỡng rộng (~20 lần thời gian thật) và lấy lần nhanh nhất trong 3 để laptop chậm / GC
    # không làm test chập chờn
    best = float("inf")
    for _ in range(3):
        start = time.perf_counter()
        _ex(text, None)
        best = min(best, time.perf_counter() - start)
        if best < 1.0:
            break
    assert best < 1.0, "%s: %.2f s cho %d dòng" % (case, best, len(lines))
