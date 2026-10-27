"""Nhãn, ràng buộc và chỉ mục của đồ thị (spec §3). ``ensure`` idempotent (IF NOT EXISTS)."""
from __future__ import annotations

# Lớp tham chiếu: dựng từ dữ liệu ai-service; xoá / dựng lại không đụng lớp người học
REFERENCE_LABELS = ("Word", "Kanji", "Radical", "Component", "HanViet", "Grammar", "Sentence")
# Lớp người học: đồng bộ từ Postgres; mỗi node có ownerId (trừ User) và run (mã lần đồng bộ)
LEARNER_LABELS = ("User", "Deck", "Card", "Path", "Chapter")
LEARNER_RELS = ("OWNS", "HAS_CARD", "REVIEWS", "FOLLOWS", "HAS_CHAPTER", "FROM_DECK", "SCHEDULES")
# Quan hệ lớp tham chiếu (đường nối ngắn nhất chỉ đi qua các quan hệ này → không lộ dữ liệu người khác)
REFERENCE_RELS = ("CONTAINS", "HAS_RADICAL", "HAS_COMPONENT", "READ_AS", "HOMOPHONE_OF", "LOOKS_LIKE", "EXAMPLE_OF",
                  "USES_GRAMMAR")

UNIQUE = (
    ("word_key", "Word", "key"), ("kanji_char", "Kanji", "char"), ("radical_no", "Radical", "no"),
    ("component_char", "Component", "char"), ("hanviet_reading", "HanViet", "reading"), ("grammar_id", "Grammar", "id"),
    ("sentence_id", "Sentence", "id"), ("user_id", "User", "id"), ("deck_id", "Deck", "id"), ("card_id", "Card", "id"),
    ("path_id", "Path", "id"), ("chapter_id", "Chapter", "id"), ("meta_id", "Meta", "id"),
)
INDEXES = (
    ("word_term", "Word", "term"), ("word_reading", "Word", "reading"), ("word_jlpt", "Word", "jlpt"),
    ("hanviet_fold", "HanViet", "fold"), ("grammar_name", "Grammar", "name"), ("card_term", "Card", "term"),
    ("card_owner", "Card", "ownerId"), ("deck_owner", "Deck", "ownerId"), ("path_owner", "Path", "ownerId"),
    ("chapter_owner", "Chapter", "ownerId"), ("card_run", "Card", "run"), ("deck_run", "Deck", "run"),
    ("path_run", "Path", "run"), ("chapter_run", "Chapter", "run"), ("user_run", "User", "run"),
)


def statements() -> list[str]:
    out = [f"CREATE CONSTRAINT {name} IF NOT EXISTS FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE" for name, label, prop in UNIQUE]
    out += [f"CREATE INDEX {name} IF NOT EXISTS FOR (n:{label}) ON (n.{prop})" for name, label, prop in INDEXES]
    return out


def ensure(graph) -> int:
    """Tạo ràng buộc + chỉ mục còn thiếu; trả số câu lệnh đã chạy."""
    stmts = statements()
    for s in stmts:
        graph.run(s)
    return len(stmts)
