"""Đồng bộ lớp người học từ backend (Postgres) vào đồ thị (spec §5).

Backend gửi nhiều lô ``apply`` cùng một ``run`` (UUID) rồi ``finish``: node / quan hệ lớp người học có ``run`` khác bị xoá
(scope ``all``: cả đồ thị; ``user``: chỉ của ``userId``). Nhờ đó xoá ở Postgres cũng mất ở Neo4j mà không cần theo dõi sự kiện.
Thẻ được làm giàu ở đây: ``wordKey`` (khớp mục JMdict qua dictionary.key_for) và ``kanji`` (chữ Hán trong thuật ngữ) lưu
trên Card để builder nối lại được bằng Cypher sau khi dựng lại lớp tham chiếu.
Không có PII: backend chỉ gửi id người dùng + cấp JLPT.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.extract import dictionary
from app.extract.jachars import is_kanji, kata_to_hira
from app.graph import schema

logger = logging.getLogger(__name__)

MAX_ROWS = 2000          # mỗi loại mỗi lô (backend cắt lô cùng số này)
MEANING_MAX = 200
SCOPES = ("all", "user")

CYPHER: dict[str, str] = {
    "users": "UNWIND $rows AS r MERGE (u:User {id: r.id}) SET u.level = r.level, u.run = $run",
    "decks": "UNWIND $rows AS r MERGE (d:Deck {id: r.id}) SET d.title = r.title, d.level = r.level, d.ownerId = r.ownerId, "
             "d.run = $run WITH d, r MATCH (u:User {id: r.ownerId}) MERGE (u)-[o:OWNS]->(d) SET o.run = $run",
    "cards": "UNWIND $rows AS r MERGE (c:Card {id: r.id}) SET c.term = r.term, c.reading = r.reading, c.meaning = r.meaning, "
             "c.deckId = r.deckId, c.ownerId = r.ownerId, c.wordKey = r.wordKey, c.kanji = r.kanji, c.run = $run "
             "WITH c, r MATCH (d:Deck {id: r.deckId}) MERGE (d)-[h:HAS_CARD]->(c) SET h.pos = r.pos, h.run = $run",
    "cards_moved": "UNWIND $rows AS r MATCH (d:Deck)-[h:HAS_CARD]->(c:Card {id: r.id}) WHERE d.id <> r.deckId DELETE h",
    "cards_unlink": "UNWIND $rows AS r MATCH (c:Card {id: r.id})-[m:MEANS|CONTAINS]->() DELETE m",
    "cards_means": "UNWIND $rows AS r MATCH (c:Card {id: r.id}) MATCH (w:Word {key: r.wordKey}) MERGE (c)-[:MEANS]->(w)",
    "cards_contains": "UNWIND $rows AS r MATCH (c:Card {id: r.id}) UNWIND r.kanji AS ch MATCH (k:Kanji {char: ch}) "
                      "MERGE (c)-[:CONTAINS]->(k)",
    "reviews": "UNWIND $rows AS r MATCH (u:User {id: r.userId}) MATCH (c:Card {id: r.cardId}) MERGE (u)-[v:REVIEWS]->(c) "
               "SET v.ease = r.ease, v.intervalDays = r.intervalDays, v.reps = r.reps, v.dueAt = datetime(r.dueAt), "
               "v.again30d = r.again30d, v.lastAt = datetime(r.lastAt), v.run = $run",
    "paths": "UNWIND $rows AS r MERGE (p:Path {id: r.id}) SET p.title = r.title, p.status = r.status, p.ownerId = r.userId, "
             "p.run = $run WITH p, r MATCH (u:User {id: r.userId}) MERGE (u)-[f:FOLLOWS]->(p) SET f.run = $run",
    "chapters": "UNWIND $rows AS r MERGE (c:Chapter {id: r.id}) SET c.title = r.title, c.position = r.position, "
                "c.pathId = r.pathId, c.ownerId = r.ownerId, c.run = $run WITH c, r MATCH (p:Path {id: r.pathId}) "
                "MERGE (p)-[h:HAS_CHAPTER]->(c) SET h.run = $run WITH c, r OPTIONAL MATCH (d:Deck {id: r.deckId}) "
                "FOREACH (_ IN CASE WHEN d IS NULL THEN [] ELSE [1] END | MERGE (c)-[fd:FROM_DECK]->(d) SET fd.run = $run)",
    "pathCards": "UNWIND $rows AS r MATCH (c:Chapter {id: r.chapterId}) MATCH (k:Card {id: r.cardId}) "
                 "MERGE (c)-[s:SCHEDULES]->(k) SET s.seq = r.seq, s.day = r.day, s.run = $run",
    "meanings": "UNWIND $rows AS r MATCH (w:Word {key: r.key}) SET w.vi = r.vi",
}
ORDER = ("users", "decks", "cards", "reviews", "paths", "chapters", "pathCards", "meanings")


class SyncError(ValueError):
    """Lô không hợp lệ (thiếu trường, quá dài) → router trả 400."""


def _s(v: Any, limit: int = 255) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s[:limit] if s else None


def _i(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _f(v: Any) -> Optional[float]:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _req(row: dict, field: str, kind: str) -> Any:
    v = row.get(field)
    if v is None or v == "":
        raise SyncError(f"{kind}: thiếu {field}")
    return v


def enrich_card(term: str, reading: Optional[str]) -> tuple[Optional[str], list[str]]:
    """(khoá mục từ JMdict hoặc None, chữ Hán trong thuật ngữ theo thứ tự, mỗi chữ một lần)."""
    kanji = list(dict.fromkeys(ch for ch in term if is_kanji(ch)))
    key = None
    if dictionary.available():
        try:
            key = dictionary.key_for(term, reading) or (dictionary.key_for(reading) if reading else None)
        except Exception as exc:  # noqa: BLE001 (sqlite lỗi không làm hỏng lô)
            logger.debug("graph: key_for(%s) lỗi: %s", term, exc)
    return key, kanji


def normalize(payload: dict) -> dict[str, list[dict]]:
    """Kiểm tra + chuẩn hoá lô: ép kiểu id, cắt chuỗi, làm giàu thẻ. Sai → SyncError."""
    out: dict[str, list[dict]] = {}
    for kind in ORDER:
        rows = payload.get(kind) or []
        if not isinstance(rows, list):
            raise SyncError(f"{kind}: phải là danh sách")
        if len(rows) > MAX_ROWS:
            raise SyncError(f"{kind}: tối đa {MAX_ROWS} dòng mỗi lô")
        norm: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                raise SyncError(f"{kind}: dòng phải là object")
            if kind == "users":
                uid = _i(_req(row, "id", kind))
                if uid is None:
                    raise SyncError("users: id phải là số")
                norm.append({"id": uid, "level": _s(row.get("level"), 2)})
            elif kind == "decks":
                owner = _i(_req(row, "ownerId", kind))
                norm.append({"id": _s(_req(row, "id", kind)), "title": _s(row.get("title"), 255) or "", "level": _s(row.get("level"), 10),
                             "ownerId": owner})
            elif kind == "cards":
                term = _s(_req(row, "term", kind), 200) or ""
                reading = _s(row.get("reading"), 200)
                key, kanji = enrich_card(term, reading)
                norm.append({"id": _s(_req(row, "id", kind)), "deckId": _s(_req(row, "deckId", kind)),
                             "ownerId": _i(_req(row, "ownerId", kind)), "term": term, "reading": kata_to_hira(reading) if reading else None,
                             "meaning": _s(row.get("meaning"), MEANING_MAX), "pos": _i(row.get("pos")) or 0,
                             "wordKey": key, "kanji": kanji})
            elif kind == "reviews":
                norm.append({"userId": _i(_req(row, "userId", kind)), "cardId": _s(_req(row, "cardId", kind)),
                             "ease": _f(row.get("ease")), "intervalDays": _i(row.get("intervalDays")), "reps": _i(row.get("reps")) or 0,
                             "dueAt": _s(row.get("dueAt"), 40), "again30d": _i(row.get("again30d")) or 0, "lastAt": _s(row.get("lastAt"), 40)})
            elif kind == "paths":
                norm.append({"id": _s(_req(row, "id", kind)), "userId": _i(_req(row, "userId", kind)),
                             "title": _s(row.get("title"), 100) or "", "status": _s(row.get("status"), 12)})
            elif kind == "chapters":
                norm.append({"id": _s(_req(row, "id", kind)), "pathId": _s(_req(row, "pathId", kind)),
                             "ownerId": _i(_req(row, "ownerId", kind)), "title": _s(row.get("title"), 100) or "",
                             "position": _i(row.get("position")) or 0, "deckId": _s(row.get("deckId"))})
            elif kind == "pathCards":
                norm.append({"chapterId": _s(_req(row, "chapterId", kind)), "cardId": _s(_req(row, "cardId", kind)),
                             "seq": _i(row.get("seq")) or 0, "day": _i(row.get("day")) or 0})
            elif kind == "meanings":
                norm.append({"key": _s(_req(row, "key", kind), 64), "vi": _s(row.get("vi"), 500)})
        if norm:
            out[kind] = norm
    return out


def apply(graph, payload: dict) -> dict[str, int]:
    """Ghi một lô; trả số dòng mỗi loại. ``run`` bắt buộc."""
    run = _s(payload.get("run"), 64)
    if not run:
        raise SyncError("thiếu run")
    rows = normalize(payload)
    written: dict[str, int] = {}
    params = {"run": run}
    for kind in ORDER:
        items = rows.get(kind)
        if not items:
            continue
        written[kind] = graph.run_batches(CYPHER[kind], items, params)
        if kind == "cards":
            graph.run_batches(CYPHER["cards_moved"], items)
            graph.run_batches(CYPHER["cards_unlink"], items)
            with_key = [c for c in items if c["wordKey"]]
            if with_key:
                graph.run_batches(CYPHER["cards_means"], with_key)
            with_kanji = [c for c in items if c["kanji"]]
            if with_kanji:
                graph.run_batches(CYPHER["cards_contains"], with_kanji)
    return written


def finish_statements(scope: str, user_id: Optional[int]) -> list[tuple[str, dict]]:
    """Các câu Cypher dọn dữ liệu không thuộc ``run`` (tách ra để test không cần Neo4j)."""
    if scope not in SCOPES:
        raise SyncError("scope phải là all | user")
    out: list[tuple[str, dict]] = []
    if scope == "all":
        for label in schema.LEARNER_LABELS:
            out.append((f"MATCH (n:{label}) WHERE n.run IS NULL OR n.run <> $run "
                        "CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 2000 ROWS", {}))
        rels = "|".join(schema.LEARNER_RELS)
        out.append((f"MATCH ()-[r:{rels}]->() WHERE r.run IS NULL OR r.run <> $run "
                    "CALL (r) { DELETE r } IN TRANSACTIONS OF 5000 ROWS", {}))
        return out
    if user_id is None:
        raise SyncError("scope user cần userId")
    for label in ("Deck", "Card", "Path", "Chapter"):
        out.append((f"MATCH (n:{label} {{ownerId: $uid}}) WHERE n.run IS NULL OR n.run <> $run "
                    "CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 2000 ROWS", {"uid": user_id}))
    out.append(("MATCH (u:User {id: $uid})-[r:REVIEWS|OWNS|FOLLOWS]->() WHERE r.run IS NULL OR r.run <> $run DELETE r", {"uid": user_id}))
    out.append(("MATCH (d:Deck {ownerId: $uid})-[r:HAS_CARD]->() WHERE r.run IS NULL OR r.run <> $run DELETE r", {"uid": user_id}))
    out.append(("MATCH (p:Path {ownerId: $uid})-[r:HAS_CHAPTER]->() WHERE r.run IS NULL OR r.run <> $run DELETE r", {"uid": user_id}))
    out.append(("MATCH (c:Chapter {ownerId: $uid})-[r:SCHEDULES|FROM_DECK]->() WHERE r.run IS NULL OR r.run <> $run DELETE r",
                {"uid": user_id}))
    return out


def finish(graph, run: str, scope: str = "all", user_id: Optional[int] = None) -> dict:
    run = _s(run, 64)
    if not run:
        raise SyncError("thiếu run")
    for cypher, params in finish_statements(scope, user_id):
        graph.run(cypher, {**params, "run": run})
    graph.run("MERGE (m:Meta {id: 'learner'}) SET m.lastRun = $run, m.syncedAt = datetime(), m.scope = $scope",
              {"run": run, "scope": scope})
    return {"run": run, "scope": scope, "userId": user_id}
