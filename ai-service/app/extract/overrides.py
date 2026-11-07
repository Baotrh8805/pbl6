"""Bản sao lớp ghi đè từ điển của admin (spec 2026-10-26-tu-dien-design §4.6, quyết định D22).

Backend là chủ dữ liệu (bảng dict_overrides) và đẩy TOÀN BỘ danh sách sang qua POST /dict/overrides (lúc khởi động, sau mỗi lần
admin sửa, 10 phút / lần). ai-service giữ trong RAM + ghi data/dict_overrides.json (ghi .tmp rồi os.replace) để khởi động lại
vẫn có ngay, không chờ lần đẩy kế tiếp.

Khoá: (entry_key, field, sub_key). entry_key = "w:<id JMdict>" | "w:jlpt:<expr>|<reading>" | "k:<chữ>".
field: reading | han_viet | meaning_en | kanji_meaning | example_jpn | example_eng | example_hidden.
Giá trị None / rỗng không được lưu (backend gửi danh sách hiện hành, xoá = không gửi).
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Iterable, Optional

FIELDS = ("reading", "han_viet", "meaning_en", "kanji_meaning", "example_jpn", "example_eng", "example_hidden")
DATA_FILE = Path(__file__).parent / "data" / "dict_overrides.json"

_lock = threading.Lock()
_store: dict[tuple[str, str, str], str] = {}
_version: int = 0
_loaded = False


def _load_file() -> None:
    global _loaded, _version
    if _loaded:
        return
    _loaded = True
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    _apply(raw.get("items") or [], int(raw.get("version") or 0), persist=False)


def _apply(items: Iterable[dict], version: int, persist: bool) -> int:
    global _store, _version
    new: dict[tuple[str, str, str], str] = {}
    for it in items:
        key, field = str(it.get("key") or ""), str(it.get("field") or "")
        if not key or field not in FIELDS:
            raise ValueError(f"trường ghi đè không hợp lệ: {field!r}")
        value = it.get("value")
        if value is None or str(value).strip() == "":
            continue
        new[(key, field, str(it.get("subKey") or ""))] = str(value).strip()
    _store, _version = new, version
    if persist:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = DATA_FILE.with_suffix(".json.tmp")
        payload = {"version": version, "items": [{"key": k, "field": f, "subKey": s, "value": v}
                                                 for (k, f, s), v in new.items()]}
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, DATA_FILE)
    _clear_caches()
    return len(new)


def _clear_caches() -> None:
    # Các hàm tra cứu có lru_cache phải quên kết quả cũ khi ghi đè đổi
    from app.extract import jmdict  # noqa: PLC0415 (tránh vòng import)
    jmdict.lookup.cache_clear()
    try:
        from app.extract import dictionary  # noqa: PLC0415
        dictionary.clear_cache()
    except ImportError:  # pragma: no cover
        pass


def replace(items: list[dict], version: int) -> int:
    """Thay toàn bộ bản sao (POST /dict/overrides). Trường lạ → ValueError (router trả 400). Trả số mục giữ lại."""
    with _lock:
        _load_file()
        return _apply(items, version, persist=True)


def version() -> int:
    with _lock:
        _load_file()
        return _version


def get(key: str, field: str, sub_key: str = "") -> Optional[str]:
    if not _loaded:
        with _lock:
            _load_file()
    return _store.get((key, field, sub_key))


def han_viet(ch: str) -> Optional[str]:
    """Âm Hán-Việt admin sửa cho một chữ (viết hoa như bảng Unihan)."""
    v = get(f"k:{ch}", "han_viet")
    return v.upper() if v else None


def kanji_meaning(ch: str) -> Optional[str]:
    return get(f"k:{ch}", "kanji_meaning")


def word(word_key: str, field: str) -> Optional[str]:
    return get(word_key, field)


def example(word_key: str, tatoeba_id: str) -> dict:
    """{jpn, eng, hidden} ghi đè cho một câu ví dụ (trường không có → None / False)."""
    return {"jpn": get(word_key, "example_jpn", tatoeba_id), "eng": get(word_key, "example_eng", tatoeba_id),
            "hidden": (get(word_key, "example_hidden", tatoeba_id) or "").lower() in ("1", "true", "yes")}


def count() -> int:
    if not _loaded:
        with _lock:
            _load_file()
    return len(_store)


def reset_for_tests() -> None:
    global _store, _version, _loaded
    with _lock:
        _store, _version, _loaded = {}, 0, True
