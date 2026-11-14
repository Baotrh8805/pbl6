"""kanji_meanings: nghĩa EN của chữ (LC-02) — lọc kDefinition, bảng sửa tay thắng Unihan; phần cuối chạy trên dữ liệu
đã commit và qua kanji_cards / radical_router như người dùng gặp (/kanji?k=学日, thẻ bộ thủ #39 子)."""
import pytest

from app.extract import jmdict, kanji_cards, kanji_meanings, radicals
from app.extract.jlpt import classifier


@pytest.mark.parametrize("raw, expected", [
    ("woman, girl; feminine; Kangxi radical 38; 10th lunar mansion, determinative star ε Aquarii (Albali)",
     "woman, girl; feminine"),
    ("dog; radical number 94", "dog"),
    ("shallow container; rad. no. 108", "shallow container"),
    ("I, my, me; surname; surplus", "I, my, me; surplus"),
    ("(same as 單) single, individual, only; lone", "single, individual, only; lone"),
    ("sell; [NOT casing, shell, husk]", "sell"),
    ("thousand; many, numerous; very; (Cant.) a cheater, swindler", "thousand; many, numerous; very"),
    ("dry (as opposed to rice) field; used in Japanese names", "dry (as opposed to rice) field"),
    ("think, consider, ponder; final particle", "think, consider, ponder"),
    ("clouds; Yunnan province", "clouds"),
    ("numerary adjunct, piece; single", "counter, piece; single"),
    ("seventh earthly branch", None),
    ("surname", None),
    ("", None),
    (None, None),
])
def test_clean_definition(raw, expected):
    assert kanji_meanings.clean_definition(raw) == expected


@pytest.fixture
def tables(tmp_path, monkeypatch):
    (tmp_path / "def.csv").write_text(
        'char,definition\n日,sun; day; daytime\n字,"letter, character, word"\n存,"exist, live, be; survive; remain"\n'
        '町,raised path between fields\n姓,surname\n', encoding="utf-8")
    (tmp_path / "meaning.csv").write_text('char,meaning\n日,"day; sun; Japan"\n町,"town; block"\n', encoding="utf-8")
    monkeypatch.setattr(kanji_meanings, "DEFINITIONS_FILE", tmp_path / "def.csv")
    monkeypatch.setattr(kanji_meanings, "OVERRIDE_FILE", tmp_path / "meaning.csv")
    monkeypatch.setattr(kanji_meanings, "_table", None)
    yield tmp_path
    kanji_meanings.reset()


def test_override_wins_and_unihan_fills_the_rest(tables):
    assert kanji_meanings.meaning("日") == "day; sun; Japan"
    assert kanji_meanings.meaning("町") == "town; block"
    assert kanji_meanings.meaning("存") == "exist, live, be; survive; remain"
    assert kanji_meanings.meaning("姓") is None        # kDefinition chỉ có ghi chú "surname" → không còn nghĩa
    assert kanji_meanings.meaning("猫") is None and kanji_meanings.meaning("") is None
    assert kanji_meanings.available()


def test_missing_files_mean_no_data(tables, monkeypatch):
    monkeypatch.setattr(kanji_meanings, "DEFINITIONS_FILE", tables / "nope.csv")
    monkeypatch.setattr(kanji_meanings, "OVERRIDE_FILE", tables / "nope2.csv")
    kanji_meanings.reset()
    assert kanji_meanings.meaning("日") is None and not kanji_meanings.available()


def test_card_meaning_is_character_meaning_not_first_jmdict_word(tables, monkeypatch):
    # JMdict giả trả đúng entry gây lỗi LC-02: 日 にち "Sunday; nth day", 字 あざ "section of village"
    fake = {"日": {"kanji": "日", "kana": "にち", "gloss": "Sunday; nth day (of the month)", "common": True, "jlpt": None},
            "字": {"kanji": "字", "kana": "あざ", "gloss": "section of village", "common": True, "jlpt": None},
            "猫": {"kanji": "猫", "kana": "ねこ", "gloss": "cat", "common": True, "jlpt": None}}
    monkeypatch.setattr(jmdict, "lookup", lambda lemma, reading=None: fake.get(lemma))
    monkeypatch.setattr(classifier, "meaning_hint", lambda lemma, reading=None: {"犬": "dog"}.get(lemma))
    assert kanji_cards._meaning_en("日") == "day; sun; Japan"
    assert kanji_cards._meaning_en("字") == "letter, character, word"
    assert kanji_cards._meaning_en("存") == "exist, live, be; survive; remain"   # trước đây None ("Chưa có nghĩa")
    assert kanji_cards._meaning_en("猫") == "cat"      # không có trong bảng nghĩa chữ → vẫn rơi về JMdict
    assert kanji_cards._meaning_en("犬") == "dog"      # → rồi cột meaning JLPT
    assert kanji_cards._meaning_en("鳥") is None


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(
    not (kanji_meanings.DEFINITIONS_FILE.exists() and kanji_meanings.OVERRIDE_FILE.exists()),
    reason="chưa có unihan_definitions.csv / kanji_meaning_overrides.csv (scripts/build_dicts.py --only unihan_def)")


@pytest.fixture
def real():
    kanji_meanings.reset()
    yield
    kanji_meanings.reset()


@needs_real
def test_real_data_lc02_kanji_cards(real):
    cards = {c["kanji"]: c for c in kanji_cards.cards(["学", "日", "字", "存"])}
    assert cards["日"]["meaningEn"].startswith("day; sun") and "Sunday" not in cards["日"]["meaningEn"]
    assert cards["字"]["meaningEn"].startswith("letter, character") and "village" not in cards["字"]["meaningEn"]
    assert "exist" in cards["存"]["meaningEn"]
    assert cards["学"]["meaningEn"].startswith("learning")


@needs_real
@pytest.mark.parametrize("ch, word", [("町", "town"), ("駅", "station"), ("私", "I"), ("予", "beforehand"),
                                      ("女", "woman"), ("犬", "dog")])
def test_real_data_japanese_senses(real, ch, word):
    m = kanji_meanings.meaning(ch)
    assert m.startswith(word) and "radical" not in m.lower() and "lunar" not in m


@needs_real
def test_real_data_radical_card_mnemonic_uses_character_meaning(real, monkeypatch):
    # thẻ bộ thủ #39 子: 字 / 存 — mẹo nhớ mẫu không còn ghép "section of village", 存 có nghĩa
    from app.api import radical_router
    from app.extract import gemini, kanjidata
    monkeypatch.setattr(gemini, "generate_mnemonics", lambda items, model=None: {"items": [], "reason": "no_key", "model": None})
    kanjidata.reset()
    radicals.reset()
    cards = {c["kanji"]: c for c in radical_router.build_cards(["字", "存"])}
    radical_router.fill_mnemonics(list(cards.values()))
    assert cards["字"]["meaningEn"].startswith("letter, character")
    assert "village" not in cards["字"]["mnemonicVi"] and '"letter"' in cards["字"]["mnemonicVi"]
    assert cards["存"]["meaningEn"] and "exist" in cards["存"]["meaningEn"]


def test_build_dicts_parses_definitions_of_japanese_jis_chars():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / "scripts" / "build_dicts.py"
    spec = importlib.util.spec_from_file_location("build_dicts_under_test", path)
    build_dicts = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build_dicts)
    readings = ["# comment\n", "U+65E5\tkDefinition\tsun; day; daytime\n", "U+65E5\tkJapanese\tニチ ジツ ひ か\n",
                "U+5B57\tkDefinition\tletter, character, word\n", "U+5B57\tkJapanese\tジ あざ\n",
                "U+4E02\tkDefinition\tobstruction of breath\n",                       # không có âm Nhật → bỏ
                "U+9F98\tkDefinition\tdragon\n", "U+9F98\tkJapanese\tリュウ\n",           # không có mã JIS → bỏ
                "U+20000\tkDefinition\tnot in the URO block\n", "broken line\n"]
    mappings = ["U+65E5\tkJis0\t3892\n", "U+5B57\tkJIS0213\t1,27,90\n", "U+4E02\tkJis0\t1234\n"]
    assert build_dicts.parse_unihan_definitions(readings, mappings) == [
        ("字", "letter, character, word"), ("日", "sun; day; daytime")]
