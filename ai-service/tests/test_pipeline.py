import pytest

from app.extract import jmdict, pipeline
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


@needs_jmdict
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


@needs_jmdict
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
    text, blocks = _ocr([("中肌、志所綿、水次の電気", 0.30),
                         ("電気代を払うのを忘れた", 0.90)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["電気"]["example"] == "電気代を払うのを忘れた"
    assert v["志"]["example"] is None


@needs_jmdict
def test_ocr_suspect_items_are_flagged_unselected():
    # conf thật của dòng này là 0.40: phần tiếng Nhật đúng nhưng cả dòng bị kéo xuống bởi chữ Anh/Trung
    text, blocks = _ocr([("銀行口座bankaccount銀行具戸較子媒", 0.40),
                         ("中肌、志所綿", 0.45),
                         ("電気代を払う", 0.95)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["銀行"]["suspect"] is False and v["口座"]["suspect"] is False   # từ có nghĩa + cấp JLPT: giữ
    assert v["口座"]["example"] == "銀行口座"
    assert v["具"]["suspect"] is True and v["肌"]["suspect"] is True        # chữ đơn trên dòng kém
    assert v["電気"]["suspect"] is False


def test_ocr_item_without_dictionary_meaning_is_suspect():
    text, blocks = _ocr([("覆公を払う", 0.95)])
    v = _vocab(analyze(text, blocks, {}))
    assert v["覆公"]["meaningEn"] is None and v["覆公"]["suspect"] is True


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
