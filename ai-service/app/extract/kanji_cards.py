"""Thẻ chữ Hán (C5): mỗi kanji một thẻ gồm âm Hán-Việt, bộ thủ / số nét, cách đọc on / kun kèm ví dụ từ vựng JLPT.

Ví dụ cho từng cách đọc tìm bằng cách quét từ JLPT chứa chữ (classifier.entries_containing, cấp dễ → khó), căn
furigana (furigana.align) để lấy đoạn kana ứng với đúng chữ trong từ, rồi gán đoạn đó cho một cách đọc Unihan:
  khớp đúng on (学生: がく) → khớp đúng kun hoặc tiền tố kun (学ぶ: まな ⊂ まなぶ; okurigana nằm ngoài chữ)
  → khớp lỏng on (学校: がっ ~ がく 促音; 日本: に ~ にち rút gọn) → khớp lỏng kun (日曜日: び ~ ひ rendaku),
dùng lại furigana._similar để một chỗ quyết định thế nào là "biến âm". Không gán được (ateji 大人) → bỏ qua từ đó,
không bịa. Mỗi cách đọc ≤ MAX_EXAMPLES ví dụ, cấp dễ trước rồi từ thông dụng trước (han_viet_graph.word_frequency:
ニチ của 日 có hơn chục từ N5, lấy 日 / 毎日 / 日曜日 chứ không phải ba từ đầu bảng CSV); cách đọc có ví dụ xếp
trước (Unihan liệt kê nhiều âm hiếm).
Thiếu nguồn nào (Unihan readings / JLPT / JMdict / bộ thủ) thì trường tương ứng rỗng / None, thẻ vẫn trả về.
"""
from __future__ import annotations

from typing import Optional

from app.extract import furigana, han_viet, han_viet_graph, jmdict, kanji_meanings, kanjidata
from app.extract.jachars import is_kanji
from app.extract.jlpt import classifier
from app.extract.kanji_readings import readings_split

MAX_EXAMPLES = 3
_SKIP_CHARS = frozenset("々〆ヶ")  # jachars coi là kanji nhưng không có âm / bộ thủ riêng


def available() -> bool:
    """Thẻ có nội dung khi có cách đọc Unihan hoặc danh sách JLPT (ví dụ) — cờ cho health."""
    from app.extract import kanji_readings
    return bool(kanji_readings._load_raw()) or classifier.available()


# ----------------------------------------------------------------------------- gán đoạn kana cho cách đọc

def _segments_for(ch: str, term: str, reading: str) -> list[tuple[str, str]]:
    """[(đoạn kana của đúng chữ ``ch``, kana đứng ngay sau nó trong từ)] theo furigana.align
    (日曜日 → [("にち", ""), ("び", "")]; 生やす → [("は", "やす")]). Kana theo sau là okurigana khả dĩ, dùng để
    chọn đúng kun khi đoạn chỉ một âm tiết. Đoạn gộp nhiều chữ (không căn được) không nói lên cách đọc riêng → bỏ."""
    segs = furigana.align(term, reading) or []
    out: list[tuple[str, str]] = []
    for i, s in enumerate(segs):
        if s["kanji"] != ch or not s["kana"]:
            continue
        nxt = segs[i + 1] if i + 1 < len(segs) else None
        tail = nxt["kana"] if nxt and nxt["kanji"] == nxt["kana"] else ""  # đoạn kana thuần: kanji == kana
        out.append((s["kana"], tail))
    return out


# Kana hàng u cuối cách đọc kun (đuôi động từ) và các hàng nó chia thành trong từ ghép / dạng ます: 入り口 (いる → いり),
# 焼き鳥 (やく → やき), 付き合い (つく → つき), 構いません (かまう → かまい)
_CONJUGATED = {"る": "りれら", "く": "きけか", "ぐ": "ぎげが", "す": "しせさ", "つ": "ちてた", "う": "いえわ",
               "む": "みめま", "ぶ": "びべば", "ぬ": "にねな"}


def _okurigana_fits(hira: str, seg: str, tail: str) -> bool:
    """Phần cách đọc còn lại sau đoạn kana của chữ (okurigana theo Unihan) phải khớp với kana đứng ngay sau chữ trong
    từ: 生る (な + る) không phải なま (còn ま ≠ る), 夜明け (あ + け) là あける chứ không phải あかり, 手伝う (つだ + う) là
    つたう chứ không phải つたわる. Cho phép đuôi động từ chia (いる → 入り口). Cách đọc không còn gì → luôn khớp; còn
    okurigana mà sau chữ không có kana (hết từ / chữ kế là kanji) → không khớp."""
    rest = hira[len(seg):]
    if not rest:
        return True
    if not tail:
        return False
    return tail[0] == rest[0] or tail[0] in _CONJUGATED.get(rest[0], "")


def _match(seg: str, tail: str, on: list[dict], kun: list[dict]) -> Optional[tuple[str, int]]:
    """Đoạn kana → ("on" | "kun", vị trí cách đọc) theo thứ tự ưu tiên trong docstring module; không khớp → None.
    Với kun, ưu tiên cách đọc = đoạn + một phần kana theo sau (生やす: は + やす → はやす, không phải はえる), nhiều cách
    đọc cùng thoả thì lấy cách đọc DÀI nhất (大きい: おおきい chứ không phải おお — Unihan liệt kê âm ngắn trước);
    không có thì nhận kun bắt đầu bằng đoạn khi okurigana của nó khớp kana theo sau (_okurigana_fits: 生き物 → いきる,
    nhưng 生る không về なま). Khớp lỏng (rendaku / 促音 / rút gọn) cũng phải qua kiểm tra okurigana đó."""
    for i, r in enumerate(on):
        if seg == r["hiragana"]:
            return "on", i
    full = seg + tail
    exact = [i for i, r in enumerate(kun) if r["hiragana"].startswith(seg) and full.startswith(r["hiragana"])]
    if exact:
        return "kun", max(exact, key=lambda i: len(kun[i]["hiragana"]))
    for i, r in enumerate(kun):
        if r["hiragana"].startswith(seg) and _okurigana_fits(r["hiragana"], seg, tail):
            return "kun", i
    for i, r in enumerate(on):
        if furigana._similar(seg, r["hiragana"]):
            return "on", i
    for i, r in enumerate(kun):
        if furigana._similar(seg, r["hiragana"][: len(seg)]) and _okurigana_fits(r["hiragana"], seg, tail):
            return "kun", i
    return None


def _example_rank(user_level: Optional[str]):
    """Không có cấp người học → dễ nhất trước. Có cấp → từ đúng cấp đang học trước, rồi dễ hơn (đã biết), rồi khó hơn;
    trong mỗi nhóm vẫn dễ → khó. Ví dụ đúng cấp giúp thẻ gắn với bài đang học thay vì chỉ lặp lại từ N5.
    Cùng cấp → từ thông dụng trước (word_frequency; bằng nhau / không có tần suất → giữ thứ tự CSV JLPT)."""
    target = classifier.level_index(user_level) if user_level in classifier.LEVELS else None

    def key(ex: dict) -> tuple:
        idx = classifier.level_index(ex["level"])
        freq = -han_viet_graph.word_frequency(ex["term"])  # gọi qua module để test thay được bằng bảng giả
        if target is None:
            return (idx, freq)
        return (0 if idx == target else 1 if idx < target else 2, idx, freq)
    return key


def _examples(ch: str, on: list[dict], kun: list[dict], user_level: Optional[str]) -> tuple[list[list[dict]], list[list[dict]]]:
    """Ví dụ cho từng cách đọc on / kun của ``ch`` (song song với danh sách on / kun), mỗi cách đọc ≤ MAX_EXAMPLES,
    mỗi từ một lần. Quét hết từ JLPT rồi mới cắt để thứ tự theo cấp người học đúng trên toàn bộ ứng viên."""
    buckets_on: list[list[dict]] = [[] for _ in on]
    buckets_kun: list[list[dict]] = [[] for _ in kun]
    seen: set[tuple[str, str, int]] = set()
    for term, reading, meaning, level in classifier.entries_containing(ch):
        if not reading:
            continue
        for seg, tail in _segments_for(ch, term, reading):
            hit = _match(seg, tail, on, kun)
            if hit is None or (term, *hit) in seen:
                continue
            seen.add((term, *hit))
            bucket = (buckets_on if hit[0] == "on" else buckets_kun)[hit[1]]
            bucket.append({"term": term, "reading": reading, "meaning": meaning or None, "level": level})
    rank = _example_rank(user_level)
    return ([sorted(b, key=rank)[:MAX_EXAMPLES] for b in buckets_on],
            [sorted(b, key=rank)[:MAX_EXAMPLES] for b in buckets_kun])


# ----------------------------------------------------------------------------- thẻ

def _meaning_en(ch: str) -> Optional[str]:
    """Nghĩa EN của **chữ** (không phải của từ một chữ): kanji_meanings (bảng sửa tay → Unihan kDefinition; 日 → "day;
    sun; Japan", 存 → "exist, live, be…"). Chỉ khi chữ không có trong hai bảng đó mới dùng entry JMdict có kanji đúng là
    chữ (nghĩa của *từ* một chữ: 日 にち "Sunday; nth day", 字 あざ "section of village" — vì vậy không đặt trước), rồi
    cột meaning JLPT (classifier.meaning_hint); không nguồn nào → None."""
    found = kanji_meanings.meaning(ch)
    if found:
        return found
    entry = jmdict.lookup(ch)
    if entry and entry.get("kanji") == ch and entry.get("gloss"):
        return entry["gloss"]
    return classifier.meaning_hint(ch)


def _radical(ch: str) -> Optional[dict]:
    """{"no": bộ thủ Khang Hi, "strokes": số nét của riêng bộ thủ = tổng nét − nét ngoài bộ}.
    kanjidata.radical_strokes() chỉ trả (bộ, tổng) nên đọc bảng thô của nó để lấy nét ngoài bộ; không có → None."""
    row = kanjidata._table("radicals").get(ch)
    if not row:
        return None
    radical_no, residual, total = row
    return {"no": radical_no, "strokes": max(total - residual, 0)}


def card(ch: str, user_level: Optional[str] = None) -> dict:
    """Thẻ một chữ (xem docstring module). Cách đọc có ví dụ xếp trước, giữ thứ tự Unihan trong mỗi nhóm."""
    split = readings_split(ch)
    ex_on, ex_kun = _examples(ch, split["on"], split["kun"], user_level)
    on = [{"reading": r["reading"], "examples": ex} for r, ex in zip(split["on"], ex_on)]
    kun = [{"reading": r["reading"], "okurigana": r["okurigana"], "examples": ex} for r, ex in zip(split["kun"], ex_kun)]
    on.sort(key=lambda r: not r["examples"])
    kun.sort(key=lambda r: not r["examples"])
    rs = kanjidata.radical_strokes(ch)
    return {
        "kanji": ch,
        "hanViet": han_viet.han_viet(ch),
        "radical": _radical(ch),
        "on": on,
        "kun": kun,
        "meaningEn": _meaning_en(ch),
        "strokeCount": rs[1] if rs else None,
    }


def cards(kanji_list: list[str], user_level: Optional[str] = None) -> list[dict]:
    """Thẻ cho một lô chữ, giữ thứ tự gửi lên, mỗi chữ một thẻ (bỏ trùng); mục không phải một chữ Hán
    (chuỗi dài, kana, 々) bị bỏ qua thay vì báo lỗi để backend gửi cả bộ thẻ mà không phải lọc trước."""
    out: list[dict] = []
    seen: set[str] = set()
    for item in kanji_list:
        ch = (item or "").strip()
        if len(ch) != 1 or not is_kanji(ch) or ch in _SKIP_CHARS or ch in seen:
            continue
        seen.add(ch)
        out.append(card(ch, user_level))
    return out
