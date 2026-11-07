"""Vẽ chữ Hán để tra (cải tiến từ điển 26/10): nhận dạng nét vẽ tay → danh sách chữ gần nhất, dùng lại nét mẫu KanjiVG
(kanji_strokes.json, ~2 000 chữ) và cách chuẩn hoá của bộ chấm nét luyện viết (stroke_score).

Cách so (nhanh, không cần mô hình học máy):
  1. Chuẩn hoá cả chữ người vẽ về hộp 0..1 như nét mẫu (stroke_score.normalize_glyph), lấy lại mỗi nét 16 điểm.
  2. Ứng viên: chữ có số nét lệch tối đa MAX_COUNT_DIFF so với số nét đã vẽ (người học hay thiếu / thừa một nét).
  3. Chi phí nét i ↔ nét mẫu j = khoảng cách trung bình giữa 16 cặp điểm; vẽ ngược chiều chỉ bị phạt nhẹ (REVERSE_PENALTY).
  4. Lọc sơ bộ bằng cận dưới rẻ (mỗi nét lấy nét mẫu gần nhất) giữ KEEP ứng viên mỗi số nét, rồi ghép nét tối ưu (Hungarian,
     scipy) → chi phí ghép trung bình; khi số nét bằng nhau cộng thêm phần "đúng thứ tự" (nét thứ i ↔ nét mẫu thứ i); phạt nhẹ
     mỗi nét lệch số lượng. Điểm càng nhỏ càng giống.
Đo trên 150 chữ ngẫu nhiên (nét mẫu + nhiễu 3 %, khung lệch tỉ lệ): đúng hạng 1 khi vẽ sạch 150/150, đổi thứ tự hai nét ~146/150,
thiếu một nét ~144/148 (tính lúc chỉnh tham số 26/10, test_handwriting.py giữ ngưỡng thấp hơn để không giòn).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Sequence

import numpy as np
from scipy.optimize import linear_sum_assignment

from app.extract import kanjidata, stroke_score

N_POINTS = 16
MAX_COUNT_DIFF = 2
REVERSE_PENALTY = 0.04
ORDER_WEIGHT = 0.2
COUNT_PENALTY = 0.03
KEEP = 150
MAX_STROKES = 40
MAX_POINTS = 500
DEFAULT_LIMIT = 10
MAX_LIMIT = 30

_IDX = np.linspace(0, 31, N_POINTS).round().astype(int)   # 32 điểm mẫu → 16 điểm


@lru_cache(maxsize=1)
def _model() -> dict[int, tuple[list[str], np.ndarray]]:
    """{số nét: (danh sách chữ, mảng (m, k, 16, 2))} dựng một lần từ kanji_strokes.json (thiếu tệp → rỗng)."""
    groups: dict[int, tuple[list[str], list[np.ndarray]]] = {}
    for ch, packed in kanjidata._table("kanjivg").items():
        try:
            arr = np.stack([np.asarray(s, dtype=float).reshape(-1, 2) for s in packed])
        except ValueError:      # nét không đủ 32 điểm (dữ liệu tay) → lấy lại mẫu từng nét
            arr = np.stack([np.asarray(stroke_score.resample(np.asarray(s, dtype=float).reshape(-1, 2), 32)) for s in packed])
        if arr.shape[1] != 32:
            continue
        groups.setdefault(arr.shape[0], ([], []))
        groups[arr.shape[0]][0].append(ch)
        groups[arr.shape[0]][1].append(arr[:, _IDX, :])
    return {k: (chars, np.stack(arrs).astype(np.float32)) for k, (chars, arrs) in groups.items()}


def available() -> bool:
    return bool(_model())


def size() -> int:
    return sum(len(chars) for chars, _ in _model().values())


def _prepare(strokes: Sequence[Sequence[Sequence[float]]]) -> np.ndarray | None:
    pts = [[(float(p[0]), float(p[1])) for p in s] for s in strokes if len(s)]
    if not pts:
        return None
    norm = stroke_score.normalize_glyph(pts)
    return np.asarray([stroke_score.resample(s, N_POINTS) for s in norm], dtype=np.float32)


def recognize(strokes: Sequence[Sequence[Sequence[float]]], limit: int = DEFAULT_LIMIT) -> list[dict]:
    """[{char, score}] giống nhất trước (score ≥ 0, nhỏ = giống). Không có nét / thiếu dữ liệu → []."""
    user = _prepare(strokes[:MAX_STROKES])
    model = _model()
    if user is None or not model:
        return []
    n = len(user)
    limit = max(1, min(limit, MAX_LIMIT))
    scored: list[tuple[float, str]] = []
    for k in range(max(1, n - MAX_COUNT_DIFF), n + MAX_COUNT_DIFF + 1):
        if k not in model:
            continue
        chars, refs = model[k]                                           # refs (m, k, 16, 2)
        fwd = np.linalg.norm(user[None, :, None] - refs[:, None], axis=-1).mean(axis=-1)            # (m, n, k)
        rev = np.linalg.norm(user[None, :, None, ::-1] - refs[:, None], axis=-1).mean(axis=-1)
        cost = np.minimum(fwd, rev + REVERSE_PENALTY)
        # cận dưới rẻ: mỗi nét (phía ít nét hơn) lấy nét gần nhất phía kia; chỉ giữ KEEP chữ tốt nhất cho bước ghép tối ưu
        bound = cost.min(axis=2).mean(axis=1) if n <= k else cost.min(axis=1).mean(axis=1)
        for idx in np.argsort(bound)[:KEEP]:
            r, c = linear_sum_assignment(cost[idx])
            matched = float(cost[idx][r, c].mean())
            # thứ tự nét chỉ so được khi số nét bằng nhau; thiếu / thừa nét làm lệch chỉ số nên chỉ dùng phần ghép
            order = float(np.diagonal(cost[idx]).mean()) if n == k else matched
            score = (1 - ORDER_WEIGHT) * matched + ORDER_WEIGHT * order + COUNT_PENALTY * abs(n - k)
            scored.append((score, chars[idx]))
    scored.sort()
    return [{"char": ch, "score": round(s, 4)} for s, ch in scored[:limit]]
