import pytest

from app.extract import jmdict, pipeline
from app.extract.jlpt import LEVELS
from app.extract.pipeline import analyze, split_sentences

# jmdict.sqlite không commit (scripts/build_dicts.py) nên CI không có; test dựa vào nghĩa / từ ghép của JMdict thì bỏ qua.
needs_jmdict = pytest.mark.skipif(not jmdict.available(), reason="chưa có jmdict.sqlite (python scripts/build_dicts.py)")

PARAGRAPH = (
    "私は毎日日本語学校で勉強しなければなりません。"
    "昨日は友達と一緒に映画を見に行きました。"
    "日本語の勉強はとても面白いです。\n"
    "This line has no Japanese.\n"
    "漢字（かんじ）を書くことができます。"
)


def test_split_sentences_skips_non_japanese():
    sents = split_sentences(PARAGRAPH)
    assert len(sents) == 4
    assert all("This line" not in s for s in sents)


def test_analyze_end_to_end():
    r = analyze(PARAGRAPH, None, {"userLevel": "N5", "levelFilter": "all"})
    items, stats = r["items"], r["stats"]
    assert items and not r["truncated"]
    terms = {it["term"] for it in items if it["kind"] == "vocab"}
    assert {"勉強", "学校", "映画", "漢字"} <= terms
    grammar = {it["term"] for it in items if it["kind"] == "grammar"}
    assert "〜なければならない" in grammar and "〜ことができる" in grammar
    # Vị trí 1-based, tăng dần
    assert [it["position"] for it in items] == list(range(1, len(items) + 1))
    # Thống kê khớp
    assert stats["vocab"] == sum(1 for it in items if it["kind"] == "vocab")
    assert stats["grammar"] == sum(1 for it in items if it["kind"] == "grammar")
    assert sum(stats["byLevel"].values()) == len(items)
    assert stats["sentences"] == 4 and stats["tokens"] > 0
    # Từ vựng có đủ trường
    benkyou = next(it for it in items if it["term"] == "勉強")
    assert benkyou["reading"] == "べんきょう"
    assert benkyou["readingSegments"] == [{"kanji": "勉", "kana": "べん"}, {"kanji": "強", "kana": "きょう"}]
    assert benkyou["hanViet"] == "MIỄN CƯỜNG"
    assert benkyou["level"] == "N5" and benkyou["levelConfidence"] == 1.0
    assert benkyou["frequency"] == 2
    assert benkyou["meaningEn"] and "study" in benkyou["meaningEn"]
    assert benkyou["example"].startswith("私は毎日")
    assert benkyou["pos"] == "名詞"
    # Ruby trong ngoặc: 漢字 có reading từ nguồn, không thành từ riêng
    kanji = next(it for it in items if it["term"] == "漢字")
    assert kanji["reading"] == "かんじ"
    assert "（" not in kanji["example"]


def test_level_filter_at_or_above_and_drop_unknown():
    r = analyze(PARAGRAPH, None, {"userLevel": "N4", "levelFilter": "at_or_above", "treatUnknownAs": "drop"})
    assert r["items"]
    assert all(it["level"] in {"N4", "N3", "N2", "N1"} for it in r["items"])
    r2 = analyze(PARAGRAPH, None, {"userLevel": "N4", "levelFilter": "only_unknown_to_me"})
    assert all(it["level"] in {None, "N3", "N2", "N1"} for it in r2["items"])


def test_options_toggle_grammar_furigana_hanviet_and_min_frequency():
    r = analyze(PARAGRAPH, None, {"includeGrammar": False, "includeFurigana": False, "includeHanViet": False,
                                  "minFrequency": 2})
    assert all(it["kind"] == "vocab" for it in r["items"])
    assert all(it["readingSegments"] is None and it["hanViet"] is None for it in r["items"])
    assert all(it["frequency"] >= 2 for it in r["items"])
    assert {it["term"] for it in r["items"]} >= {"勉強", "日本語"}


def test_source_rubies_from_blocks_are_used():
    blocks = [{"text": "大人になる。", "page": 1, "isVertical": None, "rubies": [{"base": "大人", "reading": "おとな"}]}]
    r = analyze("大人になる。", blocks, None)
    otona = next(it for it in r["items"] if it["term"] == "大人")
    assert otona["reading"] == "おとな"


def test_limits_and_truncation(monkeypatch):
    monkeypatch.setattr(pipeline, "MAX_VOCAB", 3)
    monkeypatch.setattr(pipeline, "MAX_GRAMMAR", 1)
    r = analyze(PARAGRAPH, None, None)
    assert r["stats"]["vocab"] == 3 and r["stats"]["grammar"] == 1
    # Giữ từ tần suất cao nhất (勉強 x2, 日本語 x2)
    assert {"勉強", "日本語"} <= {it["term"] for it in r["items"]}
    monkeypatch.setattr(pipeline, "MAX_TEXT_CHARS", 30)
    r = analyze(PARAGRAPH, None, None)
    assert r["truncated"] is True


def test_prose_keeps_sudachi_compounds_whole_without_jmdict(monkeypatch):
    """B4: 自動販売機 / 銀行口座 là một morpheme SudachiDict → một thẻ, không tách 自動/販売/機 dù không có từ điển nào."""
    monkeypatch.setattr(pipeline, "_in_dictionary", lambda lemma, reading: False)
    r = analyze("私は毎日日本語学校で勉強します。自動販売機でジュースを買います。銀行口座を開きます。", None, {"levelFilter": "all"})
    terms = {it["term"] for it in r["items"] if it["kind"] == "vocab"}
    assert {"日本語", "学校", "自動販売機", "銀行口座"} <= terms
    assert not terms & {"日本", "語", "自動", "販売", "機", "銀行", "口座"}


def test_proper_nouns_are_not_vocab():
    from app.extract.pipeline import analyze
    out = analyze("田中さんは東京で会社へ行きます。", None, {"levelFilter": "all"})
    terms = [i["term"] for i in out["items"] if i["kind"] == "vocab"]
    assert "田中" not in terms
    assert "会社" in terms
    # Địa danh có trong danh sách JLPT vẫn là từ vựng
    out = analyze("日本へ行きます。", None, {"levelFilter": "all"})
    assert "日本" in [i["term"] for i in out["items"]]


# --- Văn bản OCR (blocks có lines + conf): ví dụ sạch, mục đáng ngờ bỏ chọn sẵn ---------------------------

def _ocr(lines: list[tuple[str, float]]) -> tuple[str, list[dict]]:
    text = "\n".join(t for t, _ in lines)
    return text, [{"text": text, "lines": [{"text": t, "conf": c} for t, c in lines]}]


def _vocab(r: dict) -> dict[str, dict]:
    return {it["term"]: it for it in r["items"] if it["kind"] == "vocab"}


def test_ocr_example_keeps_only_japanese_run_around_term():
    # Dòng thật từ ảnh bảng song ngữ: chữ Anh dính liền và ký hiệu đọc nhầm
    text, blocks = _ocr([("銀行でお金を[まっッmetmoneyfromyouraccount>預ける人GS", 0.80),
                         ("栄養がかたよるapoordiet償友失油。", 0.80)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["銀行"]["example"] == "銀行でお金を"
    assert v["栄養"]["example"] == "栄養がかたよる"
    # Cụm quá ngắn (chỉ còn đúng từ / thêm 1 ký tự) không đáng làm ví dụ
    assert v["預ける"]["example"] is None


def test_ocr_example_dropped_on_low_confidence_line_and_taken_from_later_good_line():
    # (電気代 là một morpheme SudachiDict nên B4 giữ nguyên → dòng tốt dùng 電気 đứng riêng)
    text, blocks = _ocr([("中肌、志所綿、水次の電気", 0.30),
                         ("電気を消すのを忘れた", 0.90)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["電気"]["example"] == "電気を消すのを忘れた"
    assert v["志"]["example"] is None


@needs_jmdict
def test_ocr_suspect_items_are_flagged_unselected():
    # conf thật của dòng này là 0.40: phần tiếng Nhật đúng nhưng cả dòng bị kéo xuống bởi chữ Anh/Trung
    text, blocks = _ocr([("銀行口座bankaccount銀行具戸較子媒", 0.40),
                         ("中肌、志所綿", 0.45),
                         ("電気を消す", 0.95)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["銀行"]["suspect"] is False                                    # từ có nghĩa + cấp JLPT: giữ
    assert "銀行口座" in v and "口座" not in v                             # B4: từ ghép SudachiDict giữ nguyên
    assert v["具"]["suspect"] is True and v["肌"]["suspect"] is True        # chữ đơn trên dòng kém
    assert v["電気"]["suspect"] is False


def test_ocr_item_without_dictionary_meaning_is_suspect():
    text, blocks = _ocr([("覆公を払う", 0.95)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["覆公"]["meaningEn"] is None and v["覆公"]["suspect"] is True


def test_sudachi_compound_without_dictionary_entry_gets_component_level_and_is_not_suspect():
    """B4: 銀行口座 / 電気代 là một morpheme SudachiDict nhưng JLPT / JMdict không có → cấp khó nhất của thành phần
    (phrase_level, như cụm trong bố cục danh sách); không OOV nên thiếu nghĩa từ điển không làm bỏ chọn sẵn."""
    text, blocks = _ocr([("銀行口座を開きました", 0.95), ("電気代を払うのを忘れた", 0.90)])
    v = _vocab(analyze(text, blocks, {}))
    for term in ("銀行口座", "電気代"):
        assert v[term]["level"] in LEVELS and v[term]["levelSources"][0].startswith("phrase:"), term
        assert v[term]["suspect"] is False and v[term]["levelConfidence"] <= 0.8
    # không còn unknown → sống sót treatUnknownAs = drop và đếm đúng cấp trong byLevelAll
    r = analyze("銀行口座を開きました。", None, {"treatUnknownAs": "drop"})
    assert "銀行口座" in {it["term"] for it in r["items"]} and r["stats"]["byLevelAllVocab"]["unknown"] == 0
    # bố cục danh sách (một token mode C) cùng quy tắc
    r = analyze("銀行口座\tbank account\n電気代\telectricity bill\n支出\texpenditure\n", None, {"extractMode": "list"})
    assert [it["term"] for it in r["items"]] == ["銀行口座", "電気代", "支出"]
    assert all(it["level"] in LEVELS for it in r["items"])


def test_plain_text_keeps_full_sentence_and_nothing_suspect():
    r = analyze("私はPCで日本語を勉強します。覆公", None, {})
    v = _vocab(r)
    assert v["勉強"]["example"] == "私はPCで日本語を勉強します。"
    assert all(it.get("suspect") is False for it in r["items"] if it["kind"] == "vocab")


def test_ocr_grammar_example_is_cleaned():
    text, blocks = _ocr([("自動で引き落とされる邊区店6cl和", 0.70)])
    g = next(it for it in analyze(text, blocks, {})["items"] if it["term"] == "〜られる")
    assert g["example"] == "自動で引き落とされる邊区店"   # "6" (chữ số ASCII) cắt cụm
    assert g["suspect"] is False


# --- Bố cục danh sách từ vựng (cụm + nghĩa in sẵn) ---------------------------------------------------------
from pathlib import Path  # noqa: E402

BANK = (Path(__file__).parent / "fixtures" / "bank_vocab.txt").read_text(encoding="utf-8")
BANK_TERMS = ["銀行でお金を下ろす", "銀行でお金を引き出す", "預ける", "銀行口座", "自動で引き落とされる", "授業料を払い込む",
              "家賃を振り込む", "振込", "公共料金を支払う", "支払い", "手数料がかかる", "収入", "支出", "赤字", "黒字",
              "外食する", "自炊する", "高くつく", "栄養がかたよる", "バランスが取れた食事"]


def test_list_layout_extracts_phrases_with_source_gloss():
    r = analyze(BANK, None, {"levelFilter": "all"})
    assert r["stats"]["layout"] == "list"
    assert [it["term"] for it in r["items"]] == BANK_TERMS          # đúng thứ tự, không từ con, không chú thích
    assert all(it["kind"] == "vocab" for it in r["items"]) and r["stats"]["grammar"] == 0
    first = r["items"][0]
    assert first["meaningEn"] == "withdraw some money from your account" and first["meaningVi"] is None
    assert first["reading"] == "ぎんこうでおかねをおろす"
    assert first["readingSegments"][0] == {"kanji": "銀", "kana": "ぎん"}
    assert first["pos"] == "句" and first["hanViet"] is None and first["example"] is None
    assert first["level"] == "N1" and first["levelSources"][0] == "phrase:下ろす"
    furikomi = next(it for it in r["items"] if it["term"] == "振込")
    assert furikomi["pos"] == "名詞" and furikomi["hanViet"] and furikomi["meaningEn"] == "bank transfer"
    assert r["stats"]["vocab"] == 20 and sum(r["stats"]["byLevel"].values()) == 20


def test_list_layout_vietnamese_gloss_used_directly():
    text = "勉強する - học\n学校：trường học\n映画\tbộ phim\n"
    r = analyze(text, None, {"extractMode": "list"})
    by_term = {it["term"]: it for it in r["items"]}
    assert set(by_term) == {"勉強する", "学校", "映画"}
    assert by_term["学校"]["meaningVi"] == "trường học"
    assert by_term["学校"]["meaningEn"] and "school" in by_term["学校"]["meaningEn"]   # JMdict vẫn tra cho nghĩa EN


def test_prose_layout_unchanged_and_reported():
    r = analyze(PARAGRAPH, None, {"userLevel": "N5", "levelFilter": "all"})
    assert r["stats"]["layout"] == "prose"
    assert {"勉強", "学校", "映画", "漢字"} <= {it["term"] for it in r["items"]}


def test_extract_mode_forces_list():
    words = "勉強\n学校\n映画\n漢字\n"
    assert analyze(words, None, {})["stats"]["layout"] == "prose"
    r = analyze(words, None, {"extractMode": "list"})
    assert r["stats"]["layout"] == "list" and [it["term"] for it in r["items"]] == ["勉強", "学校", "映画", "漢字"]
    assert all(it["meaningEn"] for it in r["items"])                       # JMdict điền nghĩa khi không có gloss
    r2 = analyze(BANK, None, {"extractMode": "prose", "levelFilter": "all"})
    assert r2["stats"]["layout"] == "prose" and "銀行" in {it["term"] for it in r2["items"]}


def test_list_layout_ocr_conf_and_suspect():
    blocks = [{"text": "銀行口座\tbank account\n銀行でお全を\twithdraw", "lines": [
        {"text": "銀行口座\tbank account", "conf": 0.9}, {"text": "銀行でお全を\twithdraw", "conf": 0.45}]}]
    r = analyze("銀行口座\tbank account\n銀行でお全を\twithdraw\n支出\texpenditure\n", blocks, {"extractMode": "list"})
    by_term = {it["term"]: it for it in r["items"]}
    assert by_term["銀行口座"]["suspect"] is False
    assert by_term["銀行でお全を"]["suspect"] is True       # cụm không tra được JMdict trên dòng conf thấp
    assert analyze("銀行口座bank\n" + "あ" * 41 + "\tx\n", None, {"extractMode": "list"})["items"][-1]["suspect"] is True


def test_bilingual_sentences_stay_prose():
    text = "私は学生です。 I am a student.\n彼は先生です。 He is a teacher.\nこれは本です。 This is a book.\n"
    r = analyze(text, None, {"levelFilter": "all"})
    assert r["stats"]["layout"] == "prose" and "学生" in {it["term"] for it in r["items"]}


def test_auto_list_without_entries_falls_back_to_prose():
    text = "※銀行口座｜bank account\n※収入｜income\n※支出｜expenditure\n"   # toàn dòng chú thích có dấu tách
    r = analyze(text, None, {"levelFilter": "all"})
    assert r["stats"]["layout"] == "prose" and r["items"]
    r2 = analyze(text, None, {"extractMode": "list"})
    assert r2["stats"]["layout"] == "list" and r2["items"] == []


def test_list_layout_three_columns_uses_reading_column():
    r = analyze("生\tなま\traw\n学校\tがっこう\tschool\n映画\tえいが\tmovie\n", None, {"extractMode": "list"})
    nama = r["items"][0]
    assert nama["term"] == "生" and nama["reading"] == "なま" and nama["meaningEn"] == "raw"
    assert nama["readingSegments"] == [{"kanji": "生", "kana": "なま"}]


# --- Tách chương (splitChapters) ----------------------------------------------------------------------------
CH_TEXT = "第1課\n私は毎日勉強します。\n第2課\n勉強は面白いです。学校へ行きます。"
CH_OPTS = {"splitChapters": True, "levelFilter": "all", "includeGrammar": False}


def test_split_chapters_assigns_chapter_and_merges_across_chapters():
    r = analyze(CH_TEXT, None, CH_OPTS)
    assert r["stats"]["chaptersDetected"] is True
    chs = r["stats"]["chapters"]
    assert [c["index"] for c in chs] == [1, 2] and [c["title"] for c in chs] == ["第1課", "第2課"]
    by_term = {it["term"]: it for it in r["items"]}
    assert by_term["勉強"]["chapter"] == 1 and by_term["勉強"]["frequency"] == 2
    assert by_term["学校"]["chapter"] == 2
    assert "課" not in by_term
    assert [it["position"] for it in r["items"]] == list(range(1, len(r["items"]) + 1))
    chapters = [it["chapter"] for it in r["items"]]
    assert chapters == sorted(chapters)
    assert sum(c["vocab"] for c in chs) == r["stats"]["vocab"]


def test_split_chapters_off_leaves_chapter_none():
    r = analyze(CH_TEXT, None, {"levelFilter": "all", "includeGrammar": False})
    assert r["items"] and all(it["chapter"] is None for it in r["items"])
    assert "chapters" not in r["stats"] and "chaptersDetected" not in r["stats"]


def test_split_chapters_without_headings_is_single_chapter():
    r = analyze("私は毎日勉強します。学校へ行きます。", None, CH_OPTS)
    assert r["stats"]["chaptersDetected"] is False
    assert r["items"] and all(it["chapter"] == 1 for it in r["items"])
    assert len(r["stats"]["chapters"]) == 1 and r["stats"]["chapters"][0]["title"] is None


def test_split_chapters_list_mode():
    text = "第1課\n勉強する\thọc\n学校\ttrường\n第2課\n映画\tphim\n"
    r = analyze(text, None, {**CH_OPTS, "extractMode": "list"})
    by_term = {it["term"]: it["chapter"] for it in r["items"]}
    assert by_term == {"勉強する": 1, "学校": 1, "映画": 2}
    assert r["stats"]["layout"] == "list"


def test_split_chapters_min_frequency_is_document_wide():
    text = "第1課\n私は毎日勉強します。\n第2課\n勉強は面白いです。学校へ行きます。"
    r = analyze(text, None, {**CH_OPTS, "minFrequency": 2})
    by_term = {it["term"]: it for it in r["items"]}
    assert by_term["勉強"]["frequency"] == 2 and by_term["勉強"]["chapter"] == 1
    assert "学校" not in by_term


def test_split_chapters_skips_front_matter_and_reports_it():
    lines = ["目次", "第1課 ...... 1", "第2課 ...... 5", "第3課 ...... 9", "はじめに", "この本は教科書です。",
             "第1課", "私は学生です。", "第2課", "学校へ行きます。", "第3課", "本を読みます。"]
    res = analyze(chr(10).join(lines), None, {"splitChapters": True, "levelFilter": "all", "includeGrammar": False})
    assert res["stats"]["chaptersDetected"] is True
    assert [c["title"] for c in res["stats"]["chapters"]] == ["第1課", "第2課", "第3課"]
    assert "はじめに" in res["stats"]["skippedSections"] and "目次" in res["stats"]["skippedSections"]
    assert not any(it["term"] == "教科書" for it in res["items"])  # câu trong lời nói đầu không thành thẻ


# --- LP-17: cap từ vựng chia theo chương ------------------------------------------------------------------------
from app.extract.pipeline import _chapter_caps  # noqa: E402

# 3 chương: 7 / 4 / 2 ứng viên (学校 và 先生 tần suất 2, còn lại 1); cắt toàn tài liệu 6 từ sẽ không còn từ nào ở chương 3
CAP_TEXT = ("第1課\n私は毎日学校で勉強します。友達と映画を見ます。学校は大きいです。\n"
            "第2課\n先生は本を読みます。先生は親切です。\n"
            "第3課\n水を飲みます。")


def _desc(n: int) -> list[int]:
    return list(range(n, 0, -1))   # tần suất giảm dần n..1


def test_chapter_caps_proportional_with_floor_and_leftover():
    assert pipeline.MAX_VOCAB_CHAPTERED == 900 > pipeline.MAX_VOCAB
    # 500/300/200 ứng viên, cap 600 → đúng tỉ lệ 300/180/120, chương nào cũng ≥ 20
    caps = _chapter_caps([500, 300, 200], [_desc(500), _desc(300), _desc(200)], 600, 20)
    assert caps == [300, 180, 120] and all(c >= 20 for c in caps)
    assert _chapter_caps([500, 300, 200], [_desc(500), _desc(300), _desc(200)], 900, 20) == [450, 270, 180]
    # Chương nhỏ được ghim ở sàn min(20, ứng viên), phần còn lại dồn cho chương lớn; tổng luôn = cap
    assert _chapter_caps([1000, 30, 30], [_desc(1000), _desc(30), _desc(30)], 600, 20) == [560, 20, 20]
    assert _chapter_caps([1000, 5, 5], [_desc(1000), _desc(5), _desc(5)], 600, 20) == [590, 5, 5]
    # Đủ chỗ cho tất cả → không cắt; chương rỗng → 0
    assert _chapter_caps([100, 100, 0], [_desc(100), _desc(100), []], 300, 20) == [100, 100, 0]
    assert _chapter_caps([100, 100, 0], [_desc(100), _desc(100), []], 150, 20) == [75, 75, 0]
    # 50 chương × 20 sàn > cap 900 → sàn hạ xuống 900 // 50 = 18, tổng không vượt cap
    many = _chapter_caps([40] * 50, [_desc(40)] * 50, 900, 20)
    assert sum(many) == 900 and min(many) == 18
    # Phần dư do chia nguyên (20 = 6+6+6 dư 2) → chương còn bị cắt nhiều tần suất nhất (chương 2: 3), hoà → chương trước
    assert _chapter_caps([7, 7, 7], [[5, 1, 1, 1, 1, 1, 1], [3] * 7, [1] * 7], 20, 2) == [7, 7, 6]


def test_chapter_caps_floor_by_affordability_and_more_chapters_than_cap():
    # 53 chương nhưng Σ min(ứng viên, 20) = 745 ≤ 900 → 30 chương 21 ứng viên vẫn đủ sàn 20 (không hạ oan xuống 900 // 53 = 16)
    counts = [300] * 2 + [21] * 30 + [5] * 21
    caps = _chapter_caps(counts, [_desc(n) for n in counts], 900, 20)
    assert sum(caps) == 900 and min(caps[2:32]) == 20 and caps[32:] == [5] * 21 and min(caps[:2]) >= 97
    # Số chương có ứng viên > cap: sàn = 0, không chia cho 0 (chương rỗng ở cuối), tổng đúng = cap, hoà → chương trước
    assert _chapter_caps([1] * 5 + [0], [[1]] * 5 + [[]], 3, 20) == [1, 1, 1, 0, 0, 0]
    assert sum(_chapter_caps([1] * 901, [[1]] * 901, 900, 20)) == 900
    assert sum(_chapter_caps([1] * 901 + [0], [[1]] * 901 + [[]], 900, 20)) == 900


def test_split_chapters_more_chapters_than_cap_does_not_crash(monkeypatch):
    # 4 chương (chương 4 không có ứng viên) với cap 2: trước đây ZeroDivisionError → HTTP 500
    monkeypatch.setattr(pipeline, "MAX_VOCAB_CHAPTERED", 2)
    monkeypatch.setattr(pipeline, "CHAPTER_VOCAB_FLOOR", 1)
    r = analyze("第1課\n猫が好きです。\n第2課\n犬が好きです。\n第3課\n鳥が好きです。\n第4課\n123 456。\n", None, CH_OPTS)
    assert r["stats"]["chaptersDetected"] is True and r["stats"]["vocab"] == 2 == len(r["items"])
    assert sum(c["kept"] for c in r["stats"]["capPerChapter"]) == 2
    assert [c["vocab"] for c in r["stats"]["chapters"]] == [cp["kept"] for cp in r["stats"]["capPerChapter"]]


def test_split_chapters_cap_is_distributed_per_chapter(monkeypatch):
    monkeypatch.setattr(pipeline, "MAX_VOCAB_CHAPTERED", 6)
    monkeypatch.setattr(pipeline, "CHAPTER_VOCAB_FLOOR", 1)
    r = analyze(CAP_TEXT, None, CH_OPTS)
    stats = r["stats"]
    assert stats["chaptersDetected"] is True and stats["vocab"] == 6 == len(r["items"])
    # 7/4/2 ứng viên, cap 6: ch3 dưới sàn → 1; còn 5 chia 7:4 → 3/1, dư 1 → chương 1 (còn nhiều tần suất bị cắt nhất)
    assert stats["capPerChapter"] == [
        {"index": 1, "cap": 4, "candidates": 7, "kept": 4},
        {"index": 2, "cap": 1, "candidates": 4, "kept": 1},
        {"index": 3, "cap": 1, "candidates": 2, "kept": 1}]
    assert [c["vocab"] for c in stats["chapters"]] == [cp["kept"] for cp in stats["capPerChapter"]]
    by_term = {it["term"]: it for it in r["items"]}
    assert by_term["水"]["chapter"] == 3 and by_term["先生"]["chapter"] == 2     # chương sau không bị bỏ đói
    assert {"学校", "毎日", "勉強", "友達"} == {t for t, it in by_term.items() if it["chapter"] == 1}  # tần suất rồi vị trí
    assert [it["position"] for it in r["items"]] == list(range(1, 7))
    assert [it["chapter"] for it in r["items"]] == sorted(it["chapter"] for it in r["items"])
    # Đối chiếu: cắt toàn tài liệu 6 từ theo tần suất (cách cũ) không còn gì của chương 3
    monkeypatch.setattr(pipeline, "MAX_VOCAB", 6)
    old = analyze(CAP_TEXT, None, {"levelFilter": "all", "includeGrammar": False})
    assert "水" not in {it["term"] for it in old["items"]} and old["stats"]["vocab"] == 6


def test_split_chapters_single_chapter_keeps_global_cap(monkeypatch):
    monkeypatch.setattr(pipeline, "MAX_VOCAB", 3)
    monkeypatch.setattr(pipeline, "MAX_VOCAB_CHAPTERED", 100)
    r = analyze("私は毎日学校で勉強します。友達と映画を見ます。", None, CH_OPTS)
    assert r["stats"]["chaptersDetected"] is False and r["stats"]["vocab"] == 3 == len(r["items"])
    assert r["stats"]["chapters"][0]["vocab"] == 3
    assert r["stats"]["capPerChapter"] == [{"index": 1, "cap": 3, "candidates": 6, "kept": 3}]


def test_split_chapters_off_ignores_chaptered_cap(monkeypatch):
    monkeypatch.setattr(pipeline, "MAX_VOCAB", 3)
    monkeypatch.setattr(pipeline, "MAX_VOCAB_CHAPTERED", 100)
    monkeypatch.setattr(pipeline, "CHAPTER_VOCAB_FLOOR", 1)
    r = analyze(CAP_TEXT, None, {"levelFilter": "all", "includeGrammar": False})
    assert r["stats"]["vocab"] == 3 == len(r["items"]) and "capPerChapter" not in r["stats"]
    assert all(it["chapter"] is None for it in r["items"])


# --- B6: cấp JLPT toàn tài liệu (byLevelAll / levelPct / overallLevel) ---------------------------------------------
from app.extract.pipeline import _level_stats  # noqa: E402

_ALL_KEYS = LEVELS + ["unknown"]


def _pct_sum(stats: dict) -> float:
    return sum(stats["levelPct"].values())


def test_level_stats_rule_cumulative80():
    s = _level_stats(["N5"] * 9 + ["N4", None, None], ["N5", None])
    assert s["overallRule"] == "cumulative80" and s["overallLevel"] == "N5"
    # ba map cùng hình {N5..N1, unknown: int} như byLevel (không lồng dict vào byLevelAll để client cộng dồn được)
    assert s["byLevelAll"] == {"N5": 10, "N4": 1, "N3": 0, "N2": 0, "N1": 0, "unknown": 3}
    assert s["byLevelAllVocab"] == {"N5": 9, "N4": 1, "N3": 0, "N2": 0, "N1": 0, "unknown": 2}
    assert s["byLevelAllGrammar"] == {"N5": 1, "N4": 0, "N3": 0, "N2": 0, "N1": 0, "unknown": 1}
    assert all(isinstance(n, int) for key in ("byLevelAll", "byLevelAllVocab", "byLevelAllGrammar") for n in s[key].values())
    assert s["levelPct"] == {"N5": 90.9, "N4": 9.1, "N3": 0.0, "N2": 0.0, "N1": 0.0}
    # Văn bản trộn: cộng dồn N5 30 % → N4 60 % → N3 90 % ≥ 80 % → N3
    s = _level_stats(["N5"] * 3 + ["N4"] * 3 + ["N3"] * 3 + ["N2"], [])
    assert s["overallLevel"] == "N3" and abs(_pct_sum(s) - 100) <= 0.2
    # Ba cấp bằng nhau: 33.3 × 3 = 99.9 — làm tròn 0.1 nên chấp nhận lệch ±0.2; đúng ngưỡng 80 % vẫn tính (12 × 0.8 = 9.6 < 12)
    s = _level_stats(["N5", "N4", "N3"] * 4, [])
    assert s["levelPct"] == {"N5": 33.3, "N4": 33.3, "N3": 33.3, "N2": 0.0, "N1": 0.0} and s["overallLevel"] == "N3"
    assert _level_stats(["N5"] * 8 + ["N1"] * 2, [])["overallLevel"] == "N5"        # 8/10 = đúng 80 %
    assert _level_stats(["N5"] * 7 + ["N1"] * 3, [])["overallLevel"] == "N1"
    # Dưới 10 từ có cấp → chưa kết luận; ngữ pháp không tính vào overallLevel nhưng có trong levelPct
    s = _level_stats(["N5"] * 9 + [None] * 5, ["N3"] * 9)
    assert s["overallLevel"] is None and s["levelPct"] == {"N5": 50.0, "N4": 0.0, "N3": 50.0, "N2": 0.0, "N1": 0.0}
    # Rỗng
    s = _level_stats([], [])
    assert s["overallLevel"] is None and set(s["levelPct"].values()) == {0.0}
    assert sum(s["byLevelAll"].values()) == 0


N5_TEXT = "私は毎日学校で勉強します。友達と映画を見ます。水を飲みます。本を読みます。先生は親切です。"


def test_analyze_overall_level_counts_every_candidate_before_filters():
    r = analyze(N5_TEXT, None, {"levelFilter": "all"})
    st = r["stats"]
    assert st["overallLevel"] == "N5" and st["overallRule"] == "cumulative80"
    assert abs(_pct_sum(st) - 100) <= 0.2
    all_ = st["byLevelAll"]
    assert all(all_[k] == st["byLevelAllVocab"][k] + st["byLevelAllGrammar"][k] for k in _ALL_KEYS)
    assert st["byLevelAllVocab"]["N5"] >= 10
    # Không lọc, không cắt → mỗi term đã trả là một ứng viên (ứng viên đếm theo term, xem test POS bên dưới)
    assert sum(st["byLevelAllVocab"].values()) == len({it["term"] for it in r["items"] if it["kind"] == "vocab"})
    assert sum(st["byLevelAllGrammar"].values()) == len({it["term"] for it in r["items"] if it["kind"] == "grammar"})
    # Lọc theo trình độ người dùng chỉ ảnh hưởng items / byLevel; cấp tài liệu giữ nguyên
    r2 = analyze(N5_TEXT, None, {"userLevel": "N3", "levelFilter": "only_unknown_to_me", "treatUnknownAs": "drop"})
    assert r2["stats"]["byLevel"]["N5"] == 0 and len(r2["items"]) < len(r["items"])
    assert r2["stats"]["byLevelAll"] == all_ and r2["stats"]["overallLevel"] == "N5"
    assert r2["stats"]["levelPct"] == st["levelPct"]
    # minFrequency cũng không ảnh hưởng
    r3 = analyze(N5_TEXT, None, {"minFrequency": 5})
    assert r3["items"] == [] and r3["stats"]["byLevelAll"] == all_ and r3["stats"]["overallLevel"] == "N5"


def test_analyze_include_grammar_toggle_does_not_change_document_level():
    # includeGrammar chỉ quyết định có TRẢ item ngữ pháp; ứng viên ngữ pháp vẫn đếm → levelPct / byLevelAll không nhảy
    text = ("日本語を勉強しなければなりません。窓を開けてください。映画を見たいです。雨が降るかもしれません。"
            "食べたことがあります。早く寝たほうがいいです。")
    on, off = (analyze(text, None, {"includeGrammar": g})["stats"] for g in (True, False))
    assert on["grammar"] > 0 and off["grammar"] == 0 and sum(on["byLevelAllGrammar"].values()) > 0
    for key in ("byLevelAll", "byLevelAllVocab", "byLevelAllGrammar", "levelPct", "overallLevel"):
        assert on[key] == off[key], key


def test_candidates_are_counted_per_term_not_per_pos():
    # 大変 là 形状詞 rồi 副詞 → hai item (khoá (lemma, POS)) nhưng một ứng viên (khoá term, như _merge_chapters khi tách
    # chương) → byLevelAll có thể nhỏ hơn byLevel dù không lọc gì
    r = analyze("大変な仕事だ。大変疲れた。", None, {"levelFilter": "all", "includeGrammar": False})
    terms = [it["term"] for it in r["items"]]
    assert terms.count("大変") == 2 and sum(r["stats"]["byLevel"].values()) == len(terms)
    assert sum(r["stats"]["byLevelAllVocab"].values()) == len(set(terms)) == len(terms) - 1


def test_analyze_overall_level_mixed_n3_list_layout():
    # 3 N5 + 3 N4 + 4 N3 (danh sách JLPT commit): N5 30 % → N4 60 % → N3 100 % → N3; bố cục list cũng đếm ứng viên
    words = ["学校", "勉強", "映画", "経験", "関係", "技術", "環境", "情報", "影響", "状況"]
    r = analyze("\n".join(f"{w}\tx" for w in words) + "\n", None, {"extractMode": "list"})
    st = r["stats"]
    assert st["layout"] == "list" and st["overallLevel"] == "N3"
    assert st["levelPct"] == {"N5": 30.0, "N4": 30.0, "N3": 40.0, "N2": 0.0, "N1": 0.0}
    assert st["byLevelAllVocab"] == {"N5": 3, "N4": 3, "N3": 4, "N2": 0, "N1": 0, "unknown": 0}
    # Bỏ một từ → 9 từ có cấp < 10 → null
    r = analyze("\n".join(f"{w}\tx" for w in words[1:]) + "\n", None, {"extractMode": "list"})
    assert r["stats"]["overallLevel"] is None and abs(_pct_sum(r["stats"]) - 100) <= 0.2


def test_analyze_overall_level_empty_text():
    for text in ["", "This line has no Japanese.\n"]:
        st = analyze(text, None, {})["stats"]
        assert st["overallLevel"] is None and st["overallRule"] == "cumulative80"
        assert set(st["levelPct"].values()) == {0.0}
        assert sum(st["byLevelAll"].values()) == 0 and st["byLevel"] == {k: 0 for k in _ALL_KEYS}


def test_split_chapters_counts_candidate_once_across_chapters():
    r = analyze(CH_TEXT, None, CH_OPTS)          # 勉強 ở cả 2 chương → một ứng viên, như _merge_chapters
    assert sum(r["stats"]["byLevelAllVocab"].values()) == r["stats"]["vocab"] == len({it["term"] for it in r["items"]})
    # includeGrammar False vẫn đếm ứng viên ngữ pháp (nút hiển thị), đúng bằng khi bật
    on = analyze(CH_TEXT, None, {**CH_OPTS, "includeGrammar": True})["stats"]
    assert r["stats"]["grammar"] == 0 and r["stats"]["byLevelAllGrammar"] == on["byLevelAllGrammar"]


# --- F2: mâu thuẫn tài liệu ↔ tham chiếu (item.conflicts, stats.conflicts) ------------------------------------------
_NO_CONFLICTS = {"reading": 0, "furigana": 0, "meaning": 0, "level": 0, "grammar": 0}


def test_list_layout_reading_conflict_from_document_reading():
    # cách đọc ghi liền sau cụm ("学校：がくこう") và cột kana ("橋\tはじ") đều là cách đọc TÀI LIỆU khai báo
    text = "学校：がくこう - school\n橋\tはじ\tbridge\n日本\tにっぽん\tJapan\n映画\tえいが\tmovie\n"
    r = analyze(text, None, {"extractMode": "list"})
    by = {it["term"]: it for it in r["items"]}
    assert by["学校"]["reading"] == "がっこう"     # thẻ vẫn lấy cách đọc chuẩn; cảnh báo nói tài liệu ghi khác
    [w] = by["学校"]["conflicts"]
    assert w["field"] == "reading" and w["document"] == "がくこう" and w["reference"] == "がっこう"
    assert w["source"] == "jlpt_list" and "がっこう" in w["note_vi"]
    assert w["confidence"] == (0.9 if jmdict.available() else 0.75)   # thiếu JMdict (CI) → bớt chắc
    assert by["橋"]["reading"] == "はじ"           # cột kana là của tài liệu → thẻ giữ, kèm cảnh báo
    assert [(c["field"], c["document"], c["reference"]) for c in by["橋"]["conflicts"]] == [("reading", "はじ", "はし")]
    assert by["日本"]["conflicts"] == [] and by["映画"]["conflicts"] == []   # にっぽん là cách đọc hợp lệ; cách đọc Sudachi không so
    assert r["stats"]["conflicts"] == 2 and r["stats"]["conflictsByField"] == {**_NO_CONFLICTS, "reading": 2}
    assert all("_doc" not in it for it in r["items"])


_DOC_KEYS = ("docReading", "docMeaningEn", "docLevel")


def _claims(it: dict) -> tuple:
    return tuple(it[k] for k in _DOC_KEYS)


def test_document_claims_are_exposed_on_every_item():
    # backend lưu khai báo của tài liệu (mục nguồn tri thức, kiểm lại job cũ) → khoá riêng `_doc` vẫn gỡ, nhưng
    # docReading / docMeaningEn / docLevel luôn có mặt trên mọi item (None = tài liệu không ghi), bất kể warnConflicts
    text = "学校：がくこう - school\n橋\tはじ\tbridge\n映画\tえいが\tmovie\tN1\n勉強\tべんきょう\thọc\n4時\tよじ\tfour o'clock\n"
    for warn in (True, False):
        r = analyze(text, None, {"extractMode": "list", "warnConflicts": warn, "docLevel": "N3"})
        by = {it["term"]: it for it in r["items"]}
        assert all("_doc" not in it and all(k in it for k in _DOC_KEYS) for it in r["items"])
        assert _claims(by["学校"]) == ("がくこう", "school", None)   # kana ghi liền sau cụm + nghĩa EN in sẵn
        assert by["学校"]["reading"] == "がっこう"                    # thẻ vẫn giữ cách đọc chuẩn
        assert _claims(by["橋"]) == ("はじ", "bridge", None)          # cột kana
        # tag "(N1)" trên dòng là khai báo của thẻ; docLevel tuỳ chọn (cấp chung) KHÔNG chép vào item nào
        assert _claims(by["映画"]) == ("えいが", "movie", "N1")
        assert _claims(by["勉強"]) == ("べんきょう", None, None)      # nghĩa VI in sẵn không phải docMeaningEn
        assert _claims(by["時"]) == (None, None, None)              # cụm bị cắt chữ số → cột kana / nghĩa là của 4時
    # văn xuôi: chỉ ruby là khai báo; cách đọc Sudachi / gloss JMdict không bao giờ thành docReading / docMeaningEn
    r = analyze("漢字（かんじ）を書く。毎日勉強します。食べなければならない。", None, {"levelFilter": "all"})
    by = {it["term"]: it for it in r["items"]}
    assert _claims(by["漢字"]) == ("かんじ", None, None)
    assert by["勉強"]["reading"] == "べんきょう" and _claims(by["勉強"]) == (None, None, None)
    assert any(it["kind"] == "grammar" for it in r["items"])
    assert all(_claims(it) == (None, None, None) for it in r["items"] if it["term"] != "漢字")
    # tách chương: item gộp giữ khai báo của lần xuất hiện đầu
    r = analyze("第1課\n学校：がくこう - school\n映画\tえいが\tmovie\n第2課\n学校\tがっこう\tschool\n橋\tはし\tbridge\n", None,
                {**CH_OPTS, "extractMode": "list"})
    assert _claims(next(it for it in r["items"] if it["term"] == "学校")) == ("がくこう", "school", None)


def test_prose_ruby_is_document_reading_but_sudachi_reading_is_not():
    r = analyze("漢字（かんし）を書く。", None, {})
    kanji = next(it for it in r["items"] if it["term"] == "漢字")
    assert kanji["reading"] == "かんし"
    assert [(c["field"], c["document"], c["reference"], c["source"]) for c in kanji["conflicts"]] == [("reading", "かんし", "かんじ", "jlpt_list")]
    assert all(it["conflicts"] == [] for it in r["items"] if it["term"] != "漢字")
    r = analyze("漢字（かんじ）を書く。", None, {})
    assert all(it["conflicts"] == [] for it in r["items"]) and r["stats"]["conflicts"] == 0
    # ruby đặt trên dạng đã chia (読み của 読みます, giáo trình thể ます) → quy về lemma (よむ): thẻ đọc đúng, không cảnh báo;
    # ruby sai nhưng cùng đuôi okurigana (とみ) → cảnh báo với cách đọc đã quy đổi; 来 (き) → 来る đổi gốc âm → không suy
    blocks = [{"text": "x", "rubies": [{"base": "読み", "reading": "よみ"}, {"base": "話し", "reading": "とし"},
                                      {"base": "来", "reading": "き"}]}]
    r = analyze("本を読みます。友達と話します。友達が来ます。", blocks, {})
    by = {it["term"]: it for it in r["items"]}
    assert by["読む"]["reading"] == "よむ" and by["読む"]["conflicts"] == []
    assert by["話す"]["reading"] == "とす" and [(c["document"], c["reference"]) for c in by["話す"]["conflicts"]] == [("とす", "はなす")]
    assert by["来る"]["reading"] == "くる" and by["来る"]["conflicts"] == []
    # văn bản thường: mọi item (kể cả ngữ pháp) có khoá conflicts = [] — không có gì tài liệu khai báo để so
    r = analyze(PARAGRAPH, None, {"levelFilter": "all"})
    assert {it["kind"] for it in r["items"]} == {"vocab", "grammar"}
    assert all(it["conflicts"] == [] for it in r["items"]) and r["stats"]["conflictsByField"] == _NO_CONFLICTS


def test_warn_conflicts_toggle_and_min_confidence():
    text = "橋\tはし\tschool\n学校：がくこう - school\n映画\tえいが\tmovie\n"
    on = analyze(text, None, {"extractMode": "list"})
    by = {it["term"]: it for it in on["items"]}
    assert by["橋"]["conflicts"] == []                 # nghĩa lệch chỉ 0.5 < ngưỡng mặc định 0.6
    assert [c["field"] for c in by["学校"]["conflicts"]] == ["reading"]
    low = analyze(text, None, {"extractMode": "list", "conflictMinConfidence": 0.5})
    by = {it["term"]: it for it in low["items"]}
    assert [(c["field"], c["confidence"], c["reference"]) for c in by["橋"]["conflicts"]] == [("meaning", 0.5, "bridge")]
    assert low["stats"]["conflicts"] == 2 and low["stats"]["conflictsByField"] == {**_NO_CONFLICTS, "reading": 1, "meaning": 1}
    off = analyze(text, None, {"extractMode": "list", "warnConflicts": False})
    assert all(it["conflicts"] == [] for it in off["items"]) and off["stats"]["conflicts"] == 0
    assert off["stats"]["conflictsByField"] == _NO_CONFLICTS
    # tắt cảnh báo không đổi gì khác
    strip = lambda res: [{k: v for k, v in it.items() if k != "conflicts"} for it in res["items"]]
    assert strip(off) == strip(on)


def test_doc_level_option_and_line_tag():
    # docLevel tuỳ chọn = cấp chung của tài liệu: từ dễ hơn (学校 / 橋 N5 trong tài liệu N3) là thường, không báo;
    # tag trên dòng "(N1)" là khai báo riêng cho thẻ đó → lệch chiều nào cũng báo
    r = analyze("学校\tschool\n映画\tmovie (N1)\n橋\tbridge\n", None, {"extractMode": "list", "docLevel": "N3"})
    by = {it["term"]: it for it in r["items"]}
    assert by["学校"]["conflicts"] == [] and by["橋"]["conflicts"] == []
    assert [(c["field"], c["document"], c["reference"], c["confidence"]) for c in by["映画"]["conflicts"]] == [("level", "N1", "N5", 0.6)]
    assert r["stats"]["conflictsByField"]["level"] == 1
    assert analyze("学校\tschool\n映画\tmovie\n橋\tbridge\n", None, {"extractMode": "list", "docLevel": "N4"})["stats"]["conflicts"] == 0
    # tài liệu tự nhận N5 nhưng có từ N1 → đáng ngờ (khó hơn ≥ 2 cấp)
    r = analyze("学校\tschool\n政策\tpolicy\n", None, {"extractMode": "list", "docLevel": "N5"})
    by = {it["term"]: it for it in r["items"]}
    assert by["学校"]["conflicts"] == [] and [(c["document"], c["reference"]) for c in by["政策"]["conflicts"]] == [("N5", "N1")]
    assert "khó hơn 4 cấp" in by["政策"]["conflicts"][0]["note_vi"]
    # văn xuôi: tài liệu N1 có từ N5 / mẫu N4 → không báo; tài liệu tự nhận N5 có mẫu N3 (〜てほしい) → grammar 0.5 (cần hạ ngưỡng)
    r = analyze("毎日漢字を勉強します。食べなければならない。", None, {"docLevel": "N1", "conflictMinConfidence": 0.5})
    assert all(it["conflicts"] == [] for it in r["items"]) and r["stats"]["conflicts"] == 0
    r = analyze("明日来てほしい。", None, {"docLevel": "N5", "conflictMinConfidence": 0.5})
    by = {it["term"]: it for it in r["items"]}
    assert [(c["field"], c["reference"], c["confidence"]) for c in by["〜てほしい"]["conflicts"]] == [("grammar", "N3", 0.5)]
    assert analyze("明日来てほしい。", None, {"docLevel": "N5"})["stats"]["conflictsByField"]["grammar"] == 0


def test_admin_references_override_dictionaries_in_pipeline():
    text = "学校：がくこう - school\n映画\tえいが\tmovie\n"
    ok = analyze(text, None, {"extractMode": "list", "references": [{"term": "学校", "reading": "がくこう", "sourceId": "ref-1"}]})
    assert all(it["conflicts"] == [] for it in ok["items"]) and ok["stats"]["conflicts"] == 0
    bad = analyze(text, None, {"extractMode": "list", "references": [{"term": "学校", "reading": "がっこう", "sourceId": 42}]})
    [w] = next(it for it in bad["items"] if it["term"] == "学校")["conflicts"]
    assert (w["source"], w["confidence"], w["reference"]) == ("admin:42", 0.95, "がっこう")


def test_inline_reading_recovery_is_conservative():
    from app.extract.pipeline import _inline_reading
    assert _inline_reading("学校：がくこう - school", "学校") == "がくこう"
    assert _inline_reading("本 ほん book", "本") == "ほん" and _inline_reading("食べる（たべる）", "食べる") == "たべる"
    assert _inline_reading("学校 ガッコウ school", "学校") == "がっこう"
    assert _inline_reading("学校 がくせい", "学校") == "がくせい"                 # sai nhưng đúng hình → được so, bị báo
    assert _inline_reading("行く つもり - intend to go", "行く") is None          # つもり không có okurigana く → không phải cách đọc
    assert _inline_reading("日本語 を 勉強する", "日本語") is None                # を: quá ngắn cho 3 chữ Hán, sau đó còn tiếng Nhật
    assert _inline_reading("勉強する ことができる", "勉強する") is None
    assert _inline_reading("学校：trường học", "学校") is None and _inline_reading("映画\tbộ phim", "映画") is None
    assert _inline_reading("学校", "映画") is None
    # chữ đơn: trợ từ / từ kế tiếp trên dòng OCR có khoảng trắng không phải cách đọc ("本 だけ", "人 が"); やま vẫn nhận
    assert _inline_reading("本 だけ only books", "本") is None and _inline_reading("人 が people", "人") is None
    assert _inline_reading("本 を buy books", "本") is None and _inline_reading("山 やま mountain", "山") == "やま"
    r = analyze("本 だけ only books\n人 が people\n山 やま mountain\n", None, {"extractMode": "list"})
    assert all(it["conflicts"] == [] for it in r["items"])


def test_list_head_cut_before_digits_claims_nothing():
    # entries._first_ja_run bỏ chữ số đầu cụm ("4時" → 時, lỗi cũ) → cột kana よじ / nghĩa "four o'clock" là của cả cụm,
    # không đổ cho tài liệu đọc sai 時 (0.9); 学校 cùng danh sách vẫn được so bình thường
    text = "1時\tいちじ\tone o'clock\n4時\tよじ\tfour o'clock\n1日\tついたち\t1st\n学校\tがくこう\tschool\n"
    r = analyze(text, None, {"extractMode": "list", "conflictMinConfidence": 0.5})
    by = {it["term"]: it for it in r["items"]}
    assert {"時", "日", "学校"} <= set(by)
    assert by["時"]["conflicts"] == [] and by["日"]["conflicts"] == []
    assert [c["field"] for c in by["学校"]["conflicts"]] == ["reading"]
    from app.extract.pipeline import _partial_head
    assert _partial_head("4時\tよじ", "時") and _partial_head("No1学校", "学校") and not _partial_head("学校\tschool", "学校")
    assert not _partial_head("1. 学校\tschool", "学校") and not _partial_head("school\t学校", "学校")


def test_split_chapters_items_carry_conflicts_once():
    r = analyze("第1課\n学校：がくこう - school\n映画\tえいが\tmovie\n第2課\n学校：がくこう - school\n橋\tはし\tbridge\n", None,
                {**CH_OPTS, "extractMode": "list"})
    by = {it["term"]: it for it in r["items"]}
    assert by["学校"]["frequency"] == 2 and [c["field"] for c in by["学校"]["conflicts"]] == ["reading"]
    assert r["stats"]["conflicts"] == 1 and all("_doc" not in it for it in r["items"])


# --- B5: furigana theo ngữ cảnh — cách đọc lemma từ câu, từ đồng tự dị âm, furigana câu ví dụ ---------------------

from app.extract import heteronyms  # noqa: E402
from app.extract.jachars import is_kana_only  # noqa: E402
from app.extract.pipeline import _example_segments, _lemma_reading  # noqa: E402
from app.extract.tokenizer import Token, reading_of, tokenize  # noqa: E402

_VERB = ("動詞", "一般", "*", "*")


def _tok(surface: str, lemma: str, reading: str, conj_type: str = "五段-カ行") -> Token:
    return Token(surface, lemma, reading, _VERB + (conj_type, "連用形-一般"), lemma, 0, len(surface))


def test_lemma_reading_derived_from_reading_in_context():
    # Sudachi đọc dạng chia trong câu là あい → lemma あく (đổi đuôi okurigana), không đọc lại 開く đứng một mình (ひらく)
    assert reading_of("開く") == "ひらく"
    assert _lemma_reading(_tok("開い", "開く", "あい")) == "あく"
    assert _lemma_reading(_tok("辛かっ", "辛い", "からかっ", "形容詞")) == "からい"
    assert _lemma_reading(_tok("取り扱っ", "取り扱う", "とりあつかっ", "五段-ワア行")) == "とりあつかう"
    assert _lemma_reading(_tok("愛し", "愛する", "あいし", "サ行変格")) == "あいする"
    # カ変 đổi âm gốc (き → く): không suy き + る
    assert _lemma_reading(_tok("来", "来る", "き", "カ行変格")) == "くる"
    # gốc khác chữ → reading_of(lemma)
    assert _lemma_reading(_tok("云っ", "言う", "いっ", "五段-ワア行")) == reading_of("言う")
    # surface = lemma → cách đọc của chính token
    assert _lemma_reading(_tok("開く", "開く", "あく")) == "あく"


def test_conjugated_verb_reading_consistent_with_sudachi_context():
    # 窓を開いて: Sudachi đọc 開い = ひらい trong câu → lemma ひらく (suy từ ngữ cảnh); cue "を開い" cùng phía → không ghi chú
    sent = "窓を開いて空気を入れる。"
    tok = next(t for t in tokenize(sent, "C") if t.lemma == "開く")
    hiraku = _vocab(analyze(sent, None, {"levelFilter": "all"}))["開く"]
    assert hiraku["reading"] == _lemma_reading(tok) == "ひらく"
    assert hiraku["readingNote"] is None and not any(s.startswith("heteronym:") for s in hiraku["levelSources"])
    # ドアが開いている: Sudachi vẫn ひらい nhưng "が開い" là cue của あく (tự động từ) → đổi, ghi chú, giảm độ tin cậy
    aku = _vocab(analyze("ドアが開いている。", None, {"levelFilter": "all"}))["開く"]
    assert aku["reading"] == "あく"
    assert aku["readingSegments"] == [{"kanji": "開", "kana": "あ"}, {"kanji": "く", "kana": "く"}]
    assert aku["readingNote"] == "khử nhập nhằng theo ngữ cảnh: が開い"
    assert aku["levelSources"][-1] == "heteronym:が開い"
    _, base_conf, _ = pipeline.classify("開く", "あく", False)
    assert aku["levelConfidence"] == round(base_conf - 0.1, 3)
    assert {"text": "開", "reading": "あ"} in aku["exampleSegments"]


def test_heteronym_karai_tsurai_by_context():
    tsurai = _vocab(analyze("仕事が辛い。", None, {"levelFilter": "all"}))["辛い"]
    assert tsurai["reading"] == "つらい" and tsurai["readingNote"] is None
    karai = _vocab(analyze("カレーが辛かった。", None, {"levelFilter": "all"}))["辛い"]
    assert karai["reading"] == "からい"
    assert karai["readingSegments"] == [{"kanji": "辛", "kana": "から"}, {"kanji": "い", "kana": "い"}]
    assert "カレー" in karai["readingNote"] and karai["levelSources"][-1] == "heteronym:カレー"
    # câu ví dụ: dạng chia giữ đuôi của chính nó (辛/から + かっ)
    assert karai["exampleSegments"][2:4] == [{"text": "辛", "reading": "から"}, {"text": "かっ", "reading": None}]


def test_heteronym_keeps_sudachi_without_cue_or_on_tie_or_declared_reading():
    assert _vocab(analyze("辛い。", None, None))["辛い"]["reading"] == "つらい"
    # hai cách đọc cùng có cue (カレー vs 仕事) → hoà → giữ Sudachi
    tie = _vocab(analyze("カレーは辛いが、仕事も辛い。", None, None))["辛い"]
    assert tie["reading"] == "つらい" and tie["readingNote"] is None
    # cách đọc tài liệu khai báo (ruby) không bao giờ bị heuristic đổi
    blocks = [{"text": "カレーが辛い。", "rubies": [{"base": "辛い", "reading": "つらい"}]}]
    declared = _vocab(analyze("カレーが辛い。", blocks, None))["辛い"]
    assert declared["reading"] == "つらい" and declared["readingNote"] is None


def test_heteronym_tsuitachi_with_month_cue():
    assert heteronyms.resolve("一日", "いちにち", ["四月一日に会いましょう。"]) == ("ついたち", "月一日")
    assert heteronyms.resolve("一日", "いちにち", ["一日中働いた。"]) is None
    # Sudachi tách 一 + 日 → câu ví dụ ghép lại thành một đoạn rồi mới chọn cách đọc
    assert {"text": "一日", "reading": "ついたち"} in _example_segments("四月一日に会いましょう。")
    assert {"text": "一日", "reading": "いちにち"} in _example_segments("一日中働いた。")
    # 十一日: 一日 chỉ là đuôi của số khác → không ghép
    assert all(sg["text"] != "一日" for sg in _example_segments("十一日に会う。"))
    # bố cục danh sách: nghĩa in sẵn trên dòng là ngữ cảnh
    r = analyze("一日\tngày đầu tháng\n学校\ttrường học\n", None, {"extractMode": "list"})
    by = {it["term"]: it for it in r["items"]}
    assert by["一日"]["reading"] == "ついたち" and by["一日"]["readingNote"].endswith("đầu tháng")
    assert by["学校"]["readingNote"] is None and by["学校"]["exampleSegments"] is None


def test_example_segments_shape_and_alignment():
    assert _example_segments("学校へ行きます。") == [
        {"text": "学校", "reading": "がっこう"}, {"text": "へ", "reading": None},
        {"text": "行", "reading": "い"}, {"text": "き", "reading": None},
        {"text": "ます", "reading": None}, {"text": "。", "reading": None},
    ]
    assert _example_segments("") is None and _example_segments(None) is None
    # khoảng trắng / chữ Latin / OOV (Sudachi trả chính surface làm cách đọc) giữ nguyên, nối lại đúng câu
    odd = "ABC 学校　覆公です"
    segs = _example_segments(odd)
    assert "".join(sg["text"] for sg in segs) == odd
    assert {"text": "覆公", "reading": None} in segs and {"text": "学校", "reading": "がっこう"} in segs
    # ruby tài liệu cho đúng surface thắng cách đọc Sudachi
    assert _example_segments("大人です", {"大人": "たいじん"})[0] == {"text": "大人", "reading": "たいじん"}


def test_analyze_items_carry_example_segments():
    r = analyze(PARAGRAPH, None, {"levelFilter": "all"})
    for it in r["items"]:
        assert "readingNote" in it and "exampleSegments" in it
        if it["example"]:
            assert "".join(sg["text"] for sg in it["exampleSegments"]) == it["example"]
        else:
            assert it["exampleSegments"] is None
    grammar = next(it for it in r["items"] if it["kind"] == "grammar")
    assert grammar["readingNote"] is None and any(sg["reading"] for sg in grammar["exampleSegments"])
    # thẻ chung một câu ví dụ có đoạn bằng nhau nhưng không chung object (sửa thẻ này không đổi thẻ kia)
    first = r["items"][0]
    twin = next(it for it in r["items"][1:] if it["example"] == first["example"])
    assert twin["exampleSegments"] == first["exampleSegments"]
    assert twin["exampleSegments"][0] is not first["exampleSegments"][0]


def test_furigana_off_emits_no_segments():
    r = analyze("カレーが辛かった。学校へ行きます。", None, {"includeFurigana": False, "levelFilter": "all"})
    assert r["items"]
    assert all(it["readingSegments"] is None and it["exampleSegments"] is None for it in r["items"])
    # cách đọc vẫn được khử nhập nhằng (chỉ phần hiển thị furigana tắt)
    assert _vocab(r)["辛い"]["reading"] == "からい"
    r = analyze("一日\tngày đầu tháng\n", None, {"includeFurigana": False, "extractMode": "list"})
    assert r["items"][0]["readingSegments"] is None and r["items"][0]["exampleSegments"] is None


def test_heteronym_table_parsing_and_resolution():
    table = heteronyms.parse_table([
        {"term": "辛い", "readings": [{"reading": "カライ", "cues": ["カレー", "Spicy"]},
                                    {"reading": "つらい", "cues": ["仕事", 3, ""]}]},
        {"term": "一つだけ", "readings": [{"reading": "ひとつ", "cues": ["x"]}]},   # < 2 cách đọc → bỏ
        {"readings": []}, "rác", None,
    ])
    assert set(table) == {"辛い"}
    assert [r.reading for r in table["辛い"]] == ["からい", "つらい"]   # katakana → hiragana
    assert table["辛い"][1].cues == ("仕事",)
    assert heteronyms.resolve("辛い", "つらい", ["very SPICY curry"], table) == ("からい", "Spicy")
    assert heteronyms.resolve("辛い", "からい", ["カレー"], table) is None          # đã đúng → không đổi
    assert heteronyms.resolve("辛い", "つらい", [], table) is None
    assert heteronyms.resolve("甘い", "あまい", ["カレー"], table) is None          # không có trong bảng
    assert heteronyms.parse_table(None) == {} and heteronyms.parse_table({"term": "x"}) == {}


def test_heteronym_data_file_and_missing_file(monkeypatch, tmp_path):
    table = heteronyms.load_table()
    assert len(table) >= 25 and {"辛い", "一日", "開く", "生物", "人気", "市場"} <= set(table)
    for term, options in table.items():
        assert all(is_kana_only(o.reading) for o in options), term
        assert len({o.reading for o in options}) == len(options), term
    # thiếu file → bảng rỗng, không lỗi, mọi từ giữ cách đọc Sudachi
    monkeypatch.setattr(heteronyms, "_table", None)
    assert heteronyms.load_table(tmp_path / "missing.yaml") == {}
    assert heteronyms.resolve("辛い", "つらい", ["カレー"]) is None
    assert _vocab(analyze("カレーが辛かった。", None, None))["辛い"]["reading"] == "つらい"


@pytest.mark.parametrize("sent, term, expected", [
    ("この方が便利です。", "方", "ほう"),                       # "この方" trần từng là cue かた
    ("この方が安いと思います。", "方", "ほう"),
    ("夜、人気のレストランに行った。", "人気", "にんき"),         # danh từ chủ đề (夜, 公園) đi với cả hai cách đọc
    ("週末の公園は家族連れに人気がある。", "人気", "にんき"),
    ("今日は江戸時代について勉強しました。", "今日", "きょう"),     # 時代 khớp 江戸時代 / 時代劇
    ("今日は時代劇を見た。", "今日", "きょう"),
    ("これからは経験が大事になってくる。", "大事", "だいじ"),       # X が大事になる = trở nên quan trọng
    ("幸い大事に至らなかった。", "大事", "だいじ"),
    ("試合は後半に入って点差が開いた。", "開く", "ひらく"),        # 差が開く đọc ひらく
    ("二人の差が開いてしまった。", "開く", "ひらく"),
    ("深海の生物は何を食べているのだろう。", "生物", "せいぶつ"),   # sinh vật cũng 食べ
    ("アイスを食べている最中、電話が鳴った。", "最中", "さいちゅう"),
    ("大家に計画を話した。", "大家", "おおや"),                 # 画 ⊂ 計画
])
def test_heteronym_cues_do_not_flip_correct_sudachi_reading(sent, term, expected):
    it = _vocab(analyze(sent, None, {"levelFilter": "all"}))[term]
    assert it["reading"] == expected and it["readingNote"] is None
    assert not any(s.startswith("heteronym:") for s in it["levelSources"])
    if term != "開く":
        assert {"text": term, "reading": expected} in it["exampleSegments"]


@pytest.mark.parametrize("sent, term, expected", [
    ("人気のない道を歩いた。", "人気", "ひとけ"),
    ("小さな問題が大事になってしまった。", "大事", "おおごと"),
    ("今日では誰もがスマホを持つ。", "今日", "こんにち"),
    ("彼は上手に出る相手には弱い。", "上手", "うわて"),          # 上手に (じょうず) từng luôn hoà với 上手に出る
    ("あの方が来ました。", "方", "かた"),                       # Sudachi đọc ほう; cue có trợ từ neo
    ("お茶と最中をいただいた。", "最中", "もなか"),
    ("書道の大家として知られる。", "大家", "たいか"),
])
def test_heteronym_anchored_cues_still_switch(sent, term, expected):
    it = _vocab(analyze(sent, None, {"levelFilter": "all"}))[term]
    assert it["reading"] == expected and it["readingNote"] is not None
    assert {"text": term, "reading": expected} in it["exampleSegments"]


def test_tsuitachi_month_cue_not_cancelled_by_neighbour_words():
    # 過ごし / 一日一 (khớp 一日一緒) từng là cue いちにち → hoà với 月一日 → giữ いちにち
    for sent in ("四月一日は家で過ごした。", "四月一日一緒に行こう。"):
        assert {"text": "一日", "reading": "ついたち"} in _example_segments(sent)
    assert {"text": "一日", "reading": "いちにち"} in _example_segments("一日一回飲んでください。")


def test_heteronym_example_sentence_matches_chosen_reading():
    # Mọi lần xuất hiện gộp một thẻ, cách đọc theo đa số (あく 2 : ひらく 1) → ví dụ phải là câu đọc あく, không phải câu đầu
    it = _vocab(analyze("窓を開いて、空気を入れた。ドアが開いた。ドアが開いている。", None, {"levelFilter": "all"}))["開く"]
    assert it["reading"] == "あく" and it["example"] == "ドアが開いた。"
    assert {"text": "開", "reading": "あ"} in it["exampleSegments"]
    # không đổi cách đọc (ひらく đa số = Sudachi) nhưng câu đầu có cue あく → lấy câu đầu đọc ひらく
    it = _vocab(analyze("ドアが開いた。窓を開いて。会議を開いた。", None, {"levelFilter": "all"}))["開く"]
    assert it["reading"] == "ひらく" and it["example"] == "窓を開いて。"
    assert {"text": "開", "reading": "ひら"} in it["exampleSegments"]
    # câu không có cue nào vẫn là ví dụ hợp lệ khi cách đọc là của Sudachi (giữ câu đầu như trước)
    it = _vocab(analyze("開いた本を読む。会議を開いた。", None, {"levelFilter": "all"}))["開く"]
    assert it["reading"] == "ひらく" and it["example"] == "開いた本を読む。"


def test_example_segments_te_form_ruby_only_over_kanji():
    segs = _example_segments("彼は「待って」と言った。")
    assert {"text": "待", "reading": "ま"} in segs and {"text": "言", "reading": "い"} in segs
    assert all(sg["reading"] is None for sg in segs if "っ" in sg["text"])


@pytest.mark.xfail(reason="Sudachi tách 一日中家 thành 一 + 日中(にっちゅう) + 家(か): không có token / cụm 一日 nào để bảng "
                          "đồng tự dị âm xét; cần ghép cụm cố định 一日中 trước khi tách từ (ngoài phạm vi B5)")
def test_ichinichijuu_in_prose_is_not_nicchuu():
    r = analyze("一日中家にいた。", None, {"levelFilter": "all"})
    assert "日中" not in _vocab(r)
    segs = _example_segments("一日中家にいた。")
    assert {"text": "家", "reading": "いえ"} in segs and all(sg["reading"] != "にっちゅう" for sg in segs)


def test_nihon_item_reading_and_level_lc03():
    """LC-03: câu trong đoạn 4 câu của báo lỗi — 日本 phải là にほん / N5 (trước: にっぽん / N3, furigana 日にっ本ぽん)."""
    r = analyze("図書館で日本の歴史について勉強しました。", None, {"userLevel": "N5", "levelFilter": "all"})
    nihon = next(it for it in r["items"] if it["term"] == "日本")
    assert nihon["reading"] == "にほん" and nihon["level"] == "N5" and nihon["levelSources"] == ["jlpt_list:N5"]
    assert nihon["readingSegments"] == [{"kanji": "日", "kana": "に"}, {"kanji": "本", "kana": "ほん"}]
    assert nihon["hanViet"] == "NHẬT BẢN"


def test_han_viet_of_extracted_items_lc01():
    """LC-01: 予定 lấy âm Hán-Việt DỰ ĐỊNH (Unihan ghi âm Nôm "nhừ"), 郵便局 có đủ BƯU."""
    r = analyze("週末は友達と一緒に映画を見に行く予定です。郵便局で切手を買いました。", None, {"levelFilter": "all"})
    by_term = {it["term"]: it for it in r["items"]}
    assert by_term["予定"]["hanViet"] == "DỰ ĐỊNH"
    assert by_term["郵便局"]["hanViet"] == "BƯU TIỆN CỤC"
