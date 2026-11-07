"""Đồ thị tri thức (spec 2026-10-27 §4–§5): dựng lớp tham chiếu từ dữ liệu tí hon và đồng bộ lớp người học, không cần Neo4j
(FakeGraph ghi lại Cypher)."""
from __future__ import annotations

import json

import pytest

from app.graph import builder, schema, sync
from tests.graph_support import FakeGraph, install_tiny_data, teardown_tiny_data


@pytest.fixture
def tiny(tmp_path, monkeypatch):
    install_tiny_data(tmp_path, monkeypatch)
    yield
    teardown_tiny_data()


def _by(rows, key, value):
    return [r for r in rows if r.get(key) == value]


# ----------------------------------------------------------------------------- schema

def test_schema_statements_cover_every_label_once():
    stmts = schema.statements()
    assert all(s.startswith("CREATE CONSTRAINT") or s.startswith("CREATE INDEX") for s in stmts)
    assert all("IF NOT EXISTS" in s for s in stmts)
    for label in schema.REFERENCE_LABELS + schema.LEARNER_LABELS + ("Meta",):
        assert sum(1 for s in stmts if f"(n:{label})" in s and s.startswith("CREATE CONSTRAINT")) == 1, label
    g = FakeGraph()
    assert schema.ensure(g) == len(stmts) and len(g.calls) == len(stmts)


# ----------------------------------------------------------------------------- lớp tham chiếu

def test_reference_rows_words_kanji_and_relations(tiny):
    rows = builder.reference_rows(with_grammar=False, with_similar=False)
    words = {r["key"]: r for r in rows["words"]}
    # mục JLPT khớp JMdict lấy khoá w:<id> + cấp + nghĩa gọn của JLPT; không khớp → w:jlpt:
    taberu = words["w:1358280"]
    assert taberu["term"] == "食べる" and taberu["reading"] == "たべる" and taberu["jlpt"] == "N5" and taberu["gloss"] == "to eat"
    assert words["w:jlpt:箸|はし"]["jlpt"] == "N5" and words["w:jlpt:橋|はし"]["jlpt"] == "N4"
    # JLPT ghi ご飯 nhưng dạng viết lấy theo JMdict (dạng đầu, phổ biến nhất), cấp + nghĩa gọn vẫn của JLPT
    assert words["w:1270590"]["term"] == "ご飯" and words["w:1270590"]["jlpt"] == "N5" and words["w:1270590"]["gloss"] == "cooked rice; meal"
    # mục JMdict common không thuộc JLPT vẫn có (を kana-only); mục hiếm 〃 không common → không có
    assert words["w:2029010"]["kanaOnly"] is True and "w:1000040" not in words
    chars = {r["char"]: r for r in rows["kanji"]}
    assert {"食", "学", "校", "日", "本", "語", "飯", "箸", "橋"} <= set(chars)
    assert chars["食"]["hanViet"] == "THỰC" and chars["食"]["radicalNo"] == 184 and chars["食"]["strokes"] == 9 and chars["食"]["jlpt"] == "N5"
    assert chars["橋"]["jlpt"] == "N4"
    # CONTAINS có vị trí; mỗi chữ một lần dù lặp
    assert _by(_by(rows["contains"], "key", "w:1358280"), "char", "食")[0]["pos"] == 0
    assert [r["char"] for r in _by(rows["contains"], "key", "w:1464530")] == ["日", "本", "語"]
    # bộ thủ 214 + HAS_RADICAL, âm Hán-Việt + READ_AS, thành phần KRADFILE
    assert len(rows["radicals"]) == 214 and {"char": "食", "no": 184} in rows["has_radical"]
    hv = {r["reading"]: r for r in rows["hanviet"]}
    assert hv["THỰC"]["fold"] == "THUC" and {"char": "食", "reading": "THỰC"} in rows["read_as"]
    assert any(r["char"] == "校" for r in rows["has_component_kanji"] + rows["has_component_other"])
    # đồng âm: chỉ từ JLPT cùng cách đọc khác chữ (はし), không ghép từ với chính nó
    assert rows["homophones"] == [{"a": "w:jlpt:橋|はし", "b": "w:jlpt:箸|はし"}]
    # câu ví dụ chỉ của từ có trong đồ thị, mỗi câu một node, EXAMPLE_OF trỏ đúng khoá
    sents = {r["id"]: r for r in rows["sentences"]}
    assert sents and all(r["id"].isdigit() for r in sents.values())   # id Tatoeba từ fixture
    assert sents["222600"]["vi"] == "Trường này có nhiều học sinh." and sents["217034"]["vi"] is None
    keys = {r["key"] for r in rows["example_of"]}
    assert "w:1358280" in keys and "w:1000040" not in keys
    assert rows["looks_like"] == [] and rows["uses_grammar"] == []
    assert rows["grammar"] and rows["grammar"][0]["id"] == "nakereba_naranai"


def test_reference_rows_grammar_links_sentences(tiny):
    rows = builder.reference_rows(with_grammar=True, with_similar=False)
    # 「もっと果物を食べるべきです」 khớp 〜べき; mọi gid phải là mẫu trong catalog
    gids = {g["id"] for g in rows["grammar"]}
    assert rows["uses_grammar"] and all(r["gid"] in gids for r in rows["uses_grammar"])
    sids = {s["id"] for s in rows["sentences"]}
    assert all(r["id"] in sids for r in rows["uses_grammar"])


def test_build_writes_nodes_before_edges_then_relinks_and_meta(tiny):
    g = FakeGraph()
    res = builder.build(g, with_grammar=False, with_similar=False)
    order = [c for c, _ in g.calls]
    first_word = next(i for i, c in enumerate(order) if "MERGE (w:Word {key: r.key})" in c)
    first_contains = next(i for i, c in enumerate(order) if "MERGE (w)-[c:CONTAINS]->(k)" in c)
    assert first_word < first_contains
    # xoá lớp tham chiếu theo lô trước khi ghi, không đụng nhãn lớp người học
    deletes = [c for c in order if "DETACH DELETE" in c]
    assert len(deletes) == len(schema.REFERENCE_LABELS) and not any("(n:Card)" in c or "(n:User)" in c for c in deletes)
    assert all(any(f"(n:{label})" in c for c in deletes) for label in schema.REFERENCE_LABELS)
    assert order.index(deletes[0]) < first_word
    # nối lại thẻ (MEANS / CONTAINS) rồi Meta với số liệu
    assert any("MERGE (c)-[:MEANS]->(w)" in c for c in order) and any("MERGE (c)-[:CONTAINS]->(k)" in c for c in order)
    meta = [p for c, p in g.calls if "MERGE (m:Meta {id: 'reference'})" in c]
    assert len(meta) == 1 and json.loads(meta[0]["counts"])["words"] == res["counts"]["words"] > 0
    assert res["written"]["words"] == res["counts"]["words"]


def test_start_build_runs_in_background_and_reports_state(tiny):
    builder.reset_state()
    g = FakeGraph()
    assert builder.start_build(g, with_grammar=False, with_similar=False) is True
    import time
    for _ in range(200):
        if not builder.state()["building"]:
            break
        time.sleep(0.05)
    st = builder.state()
    assert st["building"] is False and st["error"] is None and st["result"]["counts"]["kanji"] > 0
    builder.reset_state()


# ----------------------------------------------------------------------------- đồng bộ lớp người học

def _payload(run="run-1"):
    return {
        "run": run,
        "users": [{"id": 7, "level": "N4"}],
        "decks": [{"id": "d1", "title": "Bài 1", "level": "N5", "ownerId": 7}],
        "cards": [{"id": "c1", "deckId": "d1", "ownerId": 7, "term": "食べる", "reading": "タベル", "meaning": "ăn " * 100, "pos": 0},
                  {"id": "c2", "deckId": "d1", "ownerId": 7, "term": "はし", "reading": None, "meaning": "đũa", "pos": 1}],
        "reviews": [{"userId": 7, "cardId": "c1", "ease": 2.5, "intervalDays": 3, "reps": 2, "dueAt": "2026-10-27T10:00:00+07:00",
                     "again30d": 1, "lastAt": None}],
        "paths": [{"id": "p1", "userId": 7, "title": "Lộ trình", "status": "ACTIVE"}],
        "chapters": [{"id": "ch1", "pathId": "p1", "ownerId": 7, "title": "Chương 1", "position": 1, "deckId": "d1"}],
        "pathCards": [{"chapterId": "ch1", "cardId": "c1", "seq": 1, "day": 1}],
        "meanings": [{"key": "w:1358280", "vi": "ăn"}],
    }


def test_sync_normalize_enriches_cards_and_coerces_types(tiny):
    rows = sync.normalize(_payload())
    c1, c2 = rows["cards"]
    assert c1["wordKey"] == "w:1358280" and c1["kanji"] == ["食"] and c1["reading"] == "たべる"   # katakana → hiragana
    assert len(c1["meaning"]) == sync.MEANING_MAX
    assert c2["wordKey"] is None and c2["kanji"] == []   # はし không có trong jmdict_mini
    assert rows["users"] == [{"id": 7, "level": "N4"}] and rows["decks"][0]["ownerId"] == 7
    assert rows["reviews"][0]["again30d"] == 1 and rows["reviews"][0]["lastAt"] is None
    assert rows["chapters"][0]["deckId"] == "d1" and rows["pathCards"][0]["day"] == 1


@pytest.mark.parametrize("bad, msg", [
    ({"run": "r", "cards": [{"id": "c1"}]}, "thiếu term"),
    ({"run": "r", "users": [{"id": "abc"}]}, "id phải là số"),
    ({"run": "r", "decks": "x"}, "phải là danh sách"),
    ({"run": "r", "users": [{"id": i} for i in range(sync.MAX_ROWS + 1)]}, "tối đa"),
    ({"users": [{"id": 1}]}, "thiếu run"),
])
def test_sync_rejects_bad_payload(tiny, bad, msg):
    with pytest.raises(sync.SyncError, match=msg):
        sync.apply(FakeGraph(), bad)


def test_sync_apply_writes_in_order_with_run_and_links_cards(tiny):
    g = FakeGraph()
    written = sync.apply(g, _payload())
    assert written == {"users": 1, "decks": 1, "cards": 2, "reviews": 1, "paths": 1, "chapters": 1, "pathCards": 1, "meanings": 1}
    kinds = [c for c, _ in g.calls]
    assert kinds.index(sync.CYPHER["users"]) < kinds.index(sync.CYPHER["decks"]) < kinds.index(sync.CYPHER["cards"]) < kinds.index(sync.CYPHER["reviews"])
    # mọi lô lớp người học mang run; nghĩa Việt không cần run
    for c, p in g.calls:
        if c in (sync.CYPHER["users"], sync.CYPHER["cards"], sync.CYPHER["reviews"]):
            assert p["run"] == "run-1"
    # thẻ: gỡ liên kết cũ, chỉ thẻ có wordKey mới MEANS, chỉ thẻ có chữ Hán mới CONTAINS
    assert g.cyphers("DELETE m") and g.cyphers("WHERE d.id <> r.deckId DELETE h")
    means = g.cyphers("MERGE (c)-[:MEANS]->(w)")
    assert [r["id"] for r in means[0][1]["rows"]] == ["c1"]
    contains = g.cyphers("MERGE (c)-[:CONTAINS]->(k)")
    assert [r["id"] for r in contains[0][1]["rows"]] == ["c1"]


def test_finish_statements_scope_all_vs_user():
    all_stmts = sync.finish_statements("all", None)
    assert len(all_stmts) == len(schema.LEARNER_LABELS) + 1
    assert all("$run" in c for c, _ in all_stmts) and any("(n:User)" in c for c, _ in all_stmts)
    assert all(p == {} for _, p in all_stmts)
    user_stmts = sync.finish_statements("user", 7)
    assert all(p == {"uid": 7} for _, p in user_stmts)
    assert not any("(n:User" in c for c, _ in user_stmts)          # không xoá người dùng khác / chính mình
    assert all("ownerId: $uid" in c or "{id: $uid}" in c or "{ownerId: $uid}" in c for c, _ in user_stmts)
    with pytest.raises(sync.SyncError):
        sync.finish_statements("user", None)
    with pytest.raises(sync.SyncError):
        sync.finish_statements("deck", 1)


def test_finish_runs_cleanup_then_meta():
    g = FakeGraph()
    out = sync.finish(g, "run-2", "user", 7)
    assert out == {"run": "run-2", "scope": "user", "userId": 7}
    assert g.calls[-1][0].startswith("MERGE (m:Meta {id: 'learner'})") and g.calls[-1][1]["run"] == "run-2"
    assert all(p.get("run") == "run-2" for _, p in g.calls)
