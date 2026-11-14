import dataclasses

from app.extract import pipeline
from app.extract.tokenizer import tokenize


def test_modes_split_compound_differently():
    c = [t.surface for t in tokenize("日本語学校", "C")]
    a = [t.surface for t in tokenize("日本語学校", "A")]
    assert c == ["日本語", "学校"]
    assert a == ["日本", "語", "学校"]


def test_reading_is_hiragana_and_lemma_is_dictionary_form():
    toks = tokenize("食べました", "C")
    assert toks[0].lemma == "食べる"
    assert toks[0].reading == "たべ"
    assert toks[0].pos1 == "動詞"


def test_token_oov_flag_from_sudachi():
    toks = {t.surface: t for t in tokenize("覆公を払う", "C")}
    assert toks["覆公"].oov is True          # chuỗi OCR rác: Sudachi ghép ký tự lạ, không có trong SudachiDict
    assert toks["払う"].oov is False


def _expand(sent: str) -> list[str]:
    c_tokens, a_tokens = tokenize(sent, "C"), tokenize(sent, "A")
    return [t.surface for ct in c_tokens for t in pipeline._expand_compound(ct, a_tokens)]


def test_sudachi_dictionary_compounds_kept_whole_without_jmdict(monkeypatch):
    """B4: mode C trả về một morpheme có trong SudachiDict → giữ nguyên kể cả khi không từ điển nào khác biết
    (CI không có jmdict.sqlite; JMdict bản common cũng không có 銀行口座)."""
    monkeypatch.setattr(pipeline, "_in_dictionary", lambda lemma, reading: False)
    assert _expand("日本語学校へ行く")[:2] == ["日本語", "学校"]       # Sudachi C đã tách sẵn; không tách tiếp 日本/語
    assert _expand("自動販売機を使う")[0] == "自動販売機"
    assert _expand("銀行口座を開く")[0] == "銀行口座"
    assert _expand("日本語を勉強する")[0] == "日本語"


def test_compound_kept_when_in_dictionary():
    sent = "日本語を勉強する"
    c_tokens = tokenize(sent, "C")
    a_tokens = tokenize(sent, "A")
    expanded = [t.surface for t in pipeline._expand_compound(c_tokens[0], a_tokens)]
    assert expanded == ["日本語"]


def test_oov_compound_split_only_when_all_components_known(monkeypatch):
    """Nhánh tách chỉ còn cho cụm OOV. Sudachi không tách OOV ở mode A nên giả lập bằng cờ `oov` trên token mode C:
    compound không có trong từ điển nhưng mọi thành phần có → trả về thành phần; ngược lại giữ nguyên."""
    known = {"日本", "語"}
    monkeypatch.setattr(pipeline, "_in_dictionary", lambda lemma, reading: lemma in known)
    sent = "日本語学校へ行く"
    c_tokens, a_tokens = tokenize(sent, "C"), tokenize(sent, "A")
    oov = dataclasses.replace(c_tokens[0], oov=True)       # 日本語 giả làm OOV
    assert [t.surface for t in pipeline._expand_compound(oov, a_tokens)] == ["日本", "語"]
    known.add("日本語")                                    # compound có trong JLPT / JMdict → giữ
    assert [t.surface for t in pipeline._expand_compound(oov, a_tokens)] == ["日本語"]
    known -= {"日本語", "語"}                              # thiếu một thành phần → giữ compound (unknown)
    assert [t.surface for t in pipeline._expand_compound(oov, a_tokens)] == ["日本語"]
    # Không phải OOV → không bao giờ tách, dù từ điển không biết
    known.clear()
    assert [t.surface for t in pipeline._expand_compound(c_tokens[0], a_tokens)] == ["日本語"]


def test_nihon_read_nihon_not_nippon():
    """LC-03: SudachiDict đọc danh từ riêng 日本 là ニッポン → furigana 日にっ本ぽん và cặp (日本, にっぽん) khi phân cấp.
    Cách đọc chuẩn của giáo trình là にほん; từ ghép Sudachi đã đọc にほん thì giữ nguyên."""
    toks = {t.surface: t for t in tokenize("図書館で日本の歴史について勉強しました。", "C")}
    assert toks["日本"].reading == "にほん" and toks["日本"].lemma == "日本"
    assert [t.reading for t in tokenize("日本", "A")] == ["にほん"]
    assert {t.surface: t.reading for t in tokenize("日本人と日本語", "C")} == {"日本人": "にほんじん", "と": "と",
                                                                              "日本語": "にほんご"}
    assert tokenize("東京", "C")[0].reading == "とうきょう"   # bảng sửa chỉ đụng đúng từ đã liệt kê
