"""Căn chỉnh kanji ↔ kana từng đoạn cho furigana (UC-09).

align("勉強", "べんきょう") → [{"kanji": "勉", "kana": "べん"}, {"kanji": "強", "kana": "きょう"}]
Quy tắc: run kana trong surface phải khớp nguyên văn trong reading; phần còn lại
chia cho run kanji (mỗi kanji ≥ 1 kana) bằng quay lui. Trong một run nhiều kanji,
chia tiếp theo cách đọc từng chữ của Sudachi (cho phép rendaku / 促音); không chia
được → một đoạn cho cả run. Không có kanji → None. Không căn được → một đoạn duy nhất.
"""
from __future__ import annotations

from typing import Optional

from app.extract.jachars import has_kanji, is_kana, is_kanji, kata_to_hira

SMALL_KANA = set("ぁぃぅぇぉゃゅょゎっ")
Segment = dict  # {"kanji": str, "kana": str}
_VOICED = str.maketrans("がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ",
                        "かきくけこさしすせそたちつてとはひふへほはひふへほ")


def _runs(surface: str) -> list[tuple[str, str]]:
    """Tách surface thành các run ('K' kanji / 'k' kana / 'o' khác)."""
    runs: list[tuple[str, str]] = []
    for ch in surface:
        kind = "K" if is_kanji(ch) else ("k" if is_kana(ch) else "o")
        if runs and runs[-1][0] == kind:
            runs[-1] = (kind, runs[-1][1] + ch)
        else:
            runs.append((kind, ch))
    return runs


def _assign(runs: list[tuple[str, str]], reading: str) -> Optional[list[str]]:
    """Quay lui: gán cho mỗi run một đoạn liên tiếp của reading."""
    n = len(runs)
    result: list[str] = [""] * n

    def rec(i: int, pos: int) -> bool:
        if i == n:
            return pos == len(reading)
        kind, text = runs[i]
        if kind == "k":
            end = pos + len(text)
            if kata_to_hira(reading[pos:end]) == kata_to_hira(text):
                result[i] = reading[pos:end]
                return rec(i + 1, end)
            return False
        if kind == "o":
            # Số / latin: xuất hiện nguyên văn trong reading hoặc không xuất hiện
            end = pos + len(text)
            if reading[pos:end] == text and rec(i + 1, end):
                result[i] = text
                return True
            result[i] = ""
            return rec(i + 1, pos)
        # run kanji: thử từ dài đến ngắn, mỗi kanji ít nhất 1 kana
        for ln in range(len(reading) - pos, len(text) - 1, -1):
            nxt = pos + ln
            # Không cắt ngay trước kana nhỏ / ー vì chúng thuộc mora trước
            if nxt < len(reading) and (reading[nxt] in SMALL_KANA or reading[nxt] == "ー"):
                continue
            result[i] = reading[pos:nxt]
            if rec(i + 1, nxt):
                return True
        return False

    return result if rec(0, 0) else None


def _similar(seg: str, base: str) -> bool:
    """seg khớp cách đọc base sau khi bỏ dấu đục (rendaku) hoặc biến 促音 cuối."""
    if not seg or not base:
        return False
    a, b = seg.translate(_VOICED), base.translate(_VOICED)
    if a == b:
        return True
    if len(a) == len(b) and a[:-1] == b[:-1] and a[-1] == "っ":  # がく+こう → がっこう
        return True
    if len(a) == len(b) - 1 and a == b[:-1]:                      # にち → に (日本)
        return True
    return False


def _candidates(ch: str, prev: Optional[str]) -> list[str]:
    """Các cách đọc có thể của một kanji: on/kun từ Unihan; kun cắt okurigana
    (つとめる → つと, つとめ). 々 lấy cách đọc chữ trước."""
    from app.extract.kanji_readings import readings
    base = readings(prev) if ch == "々" and prev else readings(ch)
    out: list[str] = []
    for r in base:
        for ln in range(len(r), 0, -1):
            cand = r[:ln]
            if cand not in out:
                out.append(cand)
    return out


def _match_per_char(kanji: str, kana: str) -> Optional[list[Segment]]:
    n = len(kanji)
    out: list[str] = [""] * n
    cands = [_candidates(ch, kanji[i - 1] if i else None) for i, ch in enumerate(kanji)]

    def rec(i: int, pos: int) -> bool:
        if i == n:
            return pos == len(kana)
        remaining = n - i - 1
        tried: set[int] = set()
        # Ưu tiên khớp chính xác dài nhất, rồi biến âm (rendaku / 促音)
        for strict in (True, False):
            for cand in cands[i]:
                ln = len(cand)
                if ln < 1 or pos + ln > len(kana) - remaining or ln in tried:
                    continue
                seg = kana[pos:pos + ln]
                ok = seg == cand if strict else _similar(seg, cand)
                if ok:
                    tried.add(ln)
                    out[i] = seg
                    if rec(i + 1, pos + ln):
                        return True
        return False

    if rec(0, 0):
        return [{"kanji": k, "kana": r} for k, r in zip(kanji, out)]
    return None


def _split_kanji_run(kanji: str, kana: str) -> list[Segment]:
    """Chia cách đọc của một run nhiều kanji theo từng chữ."""
    if len(kanji) == 1:
        return [{"kanji": kanji, "kana": kana}]
    # 1) Ranh giới từ của Sudachi mode A (日本語学校 → 日本 + 語 + 学校) nếu reading ghép đúng
    try:
        from app.extract.tokenizer import tokenize
        toks = tokenize(kanji, "A")
    except Exception:  # không có Sudachi → bỏ qua bước này
        toks = []
    if len(toks) > 1 and "".join(t.reading for t in toks) == kana:
        segs: list[Segment] = []
        for t in toks:
            segs.extend(_split_kanji_run(t.surface, t.reading))
        return segs
    # 2) Cách đọc từng chữ (Unihan kJapanese); không khớp (ateji: 大人) → một đoạn
    return _match_per_char(kanji, kana) or [{"kanji": kanji, "kana": kana}]


def align(surface: str, reading: Optional[str]) -> Optional[list[Segment]]:
    """Trả về list đoạn {kanji, kana}; None nếu surface không có kanji hoặc thiếu reading."""
    if not surface or not reading or not has_kanji(surface):
        return None
    reading = kata_to_hira(reading)
    runs = _runs(surface)
    assigned = _assign(runs, reading)
    if assigned is None:
        return [{"kanji": surface, "kana": reading}]
    segs: list[Segment] = []
    for (kind, text), kana in zip(runs, assigned):
        if kind == "K":
            segs.extend(_split_kanji_run(text, kana))
        elif kana or kind == "k":
            segs.append({"kanji": text, "kana": text})
        else:
            segs.append({"kanji": text, "kana": ""})
    return segs


def reading_from_rubies(surface: str, rubies: list[dict] | None) -> Optional[str]:
    """Reading từ ruby nguồn (DOCX / ngoặc) nếu base khớp đúng surface."""
    if not rubies:
        return None
    for rb in rubies:
        if rb.get("base") == surface and rb.get("reading"):
            return kata_to_hira(rb["reading"])
    return None


def apply_rubies(surface: str, rubies: list[dict] | None) -> Optional[list[Segment]]:
    """Ưu tiên ruby từ nguồn: base khớp surface → căn theo reading của ruby."""
    reading = reading_from_rubies(surface, rubies)
    return align(surface, reading) if reading else None
