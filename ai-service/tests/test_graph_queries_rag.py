"""Đồ thị tri thức §6–§7: truy vấn (resolve / explore / path / recommend / conflicts / status) và GraphRAG trên FakeGraph
trả bản ghi dựng sẵn — kiểm Cypher gửi đi và cách ghép kết quả, không cần Neo4j."""
from __future__ import annotations

import pytest

from app.extract import example_vi, gemini
from app.graph import builder, queries, rag
from tests.graph_support import FakeGraph, neighbor_row, node_row

TABERU = {"key": "w:1358280", "term": "食べる", "reading": "たべる", "gloss": "to eat", "vi": "ăn", "jlpt": "N5", "common": True}
SHOKU = {"char": "食", "hanViet": "THỰC", "strokes": 9, "radicalNo": 184, "jlpt": "N5", "meaning": "eat, food"}
GOHAN = {"key": "w:1270590", "term": "ご飯", "reading": "ごはん", "gloss": "cooked rice", "jlpt": "N5", "common": True}
RAD = {"no": 184, "char": "食", "nameVi": "thực", "meaningVi": "ăn", "strokes": 9}
SENT = {"id": "x1", "jpn": "もっと果物を食べるべきです。", "eng": "You should eat more fruit.", "vi": "Bạn nên ăn nhiều hoa quả hơn."}
GRAM = {"id": "beki", "name": "〜べき", "level": "N3", "meaningVi": "nên làm gì"}
HV = {"reading": "THỰC", "fold": "THUC"}


def _match(cypher: str, *needles: str) -> bool:
    return all(n in cypher for n in needles)


# ----------------------------------------------------------------------------- resolve

def test_resolve_by_prefixed_id_single_kanji_and_hanviet():
    seen = []

    def handler(c, p):
        seen.append((c, p))
        if "(n:Kanji {char: $v})" in c:
            return [node_row("Kanji", SHOKU)]
        if "(n:HanViet {reading: $v})" in c:
            return [node_row("HanViet", HV)] if p["v"] == "THỰC" else []
        if "(n:HanViet {fold: $v})" in c:
            return [node_row("HanViet", HV)]
        if "(n:Radical {no: $v})" in c:
            return [node_row("Radical", RAD)] if p["v"] == 184 else []
        return []

    g = FakeGraph(handler)
    assert queries.resolve(g, "k:食")["label"] == "Kanji"
    assert queries.resolve(g, "食")["label"] == "Kanji"
    assert queries.resolve(g, "rad:184")["props"]["no"] == 184 and queries.resolve(g, "rad:x") is None
    assert queries.resolve(g, "thực")["label"] == "HanViet"      # chuẩn hoá hoa + NFC rồi khớp đúng dấu
    r = queries.resolve(g, "thuc")                                # không dấu → fold
    assert r["label"] == "HanViet" and any("fold: $v" in c and p["v"] == "THUC" for c, p in seen)
    assert queries.resolve(g, "") is None and queries.resolve(g, "x" * 65) is None


def test_resolve_word_tries_term_reading_lemma_then_prefix(monkeypatch):
    calls = []

    def handler(c, p):
        calls.append((c, p))
        if "(n:Word {term: $v})" in c and p["v"] == "食べる":
            return [node_row("Word", TABERU)]
        return []

    monkeypatch.setattr("app.extract.dictionary._lemma_candidates", lambda q: ["食べる"])
    monkeypatch.setattr("app.extract.dictionary.available", lambda: False)   # không có jmdict.sqlite → bỏ bước tra khoá
    g = FakeGraph(handler)
    r = queries.resolve(g, "食べました")
    assert r["props"]["term"] == "食べる"
    kinds = [("term" if "{term: $v}" in c else "reading") for c, p in calls if "(n:Word" in c]
    assert kinds == ["term", "reading", "term"] and [p["v"] for c, p in calls if "(n:Word" in c][-1] == "食べる"   # dạng viết → cách đọc → dạng gốc
    # không có gì khớp → tiền tố là bước cuối
    g2 = FakeGraph(lambda c, p: [])
    assert queries.resolve(g2, "食べました") is None
    assert any("STARTS WITH $v" in c for c, _ in g2.calls)


def test_resolve_word_by_dictionary_key_for_variant_forms(monkeypatch):
    """御飯 / ご飯 / ごはん đều là mục JMdict 1270590: dạng viết không trùng term của node vẫn tra được qua dictionary.key_for."""
    monkeypatch.setattr("app.extract.dictionary.available", lambda: True)
    monkeypatch.setattr("app.extract.dictionary.key_for", lambda form, reading=None: "w:1270590" if form in ("御飯", "ご飯") else None)

    def handler(c, p):
        if "(n:Word {key: $v})" in c and p["v"] == "w:1270590":
            return [node_row("Word", GOHAN)]
        return []

    g = FakeGraph(handler)
    assert queries.resolve(g, "御飯")["props"]["term"] == "ご飯"
    assert queries.resolve(g, "xyz漢") is None


# ----------------------------------------------------------------------------- explore

def _explore_handler(uid_rows=None):
    def handler(c, p):
        if "(n:Word {term: $v})" in c:
            return [node_row("Word", TABERU)]
        if "MATCH (c)-[r]-(n)" in c:
            if p["eid"] == node_row("Word", TABERU)["eid"]:
                assert p["caps"]["CONTAINS"] == 10 and p["exclude"] == []
                return [neighbor_row("CONTAINS", True, "Kanji", SHOKU, {"pos": 0}),
                        neighbor_row("EXAMPLE_OF", False, "Sentence", SENT),
                        neighbor_row("MEANS", False, "Card", {"id": "c1", "term": "食べる", "ownerId": 7, "deckId": "d1"})]
            if p["eid"] == node_row("Kanji", SHOKU)["eid"]:
                assert "Word" in p["exclude"]
                return [neighbor_row("HAS_RADICAL", True, "Radical", RAD), neighbor_row("READ_AS", True, "HanViet", HV)]
            if p["eid"] == node_row("Sentence", SENT)["eid"]:
                return [neighbor_row("USES_GRAMMAR", True, "Grammar", GRAM)]
            return []
        if "sum(coalesce(v.again30d, 0)) AS again30d" in c:
            assert p["uid"] == 7 and node_row("Word", TABERU)["eid"] in p["eids"]
            return uid_rows or []
        return []
    return handler


def test_explore_assembles_two_hops_edges_and_learner_state():
    g = FakeGraph(_explore_handler([{"eid": node_row("Word", TABERU)["eid"], "cards": 1, "reviewed": 1, "due": 1, "again30d": 2}]))
    out = queries.explore(g, "食べる", uid=7, limit=24)
    ids = {n["id"]: n for n in out["nodes"]}
    assert out["center"] == "w:1358280"
    assert any(p.get("uid") == 7 for c, p in g.calls if "MATCH (c)-[r]-(n)" in c)
    assert {"w:1358280", "k:食", "s:x1", "card:c1", "rad:184", "h:THỰC", "g:beki"} == set(ids)
    assert ids["w:1358280"]["learner"] == {"cards": 1, "reviewed": 1, "due": 1, "again30d": 2}
    assert "learner" not in ids["k:食"]
    edges = {(e["from"], e["to"], e["type"]) for e in out["edges"]}
    assert ("w:1358280", "k:食", "contains") in edges and ("s:x1", "w:1358280", "example_of") in edges
    assert ("k:食", "rad:184", "has_radical") in edges and ("s:x1", "g:beki", "uses_grammar") in edges
    assert ("card:c1", "w:1358280", "means") in edges
    assert ids["s:x1"]["label"].endswith("。") and "eid" not in ids["k:食"]   # không lộ elementId
    assert ids["card:c1"]["type"] == "card" and "ownerId" not in ids["card:c1"]


def test_explore_unknown_query_and_no_user():
    g = FakeGraph(lambda c, p: [])
    assert queries.explore(g, "zzz", None) == {"query": "zzz", "center": None, "nodes": [], "edges": []}
    g2 = FakeGraph(_explore_handler())
    out = queries.explore(g2, "食べる", uid=None)
    assert not any("again30d" in c for c, _ in g2.calls)   # không có người dùng → không truy vấn ngữ cảnh học
    assert all("learner" not in n for n in out["nodes"])


# ----------------------------------------------------------------------------- path

def test_path_found_and_not_found():
    a, b = node_row("Kanji", SHOKU), node_row("Word", GOHAN)

    def handler(c, p):
        if "(n:Kanji {char: $v})" in c:
            return [a]
        if "(n:Word {term: $v})" in c:
            return [b]
        if "shortestPath" in c:
            assert p == {"a": a["eid"], "b": b["eid"]} and "*..6" in c and "HAS_RADICAL" in c and "REVIEWS" not in c
            return [{"ns": [{"label": "Kanji", "props": SHOKU}, {"label": "Radical", "props": RAD}, {"label": "Kanji", "props": {"char": "飯"}},
                            {"label": "Word", "props": GOHAN}],
                     "rs": [{"type": "HAS_RADICAL", "from": "e1", "to": "e2"}, {"type": "HAS_RADICAL", "from": "e3", "to": "e2"},
                            {"type": "CONTAINS", "from": "e4", "to": "e3"}],
                     "ids": ["e1", "e2", "e3", "e4"]}]
        return []

    out = queries.path(FakeGraph(handler), "食", "ご飯")
    assert out["found"] and [n["id"] for n in out["nodes"]] == ["k:食", "rad:184", "k:飯", "w:1270590"]
    assert out["edges"][2] == {"from": "w:1270590", "to": "k:飯", "type": "contains"}
    empty = queries.path(FakeGraph(lambda c, p: [a] if "(n:Kanji {char: $v})" in c else []), "食", "zzz")
    assert empty["found"] is False and empty["to"] is None and empty["from"]["id"] == "k:食"


# ----------------------------------------------------------------------------- recommend / conflicts / status

def test_recommend_three_groups_with_level_filter():
    def handler(c, p):
        assert p["uid"] == 7 and p["level"] == "N4" and p["limit"] == 5
        if "knownChars" in c:
            assert "w.jlpt >= $level" in c and "NOT EXISTS" in c
            return [{"props": GOHAN, "shared": 1, "total": 1, "knownChars": ["飯"]}]
        if "again >= 2" in c:
            return [{"props": SHOKU, "again": 3, "terms": ["食べる"], "radical": RAD, "similar": ["飲"]}]
        if "HOMOPHONE_OF" in c:
            return [{"props": {"key": "w:jlpt:橋|はし", "term": "橋", "reading": "はし", "jlpt": "N4"}, "withTerms": ["箸"], "n": 1}]
        return []

    out = queries.recommend(FakeGraph(handler), 7, "N4", 5)
    assert out["level"] == "N4" and out["words"][0]["word"]["id"] == "w:1270590" and out["words"][0]["knownChars"] == ["飯"]
    assert out["weakKanji"][0]["radical"]["id"] == "rad:184" and out["weakKanji"][0]["similar"] == ["飲"]
    assert out["homophones"][0]["word"]["term"] == "橋" and out["homophones"][0]["withTerms"] == ["箸"]
    assert queries.recommend(FakeGraph(lambda c, p: []), 7, "N9", 500)["level"] == "N1"   # cấp lạ → mọi cấp, limit kẹp


def test_conflicts_kind_reading_vs_meaning():
    def handler(c, p):
        assert "c1.term = c2.term" in c and p["uid"] == 7
        return [{"c1": {"id": "a", "term": "橋", "reading": "はし"}, "d1": {"id": "d1", "title": "A"},
                 "c2": {"id": "b", "term": "橋", "reading": "きょう"}, "d2": {"id": "d2", "title": "B"},
                 "w1": None, "w2": None, "readingDiffers": True, "wordDiffers": False},
                {"c1": {"id": "c", "term": "日本"}, "d1": {"id": "d1", "title": "A"}, "c2": {"id": "d", "term": "日本"},
                 "d2": {"id": "d3", "title": "C"}, "w1": {"key": "w:1", "term": "日本"}, "w2": {"key": "w:2", "term": "日本"},
                 "readingDiffers": False, "wordDiffers": True}]

    out = queries.conflicts(FakeGraph(handler), 7)
    assert [i["kind"] for i in out["items"]] == ["reading", "meaning"]
    assert out["items"][0]["a"]["deck"]["label"] == "A" and out["items"][1]["b"]["word"]["id"] == "w:2"


def test_status_counts_meta_and_build_state():
    builder.reset_state()

    def handler(c, p):
        if "RETURN count(n) AS c" in c:
            return [{"c": 12 if "(n:Word)" in c else 0}]
        if "MATCH (m:Meta)" in c:
            return [{"id": "reference", "props": {"builtAt": "2026-10-27T10:00:00+07:00", "seconds": 90.5, "withGrammar": True}},
                    {"id": "learner", "props": {"lastRun": "run-9", "syncedAt": "2026-10-27T11:00:00+07:00", "scope": "all"}}]
        return []

    st = queries.status(FakeGraph(handler))
    assert st["available"] and st["built"] and st["counts"]["Word"] == 12 and st["counts"]["Card"] == 0
    assert st["buildSeconds"] == 90.5 and st["learner"]["lastRun"] == "run-9" and st["building"] is False
    empty = queries.status(FakeGraph(lambda c, p: [{"c": 0}] if "count" in c else []))
    assert empty["built"] is False and empty["builtAt"] is None and empty["learner"] is None


# ----------------------------------------------------------------------------- RAG

def _rag_handler(c, p):
    if "(n:Word) WHERE n.term = $v OR n.reading = $r" in c:
        return [node_row("Word", TABERU)] if p["v"] in ("食べる",) else []
    if "(n:Kanji {char: $v})" in c:
        return [node_row("Kanji", SHOKU)] if p["v"] == "食" else []
    if "(n:HanViet) WHERE n.reading = $v OR n.fold = $f" in c:
        return [node_row("HanViet", HV)] if p["f"] == "THUC" else []
    if "(n:Grammar) WHERE n.name = $v" in c:
        return [node_row("Grammar", GRAM)] if p["v"] in ("〜べき", "べき") else []
    if "MATCH (c)-[r]-(n)" in c:
        if p["eid"] == node_row("Word", TABERU)["eid"]:
            return [neighbor_row("CONTAINS", True, "Kanji", SHOKU), neighbor_row("EXAMPLE_OF", False, "Sentence", SENT),
                    neighbor_row("HOMOPHONE_OF", True, "Word", GOHAN)]
        if p["eid"] == node_row("Kanji", SHOKU)["eid"]:
            return [neighbor_row("HAS_RADICAL", True, "Radical", RAD), neighbor_row("CONTAINS", False, "Word", TABERU),
                    neighbor_row("LOOKS_LIKE", True, "Kanji", {"char": "飲"})]
        return []
    if "AS deck, c.term AS term" in c:
        return [{"deck": "Bài 1", "term": "食べる", "dueAt": "2026-10-27T00:00:00+07:00", "again": 2, "reps": 3, "interval": 4,
                 "due": True, "chapter": "Chương 1"}]
    if "MATCH (s:Sentence) WHERE s.id IN $ids" in c:
        return [{"props": SENT}]
    return []


def test_extract_entities_words_kanji_grammar_hanviet(monkeypatch):
    g = FakeGraph(_rag_handler)
    ents = rag.extract_entities(g, "Từ 食べました nghĩa là gì, chữ 食 có âm Hán-Việt THỰC, mẫu 〜べき dùng sao?")
    ids = [e["id"] for e in ents]
    assert ids[0] == "g:beki" and "w:1358280" in ids and "k:食" in ids and "h:THỰC" in ids
    assert all("eid" in e for e in ents) and len(ids) == len(set(ids))
    assert rag.extract_entities(g, "xin chào") == []


def test_entity_text_and_learner_text():
    g = FakeGraph(_rag_handler)
    word = queries.node_out("Word", TABERU)
    text = rag.entity_text(word, [neighbor_row("CONTAINS", True, "Kanji", SHOKU), neighbor_row("EXAMPLE_OF", False, "Sentence", SENT),
                                  neighbor_row("HOMOPHONE_OF", True, "Word", GOHAN)])
    assert text.startswith("食べる (たべる), N5: ăn.") and "Chữ Hán: 食 (THỰC, 9 nét)" in text and "Bạn nên ăn" in text and "ご飯" in text
    kanji = queries.node_out("Kanji", SHOKU)
    kt = rag.entity_text(kanji, [neighbor_row("HAS_RADICAL", True, "Radical", RAD), neighbor_row("CONTAINS", False, "Word", TABERU)])
    assert "âm Hán-Việt THỰC" in kt and "bộ thủ 184" in kt and "Từ chứa chữ" in kt and "食べる" in kt
    assert rag.entity_text(queries.node_out("HanViet", HV), [neighbor_row("READ_AS", False, "Kanji", SHOKU)]).startswith("Âm Hán-Việt THỰC: 食")
    assert "nên làm gì" in rag.entity_text(queries.node_out("Grammar", GRAM), [])
    word["eid"] = node_row("Word", TABERU)["eid"]
    lt = rag.learner_text(g, word, 7)
    assert lt.startswith("Bạn có 1 thẻ liên quan 食べる") and "đến hạn ôn" in lt and "sai 2 lần" in lt and "Chương 1" in lt


def test_fuse_merges_branches_and_caps():
    gi = [{"id": "a", "type": "word", "label": "a", "text": "x" * 10, "score": 1.0, "branch": "graph"},
          {"id": "b", "type": "kanji", "label": "b", "text": "y" * 10, "score": 0.6, "branch": "graph"}]
    ti = [{"id": "b", "type": "kanji", "label": "b", "text": "y" * 12, "score": 0.5, "branch": "text"},
          {"id": "c", "type": "sentence", "label": "c", "text": "z" * 10, "score": 0.5, "branch": "text"}]
    out = rag.fuse(gi, ti)
    assert [i["id"] for i in out] == ["a", "b", "c"] and out[1]["score"] == pytest.approx(0.9) and out[1]["branch"] == "both"
    assert len(out[1]["text"]) == 12
    assert [i["id"] for i in rag.fuse(gi, ti, max_items=2)] == ["a", "b"]
    assert [i["id"] for i in rag.fuse(gi, ti, max_chars=21)] == ["a", "c"]   # b (12 ký tự) không vừa, c (10) vừa


def test_prompt_and_template_answer():
    items = [{"id": "w:1", "type": "word", "label": "食べる", "text": "食べる: ăn.", "score": 1.0, "branch": "graph"},
             {"id": "me:w:1", "type": "learner", "label": "Bạn", "text": "Bạn có 1 thẻ.", "score": 0.9, "branch": "graph"},
             {"id": "s:1", "type": "sentence", "label": "câu", "text": "Câu: 「…」", "score": 0.5, "branch": "text"}]
    prompt = rag.build_prompt("食べる là gì?", items, "N5")
    assert "[1] (từ) 食べる: ăn." in prompt and "[3] (câu ví dụ)" in prompt and "trình độ N5" in prompt and "CHỈ dựa trên" in prompt
    ans = rag.template_answer("食べる là gì?", [{"id": "w:1", "type": "word", "label": "食べる"}], items)
    assert ans.splitlines()[1] == "- 食べる: ăn. [1]" and "- Bạn có 1 thẻ. [2]" in ans and "Liên quan:" in ans and "[3]" in ans
    assert "chưa nhận ra" in rag.template_answer("?", [], [])


def test_ask_without_gemini_returns_template_with_sources(monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: False)
    monkeypatch.setattr(example_vi, "available", lambda: True)
    monkeypatch.setattr(example_vi, "search", lambda q, limit: ["x1"] if q == "hoa" else [])
    monkeypatch.setattr("app.extract.dictionary.available", lambda: False)
    g = FakeGraph(_rag_handler)
    out = rag.ask(g, "Từ 食べる nghĩa là gì, có câu nào về hoa quả không?", uid=7, level="N5")
    assert out["model"] == "template" and "Chưa cấu hình khoá Gemini" in out["note"]
    assert [e["id"] for e in out["entities"]] == ["w:1358280", "k:食"]
    types = {s["type"] for s in out["sources"]}
    assert {"word", "kanji", "learner", "sentence"} <= types
    sent = next(s for s in out["sources"] if s["type"] == "sentence")
    assert sent["branch"] == "both"   # câu ví dụ vừa là láng giềng của 食べる vừa khớp từ khoá "hoa"
    assert out["answer"].startswith("Tóm tắt từ đồ thị") and f"[{out['sources'][0]['n']}]" in out["answer"]
    assert {n["id"] for n in out["subgraph"]["nodes"]} >= {"w:1358280", "k:食", "s:x1", "rad:184"}
    assert all("eid" not in e for e in out["entities"])


def test_ask_uses_gemini_prompt_with_numbered_context(monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "resolve_model", lambda m: m or "gemini-test")
    captured = {}

    def fake_generate(contents, config=None, model=None, **kw):
        captured["prompt"], captured["config"], captured["model"] = contents, config, model
        return "  食べる nghĩa là ăn [1].  "

    monkeypatch.setattr(gemini, "_generate", fake_generate)
    monkeypatch.setattr("app.extract.dictionary.available", lambda: False)
    out = rag.ask(FakeGraph(_rag_handler), "食べる là gì?", uid=None, level="N5", gemini_model="gemini-x")
    assert out["answer"] == "食べる nghĩa là ăn [1]." and out["model"] == "gemini-x" and out["note"] is None
    assert captured["prompt"].startswith("Bạn là trợ giảng") and "[1] (từ) 食べる (たべる), N5: ăn." in captured["prompt"]
    assert captured["config"]["temperature"] == 0.2 and captured["model"] == "gemini-x"
    # Gemini lỗi → trả lời mẫu kèm ghi chú
    def boom(*a, **k):
        raise gemini.GeminiError("quota", "hết quota")
    monkeypatch.setattr(gemini, "_generate", boom)
    out2 = rag.ask(FakeGraph(_rag_handler), "食べる là gì?")
    assert out2["model"] == "template" and "quota" in out2["note"]
