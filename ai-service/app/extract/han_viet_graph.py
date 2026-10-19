"""Đồ thị âm Hán-Việt → chữ Hán → từ vựng (F1): "NHẬT" → 日 → 日本, 毎日, 日曜日 …

Người Việt học kanji nhanh hơn khi đi từ âm Hán-Việt quen thuộc; đồ thị này là lớp tra ngược của han_viet.py
(chữ → âm) để frontend vẽ sơ đồ reading → kanji → word.

Ba bảng dựng lười một lần, độc lập với nhau nên thiếu nguồn nào vẫn trả được phần còn lại:
  âm → chữ     đảo bảng han_viet._load() (Unihan kVietnamese + overrides). Khoá tra cứu chuẩn hoá NFC + viết hoa;
               thêm khoá "gấp dấu" (bỏ dấu thanh / dấu mũ, Đ → D) để "nhat" cũng ra NHẬT / NHẠT / NHÁT …
  chữ → từ     danh sách JLPT (classifier.entries_containing, cấp dễ → khó) + JMdict (file sqlite, quét một lượt
               dựng chỉ mục chữ → entry, mỗi chữ giữ tối đa JMDICT_PER_KANJI mục ngắn nhất). JMdict đi bằng kết nối
               chỉ-đọc riêng để không đụng jmdict.py (4 agent song song).
  thống kê chữ số từ JLPT chứa chữ + cấp dễ nhất → xếp hạng chữ trong một âm và gợi ý autocomplete.

Từ của một chữ xếp cấp dễ → khó, trong cùng cấp từ **thông dụng** (wordfreq, xem word_frequency) lên trước: đồ thị
chỉ vẽ ``limit_words`` từ mỗi chữ nên 日 (84 từ) phải cho 日本 / 今日 / 毎日 ra trước 七日 / 日中, không phải cắt theo
thứ tự a-b-c của CSV.
"""
from __future__ import annotations

import sqlite3
import threading
import unicodedata
from typing import Optional

from app.extract import han_viet, jmdict, kanjidata
from app.extract.jachars import is_kanji
from app.extract.jlpt import classifier
from app.extract.kanji_readings import readings_split

MAX_KANJI = 40           # một âm Hán-Việt phổ biến (THỊ, HOÀ…) có hàng chục chữ, phần đuôi là chữ hiếm không có từ
JMDICT_PER_KANJI = 50    # 学 có hơn 400 entry JMdict; giữ 50 từ ngắn nhất là đủ cho đồ thị
SUGGEST_SAMPLE = 5       # số chữ mẫu kèm mỗi gợi ý autocomplete
_SKIP_CHARS = frozenset("々〆ヶ")

_lock = threading.Lock()  # nạp lười chạy đúng một lần dù nhiều request đầu tiên đến cùng lúc (threadpool), như kanjidata
_index: dict | None = None            # xem _build_index()
_jmdict_idx: dict[str, list[tuple[str, str, str]]] | None = None
_words_cache: dict[str, list[dict]] = {}


# ----------------------------------------------------------------------------- chuẩn hoá âm Hán-Việt

def normalize(reading: str) -> str:
    """Khoá chính: NFC + viết hoa + bỏ khoảng trắng thừa ("nhật " → "NHẬT")."""
    return unicodedata.normalize("NFC", (reading or "").strip()).upper()


def fold(reading: str) -> str:
    """Khoá gấp dấu: bỏ mọi dấu tổ hợp (thanh, mũ, móc), Đ → D ("NHẬT" → "NHAT", "ĐẠI" → "DAI").
    Đ không phân rã được bằng NFD nên thay tay."""
    nfd = unicodedata.normalize("NFD", normalize(reading))
    return "".join(c for c in nfd if not unicodedata.combining(c)).replace("Đ", "D")


# ----------------------------------------------------------------------------- dựng chỉ mục

def _jmdict_index() -> dict[str, list[tuple[str, str, str]]]:
    """Chữ Hán → [(kanji, kana, gloss)] từ JMdict, mỗi chữ tối đa JMDICT_PER_KANJI mục, từ ngắn trước (từ ngắn thường
    phổ biến hơn và đọc dễ hơn). Quét cả bảng một lần (~36k dòng, ~0,15 s) vì sqlite không có chỉ mục chuỗi con;
    thiếu file / lỗi sqlite → {} và đồ thị chỉ còn từ JLPT."""
    global _jmdict_idx
    if _jmdict_idx is not None:
        return _jmdict_idx
    with _lock:
        if _jmdict_idx is not None:
            return _jmdict_idx
        idx: dict[str, list[tuple[str, str, str]]] = {}
        path = jmdict.DATA_FILE
        if path.exists():
            try:
                conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
                try:
                    rows = conn.execute(
                        "SELECT kanji, kana, gloss FROM entries WHERE kanji IS NOT NULL AND common=1").fetchall()
                finally:
                    conn.close()
            except sqlite3.Error:
                rows = []
            for kanji, kana, gloss in rows:
                for ch in dict.fromkeys(kanji):  # mỗi chữ một lần dù lặp trong từ (人々, 日々)
                    if is_kanji(ch) and ch not in _SKIP_CHARS:
                        idx.setdefault(ch, []).append((kanji, kana or "", gloss or ""))
            for ch, items in idx.items():
                items.sort(key=lambda t: (len(t[0]), t[0]))
                del items[JMDICT_PER_KANJI:]
        _jmdict_idx = idx
    return _jmdict_idx


def _kanji_stats(ch: str) -> tuple[int, int]:
    """(số từ JLPT chứa chữ, cấp dễ nhất N5=0…; không có từ → 5) — dùng xếp hạng, không cần cache vì chỉ tra dict."""
    entries = classifier.entries_containing(ch)
    if not entries:
        return 0, classifier.level_index(None)
    return len(entries), min(classifier.level_index(e[3]) for e in entries)


def _build_index() -> dict:
    """{"exact": {NHẬT: [日, …]}, "fold": {NHAT: [NHẬT, NHẠT, …]}, "readings": [NHẬT, …] (đã xếp)}.
    Chữ trong một âm xếp: nhiều từ JLPT trước → cấp dễ trước → mã Unicode (ổn định giữa các lần chạy)."""
    exact: dict[str, list[str]] = {}
    for ch, reading in han_viet._load().items():
        key = normalize(reading)
        if key and is_kanji(ch) and ch not in _SKIP_CHARS:
            exact.setdefault(key, []).append(ch)
    for key, chars in exact.items():
        chars.sort(key=lambda c: (-_kanji_stats(c)[0], _kanji_stats(c)[1], ord(c)))
    folded: dict[str, list[str]] = {}
    for key in exact:
        folded.setdefault(fold(key), []).append(key)
    for keys in folded.values():
        keys.sort()
    # gợi ý: âm có nhiều từ JLPT nhất (cộng dồn các chữ) lên trước — NHÂN (人), NHẬT (日) trước NHỌN (鈍 鋭) —
    # rồi nhiều chữ hơn, rồi a-b-c
    readings = sorted(exact, key=lambda k: (-sum(_kanji_stats(c)[0] for c in exact[k]), -len(exact[k]), k))
    return {"exact": exact, "fold": folded, "readings": readings}


def _get_index() -> dict:
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                _index = _build_index()
    return _index


def reset() -> None:
    """Xoá chỉ mục đã dựng (test đổi dữ liệu han_viet / JLPT / JMdict rồi gọi)."""
    global _index, _jmdict_idx
    with _lock:
        _index = None
        _jmdict_idx = None
        _words_cache.clear()


def available() -> bool:
    """Có bảng âm Hán-Việt là dựng được đồ thị (từ vựng chỉ làm giàu thêm) — cờ cho health."""
    return han_viet.available()


# ----------------------------------------------------------------------------- tra cứu

def kanji_for(reading: str) -> list[tuple[str, list[str]]]:
    """Âm → [(âm hiển thị, [chữ…])]. Gõ có dấu ("NHẬT") → khớp đúng dấu, một mục (không có âm đó thì mới rơi về khớp
    gấp dấu). Gõ KHÔNG dấu ("nhat", "nhan") → mọi âm gấp về cùng khoá, mỗi âm một mục, âm trùng đúng chuỗi gõ (nếu có)
    lên đầu rồi a-b-c — cùng quy tắc với suggest(): người dùng chưa chọn dấu thì NHÂN (人) phải hiện cùng NHAN (顔),
    không được vì "NHAN" tình cờ là một âm thật mà nuốt mất NHÂN / NHẬN / NHẪN (262 / 1 073 nhóm gấp dấu của bảng thật
    có âm trùng khoá như vậy: DAY, DO, BAN, NHAN, TAM, THU…). Không khớp → []."""
    idx = _get_index()
    key = normalize(reading)
    if not key:
        return []
    folded = fold(key)
    if key != folded and key in idx["exact"]:
        return [(key, list(idx["exact"][key]))]
    keys = sorted(idx["fold"].get(folded, []), key=lambda k: (k != key, k))
    return [(k, list(idx["exact"][k])) for k in keys]


def words_of(ch: str) -> list[dict]:
    """Từ chứa chữ: JLPT (cấp dễ → khó) rồi JMdict, mỗi expression một lần →
    [{term, reading, meaning, level, source: jlpt | jmdict}]. Cache theo chữ vì một âm lặp lại nhiều chữ giữa các request."""
    cached = _words_cache.get(ch)
    if cached is not None:
        return cached
    out: list[dict] = []
    seen: set[str] = set()
    for expr, reading, meaning, level in classifier.entries_containing(ch):
        if expr in seen:
            continue
        seen.add(expr)
        out.append({"term": expr, "reading": reading or None, "meaning": meaning or None, "level": level, "source": "jlpt"})
    for kanji, kana, gloss in _jmdict_index().get(ch, []):
        if kanji in seen:
            continue
        seen.add(kanji)
        out.append({"term": kanji, "reading": kana or None, "meaning": gloss or None, "level": None, "source": "jmdict"})
    _words_cache[ch] = out
    return out


def word_frequency(term: str) -> float:
    """Độ thông dụng của từ theo wordfreq (thang zipf 0…7; 日本 ≈ 6, 日光 ≈ 4, không có → 0) — khoá phụ để xếp từ cùng
    cấp JLPT. Dùng lại bảng tần suất classifier đã nạp cho fallback cấp độ (một lần ~0,7 s) thay vì thêm nguồn mới;
    wordfreq lỗi / thiếu → 0 cho mọi từ và thứ tự rơi về từ ngắn trước, a-b-c (đồ thị vẫn vẽ được).
    kanji_cards dùng chung để chọn ví dụ thông dụng nhất trong cùng cấp."""
    try:
        return classifier._zipf(term)
    except Exception:  # wordfreq thiếu dữ liệu 'ja' / lỗi nạp: không phải lý do làm hỏng đồ thị
        return 0.0


def _word_sort_key(w: dict) -> tuple:
    # N5 → N1 → không cấp; cùng cấp thì JLPT trước JMdict; rồi thông dụng trước; rồi từ ngắn; rồi a-b-c
    return (classifier.level_index(w["level"]), 0 if w["source"] == "jlpt" else 1,
            -word_frequency(w["term"]), len(w["term"]), w["term"])


def _kanji_node(ch: str, reading: str, level_idx: int) -> dict:
    split = readings_split(ch)
    rs = kanjidata.radical_strokes(ch)
    return {
        "id": f"k:{ch}", "type": "kanji", "label": ch, "hanViet": reading,
        "on": [r["reading"] for r in split["on"]],
        "kun": [r["reading"] for r in split["kun"]],
        "level": classifier.LEVELS[level_idx] if level_idx < len(classifier.LEVELS) else None,
        "strokes": rs[1] if rs else None,
        "radical": rs[0] if rs else None,
    }


def graph(reading: str, level: Optional[str] = None, limit_words: int = 30) -> dict:
    """Đồ thị {query, nodes, edges} cho một âm Hán-Việt.

    nodes: reading (r:NHẬT) → kanji (k:日, kèm on/kun/cấp dễ nhất/số nét/bộ thủ) → word (w:日本, kèm reading/meaning/
    level/hanViet). edges: has_kanji (r → k), in_word (k → w). Mỗi chữ tối đa ``limit_words`` từ, xếp N5 → N1 rồi
    JLPT trước JMdict rồi thông dụng trước (word_frequency); tối đa MAX_KANJI chữ, nhiều từ JLPT trước.
    ``level`` (N5…N1) chỉ giữ từ ở cấp đó hoặc dễ hơn
    và bỏ chữ không còn từ nào (đồ thị cho người học cấp đó; từ JMdict không cấp cũng bị bỏ). Âm lạ → nodes rỗng,
    không phải lỗi. "nhat" không dấu → một node reading cho mỗi âm khớp (NHÁT, NHẠT, NHẬT …)."""
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_words: set[str] = set()
    max_idx = classifier.level_index(level) if level in classifier.LEVELS else None
    for display, chars in kanji_for(reading):
        ranked: list[tuple[str, list[dict]]] = []
        for ch in chars:
            words = [w for w in words_of(ch) if max_idx is None or classifier.level_index(w["level"]) <= max_idx]
            if max_idx is not None and not words:
                continue
            ranked.append((ch, sorted(words, key=_word_sort_key)[: max(limit_words, 0)]))
        if not ranked:
            continue  # lọc cấp bỏ hết chữ của âm này → không để node reading mồ côi (gõ "nhat" ra 5 âm, chỉ vài âm có từ N5)
        rid = f"r:{display}"
        nodes.append({"id": rid, "type": "reading", "label": display})
        # ưu tiên chữ có nhiều từ JLPT (chữ "sống"), rồi dễ, rồi mã Unicode — chars đã xếp vậy nên sort ổn định giữ nguyên
        ranked.sort(key=lambda t: -sum(1 for w in t[1] if w["source"] == "jlpt"))
        for ch, words in ranked[:MAX_KANJI]:
            level_idx = min((classifier.level_index(w["level"]) for w in words if w["source"] == "jlpt"),
                            default=classifier.level_index(None))
            kid = f"k:{ch}"
            nodes.append(_kanji_node(ch, display, level_idx))
            edges.append({"from": rid, "to": kid, "type": "has_kanji"})
            for w in words:
                wid = f"w:{w['term']}"
                if wid not in seen_words:
                    seen_words.add(wid)
                    nodes.append({"id": wid, "type": "word", "label": w["term"], "reading": w["reading"],
                                  "meaning": w["meaning"], "level": w["level"], "hanViet": han_viet.han_viet(w["term"])})
                edges.append({"from": kid, "to": wid, "type": "in_word"})
    return {"query": reading, "nodes": nodes, "edges": edges}


def suggest(prefix: str, limit: int = 10) -> list[dict]:
    """Autocomplete âm Hán-Việt: [{reading, count, kanji: [≤ SUGGEST_SAMPLE chữ tiêu biểu]}].
    Khớp đúng dấu theo tiền tố trước ("NHẬ" → NHẬT, NHẬN…), rồi khớp gấp dấu ("nha" → NHÀ, NHÃ, NHẬT…);
    trong mỗi nhóm giữ thứ tự xếp hạng của chỉ mục (âm có nhiều chữ "sống" trước). Tiền tố rỗng → []."""
    idx = _get_index()
    key, folded = normalize(prefix), fold(prefix)
    if not key or limit <= 0:
        return []
    if key == folded:
        # gõ không dấu ("nha"): người dùng chưa chọn dấu nên NHÂN / NHẬT phải đứng ngang NHAM / NHAN — một bể chung
        hits = [r for r in idx["readings"] if fold(r).startswith(folded)]
    else:
        hits = [r for r in idx["readings"] if r.startswith(key)]
        if len(hits) < limit:
            seen = set(hits)
            hits += [r for r in idx["readings"] if r not in seen and fold(r).startswith(folded)]
    return [{"reading": r, "count": len(idx["exact"][r]), "kanji": idx["exact"][r][:SUGGEST_SAMPLE]}
            for r in hits[:limit]]
