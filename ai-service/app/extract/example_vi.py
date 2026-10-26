"""Bản dịch tiếng Việt dịch sẵn cho câu ví dụ Tatoeba của từ điển (cải tiến 26/10, xem data/README.md).

data/example_vi.csv: tatoeba_id,vi — một dòng mỗi câu (câu Tatoeba dùng chung cho nhiều mục từ chỉ dịch một lần). Không có tệp thì
mọi hàm trả rỗng: từ điển vẫn chạy, câu ví dụ hiện tiếng Anh như trước. Bản admin sửa / bản Gemini (backend, dict_example_vi) luôn
thắng bản dịch sẵn này — ai-service chỉ đưa "viSeed", backend chọn.
"""
from __future__ import annotations

import csv
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Optional

DATA_FILE = Path(__file__).parent / "data" / "example_vi.csv"


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    if not DATA_FILE.exists():
        return {}
    out: dict[str, str] = {}
    with open(DATA_FILE, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            tid, vi = (row.get("tatoeba_id") or "").strip(), (row.get("vi") or "").strip()
            if tid and vi:
                out[tid] = vi
    return out


def clear_cache() -> None:
    _table.cache_clear()
    _folded.cache_clear()


def available() -> bool:
    return bool(_table())


def count() -> int:
    return len(_table())


def get(tatoeba_id: str) -> Optional[str]:
    return _table().get(str(tatoeba_id))


def fold(text: str) -> str:
    """Chữ thường, bỏ dấu tiếng Việt (đ → d) để tìm "an com" ra "ăn cơm"."""
    t = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return "".join(ch for ch in t if unicodedata.category(ch) != "Mn")


@lru_cache(maxsize=1)
def _folded() -> list[tuple[str, str, str]]:
    return [(tid, vi.casefold(), fold(vi)) for tid, vi in _table().items()]


def search(q: str, limit: int) -> list[str]:
    """tatoeba_id có bản dịch chứa q (khớp nguyên dấu trước; q không dấu thì khớp cả bản bỏ dấu)."""
    ql = q.strip().casefold()
    if not ql:
        return []
    qf = fold(ql)
    loose = qf == ql  # người dùng gõ không dấu
    exact, folded = [], []
    for tid, vi_l, vi_f in _folded():
        if ql in vi_l:
            exact.append(tid)
        elif loose and qf in vi_f:
            folded.append(tid)
        if len(exact) >= limit:
            break
    return (exact + folded)[:limit]
