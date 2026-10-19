"""Khử nhập nhằng cách đọc theo ngữ cảnh cho từ đồng tự dị âm (B5, data/heteronyms.yaml).

Sudachi gần như gắn MỘT cách đọc cho mỗi lemma bất kể câu (開い luôn ひらい, 辛かっ luôn つらかっ, 抱い luôn いだい), nên
"ドアが開いている" / "カレーが辛い" / "子供を抱いて" nhận furigana sai. Ở đây chỉ đổi khi ngữ cảnh có DẤU HIỆU (cue) rõ
của một cách đọc: mỗi cách đọc được chấm bằng số cue khớp trong các cửa sổ ngữ cảnh; cách đọc điểm cao nhất DUY NHẤT
(> 0) thắng. Không cue nào khớp / hoà điểm → giữ cách đọc Sudachi (bảng chỉ là heuristic, sai một cách im lặng tệ hơn
không sửa). Người gọi hạ levelConfidence và ghi readingNote để người dùng xem lại thẻ đã đổi.

Thiếu file / thiếu PyYAML / YAML hỏng → bảng rỗng, mọi hàm trả "không đổi" (service vẫn chạy như trước B5).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from app.extract.jachars import kata_to_hira

DATA_FILE = Path(__file__).parent / "data" / "heteronyms.yaml"
# Cửa sổ ngữ cảnh quanh từ (ký tự mỗi bên): cue như "が開い" nằm sát từ, cue chủ đề (カレー, 仕事) thường trong cùng
# mệnh đề; cả câu dài (PDF không có 。) thì cue ở xa dễ là của mệnh đề khác.
CONTEXT_WINDOW = 30
MAX_SPAN_TOKENS = 3   # từ trong bảng bị Sudachi tách nhiều token (一日 = 一 + 日) — ghép lại ở câu ví dụ


@dataclass(frozen=True)
class Reading:
    reading: str
    cues: tuple[str, ...]


Table = dict[str, tuple[Reading, ...]]

_table: Optional[Table] = None


def parse_table(raw: Any) -> Table:
    """List YAML → {term: (Reading, …)} (hàm thuần). Bỏ qua mục hỏng (thiếu term, < 2 cách đọc, cue không phải chuỗi)
    thay vì làm hỏng cả bảng: một dòng biên soạn sai không được tắt tính năng cho mọi từ khác."""
    table: Table = {}
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict) or not isinstance(entry.get("term"), str) or not entry["term"].strip():
            continue
        readings: list[Reading] = []
        for r in entry.get("readings") or []:
            if not isinstance(r, dict) or not isinstance(r.get("reading"), str) or not r["reading"].strip():
                continue
            cues = tuple(c for c in (r.get("cues") or []) if isinstance(c, str) and c.strip())
            readings.append(Reading(kata_to_hira(r["reading"].strip()), cues))
        if len(readings) >= 2:
            table[entry["term"].strip()] = tuple(readings)
    return table


def load_table(path: Path = DATA_FILE) -> Table:
    """Bảng nạp lười một lần (cache cả kết quả rỗng khi thiếu file như các bảng dữ liệu khác)."""
    global _table
    if _table is None:
        try:
            import yaml
            with open(path, encoding="utf-8") as fh:
                _table = parse_table(yaml.safe_load(fh))
        except Exception:
            _table = {}
    return _table


def available() -> bool:
    return bool(load_table())


def is_heteronym(term: str, table: Optional[Table] = None) -> bool:
    return term in (load_table() if table is None else table)


def window(text: str, begin: int, end: int, size: int = CONTEXT_WINDOW) -> str:
    """Cửa sổ ngữ cảnh [begin - size, end + size) quanh từ (gồm cả từ, để cue có trợ từ dính liền như "が開い" khớp)."""
    return text[max(0, begin - size):end + size]


def resolve(term: str, current: Optional[str], contexts: Iterable[str],
            table: Optional[Table] = None) -> Optional[tuple[str, str]]:
    """(cách đọc mới, cue quyết định) khi ngữ cảnh chọn một cách đọc KHÁC ``current``; None = giữ nguyên.

    Điểm của mỗi cách đọc = số cặp (ngữ cảnh, cue) khớp (chuỗi con, không phân biệt hoa thường cho nghĩa EN / VI in
    sẵn ở bố cục danh sách). Chỉ đổi khi một cách đọc có điểm cao nhất duy nhất: "カレーは辛いが仕事も辛い" hoà → giữ
    Sudachi. Cue trả về là cue khớp đầu tiên của cách đọc thắng (theo thứ tự ngữ cảnh rồi thứ tự cue trong YAML)."""
    options = (load_table() if table is None else table).get(term)
    if not options:
        return None
    ctx = [c.casefold() for c in contexts if c]
    if not ctx:
        return None
    scored: list[tuple[int, Optional[str], Reading]] = []
    for opt in options:
        hits, first = 0, None
        for c in ctx:
            for cue in opt.cues:
                if cue.casefold() in c:
                    hits += 1
                    first = first or cue
        scored.append((hits, first, opt))
    best = max(s[0] for s in scored)
    winners = [s for s in scored if s[0] == best]
    if best == 0 or len(winners) != 1:
        return None
    _, cue, opt = winners[0]
    if current is not None and kata_to_hira(current) == opt.reading:
        return None
    return opt.reading, cue or ""
