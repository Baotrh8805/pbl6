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
        nxt_kana = runs[i + 1][1][0] if i + 1 < n and runs[i + 1][0] == "k" else None
        for ln in range(len(reading) - pos, len(text) - 1, -1):
            nxt = pos + ln
            # Không cắt ngay trước kana nhỏ / ー vì chúng thuộc mora trước (学校 がっこう: っ thuộc 学) — trừ khi chính
            # kana đó được VIẾT ra ở run kana kế tiếp (待っ まっ, 引っ越し ひっこし: っ là okurigana, không phải của kanji);
            # thiếu ngoại lệ này mọi dạng て/た 促音便 rơi về một ruby cho cả token, furigana đè lên okurigana
            if nxt < len(reading) and (reading[nxt] in SMALL_KANA or reading[nxt] == "ー") and not (
                    nxt_kana is not None and kata_to_hira(nxt_kana) == kata_to_hira(reading[nxt])):
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


def swap_okurigana(surface: str, reading: Optional[str], target: str) -> Optional[str]:
    """Cách đọc của ``target`` suy từ cách đọc ``reading`` của ``surface`` khi hai dạng chung gốc (B5): bỏ đuôi kana
    của surface khỏi reading rồi nối đuôi kana của target. Dùng hai chiều: dạng chia → dạng từ điển (開い ひらい → 開く
    ひらく, 辛かっ つらかっ → 辛い つらい) và ngược lại (辛い からい → 辛かっ からかっ) — giữ đúng cách đọc gốc Sudachi
    chọn TRONG CÂU thay vì đọc lại lemma đứng một mình.

    None khi không suy được: gốc chung rỗng, phần khác nhau chứa kanji (gốc khác chữ), reading không kết thúc bằng
    đuôi kana của surface, hoặc kết quả không căn được với target (run kana của target không khớp — _assign). Hàm
    thuần; KHÔNG biết động từ bất quy tắc đổi âm gốc (来 き → 来る くる): người gọi tự loại."""
    if not surface or not reading or not target:
        return None
    k = 0
    while k < min(len(surface), len(target)) and surface[k] == target[k]:
        k += 1
    if k == 0:
        return None
    s_tail, t_tail = surface[k:], target[k:]
    if any(kind != "k" for kind, _ in _runs(s_tail + t_tail)):
        return None
    reading, s_tail, t_tail = kata_to_hira(reading), kata_to_hira(s_tail), kata_to_hira(t_tail)
    if s_tail and not reading.endswith(s_tail):
        return None
    stem = reading[:len(reading) - len(s_tail)]
    out = stem + t_tail
    if not stem or _assign(_runs(target), out) is None:
        return None
    return out


def ruby_segments(surface: str, reading: Optional[str]) -> list[dict]:
    """Đoạn ruby mức run cho câu ví dụ (B5): [{"text", "reading"}] — run kanji mang cách đọc của CẢ run (学校 →
    がっこう, hiển thị một <rt> như sách in, không chia 学/がっ + 校/こう như readingSegments của thẻ), okurigana / kana /
    ký hiệu là chữ thường (reading None). Không có kanji / thiếu reading / reading còn kanji (Sudachi OOV trả chính
    surface) → một đoạn chữ thường; không căn được → một đoạn ruby cho cả surface. "".join(text) luôn bằng surface."""
    if not surface:
        return []
    if not reading or not has_kanji(surface) or has_kanji(reading):
        return [{"text": surface, "reading": None}]
    reading = kata_to_hira(reading)
    runs = _runs(surface)
    assigned = _assign(runs, reading)
    if assigned is None:
        return [{"text": surface, "reading": reading}]
    return [{"text": text, "reading": kana if kind == "K" and kana else None}
            for (kind, text), kana in zip(runs, assigned)]


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
