"""kanji_similar trên bảng KRADFILE / Unihan tí hon và danh sách JLPT giả: không cần kradfile.csv thật
(chưa commit, build_dicts --only kradfile) và không phụ thuộc nội dung CSV JLPT."""
import pytest

from app.extract import jmdict, kanjidata, kanji_similar
from app.extract.jlpt import classifier

# char,radical_no,residual_strokes,total_strokes — 待 持 特 侍 時 詩 cùng nhóm 土寸寺; 後 律 役 徳 cùng bộ 彳 với 待
RS_CSV = (
    "char,radical_no,residual_strokes,total_strokes\n"
    "待,60,6,9\n持,64,6,9\n特,93,6,10\n侍,9,6,8\n時,72,6,10\n詩,149,6,13\n寺,41,3,6\n"
    "後,60,6,9\n律,60,6,9\n役,60,4,7\n徳,60,11,14\n日,72,0,4\n明,72,4,8\n"
)
KRAD_CSV = (
    "kanji,components\n"
    "待,彳 土 寸 寺\n持,扌 土 寸 寺\n特,牛 土 寸 寺\n侍,亻 土 寸 寺\n時,日 土 寸 寺\n詩,言 土 寸 寺\n"
    "寺,土 寸\n日,日\n明,日 月\n"
)
# "độ dễ" của chữ = cấp dễ nhất của từ JLPT chứa nó (giả lập entries_containing)
EASINESS = {"時": "N5", "持": "N5", "後": "N5", "特": "N4", "律": "N2", "侍": "N1"}


def _fake_entries_containing(ch):
    level = EASINESS.get(ch)
    return [(ch, "", "", level)] if level else []


@pytest.fixture
def kdata(tmp_path, monkeypatch):
    (tmp_path / "unihan_rs.csv").write_text(RS_CSV, encoding="utf-8")
    (tmp_path / "kradfile.csv").write_text(KRAD_CSV, encoding="utf-8")
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "unihan_rs.csv")
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "kradfile.csv")
    monkeypatch.setattr(classifier, "entries_containing", _fake_entries_containing)
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset("待持特侍時詩寺後律役徳日明"))
    kanjidata.reset()
    kanji_similar.reset()
    yield tmp_path
    kanjidata.reset()
    kanji_similar.reset()


# ----------------------------------------------------------------------------- similar()

def test_similar_ranks_components_then_radical_strokes(kdata):
    # Jaccard với 待 = 3/5 cho cả nhóm; 持 cùng 9 nét (điểm nét 1.0) > 特/侍 lệch 1 nét (0.8) > 詩 lệch 4 (0.2) > 寺 (Jaccard 2/4)
    got = kanji_similar.similar("待", k=3, pool="持特侍詩寺")
    assert [k for k, _ in got] == ["持", "特", "侍"]
    assert got[0][1] == pytest.approx(0.7 * 0.6 + 0.3 * 0.5, abs=1e-4)
    assert got[1][1] == got[2][1] == pytest.approx(0.7 * 0.6 + 0.3 * 0.5 * 0.8, abs=1e-4)
    full = kanji_similar.similar("待", k=10, pool="持特侍詩寺")
    assert [k for k, _ in full] == ["持", "特", "侍", "詩", "寺"]
    assert full[-1][1] == pytest.approx(0.7 * 0.5 + 0.3 * 0.5 * 0.4, abs=1e-4)


def test_similar_default_pool_excludes_self_and_breaks_ties_by_easiness(kdata):
    got = kanji_similar.similar("待", k=6)
    assert "待" not in [k for k, _ in got]
    # 時 (N5) và 特 (N4) cùng điểm với 侍 (N1): chữ dễ hơn đứng trước; 後/律 (không chung thành phần) chỉ còn bộ thủ
    assert [k for k, _ in got][:4] == ["持", "時", "特", "侍"]
    assert kanji_similar.similar("待", k=1) == got[:1]
    assert kanji_similar.similar("待", k=0) == [] and kanji_similar.similar("", k=3) == []
    assert kanji_similar.similar("あ", k=3) == []  # không phải chữ Hán → không có dữ liệu → []


def test_similar_same_radical_only_scores_low_but_ranks_deterministically(kdata):
    got = dict(kanji_similar.similar("待", k=20))
    # 後 cùng bộ 彳, cùng 9 nét nhưng không chung thành phần KRADFILE: chỉ 0.3 × (0.5 + 0.5)
    assert got["後"] == pytest.approx(0.3, abs=1e-4)
    assert got["後"] < got["詩"]


def test_similar_fallback_without_kradfile(kdata, tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "missing.csv")
    kanjidata.reset()
    kanji_similar.reset()
    got = kanji_similar.similar("待", k=5, pool="後律役徳持")
    # chỉ cùng bộ thủ và lệch ≤ 2 nét: 持 (bộ 扌) và 徳 (lệch 5) bị loại; 後 (N5) trước 律 (N2) khi cùng điểm
    assert [k for k, _ in got] == ["後", "律", "役"]
    assert got[0][1] == pytest.approx(0.3, abs=1e-4)
    assert got[2][1] == pytest.approx(0.3 * (0.5 + 0.5 * 0.6), abs=1e-4)


def test_similar_without_any_data_is_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "missing")
    monkeypatch.setattr(kanjidata, "KRAD_FILE", tmp_path / "missing")
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset("持特侍"))
    kanjidata.reset()
    kanji_similar.reset()
    try:
        assert kanji_similar.similar("待", k=3) == []
        assert kanji_similar.similar("待", k=3, pool="持特侍") == []
        assert kanji_similar.lookalike_terms("待つ", "まつ", "N5") == []
    finally:
        kanjidata.reset()
        kanji_similar.reset()


# ----------------------------------------------------------------------------- nghĩa trùng

def test_same_meaning_overlap_heuristic():
    assert kanji_similar.same_meaning("bridge", "bridge; span")
    assert kanji_similar.same_meaning("beak, bill", "beak, bill")
    assert kanji_similar.same_meaning("very (much), greatly, exceedingly", "very, awfully; (not) at all, by no means")
    assert not kanji_similar.same_meaning("bridge", "chopsticks")
    assert not kanji_similar.same_meaning("to hold, to carry; to possess", "to wait")
    assert not kanji_similar.same_meaning("end (e.g. of street), tip; beginning, start", "machine")
    assert not kanji_similar.same_meaning(None, "bridge") and not kanji_similar.same_meaning("", "")
    assert kanji_similar.gloss_tokens("to go (e.g. home)") == frozenset({"go", "home"})


# ----------------------------------------------------------------------------- lookalike_terms()

JLPT_FAKE = {
    "待つ": [("まつ", "to wait", "N5")],
    "持つ": [("もつ", "to hold, to carry; to possess", "N5")],
    "寺": [("てら", "temple", "N4")],
    "侍": [("さむらい", "samurai", "N1")],
}
JMDICT_FAKE = {
    "時": {"kanji": "時", "kana": "とき", "gloss": "time, hour; occasion", "common": True, "jlpt": None},
    "詩": {"kanji": "詩", "kana": "し", "gloss": "poem, poetry", "common": False, "jlpt": None},
    "持": {"kanji": "持", "kana": "じ", "gloss": "temple; shrine", "common": True, "jlpt": None},  # giả: cùng nghĩa với 寺
}


@pytest.fixture
def words(kdata, monkeypatch):
    monkeypatch.setattr(classifier, "entries_of", lambda expr: JLPT_FAKE.get(expr, []))
    monkeypatch.setattr(jmdict, "lookup", lambda lemma, reading=None: JMDICT_FAKE.get(lemma))
    monkeypatch.setattr(classifier, "classify", lambda lemma, reading, kana_only: ("N2", 0.4, ["wordfreq:N2"]))
    return kdata


def test_lookalike_terms_keeps_only_real_words(words):
    got = kanji_similar.lookalike_terms("待つ", "まつ", "N5")
    # 持つ là từ JLPT; 特つ / 侍つ / 時つ / 詩つ không phải từ → không bịa
    assert got == [{"term": "持つ", "reading": "もつ", "meaning": "to hold, to carry; to possess", "level": "N5",
                    "confidence": pytest.approx(0.5 * 0.57 + 0.5, abs=1e-3)}]
    assert kanji_similar.lookalike_terms("期待", "きたい", "N3") == []   # 期 không có dữ liệu, 期X không phải từ
    assert kanji_similar.lookalike_terms("まつ", "まつ", "N5") == []     # toàn kana → không có chữ để thay


def test_lookalike_terms_sources_confidence_and_same_meaning_filter(words):
    got = kanji_similar.lookalike_terms("寺", "てら", "N4", k=5)
    terms = {d["term"]: d for d in got}
    # 持 bị loại vì gloss giả "temple; shrine" trùng nghĩa 寺; 待 không phải từ; 侍 JLPT (1.0), 時 JMdict phổ biến (0.6), 詩 JMdict khác (0.4)
    assert set(terms) == {"侍", "時", "詩"}
    sim = dict(kanji_similar.similar("寺", k=10))
    assert terms["侍"]["confidence"] == pytest.approx(0.5 * sim["侍"] + 0.5, abs=1e-3)
    assert terms["時"] == {"term": "時", "reading": "とき", "meaning": "time, hour; occasion", "level": "N2",
                          "confidence": pytest.approx(0.5 * sim["時"] + 0.3, abs=1e-3)}
    assert terms["詩"]["confidence"] == pytest.approx(0.5 * sim["詩"] + 0.2, abs=1e-3)
    assert [d["confidence"] for d in got] == sorted((d["confidence"] for d in got), reverse=True)
    assert len(kanji_similar.lookalike_terms("寺", "てら", "N4", k=1)) == 1


def test_lookalike_terms_given_meaning_supplements_lookup(words):
    # nghĩa truyền vào (cột meaning của thẻ, có thể tiếng Việt) BỔ SUNG gloss từ điển: 侍 rơi vì "samurai" truyền vào,
    # 持 vẫn rơi vì gloss giả "temple; shrine" trùng nghĩa từ điển của 寺 — nghĩa VI không được tắt bộ lọc EN
    got = kanji_similar.lookalike_terms("寺", "てら", "N4", k=5, meaning="samurai")
    assert {d["term"] for d in got} == {"時", "詩"}
    got = kanji_similar.lookalike_terms("寺", "てら", "N4", k=5, meaning="ngôi chùa")
    assert {d["term"] for d in got} == {"侍", "時", "詩"}


def test_word_entry_prefers_jlpt_then_jmdict(words):
    assert kanji_similar.word_entry("待つ", "まつ") == {"reading": "まつ", "meaning": "to wait", "level": "N5", "source": "jlpt"}
    assert kanji_similar.word_entry("時")["source"] == "jmdict_common"
    assert kanji_similar.word_entry("詩")["source"] == "jmdict"
    assert kanji_similar.word_entry("特つ") is None
