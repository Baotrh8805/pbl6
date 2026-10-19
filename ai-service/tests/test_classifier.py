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


def test_load_is_idempotent_under_concurrent_first_call(monkeypatch):
    """Endpoint sync chạy trên threadpool → nhiều request đầu tiên gọi _load() cùng lúc; chỉ mục _entries / _idx_*
    là list append nên hai lần nạp chồng nhau sẽ nhân đôi mục (31 780 thay vì 7 945). Khoá + gán sau khi dựng xong."""
    import threading
    classifier._load()
    n_entries, n_expr = len(classifier._entries), len(classifier._by_expr)
    assert n_entries > 0
    for name, empty in (("_by_pair", None), ("_by_expr", {}), ("_by_reading", {}), ("_meaning", {}),
                        ("_entries", []), ("_idx_expr", {}), ("_idx_reading", {}), ("_idx_char", {})):
        monkeypatch.setattr(classifier, name, empty)   # module như lúc mới import; monkeypatch trả lại bảng cũ sau test
    threads = [threading.Thread(target=classifier._load) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(classifier._entries) == n_entries and len(classifier._by_expr) == n_expr
    assert classifier.entries_of("待つ") == [("まつ", "to wait", "N5")]
    assert all(len(ix) == len(set(ix)) for ix in classifier._idx_expr.values())


def test_phrase_level_none_when_no_word_has_level():
    from app.extract.jlpt import phrase_level
    assert phrase_level([("逝得", None), ("償友", None)]) == (None, 0.0, [])
    assert phrase_level([]) == (None, 0.0, [])
