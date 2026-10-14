import pytest

from app.extract.grammar.matcher import compile_pattern, encode, load_catalog, match_document, match_sentence
from app.extract.tokenizer import tokenize


def names(sentence: str) -> list[str]:
    return [m.pattern.name for m in match_sentence(tokenize(sentence, "A"))]


def test_catalog_size_and_levels():
    cat = load_catalog()
    assert len({p.name for p in cat}) >= 80
    assert all(p.level in {"N5", "N4", "N3", "N2", "N1"} for p in cat)


@pytest.mark.parametrize("sentence, expected", [
    ("食べなければならない", "〜なければならない"),
    ("行ってはいけません", "〜てはいけない"),
    ("読んでもいいです", "〜てもいい"),
    ("本を読んでいる", "〜ている"),
    ("行ったことがある", "〜たことがある"),
    ("漢字を書くことができる", "〜ことができる"),
    ("早く起きるようにする", "〜ようにする"),
    ("音楽を聞きながら勉強する", "〜ながら"),
    ("日本に行くつもりです", "〜つもり"),
    ("寿司が食べたい", "〜たい"),
    ("食べすぎる", "〜すぎる"),
    ("雨が降りそうだ", "〜そうだ（様態）"),
    ("雨が降るそうだ", "〜そうだ（伝聞）"),
    ("子供に野菜を食べさせる", "〜させる"),
    ("先生に褒められる", "〜られる"),
    ("忘れてしまった", "〜てしまう"),
    ("雨かもしれない", "〜かもしれない"),
    ("早く寝なさい", "〜なさい"),
    ("寝る前に歯を磨く", "〜前に"),
    ("水しか飲まない", "〜しか〜ない"),
    ("行かせてください", "〜させてください"),
    ("お待ちください", "お〜ください"),
    ("使い方を教えて", "〜方"),
])
def test_patterns(sentence, expected):
    assert expected in names(sentence)


def test_longer_match_wins_over_shorter():
    # ていく chứa て + いく; không được tách thành ている / てください…
    assert names("増えていく") == ["〜ていく"]
    # なければならない dài hơn 〜ば → chỉ giữ mẫu dài
    assert names("食べなければならない") == ["〜なければならない"]


def test_document_aggregates_frequency_and_first_example():
    sents = ["食べなければならない。", "行かなければなりません。", "本を読んでいる。"]
    inp = [(i, s, tokenize(s, "A")) for i, s in enumerate(sents)]
    items = match_document(inp)
    by_name = {it["term"]: it for it in items}
    nak = by_name["〜なければならない"]
    assert nak["frequency"] == 2
    assert nak["example"] == "食べなければならない。"
    assert nak["kind"] == "grammar" and nak["pos"] == "文法"
    assert nak["level"] == "N4" and nak["levelSources"] == ["grammar_catalog:N4"]
    assert nak["meaningVi"]


def test_dsl_compile_basic():
    toks = tokenize("食べている", "A")
    enc = encode(toks)
    assert compile_pattern("V[連用] て いる/動詞").search(enc)
    assert compile_pattern("V[未然] て").search(enc) is None
    assert compile_pattern("* * *").search(enc)
    assert compile_pattern("食べ て|で いる/動詞?").search(enc)
