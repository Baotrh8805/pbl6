"""Truy vấn Cypher cho giao diện (spec §6): tìm node tâm, lân cận, đường nối, gợi ý, xung đột, trạng thái.

Mọi câu Cypher tham số hoá (không ghép chuỗi người dùng), có LIMIT. Dữ liệu người học (Card / Deck / Path / Chapter) chỉ lộ
khi ``ownerId`` trùng ``uid`` của người hỏi; User và Meta không bao giờ trả về. Id node trả cho giao diện theo quy ước
``node_id`` (w:<id> / k:<chữ> / rad:<số> / c:<chữ> / h:<ÂM> / g:<id> / s:<id> / d:<id> / card:<id> / p:<id> / ch:<id>).
"""
from __future__ import annotations

import re
from typing import Any, Optional

from app.extract import han_viet_graph
from app.extract.jachars import has_japanese, is_kanji, kata_to_hira
from app.graph import builder, schema

LEVELS = ("N5", "N4", "N3", "N2", "N1")
DEFAULT_LIMIT = 24
MAX_LIMIT = 60
PRIVATE_LABELS = ("Card", "Deck", "Path", "Chapter")

_PROPS: dict[str, tuple[str, ...]] = {
    "Word": ("key", "term", "reading", "gloss", "vi", "jlpt", "common", "kanaOnly"),
    "Kanji": ("char", "hanViet", "strokes", "radicalNo", "jlpt", "meaning"),
    "Radical": ("no", "char", "nameVi", "meaningVi", "strokes"),
    "Component": ("char",),
    "HanViet": ("reading",),
    "Grammar": ("id", "name", "level", "meaningVi"),
    "Sentence": ("id", "jpn", "eng", "vi"),
    "Deck": ("id", "title", "level"),
    "Card": ("id", "term", "reading", "meaning", "deckId", "wordKey"),
    "Path": ("id", "title", "status"),
    "Chapter": ("id", "title", "position", "pathId"),
    "User": ("id", "level"),
}
_PREFIX = {"Word": "", "Kanji": "k:", "Radical": "rad:", "Component": "c:", "HanViet": "h:", "Grammar": "g:", "Sentence": "s:",
           "Deck": "d:", "Card": "card:", "Path": "p:", "Chapter": "ch:", "User": "u:"}
_KEY = {"Word": "key", "Kanji": "char", "Radical": "no", "Component": "char", "HanViet": "reading", "Grammar": "id",
        "Sentence": "id", "Deck": "id", "Card": "id", "Path": "id", "Chapter": "id", "User": "id"}


def node_id(label: str, props: dict) -> str:
    return f"{_PREFIX.get(label, label.lower() + ':')}{props.get(_KEY.get(label, 'id'))}"


def label_text(label: str, props: dict) -> str:
    if label == "Word":
        return str(props.get("term") or props.get("key") or "")
    if label in ("Kanji", "Component"):
        return str(props.get("char") or "")
    if label == "Radical":
        return str(props.get("char") or props.get("no") or "")
    if label == "HanViet":
        return str(props.get("reading") or "")
    if label == "Grammar":
        return str(props.get("name") or props.get("id") or "")
    if label == "Sentence":
        jpn = str(props.get("jpn") or "")
        return jpn if len(jpn) <= 40 else jpn[:39] + "…"
    if label in ("Deck", "Path", "Chapter"):
        return str(props.get("title") or "")
    if label == "Card":
        return str(props.get("term") or "")
    if label == "User":
        return "Bạn"
    return str(props.get("id") or "")


def node_out(label: str, props: dict) -> dict:
    out: dict[str, Any] = {"id": node_id(label, props), "type": label.lower(), "label": label_text(label, props)}
    for p in _PROPS.get(label, ()):
        if p != "id" and props.get(p) is not None:   # "id" của node là id có tiền tố, không ghi đè bằng id thô
            out[p] = props[p]
    return out


# ----------------------------------------------------------------------------- node tâm

_RETURN = "RETURN labels(n)[0] AS label, properties(n) AS props, elementId(n) AS eid"
_WORD_ORDER = "ORDER BY coalesce(n.jlpt, 'N0') DESC, coalesce(n.common, false) DESC, n.key LIMIT 1"
_LATIN_RE = re.compile(r"^[A-Za-zÀ-ỹĐđ\s\-]+$")


def _one(graph, cypher: str, params: dict) -> Optional[dict]:
    rows = graph.run(cypher, params)
    return rows[0] if rows else None


def _by_dict_key(graph, form: str, reading: Optional[str] = None) -> Optional[dict]:
    """Mục từ theo khoá JMdict của một dạng viết (dictionary.key_for: 御飯 / ご飯 / kana đều về cùng khoá); thiếu từ điển → None."""
    try:
        from app.extract import dictionary
        key = dictionary.key_for(form, reading) if dictionary.available() else None
    except Exception:  # noqa: BLE001 (sqlite lỗi không chặn tra đồ thị)
        key = None
    if not key:
        return None
    return _one(graph, f"MATCH (n:Word {{key: $v}}) {_RETURN} LIMIT 1", {"v": key})


def resolve(graph, q: str) -> Optional[dict]:
    """``q`` → {label, props, eid} của node tâm hoặc None. Thứ tự: id có tiền tố → một chữ Hán → mẫu ngữ pháp → âm Hán-Việt
    (chuỗi Latin) → mục từ theo dạng viết / cách đọc / dạng gốc (食べました → 食べる) / tiền tố."""
    q = (q or "").strip()
    if not q or len(q) > 64:
        return None
    for prefix, label in (("k:", "Kanji"), ("h:", "HanViet"), ("g:", "Grammar"), ("s:", "Sentence"), ("rad:", "Radical"),
                          ("c:", "Component")):
        if q.startswith(prefix) and len(q) > len(prefix):
            value: Any = q[len(prefix):]
            if label == "Radical":
                try:
                    value = int(value)
                except ValueError:
                    return None
            key = _KEY[label]
            return _one(graph, f"MATCH (n:{label} {{{key}: $v}}) {_RETURN} LIMIT 1", {"v": value})
    if q.startswith("w:"):
        return _one(graph, f"MATCH (n:Word {{key: $v}}) {_RETURN} LIMIT 1", {"v": q})
    if len(q) == 1 and is_kanji(q):
        return _one(graph, f"MATCH (n:Kanji {{char: $v}}) {_RETURN} LIMIT 1", {"v": q})
    g = _one(graph, f"MATCH (n:Grammar) WHERE n.name = $v OR n.id = $v OR n.name = '〜' + $v {_RETURN} LIMIT 1", {"v": q})
    if g:
        return g
    if not has_japanese(q) and _LATIN_RE.match(q):
        reading = han_viet_graph.normalize(q)
        hv = _one(graph, f"MATCH (n:HanViet {{reading: $v}}) {_RETURN} LIMIT 1", {"v": reading})
        if hv:
            return hv
        # không dấu (thuc → THÚC / THỤC / THỰC…): âm có nhiều chữ Hán nhất trước (THỰC 食 実 thực tế hơn THÚC)
        return _one(graph, "MATCH (n:HanViet {fold: $v}) OPTIONAL MATCH (n)<-[:READ_AS]-(k:Kanji) WITH n, count(k) AS c "
                           f"{_RETURN} ORDER BY c DESC, n.reading LIMIT 1", {"v": han_viet_graph.fold(q)})
    if has_japanese(q):
        w = _one(graph, f"MATCH (n:Word {{term: $v}}) {_RETURN} {_WORD_ORDER}", {"v": q})
        if w:
            return w
        w = _by_dict_key(graph, q)
        if w:
            return w
        w = _one(graph, f"MATCH (n:Word {{reading: $v}}) {_RETURN} {_WORD_ORDER}", {"v": kata_to_hira(q)})
        if w:
            return w
        try:
            from app.extract import dictionary
            lemmas = dictionary._lemma_candidates(q)
        except Exception:  # noqa: BLE001 (tokenizer thiếu)
            lemmas = []
        for lemma in lemmas:
            if lemma == q:
                continue
            w = _one(graph, f"MATCH (n:Word {{term: $v}}) {_RETURN} {_WORD_ORDER}", {"v": lemma}) or _by_dict_key(graph, lemma)
            if w:
                return w
        return _one(graph, f"MATCH (n:Word) WHERE n.term STARTS WITH $v {_RETURN} {_WORD_ORDER}", {"v": q})
    return None


# ----------------------------------------------------------------------------- lân cận

_NEIGHBORS = """
MATCH (c) WHERE elementId(c) = $eid
MATCH (c)-[r]-(n)
WHERE NOT n:User AND NOT n:Meta
  AND none(l IN labels(n) WHERE l IN $exclude)
  AND (NOT (n:Card OR n:Deck OR n:Path OR n:Chapter) OR n.ownerId = $uid)
WITH r, n, type(r) AS t, startNode(r) = c AS outward
ORDER BY coalesce(n.jlpt, 'N0') DESC, (n.vi IS NOT NULL) DESC, coalesce(n.common, false) DESC,
         size(toString(coalesce(n.jpn, n.term, n.char, n.title, n.name, n.reading, ''))) ASC,
         toString(coalesce(n.term, n.char, n.title, n.name, n.reading, n.id, '')) ASC
WITH t, outward, collect({n: n, r: r})[0..coalesce($caps[t], $cap)] AS items
UNWIND items AS it
RETURN t AS type, outward, labels(it.n)[0] AS label, properties(it.n) AS props, elementId(it.n) AS eid, properties(it.r) AS rprops
"""


def neighbors(graph, eid: str, caps: Optional[dict[str, int]] = None, exclude: tuple[str, ...] = (), uid: Optional[int] = None,
              cap: int = 6) -> list[dict]:
    """Láng giềng bậc 1 của node ``eid``: [{type, outward, label, props, eid, rprops}], mỗi loại quan hệ tối đa caps[type]."""
    return graph.run(_NEIGHBORS, {"eid": eid, "caps": caps or {}, "cap": cap, "exclude": list(exclude), "uid": uid})


# (caps bậc 1, [(nhãn láng giềng được mở tiếp, caps bậc 2, nhãn loại trừ ở bậc 2)])
_PLAN: dict[str, tuple[dict[str, int], list[tuple[str, dict[str, int], tuple[str, ...]]]]] = {
    "Word": ({"CONTAINS": 10, "EXAMPLE_OF": 4, "HOMOPHONE_OF": 6, "MEANS": 12, "SCHEDULES": 0},
             [("Kanji", {"READ_AS": 2, "HAS_RADICAL": 1, "HAS_COMPONENT": 4, "LOOKS_LIKE": 2}, ("Word", "Card", "Sentence")),
              ("Sentence", {"USES_GRAMMAR": 3}, ("Word", "Card", "Kanji"))]),
    "Kanji": ({"CONTAINS": -1, "READ_AS": 3, "HAS_RADICAL": 1, "HAS_COMPONENT": 6, "LOOKS_LIKE": 4},
              [("Word", {"CONTAINS": 3}, ("Sentence", "Card", "Word"))]),
    "HanViet": ({"READ_AS": 12}, [("Kanji", {"CONTAINS": 3, "HAS_RADICAL": 1}, ("Card", "Sentence", "Component", "HanViet"))]),
    "Grammar": ({"USES_GRAMMAR": 8}, [("Sentence", {"EXAMPLE_OF": 1}, ("Card", "Grammar"))]),
    "Radical": ({"HAS_RADICAL": -1}, [("Kanji", {"READ_AS": 1}, ("Word", "Card", "Sentence", "Component", "Radical"))]),
    "Component": ({"HAS_COMPONENT": -1}, [("Kanji", {"READ_AS": 1}, ("Word", "Card", "Sentence", "Component", "Radical"))]),
    "Sentence": ({"EXAMPLE_OF": 6, "USES_GRAMMAR": 6}, [("Word", {"CONTAINS": 4}, ("Sentence", "Card", "Word"))]),
    "Card": ({"MEANS": 1, "CONTAINS": 10, "HAS_CARD": 1, "SCHEDULES": 2},
             [("Word", {"EXAMPLE_OF": 2, "HOMOPHONE_OF": 4}, ("Card", "Kanji"))]),
    "Deck": ({"HAS_CARD": -1}, [("Card", {"MEANS": 1}, ("Deck", "Kanji", "Chapter"))]),
}

_LEARNER = """
MATCH (u:User {id: $uid})-[:OWNS]->(:Deck)-[:HAS_CARD]->(c:Card)-[:MEANS|CONTAINS]->(n) WHERE elementId(n) IN $eids
OPTIONAL MATCH (u)-[v:REVIEWS]->(c)
RETURN elementId(n) AS eid, count(DISTINCT c) AS cards,
       count(DISTINCT CASE WHEN v IS NOT NULL THEN c END) AS reviewed,
       sum(CASE WHEN v IS NOT NULL AND v.dueAt <= datetime() THEN 1 ELSE 0 END) AS due,
       sum(coalesce(v.again30d, 0)) AS again30d
"""


def _caps(caps: dict[str, int], limit: int) -> dict[str, int]:
    return {k: (limit if v < 0 else v) for k, v in caps.items()}


def explore(graph, q: str, uid: Optional[int] = None, limit: int = DEFAULT_LIMIT) -> dict:
    """{query, center, nodes, edges}; không tìm thấy → center None, nodes rỗng (200, không phải lỗi)."""
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    center = resolve(graph, q)
    if not center:
        return {"query": q, "center": None, "nodes": [], "edges": []}
    nodes: dict[str, dict] = {}
    eids: dict[str, str] = {}   # id → elementId (nội bộ, không trả ra)
    edges: dict[tuple[str, str, str], dict] = {}

    def add_node(label: str, props: dict, eid: str) -> str:
        out = node_out(label, props)
        nodes.setdefault(out["id"], out)
        eids[out["id"]] = eid
        return out["id"]

    def add_edge(a: str, b: str, rtype: str, rprops: Optional[dict]) -> None:
        key = (a, b, rtype)
        if key not in edges:
            e = {"from": a, "to": b, "type": rtype.lower()}
            if rprops and rprops.get("score") is not None:
                e["score"] = rprops["score"]
            edges[key] = e

    cid = add_node(center["label"], center["props"], center["eid"])
    caps1, second = _PLAN.get(center["label"], ({}, []))
    first = neighbors(graph, center["eid"], _caps(caps1, limit), (), uid, cap=6)
    by_label: dict[str, list[dict]] = {}
    for row in first:
        nid = add_node(row["label"], row["props"], row["eid"])
        add_edge(cid, nid, row["type"], row["rprops"]) if row["outward"] else add_edge(nid, cid, row["type"], row["rprops"])
        by_label.setdefault(row["label"], []).append(row)
    for hop_label, caps2, exclude in second:
        for row in by_label.get(hop_label, [])[:limit]:
            src = node_id(row["label"], row["props"])
            for r2 in neighbors(graph, row["eid"], caps2, exclude, uid, cap=3):
                nid = add_node(r2["label"], r2["props"], r2["eid"])
                add_edge(src, nid, r2["type"], r2["rprops"]) if r2["outward"] else add_edge(nid, src, r2["type"], r2["rprops"])
    if uid is not None:
        targets = {eids[i]: i for i, n in nodes.items() if n["type"] in ("word", "kanji")}
        if targets:
            for row in graph.run(_LEARNER, {"uid": uid, "eids": list(targets)}):
                nid = targets.get(row["eid"])
                if nid:
                    nodes[nid]["learner"] = {"cards": row["cards"], "reviewed": row["reviewed"], "due": row["due"],
                                             "again30d": row["again30d"]}
    return {"query": q, "center": cid, "nodes": list(nodes.values()), "edges": list(edges.values())}


# ----------------------------------------------------------------------------- đường nối

_PATH = f"""
MATCH (a) WHERE elementId(a) = $a
MATCH (b) WHERE elementId(b) = $b
MATCH p = shortestPath((a)-[:{'|'.join(schema.REFERENCE_RELS)}*..6]-(b))
RETURN [n IN nodes(p) | {{label: labels(n)[0], props: properties(n)}}] AS ns,
       [r IN relationships(p) | {{type: type(r), from: elementId(startNode(r)), to: elementId(endNode(r))}}] AS rs,
       [n IN nodes(p) | elementId(n)] AS ids
LIMIT 1
"""


def path(graph, a: str, b: str) -> dict:
    """Đường nối ngắn nhất (≤ 6 bước, chỉ qua quan hệ lớp tham chiếu) giữa hai khái niệm; không có → found false."""
    na, nb = resolve(graph, a), resolve(graph, b)
    out: dict[str, Any] = {"from": node_out(na["label"], na["props"]) if na else None,
                           "to": node_out(nb["label"], nb["props"]) if nb else None, "found": False, "nodes": [], "edges": []}
    if not na or not nb:
        return out
    if na["eid"] == nb["eid"]:
        out.update({"found": True, "nodes": [out["from"]]})
        return out
    rows = graph.run(_PATH, {"a": na["eid"], "b": nb["eid"]})
    if not rows:
        return out
    row = rows[0]
    ids = {eid: node_id(n["label"], n["props"]) for eid, n in zip(row["ids"], row["ns"])}
    out["found"] = True
    out["nodes"] = [node_out(n["label"], n["props"]) for n in row["ns"]]
    out["edges"] = [{"from": ids[r["from"]], "to": ids[r["to"]], "type": r["type"].lower()} for r in row["rs"]]
    return out


# ----------------------------------------------------------------------------- gợi ý

_REC_WORDS = """
MATCH (u:User {id: $uid})-[:REVIEWS]->(:Card)-[:CONTAINS]->(k:Kanji)
WITH u, collect(DISTINCT k.char) AS known
UNWIND known AS ch
MATCH (w:Word)-[:CONTAINS]->(k:Kanji {char: ch})
WHERE w.jlpt IS NOT NULL AND w.jlpt >= $level
  AND NOT EXISTS { MATCH (u)-[:OWNS]->(:Deck)-[:HAS_CARD]->(:Card)-[:MEANS]->(w) }
  AND NOT EXISTS { MATCH (u)-[:OWNS]->(:Deck)-[:HAS_CARD]->(c2:Card) WHERE c2.term = w.term }
WITH w, known, count(DISTINCT k) AS shared
MATCH (w)-[:CONTAINS]->(all:Kanji)
WITH w, known, shared, collect(DISTINCT all.char) AS chars
RETURN properties(w) AS props, shared, size(chars) AS total, [x IN chars WHERE x IN known] AS knownChars
ORDER BY toFloat(shared) / size(chars) DESC, w.jlpt DESC, coalesce(w.common, false) DESC, w.key
LIMIT $limit
"""
_REC_KANJI = """
MATCH (u:User {id: $uid})-[v:REVIEWS]->(c:Card)-[:CONTAINS]->(k:Kanji)
WHERE coalesce(v.again30d, 0) >= 1
WITH k, sum(v.again30d) AS again, collect(DISTINCT c.term)[0..4] AS terms
WHERE again >= 2
OPTIONAL MATCH (k)-[:HAS_RADICAL]->(rad:Radical)
OPTIONAL MATCH (k)-[:LOOKS_LIKE]->(s:Kanji)
WITH k, again, terms, rad, collect(DISTINCT s.char)[0..3] AS similar
RETURN properties(k) AS props, again, terms, properties(rad) AS radical, similar
ORDER BY again DESC, k.char
LIMIT $limit
"""
_REC_HOMOPHONES = """
MATCH (u:User {id: $uid})-[:OWNS]->(:Deck)-[:HAS_CARD]->(c:Card)-[:MEANS]->(w:Word)-[:HOMOPHONE_OF]-(h:Word)
WHERE NOT EXISTS { MATCH (u)-[:OWNS]->(:Deck)-[:HAS_CARD]->(:Card)-[:MEANS]->(h) }
  AND (h.jlpt IS NULL OR h.jlpt >= $level)
WITH h, collect(DISTINCT w.term)[0..3] AS withTerms, count(DISTINCT w) AS n
RETURN properties(h) AS props, withTerms, n
ORDER BY n DESC, h.jlpt DESC, h.key
LIMIT $limit
"""


def _level(level: Optional[str]) -> str:
    return level if level in LEVELS else "N1"   # không rõ cấp → mọi cấp


def recommend(graph, uid: int, level: Optional[str] = None, limit: int = 8) -> dict:
    """Ba nhóm gợi ý tính từ đồ thị (spec §6): từ mới từ chữ đã học, chữ Hán hay sai, từ đồng âm dễ nhầm."""
    limit = max(1, min(int(limit or 8), 30))
    params = {"uid": uid, "level": _level(level), "limit": limit}
    words = [{"word": node_out("Word", r["props"]), "sharedKanji": r["shared"], "totalKanji": r["total"],
              "knownChars": r["knownChars"]} for r in graph.run(_REC_WORDS, params)]
    kanji = [{"kanji": node_out("Kanji", r["props"]), "again30d": r["again"], "terms": r["terms"],
              "radical": node_out("Radical", r["radical"]) if r.get("radical") else None, "similar": r["similar"]}
             for r in graph.run(_REC_KANJI, params)]
    homophones = [{"word": node_out("Word", r["props"]), "withTerms": r["withTerms"], "count": r["n"]}
                  for r in graph.run(_REC_HOMOPHONES, params)]
    return {"level": params["level"], "words": words, "weakKanji": kanji, "homophones": homophones}


# ----------------------------------------------------------------------------- xung đột giữa bộ thẻ

_CONFLICTS = """
MATCH (u:User {id: $uid})-[:OWNS]->(d1:Deck)-[:HAS_CARD]->(c1:Card)
MATCH (u)-[:OWNS]->(d2:Deck)-[:HAS_CARD]->(c2:Card)
WHERE c1.term = c2.term AND (d1.id < d2.id OR (d1.id = d2.id AND c1.id < c2.id))
OPTIONAL MATCH (c1)-[:MEANS]->(w1:Word)
OPTIONAL MATCH (c2)-[:MEANS]->(w2:Word)
WITH d1, c1, d2, c2, w1, w2,
     coalesce(c1.reading, '') <> coalesce(c2.reading, '') AS readingDiffers,
     (w1 IS NOT NULL AND w2 IS NOT NULL AND w1 <> w2) AS wordDiffers
WHERE readingDiffers OR wordDiffers
RETURN properties(c1) AS c1, properties(d1) AS d1, properties(c2) AS c2, properties(d2) AS d2,
       properties(w1) AS w1, properties(w2) AS w2, readingDiffers, wordDiffers
ORDER BY c1.term, d1.title, d2.title
LIMIT $limit
"""


def conflicts(graph, uid: int, limit: int = 50) -> dict:
    """Cùng thuật ngữ ở hai thẻ (khác bộ hoặc cùng bộ) mà cách đọc khác hoặc trỏ hai mục từ khác nhau."""
    items = []
    for r in graph.run(_CONFLICTS, {"uid": uid, "limit": max(1, min(int(limit or 50), 200))}):
        kind = "reading" if r["readingDiffers"] else "meaning"
        items.append({
            "term": r["c1"].get("term"), "kind": kind,
            "a": {"card": node_out("Card", r["c1"]), "deck": node_out("Deck", r["d1"]), "word": node_out("Word", r["w1"]) if r.get("w1") else None},
            "b": {"card": node_out("Card", r["c2"]), "deck": node_out("Deck", r["d2"]), "word": node_out("Word", r["w2"]) if r.get("w2") else None},
        })
    return {"items": items}


# ----------------------------------------------------------------------------- trạng thái

def status(graph) -> dict:
    """{available, building, step, builtAt, buildSeconds, counts, learner: {lastRun, syncedAt, scope}, error}."""
    st = builder.state()
    out: dict[str, Any] = {"available": True, "building": st["building"], "step": st["step"], "error": st["error"],
                           "builtAt": None, "buildSeconds": None, "counts": {}, "learner": None}
    for label in schema.REFERENCE_LABELS + schema.LEARNER_LABELS:
        rows = graph.run(f"MATCH (n:{label}) RETURN count(n) AS c")
        out["counts"][label] = rows[0]["c"] if rows else 0
    for row in graph.run("MATCH (m:Meta) RETURN m.id AS id, properties(m) AS props"):
        props = row["props"] or {}
        if row["id"] == "reference":
            out["builtAt"] = props.get("builtAt")
            out["buildSeconds"] = props.get("seconds")
            out["withGrammar"] = props.get("withGrammar")
        elif row["id"] == "learner":
            out["learner"] = {"lastRun": props.get("lastRun"), "syncedAt": props.get("syncedAt"), "scope": props.get("scope")}
    out["built"] = out["builtAt"] is not None and out["counts"].get("Word", 0) > 0
    return out
