"""Chạy TRÊN NEO4J THẬT (spec 2026-10-27 §11): đặt NEO4J_TEST_URI (vd bolt://localhost:7688) + NEO4J_TEST_PASSWORD trỏ tới một
Neo4j riêng cho test — test xoá sạch đồ thị đó. Không đặt → bỏ qua. Chạy một Neo4j tạm:

    docker run --rm -d --name pbl6_neo4j_test -p 7688:7687 -e NEO4J_AUTH=neo4j/test1234 neo4j:5-community
    NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=test1234 pytest tests/test_graph_live.py -q
"""
from __future__ import annotations

import os
import uuid

import pytest

from app.graph import builder, client, queries, rag, sync
from tests.graph_support import install_tiny_data, teardown_tiny_data

URI = os.getenv("NEO4J_TEST_URI")
pytestmark = pytest.mark.skipif(not URI, reason="NEO4J_TEST_URI chưa đặt (cần Neo4j riêng cho test)")


@pytest.fixture(scope="module")
def graph():
    g = client.Graph(URI, os.getenv("NEO4J_TEST_USER", "neo4j"), os.getenv("NEO4J_TEST_PASSWORD", "test1234"))
    if not g.available():
        pytest.skip(f"Neo4j test không nối được: {URI}")
    g.run("MATCH (n) DETACH DELETE n")
    yield g
    g.close()


@pytest.fixture
def tiny(tmp_path, monkeypatch):
    install_tiny_data(tmp_path, monkeypatch)
    yield
    teardown_tiny_data()


def _sync_user(graph, run: str, extra_cards=()):
    cards = [{"id": "c1", "deckId": "d1", "ownerId": 7, "term": "食べる", "reading": "たべる", "meaning": "ăn", "pos": 0},
             {"id": "c2", "deckId": "d1", "ownerId": 7, "term": "日本", "reading": "にほん", "meaning": "Nhật Bản", "pos": 1},
             *extra_cards]
    sync.apply(graph, {"run": run, "users": [{"id": 7, "level": "N5"}, {"id": 8, "level": "N3"}],
                       "decks": [{"id": "d1", "title": "Bài 1", "level": "N5", "ownerId": 7},
                                 {"id": "d9", "title": "Của người khác", "level": "N5", "ownerId": 8}],
                       "cards": cards + [{"id": "c9", "deckId": "d9", "ownerId": 8, "term": "食べる", "reading": "たべる", "meaning": "x", "pos": 0}],
                       "reviews": [{"userId": 7, "cardId": "c1", "ease": 2.3, "intervalDays": 1, "reps": 4, "dueAt": "2020-01-01T00:00:00+07:00",
                                    "again30d": 3, "lastAt": "2026-10-26T10:00:00+07:00"}],
                       "paths": [{"id": "p1", "userId": 7, "title": "Lộ trình", "status": "ACTIVE"}],
                       "chapters": [{"id": "ch1", "pathId": "p1", "ownerId": 7, "title": "Chương 1", "position": 1, "deckId": "d1"}],
                       "pathCards": [{"chapterId": "ch1", "cardId": "c1", "seq": 1, "day": 1}],
                       "meanings": [{"key": "w:1358280", "vi": "ăn"}]})
    sync.finish(graph, run, "all")


def test_build_sync_and_query_on_real_neo4j(graph, tiny):
    res = builder.build(graph, with_grammar=True, with_similar=False)
    st = queries.status(graph)
    assert st["built"] and st["counts"]["Word"] == res["counts"]["words"] and st["counts"]["Kanji"] == res["counts"]["kanji"]
    assert st["counts"]["Radical"] == 214 and st["counts"]["Sentence"] == res["counts"]["sentences"]
    # Cypher thật: CONTAINS / HAS_RADICAL / READ_AS / EXAMPLE_OF / USES_GRAMMAR / HOMOPHONE_OF
    rels = {r["t"]: r["n"] for r in graph.run("MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS n")}
    assert rels["CONTAINS"] == res["counts"]["contains"] and rels["HAS_RADICAL"] == res["counts"]["has_radical"]
    assert rels["HOMOPHONE_OF"] == 1 and rels["EXAMPLE_OF"] == res["counts"]["example_of"] and rels.get("USES_GRAMMAR", 0) == res["counts"]["uses_grammar"]

    _sync_user(graph, "run-1")
    st = queries.status(graph)
    assert st["counts"]["User"] == 2 and st["counts"]["Card"] == 3 and st["learner"]["lastRun"] == "run-1"
    assert graph.run("MATCH (w:Word {key: 'w:1358280'}) RETURN w.vi AS vi")[0]["vi"] == "ăn"
    assert graph.run("MATCH (:Card {id: 'c1'})-[:MEANS]->(w) RETURN w.key AS k")[0]["k"] == "w:1358280"
    assert {r["c"] for r in graph.run("MATCH (:Card {id: 'c2'})-[:CONTAINS]->(k) RETURN k.char AS c")} == {"日", "本"}

    # explore: thẻ của người khác không lộ, thẻ của mình có; ngữ cảnh học gắn lên từ / chữ
    out = queries.explore(graph, "食べる", uid=7)
    ids = {n["id"]: n for n in out["nodes"]}
    assert out["center"] == "w:1358280" and "k:食" in ids and "card:c1" in ids and "card:c9" not in ids
    assert ids["w:1358280"]["learner"] == {"cards": 1, "reviewed": 1, "due": 1, "again30d": 3}
    assert ids["k:食"]["learner"]["cards"] == 1 and "rad:184" in ids and "h:THỰC" in ids
    other = queries.explore(graph, "食べる", uid=8)
    assert "card:c9" in {n["id"] for n in other["nodes"]} and "card:c1" not in {n["id"] for n in other["nodes"]}
    assert queries.explore(graph, "食べました", uid=None)["center"] == "w:1358280"   # dạng chia → dạng gốc
    assert queries.explore(graph, "thuc")["center"] == "h:THỰC"

    # đường nối: 食 ↔ ご飯 qua bộ thủ 184 và chữ 飯
    p = queries.path(graph, "食", "ご飯")
    assert p["found"] and [n["id"] for n in p["nodes"]][0] == "k:食" and [n["id"] for n in p["nodes"]][-1] == "w:1270590"
    assert all(e["type"] in ("has_radical", "contains", "has_component", "read_as", "looks_like") for e in p["edges"])

    # gợi ý: 日本語 chia chữ 日 / 本 với thẻ 日本 đã ôn? (chỉ thẻ có REVIEWS mới tính "đã học": c2 chưa ôn) → từ chứa 食
    rec = queries.recommend(graph, 7, "N5", 10)
    words = {w["word"]["id"] for w in rec["words"]}
    assert "w:1346370" not in words          # 召し上がる là N4, người dùng N5 → không gợi ý
    assert rec["weakKanji"] and rec["weakKanji"][0]["kanji"]["id"] == "k:食" and rec["weakKanji"][0]["again30d"] == 3
    assert rec["weakKanji"][0]["radical"]["id"] == "rad:184"

    # xung đột: cùng thuật ngữ khác cách đọc ở hai bộ của cùng người
    sync.apply(graph, {"run": "run-1b", "users": [{"id": 7, "level": "N5"}],
                       "decks": [{"id": "d1", "title": "Bài 1", "ownerId": 7}, {"id": "d2", "title": "Bài 2", "ownerId": 7}],
                       "cards": [{"id": "c1", "deckId": "d1", "ownerId": 7, "term": "食べる", "reading": "たべる", "meaning": "ăn"},
                                 {"id": "c3", "deckId": "d2", "ownerId": 7, "term": "食べる", "reading": "くう", "meaning": "ăn"}]})
    conf = queries.conflicts(graph, 7)
    assert conf["items"] and conf["items"][0]["kind"] == "reading" and conf["items"][0]["term"] == "食べる"

    # GraphRAG không Gemini: thực thể + ngữ cảnh học + trả lời mẫu có nguồn
    ans = rag.ask(graph, "Từ 食べる nghĩa là gì và tôi học nó thế nào?", uid=7, level="N5")
    assert ans["model"] == "template" and ans["entities"][0]["id"] == "w:1358280"
    assert any(s["type"] == "learner" and "Bài 1" in s["text"] for s in ans["sources"])
    assert "THỰC" in ans["answer"]

    # finish với run mới và scope user: bộ cũ của người 7 mất, của người 8 còn; dựng lại lớp tham chiếu nối lại thẻ
    sync.apply(graph, {"run": "run-2", "users": [{"id": 7, "level": "N5"}],
                       "decks": [{"id": "d1", "title": "Bài 1", "ownerId": 7}],
                       "cards": [{"id": "c1", "deckId": "d1", "ownerId": 7, "term": "食べる", "reading": "たべる", "meaning": "ăn"}]})
    sync.finish(graph, "run-2", "user", 7)
    left = {r["id"] for r in graph.run("MATCH (c:Card) RETURN c.id AS id")}
    assert left == {"c1", "c9"}
    assert graph.run("MATCH (:User {id: 7})-[r:REVIEWS]->() RETURN count(r) AS n")[0]["n"] == 0   # lịch ôn không gửi lại → xoá
    builder.build(graph, with_grammar=False, with_similar=False)
    assert graph.run("MATCH (:Card {id: 'c1'})-[:MEANS]->(w) RETURN w.key AS k")[0]["k"] == "w:1358280"
    assert graph.run("MATCH (:Card {id: 'c9'})-[:CONTAINS]->(k) RETURN k.char AS c")[0]["c"] == "食"


def test_finish_scope_all_removes_users_not_in_run(graph, tiny):
    run = str(uuid.uuid4())
    sync.apply(graph, {"run": run, "users": [{"id": 7, "level": "N5"}]})
    sync.finish(graph, run, "all")
    assert {r["id"] for r in graph.run("MATCH (u:User) RETURN u.id AS id")} == {7}
    assert graph.run("MATCH (c:Card) RETURN count(c) AS n")[0]["n"] == 0
