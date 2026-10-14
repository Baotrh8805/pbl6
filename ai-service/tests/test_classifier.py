from app.extract.jlpt import classifier


def test_word_in_two_lists_gets_easiest_level_and_half_confidence():
    # こと nằm trong cả N4 và N3 của elzup/jlpt-word-list
    level, conf, sources = classifier.classify("こと", "こと", True)
    assert level == "N4"
    assert conf == 0.5
    assert sources == ["jlpt_list:N4", "jlpt_list:N3"]


def test_known_word_full_confidence():
    level, conf, sources = classifier.classify("勉強", "べんきょう", False)
    assert level == "N5"
    assert conf == 1.0
    assert sources == ["jlpt_list:N5"]


def test_kana_only_lookup_by_reading():
    level, conf, sources = classifier.classify("とても", "とても", True)
    assert level == "N5"
    assert sources[0].startswith("jlpt_list:")


def test_unknown_word_returns_none():
    level, conf, sources = classifier.classify("ｘｙｚ", None, False)
    assert level is None
    assert conf == 0.0
    assert sources == []


def test_wordfreq_fallback(monkeypatch):
    monkeypatch.setattr(classifier, "_zipf", lambda lemma: 4.7)
    level, conf, sources = classifier.classify("量子力学", "りょうしりきがく", False)
    assert level == "N3"
    assert conf == 0.4
    assert sources == ["wordfreq:N3"]


def test_meaning_hint():
    assert "study" in classifier.meaning_hint("勉強")


def test_phrase_level_picks_hardest_word():
    from app.extract.jlpt import phrase_level
    level, conf, sources = phrase_level([("銀行", "ぎんこう"), ("お金", "おかね"), ("下ろす", "おろす")])
    assert level == "N1"
    assert 0 < conf <= 0.8
    assert sources[0] == "phrase:下ろす" and sources[1].startswith(("jlpt_list:", "wordfreq:"))


def test_phrase_level_none_when_no_word_has_level():
    from app.extract.jlpt import phrase_level
    assert phrase_level([("逝得", None), ("償友", None)]) == (None, 0.0, [])
    assert phrase_level([]) == (None, 0.0, [])
