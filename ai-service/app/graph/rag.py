"""GraphRAG hỏi đáp (spec §7): thực thể trong câu hỏi → nhánh đồ thị (lân cận + ngữ cảnh học của người hỏi) + nhánh văn bản
(FTS từ điển / tìm câu ví dụ tiếng Việt) → hợp nhất → Gemini (có trích nguồn [n]); không có khoá / hết quota → trả lời mẫu
dựng thẳng từ ngữ cảnh (``model: "template"``). Mọi bước trước Gemini không cần mạng.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.extract import example_vi, gemini, han_viet_graph
from app.extract.jachars import has_japanese, is_kanji, kata_to_hira
from app.graph import queries

logger = logging.getLogger(__name__)

MAX_QUESTION = 300
MAX_ENTITIES = 8
MAX_ITEMS = 24
MAX_CONTEXT_CHARS = 6000
MAX_SUBGRAPH_NODES = 60

_JA_RUN = re.compile(r"[぀-ヿ一-鿿々〜ー]+")
_GRAMMAR_RE = re.compile(r"〜[^\s、。,.?？!！]+")
_LATIN_WORD = re.compile(r"[A-Za-zÀ-ỹĐđ]+")
_CONTENT_POS = ("名詞", "動詞", "形容詞", "副詞", "形状詞")
_STOP_VI = frozenset("""là gì của và có không cho với được trong này đó như thế nào khi thì mà hay hoặc các những một
các nghĩa từ chữ câu mẫu ngữ pháp tiếng nhật việt dùng cách đọc viết hán nào sao tại vì bạn mình tôi em anh chị ví dụ khác
giữa đã đang sẽ rất cũng còn lại nên cần phải làm thêm nữa đi về ra vào lên xuống hãy giúp cho biết""".split())
_STOP_EN = frozenset("the what does mean word kanji sentence grammar japanese vietnamese how which this that with from".split())


# ----------------------------------------------------------------------------- 1. thực thể

def _content_lemmas(question: str) -> list[str]:
    """Dạng gốc của từ nội dung tiếng Nhật trong câu hỏi, theo thứ tự xuất hiện; tokenizer thiếu → các cụm chữ Nhật nguyên."""
    runs = [m.group(0) for m in _JA_RUN.finditer(question)]
    try:
        from app.extract import tokenizer
        if not tokenizer.available():
            return runs
        out: list[str] = []
        for run in runs:
            for t in tokenizer.tokenize(run, "C"):
                if t.pos1 in _CONTENT_POS and t.pos2 not in ("非自立可能", "数詞") and t.lemma and t.lemma not in out:
                    out.append(t.lemma)
            if run not in out and len(run) <= 12:
                out.append(run)   # cụm nguyên văn (từ ghép tokenizer tách nhỏ vẫn tra được cả cụm)
        return out
    except Exception as exc:  # noqa: BLE001
        logger.debug("rag: tokenizer lỗi: %s", exc)
        return runs


def extract_entities(graph, question: str, limit: int = MAX_ENTITIES) -> list[dict]:
    """[{id, type, label, eid, props}] theo thứ tự: từ (dạng gốc), chữ Hán, mẫu ngữ pháp, âm Hán-Việt viết hoa."""
    found: dict[str, dict] = {}

    def add(row: Optional[dict]) -> None:
        if row and len(found) < limit:
            nid = queries.node_id(row["label"], row["props"])
            if nid not in found:
                out = queries.node_out(row["label"], row["props"])
                out["eid"] = row["eid"]
                found[nid] = out

    for m in _GRAMMAR_RE.finditer(question):
        add(queries.resolve(graph, m.group(0)))
    for lemma in _content_lemmas(question):
        if len(lemma) == 1 and is_kanji(lemma):
            add(queries.resolve(graph, lemma))
            continue
        rows = graph.run("MATCH (n:Word) WHERE n.term = $v OR n.reading = $r "
                         "RETURN labels(n)[0] AS label, properties(n) AS props, elementId(n) AS eid "
                         "ORDER BY (n.term = $v) DESC, coalesce(n.jlpt, 'N0') DESC, coalesce(n.common, false) DESC, n.key LIMIT 1",
                         {"v": lemma, "r": kata_to_hira(lemma)})
        if rows:
            add(rows[0])
            continue
        by_key = queries._by_dict_key(graph, lemma)
        if by_key:
            add(by_key)
        elif len(lemma) > 1:
            g = graph.run("MATCH (n:Grammar) WHERE n.name = '〜' + $v OR n.name = $v "
                          "RETURN labels(n)[0] AS label, properties(n) AS props, elementId(n) AS eid LIMIT 1", {"v": lemma})
            if g:
                add(g[0])
    for ch in dict.fromkeys(c for c in question if is_kanji(c)):
        add(queries.resolve(graph, ch))
    words = _LATIN_WORD.findall(question)
    for i, w in enumerate(words):
        if len(w) >= 2 and (w.isupper() or (i > 0 and w[0].isupper())):
            rows = graph.run("MATCH (n:HanViet) WHERE n.reading = $v OR n.fold = $f "
                             "RETURN labels(n)[0] AS label, properties(n) AS props, elementId(n) AS eid "
                             "ORDER BY (n.reading = $v) DESC, n.reading LIMIT 1",
                             {"v": han_viet_graph.normalize(w), "f": han_viet_graph.fold(w)})
            if rows:
                add(rows[0])
    return list(found.values())


# ----------------------------------------------------------------------------- 2. nhánh đồ thị

def _word_line(p: dict) -> str:
    s = p.get("term") or ""
    if p.get("reading") and p.get("reading") != s:
        s += f" ({p['reading']})"
    if p.get("jlpt"):
        s += f", {p['jlpt']}"
    meaning = p.get("vi") or p.get("gloss")
    return f"{s}: {meaning}" if meaning else s


def _sentence_line(p: dict) -> str:
    s = f"「{p.get('jpn') or ''}」"
    tr = p.get("vi") or p.get("eng")
    return f"{s} – {tr}" if tr else s


def _kanji_short(p: dict) -> str:
    s = p.get("char") or ""
    bits = []
    if p.get("hanViet"):
        bits.append(p["hanViet"])
    if p.get("strokes"):
        bits.append(f"{p['strokes']} nét")
    return f"{s} ({', '.join(bits)})" if bits else s


def _group(rows: list[dict], rtype: str, label: Optional[str] = None, outward: Optional[bool] = None) -> list[dict]:
    """Láng giềng theo loại quan hệ (và nhãn / chiều nếu cho), mỗi node một lần (LOOKS_LIKE hai chiều có thể lặp)."""
    out, seen = [], set()
    for r in rows:
        if r["type"] != rtype or (label is not None and r["label"] != label) or (outward is not None and r["outward"] != outward):
            continue
        key = queries.node_id(r["label"], r["props"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def entity_text(entity: dict, rows: list[dict]) -> str:
    """Một đoạn tiếng Việt mô tả thực thể từ láng giềng của nó (dùng cho ngữ cảnh Gemini lẫn trả lời mẫu)."""
    t, p = entity["type"], entity
    if t == "word":
        parts = [_word_line(p) + "."]
        kanji = [_kanji_short(r["props"]) for r in _group(rows, "CONTAINS", "Kanji")]
        if kanji:
            parts.append("Chữ Hán: " + ", ".join(kanji) + ".")
        ex = [_sentence_line(r["props"]) for r in _group(rows, "EXAMPLE_OF", "Sentence")[:2]]
        if ex:
            parts.append("Ví dụ: " + " ".join(ex))
        homo = [_word_line(r["props"]) for r in _group(rows, "HOMOPHONE_OF", "Word")[:4]]
        if homo:
            parts.append("Đồng âm dễ nhầm: " + "; ".join(homo) + ".")
        return " ".join(parts)
    if t == "kanji":
        bits = [f"{p.get('char')}"]
        if p.get("hanViet"):
            bits.append(f"âm Hán-Việt {p['hanViet']}")
        if p.get("meaning"):
            bits.append(f"nghĩa (Anh): {p['meaning']}")
        if p.get("strokes"):
            bits.append(f"{p['strokes']} nét")
        rad = _group(rows, "HAS_RADICAL", "Radical")
        if rad:
            r = rad[0]["props"]
            bits.append(f"bộ thủ {r.get('no')} {r.get('char') or ''} ({r.get('nameVi') or ''}: {r.get('meaningVi') or ''})")
        elif p.get("radicalNo"):
            bits.append(f"bộ thủ số {p['radicalNo']}")
        comps = [r["props"].get("char") for r in _group(rows, "HAS_COMPONENT", outward=True)]
        if comps:
            bits.append("thành phần: " + " ".join(c for c in comps if c))
        inside = [r["props"].get("char") for r in _group(rows, "HAS_COMPONENT", "Kanji", outward=False)]
        if inside:
            bits.append("là thành phần của: " + " ".join(c for c in inside if c))
        similar = [r["props"].get("char") for r in _group(rows, "LOOKS_LIKE", "Kanji")]
        if similar:
            bits.append("chữ giống hình: " + " ".join(c for c in similar if c))
        s = "; ".join(bits) + "."
        words = [_word_line(r["props"]) for r in _group(rows, "CONTAINS", "Word")[:6]]
        if words:
            s += " Từ chứa chữ (dễ → khó): " + "; ".join(words) + "."
        return s
    if t == "hanviet":
        kanji = []
        for r in _group(rows, "READ_AS", "Kanji")[:10]:
            kp = r["props"]
            extra = ", ".join(x for x in (kp.get("meaning"), kp.get("jlpt")) if x)
            kanji.append(f"{kp.get('char')}" + (f" ({extra})" if extra else ""))
        return f"Âm Hán-Việt {p.get('reading')}: " + (", ".join(kanji) if kanji else "chưa có chữ nào trong đồ thị") + "."
    if t == "grammar":
        s = f"Mẫu ngữ pháp {p.get('name')}"
        if p.get("level"):
            s += f" ({p['level']})"
        if p.get("meaningVi"):
            s += f": {p['meaningVi']}"
        ex = [_sentence_line(r["props"]) for r in _group(rows, "USES_GRAMMAR", "Sentence")[:3]]
        return s + "." + (" Câu ví dụ: " + " ".join(ex) if ex else "")
    if t == "sentence":
        words = [r["props"].get("term") for r in _group(rows, "EXAMPLE_OF", "Word")]
        gram = [r["props"].get("name") for r in _group(rows, "USES_GRAMMAR", "Grammar")]
        s = "Câu: " + _sentence_line(p)
        if words:
            s += " Từ: " + ", ".join(w for w in words if w) + "."
        if gram:
            s += " Mẫu: " + ", ".join(g for g in gram if g) + "."
        return s
    if t == "radical":
        kanji = [r["props"].get("char") for r in _group(rows, "HAS_RADICAL", "Kanji")[:12]]
        return f"Bộ thủ {p.get('no')} {p.get('char')} ({p.get('nameVi')}: {p.get('meaningVi')}): " + " ".join(k for k in kanji if k) + "."
    return f"{p.get('label')}."


_LEARNER_CARDS = """
MATCH (u:User {id: $uid})-[:OWNS]->(d:Deck)-[:HAS_CARD]->(c:Card)-[:MEANS|CONTAINS]->(n) WHERE elementId(n) = $eid
OPTIONAL MATCH (u)-[v:REVIEWS]->(c)
OPTIONAL MATCH (ch:Chapter)-[:SCHEDULES]->(c)
RETURN DISTINCT d.title AS deck, c.term AS term, v.dueAt AS dueAt, v.again30d AS again, v.reps AS reps, v.intervalDays AS interval,
       (v IS NOT NULL AND v.dueAt <= datetime()) AS due, ch.title AS chapter
ORDER BY due DESC, again DESC, term
LIMIT 8
"""


def learner_text(graph, entity: dict, uid: int) -> Optional[str]:
    rows = graph.run(_LEARNER_CARDS, {"uid": uid, "eid": entity["eid"]})
    if not rows:
        return None
    bits = []
    for r in rows:
        state = []
        if r.get("reps") is None:
            state.append("chưa ôn lần nào")
        else:
            state.append("đến hạn ôn" if r.get("due") else f"ôn lại sau {r.get('interval') or 0} ngày")
            if r.get("again"):
                state.append(f"sai {r['again']} lần trong 30 ngày")
        if r.get("chapter"):
            state.append(f"chương '{r['chapter']}' của lộ trình")
        bits.append(f"{r['term']} (bộ '{r['deck']}': {', '.join(state)})")
    return f"Bạn có {len(rows)} thẻ liên quan {entity['label']}: " + "; ".join(bits) + "."


_CAPS = {"CONTAINS": 8, "EXAMPLE_OF": 3, "HOMOPHONE_OF": 4, "READ_AS": 10, "HAS_RADICAL": 1, "HAS_COMPONENT": 6, "LOOKS_LIKE": 3,
         "USES_GRAMMAR": 3, "MEANS": 0, "HAS_CARD": 0, "SCHEDULES": 0}


def graph_context(graph, entities: list[dict], uid: Optional[int]) -> tuple[list[dict], dict]:
    """(mẩu ngữ cảnh [{id, type, label, text, score, branch}], đồ thị con {nodes, edges}) từ lân cận của từng thực thể."""
    items: list[dict] = []
    nodes: dict[str, dict] = {}
    edges: dict[tuple[str, str, str], dict] = {}
    for ent in entities:
        rows = queries.neighbors(graph, ent["eid"], _CAPS, (), None, cap=4)
        items.append({"id": ent["id"], "type": ent["type"], "label": ent["label"], "text": entity_text(ent, rows),
                      "score": 1.0, "branch": "graph"})
        nodes.setdefault(ent["id"], {k: v for k, v in ent.items() if k != "eid"})
        for r in rows:
            n = queries.node_out(r["label"], r["props"])
            if len(nodes) < MAX_SUBGRAPH_NODES:
                nodes.setdefault(n["id"], n)
            a, b = (ent["id"], n["id"]) if r["outward"] else (n["id"], ent["id"])
            edges.setdefault((a, b, r["type"]), {"from": a, "to": b, "type": r["type"].lower()})
            if r["label"] in ("Word", "Kanji", "Grammar", "Sentence") and n["id"] not in {i["id"] for i in items}:
                if r["label"] == "Word":
                    text, score = _word_line(r["props"]), 0.6
                elif r["label"] == "Kanji":
                    text, score = _kanji_short(r["props"]) + (f": {r['props'].get('meaning')}" if r["props"].get("meaning") else ""), 0.6
                elif r["label"] == "Grammar":
                    text, score = f"Mẫu {r['props'].get('name')}: {r['props'].get('meaningVi') or ''}", 0.6
                else:
                    text, score = "Câu: " + _sentence_line(r["props"]), 0.4   # câu ví dụ: thấp hơn, trùng nhánh văn bản sẽ được cộng
                items.append({"id": n["id"], "type": n["type"], "label": n["label"], "text": text, "score": score, "branch": "graph"})
        if uid is not None and ent["type"] in ("word", "kanji"):
            lt = learner_text(graph, ent, uid)
            if lt:
                items.append({"id": f"me:{ent['id']}", "type": "learner", "label": f"Bạn và {ent['label']}", "text": lt,
                              "score": 0.9, "branch": "graph"})
    return items, {"nodes": list(nodes.values()), "edges": list(edges.values())}


# ----------------------------------------------------------------------------- 3. nhánh văn bản

def _keywords(question: str) -> tuple[list[str], list[str]]:
    """(từ khoá tiếng Việt, từ khoá tiếng Anh) dài → ngắn, bỏ từ dừng."""
    vi, en = [], []
    for w in _LATIN_WORD.findall(question):
        lw = w.lower()
        if len(lw) < 3:
            continue
        if lw in _STOP_VI or lw in _STOP_EN:
            continue
        if lw not in vi:
            vi.append(lw)          # tiếng Việt gõ không dấu cũng là ASCII → tìm câu theo bản bỏ dấu (example_vi.search)
        if lw.isascii() and lw not in en:
            en.append(lw)
    vi.sort(key=len, reverse=True)
    en.sort(key=len, reverse=True)
    return vi[:3], en[:2]


def text_context(graph, question: str, entities: list[dict]) -> list[dict]:
    """Câu ví dụ theo từ khoá tiếng Việt (example_vi) + mục từ theo FTS Anh / tìm Nhật cho cụm chưa thành thực thể."""
    items: list[dict] = []
    known = {e["id"] for e in entities}
    vi_kw, en_kw = _keywords(question)
    ids: list[str] = []
    if vi_kw and example_vi.available():
        for kw in vi_kw:
            for sid in example_vi.search(kw, 4):
                if sid not in ids:
                    ids.append(sid)
    if ids:
        for r in graph.run("MATCH (s:Sentence) WHERE s.id IN $ids RETURN properties(s) AS props LIMIT 8", {"ids": ids[:12]}):
            n = queries.node_out("Sentence", r["props"])
            items.append({"id": n["id"], "type": "sentence", "label": n["label"], "text": "Câu: " + _sentence_line(r["props"]),
                          "score": 0.5, "branch": "text"})
    try:
        from app.extract import dictionary
        if dictionary.available():
            queries_ja = [m.group(0) for m in _JA_RUN.finditer(question) if len(m.group(0)) > 1][:2]
            for q, mode, k in [(q, "ja", 3) for q in queries_ja] + [(q, "en", 2) for q in en_kw]:
                for it in dictionary.search(q, mode, limit=k).get("items", []):
                    key = it.get("key")
                    if not key or key in known:
                        continue
                    rows = graph.run("MATCH (w:Word {key: $k}) RETURN properties(w) AS props LIMIT 1", {"k": key})
                    if rows:
                        n = queries.node_out("Word", rows[0]["props"])
                        if n["id"] not in {i["id"] for i in items}:
                            items.append({"id": n["id"], "type": "word", "label": n["label"], "text": _word_line(rows[0]["props"]),
                                          "score": 0.5, "branch": "text"})
    except Exception as exc:  # noqa: BLE001 (từ điển thiếu không chặn hỏi đáp)
        logger.debug("rag: nhánh văn bản lỗi: %s", exc)
    return items


# ----------------------------------------------------------------------------- 4. hợp nhất

def fuse(graph_items: list[dict], text_items: list[dict], max_items: int = MAX_ITEMS, max_chars: int = MAX_CONTEXT_CHARS) -> list[dict]:
    """Gộp hai nhánh theo id: điểm cao nhất + 0,3 khi cùng xuất hiện; xếp điểm giảm dần (ổn định), cắt theo số mẩu và ký tự."""
    merged: dict[str, dict] = {}
    for it in graph_items + text_items:
        cur = merged.get(it["id"])
        if cur is None:
            merged[it["id"]] = dict(it)
        else:
            cur["score"] = max(cur["score"], it["score"]) + (0.3 if cur["branch"] != it["branch"] else 0.0)
            cur["branch"] = "both" if cur["branch"] != it["branch"] else cur["branch"]
            if len(it["text"]) > len(cur["text"]):
                cur["text"] = it["text"]
    ordered = sorted(merged.values(), key=lambda x: -x["score"])
    out, used = [], 0
    for it in ordered:
        if len(out) >= max_items or used + len(it["text"]) > max_chars:
            continue
        out.append(it)
        used += len(it["text"])
    return out


# ----------------------------------------------------------------------------- 5. sinh câu trả lời

_TYPE_VI = {"word": "từ", "kanji": "chữ Hán", "hanviet": "âm Hán-Việt", "grammar": "mẫu ngữ pháp", "sentence": "câu ví dụ",
            "radical": "bộ thủ", "learner": "dữ liệu học của bạn", "component": "thành phần"}


def build_prompt(question: str, items: list[dict], level: Optional[str]) -> str:
    lines = [
        "Bạn là trợ giảng tiếng Nhật cho người Việt. Trả lời câu hỏi CHỈ dựa trên ngữ cảnh đánh số bên dưới (lấy từ đồ thị tri "
        "thức và từ điển của ứng dụng). Quy tắc: viết tiếng Việt, ngắn gọn, có cấu trúc (gạch đầu dòng khi liệt kê); mỗi thông tin "
        "lấy từ ngữ cảnh ghi số nguồn dạng [n] ngay sau; không bịa thêm từ, nghĩa, cách đọc hay ví dụ ngoài ngữ cảnh; nếu ngữ "
        "cảnh không đủ thì nói rõ phần nào chưa có dữ liệu. Nếu có mục 'dữ liệu học của bạn' thì liên hệ với việc học của người hỏi.",
        f"Người hỏi đang ở trình độ {level or 'chưa rõ'}.",
        "", f"Câu hỏi: {question.strip()}", "", "Ngữ cảnh:",
    ]
    for n, it in enumerate(items, 1):
        lines.append(f"[{n}] ({_TYPE_VI.get(it['type'], it['type'])}) {it['text']}")
    return "\n".join(lines)


def template_answer(question: str, entities: list[dict], items: list[dict]) -> str:
    """Trả lời không qua Gemini: ghép ngữ cảnh thành đoạn có cấu trúc, vẫn trích nguồn [n]."""
    if not items:
        return ("Mình chưa nhận ra từ, chữ Hán, âm Hán-Việt hay mẫu ngữ pháp nào trong câu hỏi, và cũng không tìm thấy câu ví dụ "
                "liên quan. Thử hỏi về một từ cụ thể (vd. 食べる), một chữ Hán (食), một âm Hán-Việt (THỰC) hoặc mẫu ngữ pháp "
                "(〜なければならない).")
    index = {it["id"]: n for n, it in enumerate(items, 1)}
    lines = ["Tóm tắt từ đồ thị tri thức (chưa qua mô hình ngôn ngữ):"]
    shown: set[str] = set()
    for ent in entities:
        n = index.get(ent["id"])
        if n:
            lines.append(f"- {items[n - 1]['text']} [{n}]")
            shown.add(ent["id"])
        me = index.get(f"me:{ent['id']}")
        if me:
            lines.append(f"- {items[me - 1]['text']} [{me}]")
            shown.add(f"me:{ent['id']}")
    rest = [it for it in items if it["id"] not in shown][:6]
    if rest:
        lines.append("Liên quan:")
        for it in rest:
            lines.append(f"- {it['text']} [{index[it['id']]}]")
    return "\n".join(lines)


def ask(graph, question: str, uid: Optional[int] = None, level: Optional[str] = None, gemini_model: Optional[str] = None) -> dict:
    question = (question or "").strip()[:MAX_QUESTION]
    entities = extract_entities(graph, question)
    g_items, subgraph = graph_context(graph, entities, uid)
    t_items = text_context(graph, question, entities)
    items = fuse(g_items, t_items)
    sources = [{"n": n, "id": it["id"], "type": it["type"], "label": it["label"], "text": it["text"], "branch": it["branch"]}
               for n, it in enumerate(items, 1)]
    model, note, answer = "template", None, None
    if items and gemini.available():
        try:
            answer = gemini._generate(build_prompt(question, items, level), {"temperature": 0.2, "max_output_tokens": 1024},
                                      gemini_model).strip()
            model = gemini.resolve_model(gemini_model)
        except gemini.GeminiError as exc:
            note = f"Gemini không trả lời được ({exc.reason}); đây là tóm tắt thẳng từ đồ thị."
            logger.info("rag: Gemini lỗi %s -> trả lời mẫu", exc.reason)
        except Exception as exc:  # noqa: BLE001
            note = "Gemini lỗi; đây là tóm tắt thẳng từ đồ thị."
            logger.warning("rag: Gemini lỗi không ngờ: %s", exc)
    elif items:
        note = "Chưa cấu hình khoá Gemini: câu trả lời ghép thẳng từ đồ thị tri thức."
    if not answer:
        answer = template_answer(question, entities, items)
    return {"question": question, "answer": answer, "model": model, "note": note,
            "entities": [{k: v for k, v in e.items() if k != "eid"} for e in entities], "sources": sources, "subgraph": subgraph}
