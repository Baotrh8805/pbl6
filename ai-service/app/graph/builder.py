"""Dựng lớp tham chiếu của đồ thị từ dữ liệu ai-service (spec §4).

``reference_rows`` chỉ đọc dữ liệu và trả các danh sách dòng (test được không cần Neo4j); ``build`` ghi chúng theo lô UNWIND
rồi ghi node Meta. ``start_build`` chạy ``build`` ở luồng nền (dựng thật mất vài phút: 32k câu ví dụ qua tokenizer + matcher
ngữ pháp là bước chậm nhất); ``state()`` cho /graph/status biết đang dựng hay không.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from typing import Callable, Optional

from app.extract import dictionary, example_vi, han_viet, han_viet_graph, jmdict, kanji_meanings, kanji_similar, kanjidata, \
    radicals, tokenizer
from app.extract.grammar import matcher
from app.extract.jachars import is_kanji, kata_to_hira
from app.extract.jlpt import classifier
from app.graph import schema

logger = logging.getLogger(__name__)

HOMOPHONE_GROUP_MAX = 8     # nhóm đồng âm lớn hơn (する-words, が…) không còn là "dễ nhầm"
LOOKS_LIKE_K = 3
MIN_LOOKS_LIKE_SCORE = 0.3

# Thứ tự ghi: node trước, quan hệ sau (MATCH hai đầu phải có)
CYPHER: list[tuple[str, str]] = [
    ("words", "UNWIND $rows AS r MERGE (w:Word {key: r.key}) SET w.term = r.term, w.reading = r.reading, w.gloss = r.gloss, "
              "w.jlpt = r.jlpt, w.common = r.common, w.kanaOnly = r.kanaOnly"),
    ("kanji", "UNWIND $rows AS r MERGE (k:Kanji {char: r.char}) SET k.hanViet = r.hanViet, k.strokes = r.strokes, "
              "k.radicalNo = r.radicalNo, k.jlpt = r.jlpt, k.meaning = r.meaning"),
    ("radicals", "UNWIND $rows AS r MERGE (x:Radical {no: r.no}) SET x.char = r.char, x.nameVi = r.nameVi, "
                 "x.meaningVi = r.meaningVi, x.strokes = r.strokes"),
    ("components", "UNWIND $rows AS r MERGE (c:Component {char: r.char})"),
    ("hanviet", "UNWIND $rows AS r MERGE (h:HanViet {reading: r.reading}) SET h.fold = r.fold"),
    ("grammar", "UNWIND $rows AS r MERGE (g:Grammar {id: r.id}) SET g.name = r.name, g.level = r.level, g.meaningVi = r.meaningVi"),
    ("sentences", "UNWIND $rows AS r MERGE (s:Sentence {id: r.id}) SET s.jpn = r.jpn, s.eng = r.eng, s.vi = r.vi"),
    ("contains", "UNWIND $rows AS r MATCH (w:Word {key: r.key}) MATCH (k:Kanji {char: r.char}) MERGE (w)-[c:CONTAINS]->(k) SET c.pos = r.pos"),
    ("has_radical", "UNWIND $rows AS r MATCH (k:Kanji {char: r.char}) MATCH (x:Radical {no: r.no}) MERGE (k)-[:HAS_RADICAL]->(x)"),
    ("has_component_kanji", "UNWIND $rows AS r MATCH (k:Kanji {char: r.char}) MATCH (p:Kanji {char: r.part}) MERGE (k)-[:HAS_COMPONENT]->(p)"),
    ("has_component_other", "UNWIND $rows AS r MATCH (k:Kanji {char: r.char}) MATCH (p:Component {char: r.part}) MERGE (k)-[:HAS_COMPONENT]->(p)"),
    ("read_as", "UNWIND $rows AS r MATCH (k:Kanji {char: r.char}) MATCH (h:HanViet {reading: r.reading}) MERGE (k)-[:READ_AS]->(h)"),
    ("homophones", "UNWIND $rows AS r MATCH (a:Word {key: r.a}) MATCH (b:Word {key: r.b}) MERGE (a)-[:HOMOPHONE_OF]->(b)"),
    ("looks_like", "UNWIND $rows AS r MATCH (a:Kanji {char: r.a}) MATCH (b:Kanji {char: r.b}) MERGE (a)-[l:LOOKS_LIKE]->(b) SET l.score = r.score"),
    ("example_of", "UNWIND $rows AS r MATCH (s:Sentence {id: r.id}) MATCH (w:Word {key: r.key}) MERGE (s)-[:EXAMPLE_OF]->(w)"),
    ("uses_grammar", "UNWIND $rows AS r MATCH (s:Sentence {id: r.id}) MATCH (g:Grammar {id: r.gid}) MERGE (s)-[:USES_GRAMMAR]->(g)"),
]

# Sau khi dựng lại: thẻ của người học nối lại với mục từ / chữ Hán (sync.py lưu wordKey và kanji trên Card để bước này
# thuần Cypher, không cần tra lại JMdict)
RELINK = [
    "MATCH (c:Card) WHERE c.wordKey IS NOT NULL MATCH (w:Word {key: c.wordKey}) MERGE (c)-[:MEANS]->(w)",
    "MATCH (c:Card) WHERE c.kanji IS NOT NULL UNWIND c.kanji AS ch MATCH (k:Kanji {char: ch}) MERGE (c)-[:CONTAINS]->(k)",
]


def _jmdict_rows() -> list[tuple]:
    """(id, head_kanji, head_kana, gloss_short, jlpt) của mục JMdict common=1; thiếu file / bảng cũ → []."""
    path = jmdict.DATA_FILE
    if not path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            if not conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='words'").fetchone():
                return []
            return conn.execute("SELECT id, head_kanji, head_kana, gloss_short, jlpt FROM words WHERE common = 1").fetchall()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        logger.warning("graph: không đọc được words từ jmdict.sqlite: %s", exc)
        return []


def _example_rows() -> list[tuple]:
    """(id, word_id, tatoeba_id, jpn, eng) của bảng examples; thiếu → []."""
    path = jmdict.DATA_FILE
    if not path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            if not conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='examples'").fetchone():
                return []
            return conn.execute("SELECT id, word_id, tatoeba_id, jpn, eng FROM examples").fetchall()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        logger.warning("graph: không đọc được examples: %s", exc)
        return []


def _words() -> dict[str, dict]:
    """Word theo khoá: mục JLPT trước (cấp + nghĩa gọn, khoá JMdict qua key_for; không khớp → w:jlpt:), rồi JMdict common."""
    rows: dict[str, dict] = {}
    classifier._load()
    dict_ok = dictionary.available()
    jm = {f"w:{wid}": (head_kanji, head_kana, gloss_short, jlpt) for wid, head_kanji, head_kana, gloss_short, jlpt in _jmdict_rows()}
    for expr, reading, meaning, level in list(classifier._entries or []):
        key = dictionary.key_for(expr, reading) if dict_ok else None
        if not key:
            key = f"w:jlpt:{expr}|{reading}"
        if key in rows:
            continue   # biến thể cùng một mục JMdict: giữ mục đầu (cấp dễ nhất vì _entries xếp N5 → N1)
        # dạng viết theo JMdict khi khớp (dạng phổ biến nhất: JMdict ご飯, JLPT ghi 御飯); cấp + nghĩa gọn vẫn của JLPT
        head_kanji, head_kana = (jm[key][0], jm[key][1]) if key in jm else (None, None)
        term = head_kanji or head_kana or expr
        rd = head_kana if key in jm and head_kana else reading
        rows[key] = {"key": key, "term": term, "reading": kata_to_hira(rd) if rd else None,
                     "gloss": meaning or (jm[key][2] if key in jm else None) or None,
                     "jlpt": level, "common": True, "kanaOnly": not any(is_kanji(ch) for ch in term)}
    for key, (head_kanji, head_kana, gloss_short, jlpt) in jm.items():
        if key in rows:
            continue
        term = head_kanji or head_kana
        if not term:
            continue
        rows[key] = {"key": key, "term": term, "reading": kata_to_hira(head_kana) if head_kana else None,
                     "gloss": gloss_short or None, "jlpt": jlpt, "common": True, "kanaOnly": not head_kanji}
    return rows


def _easiest_level(ch: str) -> Optional[str]:
    entries = classifier.entries_containing(ch)
    if not entries:
        return None
    return classifier.LEVELS[min(classifier.level_index(e[3]) for e in entries)]


def reference_rows(with_grammar: bool = True, with_similar: bool = True,
                   progress: Optional[Callable[[str], None]] = None) -> dict[str, list[dict]]:
    """Mọi dòng node / quan hệ của lớp tham chiếu, khoá = tên trong CYPHER. Thiếu nguồn nào thì phần đó rỗng (không lỗi)."""
    say = progress or (lambda msg: None)
    out: dict[str, list[dict]] = {name: [] for name, _ in CYPHER}

    say("words")
    words = _words()
    out["words"] = list(words.values())

    say("kanji")
    kanji_set: set[str] = set()
    for row in words.values():
        seen: set[str] = set()
        for pos, ch in enumerate(row["term"]):
            if is_kanji(ch) and ch not in seen:
                seen.add(ch)
                kanji_set.add(ch)
                out["contains"].append({"key": row["key"], "char": ch, "pos": pos})
    radical_nos = {r["no"] for r in radicals.table()}
    for r in radicals.table():
        out["radicals"].append({"no": r["no"], "char": r["unified"] or r["char"], "nameVi": r["name_vi"],
                                "meaningVi": r["meaning_vi"], "strokes": r["strokes"]})
    hv_seen: set[str] = set()
    comp_seen: set[str] = set()
    for ch in sorted(kanji_set):
        rs = kanjidata.radical_strokes(ch)
        hv = han_viet.han_viet(ch)
        out["kanji"].append({"char": ch, "hanViet": hv, "strokes": rs[1] if rs else None, "radicalNo": rs[0] if rs else None,
                             "jlpt": _easiest_level(ch), "meaning": kanji_meanings.meaning(ch)})
        if rs and rs[0] in radical_nos:
            out["has_radical"].append({"char": ch, "no": rs[0]})
        if hv:
            for reading in hv.split():
                if reading not in hv_seen:
                    hv_seen.add(reading)
                    out["hanviet"].append({"reading": reading, "fold": han_viet_graph.fold(reading)})
                out["read_as"].append({"char": ch, "reading": reading})
        for part in kanjidata.components(ch):
            if part == ch:
                continue
            if part in kanji_set:
                out["has_component_kanji"].append({"char": ch, "part": part})
            else:
                if part not in comp_seen:
                    comp_seen.add(part)
                    out["components"].append({"char": part})
                out["has_component_other"].append({"char": ch, "part": part})

    say("homophones")
    by_reading: dict[str, list[dict]] = {}
    for row in words.values():
        if row["jlpt"] and row["reading"]:
            by_reading.setdefault(row["reading"], []).append(row)
    for group in by_reading.values():
        terms = {r["term"]: r for r in group}
        rows = sorted(terms.values(), key=lambda r: r["key"])
        if len(rows) < 2 or len(rows) > HOMOPHONE_GROUP_MAX or not any(not r["kanaOnly"] for r in rows):
            continue
        for i, a in enumerate(rows):
            for b in rows[i + 1:]:
                out["homophones"].append({"a": a["key"], "b": b["key"]})

    if with_similar:
        say("looks_like")
        pool = kanji_set & set(classifier.jlpt_kanji_set())
        for ch in sorted(pool):
            try:
                ranked = kanji_similar.similar(ch, LOOKS_LIKE_K, pool)
            except Exception as exc:  # noqa: BLE001 (thiếu KRADFILE / RS → bỏ phần này)
                logger.warning("graph: kanji_similar lỗi ở %s: %s", ch, exc)
                break
            for other, score in ranked:
                if other in kanji_set and score >= MIN_LOOKS_LIKE_SCORE:
                    out["looks_like"].append({"a": ch, "b": other, "score": round(float(score), 3)})

    say("grammar")
    catalog = []
    try:
        catalog = matcher.load_catalog()
    except Exception as exc:  # noqa: BLE001
        logger.warning("graph: không nạp được patterns.yaml: %s", exc)
    out["grammar"] = [{"id": p.id, "name": p.name, "level": p.level, "meaningVi": p.meaning_vi} for p in catalog]

    say("sentences")
    sentences: dict[str, dict] = {}
    example_pairs: set[tuple[str, str]] = set()
    for row_id, word_id, tatoeba_id, jpn, eng in _example_rows():
        key = f"w:{word_id}"
        if key not in words or not jpn:
            continue
        sid = str(tatoeba_id) if tatoeba_id else f"x{row_id}"
        if sid not in sentences:
            sentences[sid] = {"id": sid, "jpn": jpn, "eng": eng or None, "vi": example_vi.get(tatoeba_id) if tatoeba_id else None}
        example_pairs.add((sid, key))
    out["sentences"] = list(sentences.values())
    out["example_of"] = [{"id": sid, "key": key} for sid, key in sorted(example_pairs)]

    if with_grammar and catalog and sentences and tokenizer.available():
        say("uses_grammar")
        pairs: set[tuple[str, str]] = set()
        for sid, s in sentences.items():
            try:
                tokens = tokenizer.tokenize(s["jpn"], "A")
                for m in matcher.match_sentence(tokens, catalog):
                    pairs.add((sid, m.pattern.id))
            except Exception as exc:  # noqa: BLE001 (câu lạ không được làm hỏng cả lần dựng)
                logger.debug("graph: bỏ câu %s khi bắt ngữ pháp: %s", sid, exc)
        out["uses_grammar"] = [{"id": sid, "gid": gid} for sid, gid in sorted(pairs)]
    return out


def counts_of(rows: dict[str, list[dict]]) -> dict[str, int]:
    return {name: len(items) for name, items in rows.items() if items}


def clear_reference(graph) -> None:
    """Xoá lớp tham chiếu theo lô (giữ lớp người học; quan hệ MEANS / CONTAINS của thẻ mất theo, RELINK tạo lại)."""
    for label in schema.REFERENCE_LABELS:
        graph.run(f"MATCH (n:{label}) CALL (n) {{ DETACH DELETE n }} IN TRANSACTIONS OF 5000 ROWS")
    graph.run("MATCH (m:Meta {id: 'reference'}) DELETE m")


def build(graph, with_grammar: bool = True, with_similar: bool = True,
          progress: Optional[Callable[[str], None]] = None) -> dict:
    """Dựng lại toàn bộ lớp tham chiếu: schema → xoá cũ → ghi theo lô → nối lại thẻ → Meta. Trả {counts, seconds}."""
    started = time.monotonic()
    say = progress or (lambda msg: None)
    schema.ensure(graph)
    rows = reference_rows(with_grammar=with_grammar, with_similar=with_similar, progress=progress)
    say("write")
    clear_reference(graph)
    written: dict[str, int] = {}
    for name, cypher in CYPHER:
        if rows.get(name):
            written[name] = graph.run_batches(cypher, rows[name])
    say("relink")
    for stmt in RELINK:
        graph.run(stmt)
    counts = counts_of(rows)
    seconds = round(time.monotonic() - started, 1)
    graph.run("MERGE (m:Meta {id: 'reference'}) SET m.builtAt = datetime(), m.counts = $counts, m.seconds = $seconds, "
              "m.withGrammar = $withGrammar",
              {"counts": json.dumps(counts, ensure_ascii=False), "seconds": seconds, "withGrammar": with_grammar})
    logger.info("graph: dựng lớp tham chiếu xong trong %ss: %s", seconds, counts)
    return {"counts": counts, "seconds": seconds, "written": written}


# ----------------------------------------------------------------------------- chạy nền

_state: dict = {"building": False, "step": None, "startedAt": None, "finishedAt": None, "error": None, "result": None}
_state_lock = threading.Lock()


def state() -> dict:
    with _state_lock:
        return dict(_state)


def start_build(graph, with_grammar: bool = True, with_similar: bool = True) -> bool:
    """Bắt đầu dựng ở luồng nền; False nếu đang dựng dở."""
    with _state_lock:
        if _state["building"]:
            return False
        _state.update({"building": True, "step": "start", "startedAt": time.time(), "finishedAt": None, "error": None})

    def progress(step: str) -> None:
        with _state_lock:
            _state["step"] = step

    def runner() -> None:
        try:
            result = build(graph, with_grammar=with_grammar, with_similar=with_similar, progress=progress)
            with _state_lock:
                _state.update({"result": result, "error": None})
        except Exception as exc:  # noqa: BLE001
            logger.exception("graph: dựng lớp tham chiếu lỗi")
            with _state_lock:
                _state["error"] = str(exc)[:300]
        finally:
            with _state_lock:
                _state.update({"building": False, "step": None, "finishedAt": time.time()})

    threading.Thread(target=runner, name="graph-build", daemon=True).start()
    return True


def reset_state() -> None:
    """Test: về trạng thái ban đầu."""
    with _state_lock:
        _state.update({"building": False, "step": None, "startedAt": None, "finishedAt": None, "error": None, "result": None})
