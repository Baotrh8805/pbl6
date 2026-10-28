"""Từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §4): build_dicts.write_jmdict, dictionary.py, overrides.py, /dict/*.

sqlite dựng trong tmp_path từ tests/fixtures/jmdict_mini.json (8 mục thật của jmdict-examples-eng: 学校, ご飯, 食べる, 日本語, 日本,
を, 〃 (mục hiếm, không common, không ví dụ), 召し上がる) — không cần jmdict.sqlite thật.
"""
from __future__ import annotations

import csv
import importlib.util
import re
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.extract import dictionary, example_vi, gemini, han_viet, jmdict, kanji_meanings, overrides, pipeline

FIXTURE = Path(__file__).parent / "fixtures" / "jmdict_mini.json"
SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "build_dicts.py"


def _build_module():
    spec = importlib.util.spec_from_file_location("build_dicts_for_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BUILD = _build_module()
DATA = json.loads(FIXTURE.read_text(encoding="utf-8"))
JLPT = {("食べる", "たべる"): "N5", ("学校", "がっこう"): "N5", ("召し上がる", "めしあがる"): "N4", ("日本", "にほん"): "N5"}


def _reset_caches():
    jmdict.lookup.cache_clear()
    dictionary._has_table.cache_clear()
    dictionary.clear_cache()


@pytest.fixture
def dict_db(tmp_path, monkeypatch):
    path = tmp_path / "jmdict.sqlite"
    stats = BUILD.write_jmdict(DATA, path, JLPT)
    monkeypatch.setattr(jmdict, "DATA_FILE", path)
    monkeypatch.setattr(jmdict, "_conn", None)
    monkeypatch.setattr(overrides, "DATA_FILE", tmp_path / "dict_overrides.json")
    overrides.reset_for_tests()
    _reset_caches()
    yield stats
    if jmdict._conn is not None:
        jmdict._conn.close()
    overrides.reset_for_tests()
    _reset_caches()


@pytest.fixture
def client(dict_db):
    from app.main import app
    return TestClient(app)


# ----------------------------------------------------------------------------- build

def test_write_jmdict_builds_old_and_new_tables(dict_db, tmp_path):
    con = sqlite3.connect(tmp_path / "jmdict.sqlite")
    assert dict_db["words"] == 8 and dict_db["examples"] == 14 and dict_db["fts"] == 1
    # entries cũ: chỉ mục có cờ common, schema giữ nguyên (bóc tách / đồng âm dùng)
    cols = [r[1] for r in con.execute("PRAGMA table_info(entries)")]
    assert cols == ["kanji", "kana", "gloss", "common", "jlpt"]
    assert con.execute("SELECT COUNT(*) FROM entries WHERE kanji='〃'").fetchone()[0] == 0
    assert con.execute("SELECT kana FROM entries WHERE kanji='食べる'").fetchone()[0] == "たべる"
    # words: cấp JLPT theo chỉ mục JLPT, mục hiếm vẫn có trong bảng words (scope full)
    assert con.execute("SELECT jlpt FROM words WHERE id='1358280'").fetchone()[0] == "N5"
    assert con.execute("SELECT COUNT(*) FROM words WHERE id='1000040'").fetchone()[0] == 1
    # word_forms có dạng hiragana của mục katakana và cách đọc của dạng kanji
    assert con.execute("SELECT reading FROM word_forms WHERE form='食べる'").fetchone()[0] == "たべる"
    ex = con.execute("SELECT tatoeba_id, jpn, eng FROM examples WHERE word_id='1358280'").fetchall()
    assert ex and all(t and j for t, j, _ in ex)
    con.close()


def test_write_jmdict_compact_drops_rare_entries(tmp_path):
    stats = BUILD.write_jmdict(DATA, tmp_path / "c.sqlite", JLPT, scope="compact")
    assert stats["words"] == 7


def test_write_jmdict_without_fts5_uses_plain_table(tmp_path, monkeypatch):
    path = tmp_path / "nofts.sqlite"
    stats = BUILD.write_jmdict(DATA, path, JLPT, fts=False)
    assert stats["fts"] == 0
    con = sqlite3.connect(path)
    assert con.execute("SELECT COUNT(*) FROM word_gloss").fetchone()[0] == 8
    con.close()
    monkeypatch.setattr(jmdict, "DATA_FILE", path)
    monkeypatch.setattr(jmdict, "_conn", None)
    _reset_caches()
    try:
        r = dictionary.search("eat", "en")
        assert {i["headKanji"] for i in r["items"]} >= {"食べる", "召し上がる"}
    finally:
        jmdict._conn.close()
        _reset_caches()


def test_jlpt_index_splits_variants(tmp_path):
    (tmp_path / "n5.csv").write_text("expression,reading,meaning,tags\n足; 脚,あし,foot,\n", encoding="utf-8")
    (tmp_path / "n3.csv").write_text("expression,reading,meaning,tags\n足,あし,foot,\n", encoding="utf-8")
    idx = BUILD._jlpt_index(tmp_path)
    assert idx[("足", "あし")] == "N5" and idx[("脚", "あし")] == "N5"


# ----------------------------------------------------------------------------- tra cứu

def test_search_ja_exact_first_and_kana_katakana(dict_db):
    r = dictionary.search("たべる")
    assert r["items"][0]["headKanji"] == "食べる" and r["items"][0]["jlpt"] == "N5"
    assert dictionary.search("タベル")["items"][0]["key"] == "w:1358280"
    prefix = dictionary.search("日本")
    assert [i["headKanji"] for i in prefix["items"]][:2] == ["日本", "日本語"]


def test_search_ja_deinflects_conjugated_forms(dict_db):
    """Dạng đã chia không trùng dạng viết nào -> mục của dạng gốc (lemma Sudachi) đứng đầu, kèm deinflected để giao diện ghi chú."""
    for q in ("食べました", "たべました", "タベマシタ", "食べたい", "食べて"):
        r = dictionary.search(q)
        assert r["items"] and r["items"][0]["key"] == "w:1358280", q
        assert r["deinflected"]["query"] == q and len(r["deinflected"]["lemmas"]) == 1, q
    assert dictionary.search("食べました")["deinflected"]["lemmas"] == ["食べる"]
    assert dictionary.search("召し上がりました")["items"][0]["headKanji"] == "召し上がる"


def test_search_ja_deinflect_only_when_no_exact_match(dict_db):
    exact = dictionary.search("食べる")
    assert "deinflected" not in exact and exact["items"][0]["key"] == "w:1358280"
    # dạng gốc trùng với kết quả tiền tố: không lặp mục, tổng không đếm hai lần
    partial = dictionary.search("食べ")
    assert [i["key"] for i in partial["items"]].count("w:1358280") == 1 and partial["total"] == 1
    # dạng gốc không có trong từ điển: tìm như thường, không có deinflected
    missing = dictionary.search("走りました")
    assert missing == {"items": [], "total": 0}


def test_search_ja_deinflect_sentence_keeps_word_order_and_pages(dict_db):
    """Câu nhiều từ: từ nội dung theo thứ tự trong câu; động từ phụ (する / いる) sau danh từ không phải từ cần tra."""
    r = dictionary.search("日本語を勉強しています")
    assert r["deinflected"]["lemmas"] == ["日本語"]          # 勉強 không có trong dữ liệu thử, する / いる bị bỏ
    two = dictionary.search("日本語と日本", limit=1, offset=1)
    assert two["total"] == 2 and [i["headKanji"] for i in two["items"]] == ["日本"]
    assert dictionary.search("日本語と日本", limit=1)["items"][0]["headKanji"] == "日本語"


def test_search_ja_deinflect_failure_falls_back_to_plain_search(dict_db, monkeypatch):
    def boom(q):
        raise RuntimeError("SudachiDict hỏng")
    monkeypatch.setattr(dictionary, "_lemma_candidates", boom)
    assert dictionary.search("食べました") == {"items": [], "total": 0}


@pytest.fixture
def ex_vi(dict_db, tmp_path, monkeypatch):
    """example_vi.csv thử: dịch sẵn câu ví dụ đầu tiên của 食べる."""
    first = dictionary.entry("1358280")["examples"][0]
    path = tmp_path / "example_vi.csv"
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tatoeba_id", "vi"])
        w.writerow([first["id"], "Đường này ăn cơm, \"ngon\""])
    monkeypatch.setattr(example_vi, "DATA_FILE", path)
    example_vi.clear_cache()
    dictionary.clear_cache()
    yield first
    example_vi.clear_cache()
    dictionary.clear_cache()


def test_example_vi_seed_on_entry_examples(ex_vi):
    ex = dictionary.entry("1358280")["examples"]
    assert ex[0]["viSeed"] == 'Đường này ăn cơm, "ngon"'
    assert all(x["viSeed"] is None for x in ex[1:])
    assert example_vi.available() and example_vi.count() == 1
    assert example_vi.fold("Đường ĂN") == "duong an"


def test_example_vi_dropped_when_admin_rewrote_the_sentence(ex_vi):
    overrides.replace([{"key": "w:1358280", "field": "example_jpn", "subKey": ex_vi["id"], "value": "別の文。"}], version=1)
    dictionary.clear_cache()
    assert dictionary.entry("1358280")["examples"][0]["viSeed"] is None


def test_example_vi_missing_file_is_harmless(dict_db, tmp_path, monkeypatch):
    monkeypatch.setattr(example_vi, "DATA_FILE", tmp_path / "khong-co.csv")
    example_vi.clear_cache()
    assert not example_vi.available() and example_vi.get("1") is None and example_vi.search("ăn", 5) == []
    example_vi.clear_cache()


def test_sentences_by_japanese_english_and_vietnamese(ex_vi):
    """Tab Câu: chuỗi Nhật khớp đúng chuỗi; Anh khớp từ đầu một từ; Việt khớp có dấu hoặc không dấu; mỗi câu kèm mục từ."""
    part = ex_vi["jpn"][:3]
    r = dictionary.sentences(part)
    hit = next(i for i in r["items"] if i["id"] == ex_vi["id"])
    assert part in hit["jpn"] and hit["viSeed"] == 'Đường này ăn cơm, "ngon"'
    assert any(w["key"] == "w:1358280" for w in hit["words"])
    assert all(part in i["jpn"] for i in r["items"])
    lens = [len(i["jpn"]) for i in r["items"]]
    assert lens == sorted(lens), "câu ngắn trước"

    eat = dictionary.sentences("eat")
    assert eat["items"] and all(re.search(r"\beat", i["eng"].lower()) for i in eat["items"])
    for q in ("ăn cơm", "an com", "ĐƯỜNG"):
        assert [i["id"] for i in dictionary.sentences(q)["items"]] == [ex_vi["id"]], q
    assert dictionary.sentences("ăn côm")["items"] == []   # có dấu thì khớp đúng dấu
    assert dictionary.sentences("   ") == {"items": [], "total": 0}


def test_sentences_paging(ex_vi):
    allr = dictionary.sentences("the", limit=50)
    assert allr["total"] >= 3
    page = dictionary.sentences("the", limit=2, offset=1)
    assert [i["id"] for i in page["items"]] == [i["id"] for i in allr["items"][1:3]] and page["total"] == allr["total"]


def test_search_en_prefers_exact_gloss_and_easy_level(dict_db):
    items = dictionary.search("eat", "en")["items"]
    assert items[0]["headKanji"] == "食べる"   # cả hai gloss "to eat"; N5 trước N4
    assert dictionary.search("schoo", "en")["items"][0]["headKanji"] == "学校"   # tiền tố từ cuối
    assert dictionary.search("!!!", "en") == {"items": [], "total": 0}


def test_entry_has_examples_pitch_and_kanji(dict_db):
    e = dictionary.entry("1358280")
    assert e["key"] == "w:1358280" and e["reading"] == "たべる"
    assert e["examples"] and e["examples"][0]["jpn"]
    assert e["senses"][0]["posText"]          # nhãn tag lấy từ bảng tags
    assert [c["char"] for c in e["kanjiChars"]] == ["食"]
    assert dictionary.entry("999999999") is None


def test_key_for_and_tokenize(dict_db):
    assert dictionary.key_for("日本", "にほん") == "w:1582710"
    assert dictionary.key_for("không có") is None
    toks = dictionary.tokenize("ご飯を食べる。")
    assert [t["key"] for t in toks if t["surface"] in ("ご飯", "食べる")] == ["w:1270590", "w:1358280"]


def test_unavailable_when_old_sqlite(tmp_path, monkeypatch):
    path = tmp_path / "old.sqlite"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE entries (kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT)")
    con.commit()
    con.close()
    monkeypatch.setattr(jmdict, "DATA_FILE", path)
    monkeypatch.setattr(jmdict, "_conn", None)
    _reset_caches()
    try:
        assert dictionary.available() is False
        with pytest.raises(dictionary.DictUnavailable):
            dictionary.search("たべる")
        assert dictionary.key_for("食べる") is None
    finally:
        jmdict._conn.close()
        _reset_caches()


# ----------------------------------------------------------------------------- ghi đè của admin (D22)

def test_overrides_apply_everywhere_and_persist(dict_db, tmp_path):
    base_hv = han_viet.han_viet("食")
    overrides.replace([
        {"key": "k:食", "field": "han_viet", "value": "thử"},
        {"key": "k:食", "field": "kanji_meaning", "value": "eat (sửa)"},
        {"key": "w:1358280", "field": "meaning_en", "value": "to consume (sửa)"},
        {"key": "w:1358280", "field": "reading", "value": "たべるる"},
        {"key": "w:1358280", "field": "example_hidden", "subKey": dictionary.entry("1358280")["examples"][0]["id"],
         "value": "true"},
    ], version=7)
    assert han_viet.han_viet("食") == "THỬ" != base_hv
    assert kanji_meanings.meaning("食") == "eat (sửa)"
    assert jmdict.lookup("食べる", "たべる")["gloss"] == "to consume (sửa)"
    e = dictionary.entry("1358280")
    assert e["reading"] == "たべるる" and e["readingOverridden"] and e["glossShort"] == "to consume (sửa)"
    assert e["examples"][0]["hidden"] is True
    assert dictionary.search("たべる")["items"][0]["glossShort"] == "to consume (sửa)"
    # bóc tách: dictKey + cách đọc ghi đè + readingSegments dựng lại
    res = pipeline.analyze("毎朝ご飯を食べる。", None, {})
    eat = next(i for i in res["items"] if i["term"] == "食べる")
    assert eat["dictKey"] == "w:1358280" and eat["reading"] == "たべるる"
    # khởi động lại (RAM trống) → nạp lại từ file
    saved = json.loads((tmp_path / "dict_overrides.json").read_text(encoding="utf-8"))
    assert saved["version"] == 7 and len(saved["items"]) == 5
    overrides._loaded = False
    overrides._store = {}
    assert overrides.version() == 7 and overrides.han_viet("食") == "THỬ"
    # danh sách mới rỗng → hết ghi đè
    overrides.replace([], version=8)
    assert han_viet.han_viet("食") == base_hv and dictionary.entry("1358280")["reading"] == "たべる"


def test_overrides_reject_unknown_field(dict_db):
    with pytest.raises(ValueError):
        overrides.replace([{"key": "w:1", "field": "bogus", "value": "x"}], version=1)


# ----------------------------------------------------------------------------- router

def test_router_search_entry_kanji(client):
    assert client.get("/api/dict/search", params={"q": "がっこう"}).json()["items"][0]["key"] == "w:1206730"
    assert client.get("/api/dict/search", params={"q": "x", "mode": "fr"}).status_code == 422
    sent = client.get("/api/dict/sentences", params={"q": "食", "limit": 2}).json()
    assert len(sent["items"]) == 2 and sent["total"] >= 2 and "words" in sent["items"][0]
    assert client.get("/api/dict/sentences", params={"q": " "}).status_code == 400
    conj = client.get("/api/dict/search", params={"q": "食べました"}).json()
    assert conj["items"][0]["key"] == "w:1358280" and conj["deinflected"] == {"query": "食べました", "lemmas": ["食べる"]}
    assert client.get("/api/dict/entries/1206730").json()["jlpt"] == "N5"
    assert client.get("/api/dict/entries/abc").status_code == 404
    assert client.get("/api/dict/entries/123456789").status_code == 404
    assert [i["key"] for i in client.get("/api/dict/entries", params={"ids": "1206730,abc,1358280"}).json()["items"]] \
        == ["w:1206730", "w:1358280"]
    k = client.get("/api/dict/kanji/食").json()
    assert k["key"] == "k:食" and any(w["headKanji"] == "食べる" for w in k["exampleWords"])
    assert client.get("/api/dict/kanji/ab").status_code == 404
    assert client.get("/api/dict/key", params={"term": "日本", "reading": "にほん"}).json() == {"key": "w:1582710"}
    toks = client.post("/api/dict/tokenize", json={"text": "日本語"}).json()["tokens"]
    assert toks[0]["key"] == "w:1464530"


def test_router_overrides_roundtrip(client):
    assert client.post("/api/dict/overrides", json={"version": 3, "items": [
        {"key": "k:食", "field": "han_viet", "value": "thử"}]}).json() == {"version": 3, "count": 1}
    assert client.get("/api/dict/overrides/version").json() == {"version": 3, "count": 1}
    assert client.get("/api/dict/kanji/食").json()["hanViet"] == "THỬ"
    assert client.post("/api/dict/overrides", json={"version": 4, "items": [
        {"key": "k:食", "field": "nope", "value": "x"}]}).status_code == 400


def test_router_unavailable_503(tmp_path, monkeypatch):
    monkeypatch.setattr(jmdict, "DATA_FILE", tmp_path / "missing.sqlite")
    monkeypatch.setattr(jmdict, "_conn", None)
    _reset_caches()
    from app.main import app
    c = TestClient(app)
    try:
        assert c.get("/api/dict/search", params={"q": "たべる"}).json() == {"detail": "dictUnavailable"}
        assert c.get("/api/dict/search", params={"q": "たべる"}).status_code == 503
    finally:
        _reset_caches()


def test_router_translate_without_key_is_503(client, monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: False)
    r = client.post("/api/dict/translate", json={"items": [{"ref": "w:1", "forms": "食べる"}]})
    assert r.status_code == 503 and r.json()["detail"] == "no_api_key"
    assert client.post("/api/dict/translate", json={"items": []}).json() == {"items": [], "model": None}


def test_router_translate_filters_model_output(client, monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "translate_dictionary", lambda items, model=None: [
        {"ref": "w:1358280", "meaningVi": "ăn; dùng bữa", "examples": [{"id": "1", "vi": "Tôi ăn."}, {"id": "9", "vi": "lạ"}]},
        {"ref": "w:1358280", "meaningVi": "lặp", "examples": []},
        {"ref": "w:lạ", "meaningVi": "không hỏi", "examples": []},
        {"ref": "k:食", "meaningVi": "食 vẫn còn chữ Nhật", "examples": []},
    ])
    r = client.post("/api/dict/translate", json={"items": [
        {"ref": "w:1358280", "forms": "食べる【たべる】", "glossEn": "to eat", "examples": [{"id": "1", "jpn": "食べる。"}]},
        {"ref": "k:食", "kind": "kanji", "forms": "食"}]}).json()
    assert r["items"] == [
        {"ref": "w:1358280", "meaningVi": "ăn; dùng bữa", "examples": [{"id": "1", "vi": "Tôi ăn."}]},
        {"ref": "k:食", "meaningVi": None, "examples": []}]


def test_gemini_translate_dictionary_parses(monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "_generate", lambda prompt, cfg, model=None: json.dumps([
        {"ref": "w:1", "meaningVi": " ăn ", "examples": [{"id": "7", "vi": " Tôi ăn. "}, "rác"]},
        {"ref": "w:2"}]))
    out = gemini.translate_dictionary([{"ref": "w:1", "forms": "食べる"}, {"ref": "w:2", "forms": "飲む"}])
    assert out == [{"ref": "w:1", "meaningVi": "ăn", "examples": [{"id": "7", "vi": "Tôi ăn."}]},
                   {"ref": "w:2", "meaningVi": "", "examples": []}]


# ----------------------------------------------------------------------------- dịch câu (tab Dịch, spec 2026-10-28, D33)

def test_router_translate_text_analysis_without_ai(client, monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: False)
    r = client.post("/api/dict/translate-text", json={"text": " 日本語を食べました。 "}).json()
    assert r["direction"] == "ja-vi" and r["source"] == "日本語を食べました。"
    assert r["translation"] is None and r["reason"] == "no_api_key" and r["model"] is None
    keys = {t["surface"]: t["key"] for t in r["tokens"]}
    assert keys["日本語"] == "w:1464530" and keys["食べました"] == "w:1358280" and keys["。"] is None
    assert keys["を"].startswith("w:"), "trợ từ có mục JMdict thì vẫn bấm tra được"
    nihongo = r["tokens"][0]
    assert nihongo["jlpt"] == "N5" and nihongo["reading"] == "にほんご" and nihongo["meaning"] is None and nihongo["glossEn"]

    def boom(*a, **k):
        raise AssertionError("không được gọi Gemini")
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "translate_text", boom)
    r2 = client.post("/api/dict/translate-text", json={"text": "学校", "withAi": False}).json()
    assert r2["reason"] == "skipped" and r2["tokens"][0]["key"] == "w:1206730"
    r3 = client.post("/api/dict/translate-text", json={"text": "Tôi ăn cơm", "withAi": False}).json()
    assert r3["direction"] == "vi-ja" and r3["tokens"] == [] and r3["translation"] is None
    assert client.post("/api/dict/translate-text", json={"text": "食べる", "direction": "vi-ja", "withAi": False}).json()["direction"] == "vi-ja"
    assert client.post("/api/dict/translate-text", json={"text": "   "}).status_code == 400
    assert client.post("/api/dict/translate-text", json={"text": "x" * 1001}).status_code == 422
    assert client.post("/api/dict/translate-text", json={"text": "x", "direction": "en-vi"}).status_code == 422


def test_router_translate_text_with_ai(client, monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "resolve_model", lambda m: m or "gemini-default")
    calls = []

    def fake(text, direction, words=None, model=None):
        calls.append((text, direction, words, model))
        if direction == "ja-vi":
            return ({"translation": "Tôi đã học tiếng Nhật.", "literal": "tiếng Nhật / (tân ngữ) / đã học", "alternatives": [],
                     "notes": "", "words": [{"i": 0, "meaning": "tiếng Nhật"}, {"i": 1, "meaning": "trợ từ chỉ tân ngữ"}]}, model)
        return ({"translation": "日本語を勉強しました。", "reading": "にほんごをべんきょうしました。",
                 "alternatives": [{"text": "日本語を勉強した。", "reading": "にほんごをべんきょうした。", "note": "thể thường"}],
                 "notes": "勉強する: học"}, model)
    monkeypatch.setattr(gemini, "translate_text", fake)

    r = client.post("/api/dict/translate-text", json={"text": "日本語を勉強しました。", "geminiModel": "gemini-test"}).json()
    assert r["translation"] == "Tôi đã học tiếng Nhật." and r["literal"] == "tiếng Nhật / (tân ngữ) / đã học"
    assert r["reason"] is None and r["model"] == "gemini-test" and r["readingAgrees"] is None
    assert r["tokens"][0]["meaning"] == "tiếng Nhật" and r["tokens"][1]["meaning"] == "trợ từ chỉ tân ngữ"
    assert [w["surface"] for w in calls[0][2]] == ["日本語", "を", "勉強", "しました"] and calls[0][3] == "gemini-test"

    r = client.post("/api/dict/translate-text", json={"text": "Tôi đã học tiếng Nhật."}).json()
    assert r["direction"] == "vi-ja" and r["translation"] == "日本語を勉強しました。" and r["reading"] == "にほんごをべんきょうしました。"
    assert r["readingAgrees"] is True and r["romaji"] == "nihongo o benkyou shimashita。"
    assert [t["surface"] for t in r["tokens"]] == ["日本語", "を", "勉強", "しました", "。"] and r["tokens"][0]["key"] == "w:1464530"
    assert r["alternatives"] == [{"text": "日本語を勉強した。", "reading": "にほんごをべんきょうした。", "note": "thể thường"}]
    assert r["notes"] == "勉強する: học" and calls[1][2] == [] and calls[1][3] == "gemini-default"

    # Gemini lỗi → reason theo mã /dict/translate, phân tích câu vẫn có
    def quota(*a, **k):
        raise gemini.GeminiError("quota", "x", retryable=True)
    monkeypatch.setattr(gemini, "translate_text", quota)
    r = client.post("/api/dict/translate-text", json={"text": "学校"}).json()
    assert r["reason"] == "quota" and r["translation"] is None and r["tokens"][0]["key"] == "w:1206730"

    def budget(*a, **k):
        raise gemini.GeminiError("budget", "hết hạn chót", retryable=True)
    monkeypatch.setattr(gemini, "translate_text", budget)
    assert client.post("/api/dict/translate-text", json={"text": "学校"}).json()["reason"] == "aiOverloaded"

    def bad(*a, **k):
        return {"translation": "学校 còn chữ Nhật", "literal": "", "alternatives": [], "notes": "", "words": []}, "m"
    monkeypatch.setattr(gemini, "translate_text", bad)
    r = client.post("/api/dict/translate-text", json={"text": "学校"}).json()
    assert r["reason"] == "error" and r["translation"] is None and r["model"] is None
