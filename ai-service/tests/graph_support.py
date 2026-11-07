"""Dùng chung cho test đồ thị: FakeGraph (ghi lại Cypher, trả bản ghi theo handler) và dữ liệu tí hon (jmdict_mini + vài mục
JLPT giả) để dựng lớp tham chiếu mà không cần jmdict.sqlite / danh sách JLPT thật. Dữ liệu chữ Hán (Unihan, bộ thủ, KRADFILE,
nghĩa) dùng bản đã commit."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Callable, Optional

from app.extract import dictionary, example_vi, jmdict, overrides
from app.extract.jlpt import classifier
from app.graph.client import GraphUnavailable

FIXTURE = Path(__file__).parent / "fixtures" / "jmdict_mini.json"
SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "build_dicts.py"
JLPT_INDEX = {("食べる", "たべる"): "N5", ("学校", "がっこう"): "N5", ("召し上がる", "めしあがる"): "N4", ("日本", "にほん"): "N5"}
# (expression, reading, meaning, level) như classifier._entries; 箸 / 橋 đồng âm, không có trong jmdict_mini → khoá w:jlpt:
JLPT_ENTRIES = [
    ("食べる", "たべる", "to eat", "N5"), ("学校", "がっこう", "school", "N5"), ("日本", "にほん", "Japan", "N5"),
    ("箸", "はし", "chopsticks", "N5"), ("橋", "はし", "bridge", "N4"), ("召し上がる", "めしあがる", "to eat (honorific)", "N4"),
    ("ご飯", "ごはん", "cooked rice; meal", "N5"),
]
EXAMPLE_VI = {"222600": "Trường này có nhiều học sinh."}   # bản dịch Việt giả cho một câu của 学校 (tatoeba 222600)


def _build_module():
    spec = importlib.util.spec_from_file_location("build_dicts_for_graph_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _entries_containing(ch: str):
    return [e for e in JLPT_ENTRIES if ch in e[0]]


def install_tiny_data(tmp_path, monkeypatch) -> Path:
    """jmdict_mini → sqlite trong tmp_path; classifier / example_vi thay bằng bảng tí hon. Trả đường dẫn sqlite."""
    path = tmp_path / "jmdict.sqlite"
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    _build_module().write_jmdict(data, path, JLPT_INDEX)
    monkeypatch.setattr(jmdict, "DATA_FILE", path)
    monkeypatch.setattr(jmdict, "_conn", None)
    monkeypatch.setattr(overrides, "DATA_FILE", tmp_path / "dict_overrides.json")
    overrides.reset_for_tests()
    jmdict.lookup.cache_clear()
    dictionary._has_table.cache_clear()
    dictionary.clear_cache()
    monkeypatch.setattr(classifier, "_by_pair", {})            # "đã nạp": _load() không đọc CSV thật
    monkeypatch.setattr(classifier, "_entries", list(JLPT_ENTRIES))
    monkeypatch.setattr(classifier, "entries_containing", _entries_containing)
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset(ch for e in JLPT_ENTRIES for ch in e[0] if "一" <= ch <= "鿿"))
    monkeypatch.setattr(example_vi, "available", lambda: False)
    monkeypatch.setattr(example_vi, "get", lambda tid: EXAMPLE_VI.get(str(tid)))
    return path


def teardown_tiny_data() -> None:
    if jmdict._conn is not None:
        jmdict._conn.close()
    overrides.reset_for_tests()
    jmdict.lookup.cache_clear()
    dictionary._has_table.cache_clear()
    dictionary.clear_cache()


class FakeGraph:
    """Ghi lại mọi Cypher; ``handler(cypher, params)`` trả bản ghi (mặc định rỗng). available=False → GraphUnavailable."""

    def __init__(self, handler: Optional[Callable[[str, dict], list[dict]]] = None, available: bool = True):
        self.calls: list[tuple[str, dict]] = []
        self.handler = handler
        self._available = available

    def available(self) -> bool:
        return self._available

    def run(self, cypher: str, params: Optional[dict] = None) -> list[dict]:
        params = params or {}
        self.calls.append((cypher, params))
        if not self._available:
            raise GraphUnavailable("down")
        return self.handler(cypher, params) if self.handler else []

    def run_batches(self, cypher: str, rows: list[dict], params: Optional[dict] = None, batch: int = 2000) -> int:
        if not self._available:
            raise GraphUnavailable("down")
        self.calls.append((cypher, {**(params or {}), "rows": rows}))
        return len(rows)

    def close(self) -> None:
        pass

    def cyphers(self, needle: str) -> list[tuple[str, dict]]:
        return [(c, p) for c, p in self.calls if needle in c]


def node_row(label: str, props: dict, eid: Optional[str] = None) -> dict:
    """Bản ghi như resolve() / neighbors() mong đợi."""
    return {"label": label, "props": props, "eid": eid or f"eid-{label}-{props.get('key') or props.get('char') or props.get('id') or props.get('reading')}"}


def neighbor_row(rtype: str, outward: bool, label: str, props: dict, rprops: Optional[dict] = None) -> dict:
    r = node_row(label, props)
    r.update({"type": rtype, "outward": outward, "rprops": rprops or {}})
    return r
