"""Dữ liệu chữ Hán cho lộ trình học và luyện viết (spec lộ trình 2 §0.1 LP-17).

Năm nguồn, mỗi nguồn một file trong data/ do scripts/build_dicts.py dựng:
  unihan_rs.csv       (commit)        bộ thủ Khang Hi + số nét   ← Unihan kRSUnicode / kTotalStrokes
  kradfile.csv        (commit)        thành phần phẳng (bộ gõ)   ← KRADFILE (EDRDG)
  kanji_parts.csv     (commit)        cây phân rã + chỉ âm       ← KanjiVG kvg:element / kvg:phon (sơ đồ /graph, spec 2026-10-30)
  kanji_strokes.json  (không commit)  nét viết mẫu, 32 điểm/nét  ← KanjiVG
  pitch_accent.csv    (không commit)  trọng âm (mora rơi)        ← kanjium

Nạp lười và độc lập từng file: thiếu file nào thì hàm tương ứng trả None / rỗng và
availability() báo False cho /extract/health; service vẫn chạy (như jmdict.py, kanji_readings.py).
"""
from __future__ import annotations

import csv
import json
import threading
from array import array
from pathlib import Path
from typing import Callable, NamedTuple, Optional

from app.extract.jachars import is_kana_only, kata_to_hira

DATA_DIR = Path(__file__).parent / "data"
RS_FILE = DATA_DIR / "unihan_rs.csv"
KRAD_FILE = DATA_DIR / "kradfile.csv"
PARTS_FILE = DATA_DIR / "kanji_parts.csv"
STROKES_FILE = DATA_DIR / "kanji_strokes.json"
PITCH_FILE = DATA_DIR / "pitch_accent.csv"

Point = tuple[float, float]
Stroke = list[Point]


class Parts(NamedTuple):
    """Một dòng kanji_parts.csv: con trực tiếp theo thứ tự viết (時 → 日 寺), biến thể → chữ gốc (扌 → 手), vị trí KanjiVG,
    part là bộ thủ, part mang chỉ âm và chỉ âm đã chuẩn hoá (寺 có part 土 mang phon 之)."""
    parts: tuple[str, ...]
    originals: tuple[Optional[str], ...]
    positions: tuple[Optional[str], ...]
    radical_part: Optional[str]
    phon_part: Optional[str]
    phon: Optional[str]

_cache: dict[str, object] = {}  # tên nguồn → bảng đã nạp; reset() xoá để test nạp lại
_lock = threading.Lock()        # nạp lười chạy đúng một lần dù nhiều request đầu tiên đến cùng lúc (threadpool)


# ----------------------------------------------------------------------------- parser (hàm thuần theo path)

def parse_rs_csv(path: Path) -> dict[str, tuple[int, int, int]]:
    """unihan_rs.csv (char,radical_no,residual_strokes,total_strokes) → {chữ: (số bộ, nét ngoài bộ, tổng nét)}.
    Dòng thiếu / không phải số → bỏ qua, không làm sập service."""
    table: dict[str, tuple[int, int, int]] = {}
    if not path.exists():
        return table
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch = (row.get("char") or "").strip()
            try:
                vals = tuple(int(row[k]) for k in ("radical_no", "residual_strokes", "total_strokes"))
            except (KeyError, TypeError, ValueError):
                continue
            if ch:
                table[ch] = vals  # type: ignore[assignment]
    return table


def parse_krad_csv(path: Path) -> dict[str, tuple[str, ...]]:
    """kradfile.csv (kanji,components; thành phần cách nhau bằng khoảng trắng) → {chữ: (tp1, tp2, …)}."""
    table: dict[str, tuple[str, ...]] = {}
    if not path.exists():
        return table
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch = (row.get("kanji") or "").strip()
            comps = tuple((row.get("components") or "").split())
            if ch and comps:
                table[ch] = comps
    return table


def _dash_list(cell: Optional[str], n: int) -> tuple[Optional[str], ...]:
    """'手 -' → ('手', None), bù None cho đủ ``n`` phần tử khi cột thiếu."""
    vals = [None if v == "-" else v for v in (cell or "").split()]
    vals += [None] * (n - len(vals))
    return tuple(vals[:n])


def parse_parts_csv(path: Path) -> dict[str, Parts]:
    """kanji_parts.csv (kanji,parts,originals,positions,radical_part,phon_part,phon; danh sách cách nhau bằng khoảng trắng,
    '-' = không có) → {chữ: Parts}. Dòng thiếu chữ / không có part → bỏ."""
    table: dict[str, Parts] = {}
    if not path.exists():
        return table
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch = (row.get("kanji") or "").strip()
            parts = tuple((row.get("parts") or "").split())
            if not ch or not parts:
                continue
            table[ch] = Parts(parts, _dash_list(row.get("originals"), len(parts)), _dash_list(row.get("positions"), len(parts)),
                              (row.get("radical_part") or "").strip() or None, (row.get("phon_part") or "").strip() or None,
                              (row.get("phon") or "").strip() or None)
    return table


def parse_strokes_json(path: Path) -> dict[str, list[array]]:
    """kanji_strokes.json {"日": [[[x, y], …] mỗi nét]} → {chữ: [array('d', [x0, y0, x1, y1, …]) mỗi nét]}.

    ~2 000 chữ × ~10 nét × 32 điểm ≈ 700k điểm: giữ nguyên list lồng nhau tốn hàng chục MB RAM,
    array phẳng chỉ ~11 MB; strokes() dựng lại tuple khi tra. Chữ có dữ liệu hỏng → bỏ chữ đó.
    """
    table: dict[str, list[array]] = {}
    if not path.exists():
        return table
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    if not isinstance(raw, dict):
        return table
    for ch, strokes in raw.items():
        try:
            packed = [array("d", [float(v) for pt in stroke for v in (pt[0], pt[1])]) for stroke in strokes]
        except (TypeError, ValueError, IndexError):
            continue
        packed = [s for s in packed if s]
        if packed:
            table[ch] = packed
    return table


def parse_pitch_csv(path: Path) -> dict[str, dict[str, int]]:
    """pitch_accent.csv (word,reading,accent_type) → {từ: {cách đọc hiragana: kiểu trọng âm}}; dòng đầu thắng."""
    table: dict[str, dict[str, int]] = {}
    if not path.exists():
        return table
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            word = (row.get("word") or "").strip()
            reading = kata_to_hira((row.get("reading") or "").strip() or word)
            try:
                accent = int(row.get("accent_type") or "")
            except ValueError:
                continue
            if word:
                table.setdefault(word, {}).setdefault(reading, accent)
    return table


# ----------------------------------------------------------------------------- nạp lười

# tên cờ health → (đường dẫn đọc lúc gọi để test monkeypatch được *_FILE, parser)
_SOURCES: dict[str, Callable[[], tuple[Path, Callable[[Path], dict]]]] = {
    "radicals": lambda: (RS_FILE, parse_rs_csv),
    "kradfile": lambda: (KRAD_FILE, parse_krad_csv),
    "kanjivg": lambda: (STROKES_FILE, parse_strokes_json),
    "pitch": lambda: (PITCH_FILE, parse_pitch_csv),
    # camelCase như kanjiStrokes vì availability() đổ thẳng vào /extract/health
    "kanjiParts": lambda: (PARTS_FILE, parse_parts_csv),
}


def _table(name: str) -> dict:
    if name not in _cache:
        with _lock:  # kiểm tra lại trong khoá: thread khác có thể vừa parse xong file 8 MB
            if name not in _cache:
                path, parser = _SOURCES[name]()
                _cache[name] = parser(path)
    return _cache[name]  # type: ignore[return-value]


def reset() -> None:
    """Xoá bảng đã nạp (test đổi đường dẫn file rồi gọi)."""
    _cache.clear()


def availability() -> dict[str, bool]:
    """Cờ cho /extract/health: file nguồn có mặt và không rỗng — chỉ stat, không parse (như jmdict.available()).
    kanji_strokes.json ~8 MB parse mất ~1 s lúc nguội mà backend AiServiceClient.health() chỉ chờ 2 s: health mà kéo
    theo lần nạp lười thì dashboard báo ai-service "down" ngay sau khi khởi động. Parse vẫn lười, ở lần tra cứu đầu."""
    return {name: _present(src()[0]) for name, src in _SOURCES.items()}


def _present(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:  # file vừa bị xoá / không có quyền đọc → coi như chưa có
        return False


# ----------------------------------------------------------------------------- tra cứu

def radical_strokes(ch: str) -> Optional[tuple[int, int]]:
    """(số bộ thủ Khang Hi 1..214, tổng số nét) theo Unihan; không có → None."""
    v = _table("radicals").get(ch)
    return (v[0], v[2]) if v else None


def components(ch: str) -> tuple[str, ...]:
    """Thành phần cấu tạo theo KRADFILE (vd 明 → ('日', '月')); thiếu dữ liệu → ()."""
    return _table("kradfile").get(ch, ())


def parts(ch: str) -> Optional[Parts]:
    """Cây phân rã KanjiVG của một chữ (con trực tiếp); chữ đơn (一 日) hay thiếu dữ liệu → None."""
    if not ch:
        return None
    return _table("kanjiParts").get(ch)


def phon_family(component: str) -> tuple[str, ...]:
    """Các chữ có thành phần chỉ âm ``component`` (寺 → 時 持 待 特 等 詩 侍), xếp theo mã Unicode; không có → ()."""
    if not component:
        return ()
    if "parts_rev" not in _cache:
        table = _table("kanjiParts")  # nạp NGOÀI khoá: _table cũng lấy _lock (không tái nhập) → giữ khoá rồi gọi là deadlock
        with _lock:
            if "parts_rev" not in _cache:
                rev: dict[str, list[str]] = {}
                for ch, p in table.items():
                    if p.phon:
                        rev.setdefault(p.phon, []).append(ch)
                _cache["parts_rev"] = {k: tuple(sorted(v)) for k, v in rev.items()}
    return _cache["parts_rev"].get(component, ())  # type: ignore[union-attr]


def strokes(ch: str) -> Optional[list[Stroke]]:
    """Nét viết mẫu KanjiVG theo thứ tự viết: mỗi nét 32 điểm (x, y) trong hộp 0..1 của cả chữ
    (tỉ lệ đồng nhất, cạnh dài = 1). Trả list mới mỗi lần nên caller sửa thoải mái; không có → None."""
    packed = _table("kanjivg").get(ch)
    if not packed:
        return None
    return [[(s[i], s[i + 1]) for i in range(0, len(s), 2)] for s in packed]


def pitch_accent(word: str, reading: Optional[str] = None) -> Optional[int]:
    """Kiểu trọng âm kanjium: 0 = 平板, n = hạ giọng sau mora thứ n. Không biết → None.

    Thứ tự thử: (từ, cách đọc) → từ chỉ có một kiểu trọng âm → từ toàn kana: mọi từ cùng cách đọc
    nếu chúng thống nhất (こと: 事=2, 琴=1 → None vì không biết nghĩa nào). Cách đọc katakana được đổi
    sang hiragana vì Sudachi trả katakana còn kanjium ghi hiragana.
    """
    table = _table("pitch")
    if not table:
        return None
    r = kata_to_hira(reading) if reading else (kata_to_hira(word) if is_kana_only(word) else None)
    by_reading = table.get(word)
    if by_reading:
        if r in by_reading:
            return by_reading[r]
        accents = set(by_reading.values())
        if len(accents) == 1:
            return accents.pop()
    if r and is_kana_only(word):
        accents = _by_reading().get(r, set())
        if len(accents) == 1:
            return next(iter(accents))
    return None


def _by_reading() -> dict[str, set[int]]:
    """Chỉ mục ngược cách đọc → {kiểu trọng âm}, dựng lười từ bảng pitch (cho từ toàn kana)."""
    if "pitch_rev" not in _cache:
        rev: dict[str, set[int]] = {}
        for readings in _table("pitch").values():
            for r, accent in readings.items():
                rev.setdefault(r, set()).add(accent)
        _cache["pitch_rev"] = rev
    return _cache["pitch_rev"]  # type: ignore[return-value]
