import pytest

from app.extract import jmdict, pipeline
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


def test_compound_expansion_when_compound_unknown(monkeypatch):
    """Từ ghép không có trong từ điển nhưng các thành phần có → tách thành phần."""
    known = {"日本語", "学校", "日本", "語"}
    monkeypatch.setattr(pipeline, "_in_dictionary", lambda lemma, reading: lemma in known)
    sent = "日本語学校へ行く"
    c_tokens = tokenize(sent, "C")
    a_tokens = tokenize(sent, "A")
    expanded = [t.surface for ct in c_tokens for t in pipeline._expand_compound(ct, a_tokens)]
    assert expanded[:2] == ["日本語", "学校"] or expanded[:3] == ["日本", "語", "学校"]
    # Thành phần phải được trả về khi compound dài hơn 1 token mode A và không có trong từ điển
    known.discard("日本語")
    expanded = [t.surface for ct in c_tokens for t in pipeline._expand_compound(ct, a_tokens)]
    assert expanded[:3] == ["日本", "語", "学校"]


@pytest.mark.skipif(not jmdict.available(), reason="chưa có jmdict.sqlite (python scripts/build_dicts.py)")
def test_compound_kept_when_in_dictionary():
    sent = "日本語を勉強する"
    c_tokens = tokenize(sent, "C")
    a_tokens = tokenize(sent, "A")
    expanded = [t.surface for t in pipeline._expand_compound(c_tokens[0], a_tokens)]
    assert expanded == ["日本語"]
