from app.extract.entries import Entry, detect_layout, parse_line


def test_parse_tab_separated_english_gloss():
    e = parse_line("銀行でお金を下ろす\twithdraw some money from your account")
    assert e == Entry(("銀行でお金を下ろす",), "withdraw some money from your account", "en")


def test_parse_separators_and_vietnamese_gloss():
    assert parse_line("勉強する - học").gloss_lang == "vi"
    assert parse_line("学校：trường học") == Entry(("学校",), "trường học", "vi")
    assert parse_line("映画｜bộ phim") == Entry(("映画",), "bộ phim", "vi")
    assert parse_line("映画|film").gloss == "film"


def test_parse_line_tesseract_tail_dropped():
    # dòng Tesseract bảng song ngữ: gloss EN rồi chữ Trung/Hàn đọc nhầm
    e = parse_line("銀行口座bank account銀行具戸較子媒")
    assert e.headwords == ("銀行口座",) and e.gloss == "bank account" and e.gloss_lang == "en"


def test_parse_drops_chinese_and_korean_gloss():
    assert parse_line("銀行口座\t银行账户") == Entry(("銀行口座",), None, None)
    assert parse_line("銀行口座\t은행구좌") == Entry(("銀行口座",), None, None)


def test_parse_markers_and_labels_removed():
    assert parse_line("↔ 預ける\tput money in a bank account").headwords == ("預ける",)
    assert parse_line("➔ 振込 (N)\tbank transfer").headwords == ("振込",)
    assert parse_line("支払い(N)\tpayment").headwords == ("支払い",)
    assert parse_line("1. 収入\tincome").headwords == ("収入",)
    assert parse_line("・赤字\tdeficit").headwords == ("赤字",)


def test_parse_alternatives_expand_shared_prefix():
    e = parse_line("銀行でお金を[下ろす/引き出す\twithdraw money")
    assert e.headwords == ("銀行でお金を下ろす", "銀行でお金を引き出す")
    assert parse_line("下ろす／引き出す\twithdraw").headwords == ("下ろす", "引き出す")


def test_parse_notes_and_junk_return_none():
    assert parse_line("＊公共料金＝電気代、ガス代、水道代、電話代など") is None
    assert parse_line("*公共料金=電気代、ガス代") is None     # sau NFKC
    assert parse_line("※ バランスが取れた食事") is None
    assert parse_line("hydro bills, gas bills, water bills") is None
    assert parse_line("") is None
    assert parse_line("   \t  ") is None


def test_parse_gloss_truncated_and_cleaned():
    e = parse_line("収入\t  income / revenue ,  ")
    assert e.gloss == "income / revenue"
    assert 100 < len(parse_line("収入	" + "income revenue " * 30).gloss) <= 120   # cắt 120 rồi strip khoảng trắng cuối


BANK = (
    "銀行でお金を下ろす\twithdraw some money from your account\n"
    "預ける\tput money in a bank account\n"
    "銀行口座\tbank account\n"
    "自動で引き落とされる\tbe paid by automatic bank transfer\n"
    "*公共料金=電気代、ガス代、水道代、電話代など\n"
    "収入\tincome/revenue\n"
)
PROSE = (
    "私は毎日日本語学校で勉強しなければなりません。\n"
    "昨日は友達と一緒に映画を見に行きました。\n"
    "日本語の勉強はとても面白いです。\n"
    "漢字を書くことができます。\n"
)


def test_detect_layout_list_and_prose():
    assert detect_layout(BANK) == "list"
    assert detect_layout(PROSE) == "prose"
    assert detect_layout("銀行口座\tbank account\n") == "prose"          # < 3 dòng


def test_detect_layout_dialogue_is_prose():
    dialogue = "A：はい。\nB：そうですね。\nA：行きましょう。\nB：はい、行きます。\n"
    assert detect_layout(dialogue) == "prose"


def test_detect_layout_word_list_without_gloss_is_prose():
    assert detect_layout("勉強\n学校\n映画\n漢字\n") == "prose"


# --- Sau review: định dạng dán tay phổ biến ---------------------------------------------------------------

def test_detect_layout_bilingual_sentences_is_prose():
    text = "私は学生です。 I am a student.\n彼は先生です。 He is a teacher.\nこれは本です。 This is a book.\n"
    assert detect_layout(text) == "prose"


def test_parse_gloss_column_before_headword_is_swapped():
    assert parse_line("bank account\t銀行口座") == Entry(("銀行口座",), "bank account", "en")


def test_parse_three_columns_reading_and_gloss():
    e = parse_line("漢字\tかんじ\tkanji")
    assert e.headwords == ("漢字",) and e.reading == "かんじ" and e.gloss == "kanji" and e.gloss_lang == "en"
    assert parse_line("学校\tがっこう\ttrường học").gloss_lang == "vi"
    assert parse_line("学校\tschool").reading is None


def test_ocr_junk_gloss_is_rejected():
    # Dòng Tesseract của bảng song ngữ: phần Latin chỉ là ký tự đọc nhầm, không phải nghĩa tiếng Anh
    assert parse_line("自動で引き落とされる自区交直らel和") .gloss is None
    assert parse_line("家綱を振り込む革具光租生生3計中@振迄)ME導き").gloss is None
    assert parse_line("公共料金を支払う公共移すぎ信人2選の支抱いOO pm fd 24").gloss is None
    # nhưng gloss thật (kể cả OCR hơi lỗi) vẫn nhận
    assert parse_line("レム3つPy the utility Charges 1は").gloss == "Py the utility Charges 1"
    assert parse_line("銀行口座\tbank account").gloss == "bank account"
    assert parse_line("支払い\tpayment").gloss == "payment"
    assert parse_line("収入\tincome/revenue").gloss == "income/revenue"
