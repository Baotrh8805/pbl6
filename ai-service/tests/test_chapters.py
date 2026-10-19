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
def test_particle_start_title_after_separator_is_heading():
    # Có khoảng trắng (cả 全角) / dấu ngăn giữa số bài và tên bài -> tên bài, không phải câu văn
    for line in ["第1課 はじめまして", "第1課　はじめまして", "第2課 にほんの　くらし", "第3課：がっこう",
                 "Lesson 1: はじめまして", "Lesson 1　はじめまして", "第4課 はじめてのデート"]:
        assert heading_title(line) == line
    # Dính liền sau số: không phân biệt được với câu "第1課は…" -> một dòng riêng lẻ vẫn bỏ như trước
    assert heading_title("第1課はじめまして") is None
    assert heading_title("第3課では…") is None
    assert heading_title("第2回目の授業で") is None
    # Các chốt khác vẫn áp dụng dù có khoảng trắng
    assert heading_title("第1課 はじめまして。") is None
    assert heading_title("第1課 は、あいさつです") is None
    assert heading_title("第1課 は" + "あ" * 50) is None


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
    # Hai tiêu đề dính trợ từ liền nhau: bài 2 nhận trước (đứng trước bài 3) rồi làm mốc cho bài 1
    r = split_chapters_ex("第1課はじめまして\nx。\n第2課にほんのくらし\ny。\n第3課しゅうまつ\nz。", None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課にほんのくらし", "第3課しゅうまつ"]
    # Tiêu đề cuối (sau bài n-1); "第3課のまとめ" sau đó đã có bài 3 -> ở lại trong thân
    r = split_chapters_ex("第1課あいさつ\nx。\n第2課かいもの\ny。\n第3課はるやすみ\nz。\n第3課のまとめ\nw", None)
    assert [c.title for c in r.chapters] == ["第1課あいさつ", "第2課かいもの", "第3課はるやすみ"]
    assert "第3課のまとめ" in r.chapters[2].text
    # Mục lục OCR có cùng tiêu đề -> mục lục vẫn bị bỏ theo cụm, bài 1 thật vẫn nhận
    r = split_chapters_ex("目次\n第1課はじめまして……1\n第2課かいもの……5\n第3課しゅうまつ……9\n\n" + ocr, None)
    assert [c.title for c in r.chapters] == ["第1課はじめまして", "第2課かいもの", "第3課しゅうまつ"]
    assert "目次" in r.skipped
    # Câu "第1課は…" trong phần cách dùng sách (trước bài 1 thật) không khớp dãy -> không thành tiêu đề
    r = split_chapters_ex("この本の使い方\n第1課はあいさつ\n第2課はかいもの\n" + ocr.replace("課", "課 "), None)
    assert [c.title for c in r.chapters] == ["第1課 はじめまして", "第2課 かいもの", "第3課 しゅうまつ"]
