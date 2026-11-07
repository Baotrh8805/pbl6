"""Kết nối Neo4j: driver tạo lười, mọi lỗi kết nối / xác thực gói thành GraphUnavailable (router → 503 graphUnavailable).

Chỉ ai-service nối Neo4j (spec §2); backend đi qua /api/graph/*. Cấu hình NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD
(app/core/config.py). ``run`` dùng giao dịch tự commit (một câu Cypher = một giao dịch) nên dùng được cả
``CALL {...} IN TRANSACTIONS`` cho các lệnh xoá / ghi lớn; ``run_batches`` cắt danh sách dòng thành lô UNWIND.
Test thay bằng FakeGraph qua ``set_graph``.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

BATCH = 2000
MIN_NEO4J = "5.23"   # CALL (n) { ... } IN TRANSACTIONS (builder / sync dọn theo lô)


class GraphUnavailable(RuntimeError):
    """Neo4j không nối được / sai mật khẩu / chưa chạy. Router trả 503 {"detail": "graphUnavailable"}."""


def _plain(value: Any) -> Any:
    """Giá trị Neo4j (DateTime, Node, Relationship, Path) → kiểu JSON thuần để FastAPI trả được."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    iso = getattr(value, "iso_format", None)
    if callable(iso):
        try:
            return iso()
        except Exception:  # noqa: BLE001
            return str(value)
    items = getattr(value, "items", None)   # Node / Relationship có .items()
    if callable(items):
        return {k: _plain(v) for k, v in items()}
    return str(value)


class Graph:
    """Bọc driver neo4j. ``run`` → list[dict] (mỗi bản ghi một dict, giá trị đã chuyển sang JSON thuần)."""

    def __init__(self, uri: str, user: str, password: str, database: str = "neo4j"):
        self.uri, self.user, self.password, self.database = uri, user, password, database
        self._driver = None
        self._lock = threading.Lock()

    def _get(self):
        if self._driver is None:
            with self._lock:
                if self._driver is None:
                    try:
                        from neo4j import GraphDatabase
                        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password),
                                                            connection_timeout=5.0, max_connection_pool_size=20)
                    except Exception as exc:  # noqa: BLE001 (driver thiếu / URI hỏng)
                        raise GraphUnavailable(f"Neo4j: {exc}") from exc
        return self._driver

    def available(self) -> bool:
        try:
            self._get().verify_connectivity()
            return True
        except GraphUnavailable:
            return False
        except Exception as exc:  # noqa: BLE001
            logger.debug("neo4j không sẵn sàng: %s", exc)
            return False

    def run(self, cypher: str, params: Optional[dict] = None) -> list[dict]:
        from neo4j.exceptions import AuthError, ConfigurationError, ServiceUnavailable, SessionExpired
        try:
            with self._get().session(database=self.database) as session:
                result = session.run(cypher, params or {})
                return [_plain(record.data()) for record in result]
        except (ServiceUnavailable, SessionExpired, AuthError, ConfigurationError, OSError) as exc:
            raise GraphUnavailable(f"Neo4j: {exc}") from exc

    def run_batches(self, cypher: str, rows: list[dict], params: Optional[dict] = None, batch: int = BATCH) -> int:
        """Chạy ``cypher`` (dùng ``$rows``) theo lô; trả số dòng đã gửi. Danh sách rỗng → không gọi."""
        sent = 0
        for i in range(0, len(rows), batch):
            chunk = rows[i:i + batch]
            self.run(cypher, {**(params or {}), "rows": chunk})
            sent += len(chunk)
        return sent

    def close(self) -> None:
        if self._driver is not None:
            try:
                self._driver.close()
            finally:
                self._driver = None


_graph: Optional[Graph] = None
_graph_lock = threading.Lock()


def get_graph() -> Graph:
    global _graph
    if _graph is None:
        with _graph_lock:
            if _graph is None:
                uri = settings.NEO4J_URI
                if settings.NEO4J_PASSWORD == "password123" and not any(h in uri for h in ("localhost", "127.0.0.1", "::1")):
                    logger.warning("NEO4J_PASSWORD đang là mặc định dev mà NEO4J_URI=%s không phải localhost: đổi mật khẩu khi triển khai", uri)
                _graph = Graph(uri, settings.NEO4J_USER, settings.NEO4J_PASSWORD)
    return _graph


def set_graph(graph: Optional[Graph]) -> None:
    """Test / tiện ích thay kết nối (FakeGraph hoặc Neo4j test); None = tạo lại từ cấu hình ở lần dùng sau."""
    global _graph
    with _graph_lock:
        if _graph is not None and _graph is not graph:
            try:
                _graph.close()
            except Exception:  # noqa: BLE001
                pass
        _graph = graph
