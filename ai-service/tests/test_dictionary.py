"""Từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §4): build_dicts.write_jmdict, dictionary.py, overrides.py, /dict/*.

sqlite dựng trong tmp_path từ tests/fixtures/jmdict_mini.json (8 mục thật của jmdict-examples-eng: 学校, ご飯, 食べる, 日本語, 日本,
を, 〃 (mục hiếm, không common, không ví dụ), 召し上がる) — không cần jmdict.sqlite thật.
"""
from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.extract import dictionary, gemini, han_viet, jmdict, kanji_meanings, overrides, pipeline

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
