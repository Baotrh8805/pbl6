"""Sơ đồ chữ Hán cho trang /graph (spec 2026-10-30 §3.4): cấu tạo (thành phần, bộ thủ, thành phần chỉ âm, họ chữ cùng chỉ âm)
và từ ghép, dựng hoàn toàn từ dữ liệu tĩnh — kanji_parts.csv (KanjiVG), Unihan, danh sách JLPT, JMdict nếu có — không cần Neo4j.

Tâm sơ đồ là một chữ Hán; người dùng có thể gõ âm Hán-Việt: một chữ → tâm ngay, nhiều chữ → ``candidates`` để frontend cho
chọn. Nhãn trung thực (D2): chữ cùng họ chỉ âm nhưng không trùng âm On với thành phần chỉ âm (待 không đọc ジ) nối bằng cạnh
``family`` thay vì ``phon``. Backend chỉ ghép thêm ``meaningVi`` theo ``id`` (k:X) và ``key`` (w:<id> / w:jlpt:…) rồi cache.
"""
from __future__ import annotations

import sqlite3
from typing import Optional

from app.extract import han_viet, han_viet_graph, jmdict, kanji_meanings, kanjidata, radicals
from app.extract.jachars import is_kana_only, is_kanji, kata_to_hira
from app.extract.jlpt import classifier
from app.extract.kanji_readings import readings_split

MODES = ("structure", "compounds")
MAX_FAMILY = 12          # họ chỉ âm lớn nhất trong JLPT là 8 chữ (莫, 方); trần để canvas không quá tải
MAX_WORDS = 12           # từ ghép trên sơ đồ / panel
MAX_CANDIDATES = 24      # âm Hán-Việt nhiều chữ (THỊ, HOÀ…): đủ để chọn, chữ hiếm không có từ bị cắt
MIN_WORD_CHARS = 2       # từ = cụm 2–4 chữ Hán khác nhau (spec từ nhiều chữ W4)
MAX_WORD_CHARS = 4
MAX_WORD_CANDIDATES = 12 # ứng viên từ khi gõ kana / Hán-Việt nhiều âm
_SKIP_CHARS = frozenset("々〆ヶ")


# ----------------------------------------------------------------------------- tiện ích

def _is_real_kanji(ch: str) -> bool:
    return len(ch) == 1 and is_kanji(ch) and ch not in _SKIP_CHARS


def _jlpt(ch: str) -> Optional[str]:
    """Cấp JLPT ước lượng của một chữ = cấp của từ JLPT dễ nhất chứa nó (không có KANJIDIC); không có → None."""
    rows = classifier.entries_containing(ch)
    return rows[0][3] if rows else None


def _on_readings(ch: str) -> list[str]:
    return [r["reading"] for r in readings_split(ch)["on"]]


def _kun_readings(ch: str) -> list[str]:
    return [r["reading"] for r in readings_split(ch)["kun"]]


def _same_on(a: str, b: str) -> bool:
    return bool(set(_on_readings(a)) & set(_on_readings(b)))


def _has_structure(ch: str) -> bool:
    return kanjidata.parts(ch) is not None


_PRIMARY_ON = 2          # chỉ so các âm On chính (âm hiếm như ホン của 体 sinh dương tính giả)
_radical_chars: Optional[frozenset[str]] = None


def _kangxi_chars() -> frozenset[str]:
    """Ký tự 214 bộ thủ (dạng thống nhất + dạng khối Kangxi): bộ thủ hầu như không làm phần chỉ âm (口 厂 大 小 … trùng âm
    On là tình cờ) nên heuristic bỏ qua chúng."""
    global _radical_chars
    if _radical_chars is None:
        _radical_chars = frozenset(c for r in radicals.table() for c in (r.get("unified"), r.get("char")) if c)
    return _radical_chars


def _guess_phon(ch: str, p: kanjidata.Parts) -> Optional[tuple[str, str]]:
    """KanjiVG không đánh dấu kvg:phon (≈ 42 % chữ JLPT): đoán (part, chữ chỉ âm) = part là chữ Hán thật, không phải bộ của chữ,
    không phải bộ thủ Khang Hi, trùng ≥ 1 trong 2 âm On chính với chữ tâm (但 ← 旦 タン). Không chắc → None (không bịa)."""
    center_on = set(_on_readings(ch)[:_PRIMARY_ON])
    if not center_on:
        return None
    kangxi = _kangxi_chars()
    for part, original in zip(p.parts, p.originals):
        c = original or part
        if part == p.radical_part or c == ch or c in kangxi or part in kangxi or not _is_real_kanji(c):
            continue
        if center_on & set(_on_readings(c)[:_PRIMARY_ON]):
            return part, c
    return None


def _phon_of(ch: str, p: Optional[kanjidata.Parts]) -> tuple[Optional[str], Optional[str], bool]:
    """(part mang chỉ âm, chữ chỉ âm, có phải suy đoán) — KanjiVG trước, heuristic sau. Chỉ âm trùng chính chữ (dữ liệu lệch)
    → coi như không có."""
    if not p:
        return None, None, False
    if p.phon and p.phon_part and p.phon != ch and p.phon_part != ch:
        return p.phon_part, p.phon, False
    g = _guess_phon(ch, p)
    return (g[0], g[1], True) if g else (None, None, False)


def _real_parts(ch: str, p: kanjidata.Parts):
    """(part, original, position) bỏ part trùng chính chữ (王 partial, nhóm đặt tên theo phon tự tham chiếu) — review 30/10 C1."""
    for part, original, position in zip(p.parts, p.originals, p.positions):
        if part == ch or (original or part) == ch:
            continue
        yield part, original, position


def _kanji_node(ch: str, type_: str, **extra) -> dict:
    rs = kanjidata.radical_strokes(ch)
    node = {
        "id": f"k:{ch}", "type": type_, "label": ch,
        "hanViet": han_viet.han_viet(ch),
        "meaningEn": kanji_meanings.meaning(ch),
        "jlpt": _jlpt(ch),
        "strokeCount": rs[1] if rs else None,
        "expandable": _has_structure(ch),
    }
    node.update(extra)
    return node


def _radical_info(ch: str) -> Optional[dict]:
    r = radicals.radical_of(ch)
    if not r:
        return None
    return {"no": r["no"], "char": r["unified"], "nameVi": r["name_vi"], "meaningVi": r["meaning_vi"], "hanViet": r["han_viet"]}


def _stats(nodes: list[dict]) -> dict:
    return {
        "kanji": sum(1 for n in nodes if n["type"] != "word"),
        "words": sum(1 for n in nodes if n["type"] == "word"),
        "parts": kanjidata.availability()["kanjiParts"],
        "jmdict": jmdict.available(),
    }


# ----------------------------------------------------------------------------- resolve

def kanji_run(text: str) -> list[str]:
    """Cụm chữ Hán liền nhau đầu tiên (々〆ヶ không cắt cụm nhưng bị bỏ khỏi kết quả), khử trùng giữ thứ tự: 学生です → 学 生,
    人々 → 人, 食べる → 食. Không có chữ Hán thật → []."""
    return list(dict.fromkeys(c for c in _raw_run(text) if _is_real_kanji(c)))


def _raw_run(text: str) -> str:
    """Chuỗi gốc của cụm chữ Hán đầu tiên (giữ 々), bắt đầu ở chữ Hán thật đầu tiên."""
    start = next((i for i, c in enumerate(text or "") if _is_real_kanji(c)), None)
    if start is None:
        return ""
    end = start
    while end < len(text) and is_kanji(text[end]):
        end += 1
    return text[start:end]


def _from_run(text: str) -> dict:
    """R1 (spec từ nhiều chữ §2): 1 chữ → tâm chữ; 2–4 chữ → từ (term = chuỗi gốc của cụm); ≥ 5 → chữ đầu, không có từ."""
    chars = kanji_run(text)
    term = _raw_run(text) if MIN_WORD_CHARS <= len(chars) <= MAX_WORD_CHARS else None
    return {"center": chars[0], "candidates": [], "term": term, "chars": chars, "wordCandidates": []}


def word_candidate(w: dict) -> dict:
    """Một mục của han_viet_graph.words_of → ứng viên từ {term, reading, hanViet, jlpt, meaningEn, key}."""
    return {"term": w["term"], "reading": w["reading"], "hanViet": han_viet.han_viet(w["term"]), "jlpt": w["level"],
            "meaningEn": w["meaning"], "key": _word_key(w)}


def _usable_word(term: str, source: str = "jlpt") -> bool:
    """Từ có 1–4 chữ Hán. Từ JMdict còn phải chỉ gồm chữ trong bộ chữ JLPT: JMdict đánh dấu thông dụng cả dạng chữ cũ
    (學生, 髮) nên không lọc thì "がくせい" ra hai ứng viên thay vì đi thẳng vào 学生."""
    kanji = [c for c in term if _is_real_kanji(c)]
    if not 1 <= len(kanji) <= MAX_WORD_CHARS:
        return False
    return source == "jlpt" or all(c in classifier.jlpt_kanji_set() for c in kanji)


def _words_by_kana(kana: str) -> list[dict]:
    """R2: từ JLPT đọc là ``kana`` (cấp dễ → khó) rồi JMdict thông dụng, chỉ từ có 1–4 chữ Hán, mỗi từ một lần."""
    hira = kata_to_hira(kana)
    out: list[dict] = []
    seen: set[str] = set()
    for expr, meaning, level in classifier.homophones_jlpt(hira):
        if expr not in seen and _usable_word(expr):
            seen.add(expr)
            out.append({"term": expr, "reading": hira, "meaning": meaning or None, "level": level, "source": "jlpt"})
    for kanji, gloss in _jmdict_by_kana(hira):
        if kanji not in seen and _usable_word(kanji, "jmdict"):
            seen.add(kanji)
            out.append({"term": kanji, "reading": hira, "meaning": gloss or None, "level": None, "source": "jmdict"})
    return out


def _jmdict_by_kana(hira: str) -> list[tuple[str, str]]:
    path = jmdict.DATA_FILE
    if not path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            return conn.execute("SELECT kanji, gloss FROM entries WHERE common=1 AND kanji IS NOT NULL AND kana=?",
                                (hira,)).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:  # file hỏng / khác schema → chỉ còn từ JLPT
        return []


def _words_by_han_viet(syllables: list[str]) -> list[dict]:
    """R4: từ có đúng n chữ, chữ thứ i thuộc tập chữ của âm thứ i (khớp có dấu, hoặc gập dấu khi gõ không dấu)."""
    sets = [{c for _, chars in han_viet_graph.kanji_for(s) for c in chars} for s in syllables]
    if not all(sets):
        return []
    n = len(syllables)
    out: dict[str, dict] = {}
    for c in sets[0]:
        for w in han_viet_graph.words_of(c):
            t = w["term"]
            if t not in out and len(t) == n and all(t[i] in sets[i] for i in range(n)) and _usable_word(t, w["source"]):
                out[t] = w
    return sorted(out.values(), key=han_viet_graph._word_sort_key)


def _pick_word(words: list[dict]) -> Optional[dict]:
    """R2 / R4: một từ → như R1 với từ đó; nhiều từ → wordCandidates (≤ MAX_WORD_CANDIDATES); không có → None."""
    if not words:
        return None
    if len(words) == 1:
        return _from_run(words[0]["term"])
    return {"center": None, "candidates": [], "term": None, "chars": [],
            "wordCandidates": [word_candidate(w) for w in words[:MAX_WORD_CANDIDATES]]}


def resolve(q: str) -> dict:
    """{center, candidates, term, chars, wordCandidates} theo spec từ nhiều chữ §2: R1 cụm chữ Hán (1 chữ → tâm chữ, 2–4 →
    từ, ≥ 5 → chữ đầu), R2 toàn kana → từ, R3 âm Hán-Việt đơn → chữ / ứng viên chữ, R4 Hán-Việt 2–4 âm → từ, R5 rỗng.
    Khi có term, center là chữ đầu của từ (chữ mặc định cho structure / compounds)."""
    text = (q or "").strip()
    empty = {"center": None, "candidates": [], "term": None, "chars": [], "wordCandidates": []}
    if not text:
        return empty
    if kanji_run(text):
        return _from_run(text)
    if any(is_kanji(ch) for ch in text):
        return empty  # chỉ có 々〆ヶ
    compact = text.replace(" ", "").replace("　", "")
    if is_kana_only(compact):
        return _pick_word(_words_by_kana(compact)) or empty
    syllables = text.split()
    if MIN_WORD_CHARS <= len(syllables) <= MAX_WORD_CHARS:
        return _pick_word(_words_by_han_viet(syllables)) or empty
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for display, chars in han_viet_graph.kanji_for(text):
        for ch in chars:
            if ch not in seen and _is_real_kanji(ch):
                seen.add(ch)
                found.append((ch, display))
    if not found:
        return empty
    if len(found) == 1:
        return {**empty, "center": found[0][0], "chars": [found[0][0]]}
    cands = [{"kanji": ch, "hanViet": display, "jlpt": _jlpt(ch), "meaningEn": kanji_meanings.meaning(ch)}
             for ch, display in found]
    cands.sort(key=lambda c: classifier.level_index(c["jlpt"]))  # ổn định: giữ xếp hạng của kanji_for trong cùng cấp
    return {**empty, "candidates": cands[:MAX_CANDIDATES]}


# ----------------------------------------------------------------------------- từ ghép (dùng chung cho detail)

def _top_words(ch: str, limit: int = MAX_WORDS) -> list[dict]:
    """Từ chứa chữ: JLPT trước JMdict common, cấp dễ → khó rồi thông dụng (han_viet_graph._word_sort_key), ≤ limit.
    Mỗi từ kèm ``key`` để backend ghép nghĩa Việt: JMdict → w:<id>; từ JLPT không có trong JMdict → w:jlpt:<từ>|<đọc>."""
    words = sorted(han_viet_graph.words_of(ch), key=han_viet_graph._word_sort_key)[: max(limit, 0)]
    out = []
    for w in words:
        key = _word_key(w)
        out.append({"term": w["term"], "reading": w["reading"], "meaningEn": w["meaning"], "jlpt": w["level"],
                    "hanViet": han_viet.han_viet(w["term"]), "key": key})
    return out


def _word_key(w: dict) -> Optional[str]:
    from app.extract import dictionary  # noqa: PLC0415 (mở sqlite; chỉ khi cần khoá)
    key = dictionary.key_for(w["term"], w["reading"]) if jmdict.available() else None
    if key:
        return key
    if w["source"] == "jlpt" and w["reading"]:
        return f"w:jlpt:{w['term']}|{w['reading']}"
    return None


# ----------------------------------------------------------------------------- chi tiết chữ tâm (panel)

def detail(ch: str) -> dict:
    p = kanjidata.parts(ch)
    rs = kanjidata.radical_strokes(ch)
    phon_part, phon, guessed = _phon_of(ch, p)
    formula = []
    if p:
        for part, original, position in _real_parts(ch, p):
            item = {"part": part, "original": original, "position": position, "role": _role(p, part, phon_part),
                    "hanViet": han_viet.han_viet(original or part)}
            if guessed and part == phon_part:
                item["guess"] = True
            formula.append(item)
    phon_of = [{"kanji": k, "hanViet": han_viet.han_viet(k), "jlpt": _jlpt(k), "sameOn": _same_on(k, ch)}
               for k in _family(ch)]
    return {
        "kanji": ch,
        "hanViet": han_viet.han_viet(ch),
        "meaningEn": kanji_meanings.meaning(ch),
        "on": _on_readings(ch),
        "kun": _kun_readings(ch),
        "strokeCount": rs[1] if rs else None,
        "jlpt": _jlpt(ch),
        "radical": _radical_info(ch),
        "formula": formula,
        "phon": phon,
        "phonGuess": guessed,
        "phonOf": phon_of,
        "compounds": _top_words(ch),
    }


def _role(p: kanjidata.Parts, part: str, phon_part: Optional[str]) -> str:
    if part == phon_part:
        return "phon"
    if part == p.radical_part:
        return "radical"
    return "part"


def _family(component: str) -> list[str]:
    """Chữ JLPT có thành phần chỉ âm ``component`` (trừ chính nó), cấp dễ → khó rồi ít nét trước, ≤ MAX_FAMILY."""
    jl = classifier.jlpt_kanji_set()
    members = [k for k in kanjidata.phon_family(component) if k != component and k in jl]
    members.sort(key=lambda k: (classifier.level_index(_jlpt(k)), (kanjidata.radical_strokes(k) or (0, 99))[1], k))
    return members[:MAX_FAMILY]


# ----------------------------------------------------------------------------- chế độ Cấu tạo

def structure(ch: str) -> dict:
    """nodes: center + component (role radical / phon / part, position, phon nếu part là biến thể của chỉ âm) + phonetic
    (họ cùng chỉ âm, sameOn); edges: part → tâm (radical / phon / part), part chỉ âm → chữ cùng họ (phon nếu trùng âm On,
    family nếu không)."""
    nodes = [_kanji_node(ch, "center")]
    edges: list[dict] = []
    p = kanjidata.parts(ch)
    if p:
        phon_part, phon, guessed = _phon_of(ch, p)
        seen_parts: set[str] = set()
        for part, original, position in _real_parts(ch, p):
            role = _role(p, part, phon_part)
            if part in seen_parts:
                continue  # part lặp (三 = 一 一 一): một node, một cạnh — review 30/10 M1
            seen_parts.add(part)
            extra = {"role": role, "position": position, "original": original}
            if role == "phon" and phon and phon != part:
                extra["phon"] = phon
            if role == "phon" and part == p.radical_part:
                extra["isRadical"] = True
            if role == "phon" and guessed:
                extra["guess"] = True
            nodes.append(_kanji_node(part, "component", **extra))
            edges.append({"from": f"k:{part}", "to": f"k:{ch}", "type": role})
        if p.radical_part is None:
            _attach_unihan_radical(ch, p, nodes, edges)
        if phon and phon_part:
            src = f"k:{phon_part}"
            present = {n["id"] for n in nodes}
            for k in _family(phon):
                if k == ch or f"k:{k}" in present:
                    continue  # 溶: KanjiVG đánh phon 谷 trên 容 nên 容 vừa là thành phần vừa thuộc họ — chỉ giữ thành phần (I1)
                same = _same_on(k, phon)
                nodes.append(_kanji_node(k, "phonetic", sameOn=same))
                edges.append({"from": src, "to": f"k:{k}", "type": "phon" if same else "family"})
    return {"nodes": nodes, "edges": edges, "detail": detail(ch), "stats": _stats(nodes)}


def _attach_unihan_radical(ch: str, p: kanjidata.Parts, nodes: list[dict], edges: list[dict]) -> None:
    """KanjiVG không đánh dấu bộ (≈ 65 chữ JLPT): lấy bộ Unihan; trùng một part (hoặc chữ gốc của biến thể) thì đổi vai
    part đó, không thì thêm node bộ riêng."""
    r = radicals.radical_of(ch)
    if not r:
        return
    unified = r["unified"]
    for node in nodes:
        if node["type"] == "component" and (node["label"] == unified or node.get("original") == unified) \
                and node["role"] == "part":
            node["role"] = "radical"
            for e in edges:
                if e["from"] == node["id"] and e["to"] == f"k:{ch}" and e["type"] == "part":
                    e["type"] = "radical"
            return
    if unified == ch or any(n["id"] == f"k:{unified}" for n in nodes):
        return
    nodes.append(_kanji_node(unified, "component", role="radical", position=None, original=None, virtual=True))
    edges.append({"from": f"k:{unified}", "to": f"k:{ch}", "type": "radical"})


# ----------------------------------------------------------------------------- chế độ Từ ghép

def compounds(ch: str, limit: int = MAX_WORDS) -> dict:
    """nodes: center + word (w:<từ>, reading, jlpt, hanViet, key) + kanji (chữ khác trong từ); edges: tâm → từ (compound),
    từ → chữ khác (contains)."""
    nodes = [_kanji_node(ch, "center")]
    edges: list[dict] = []
    seen_kanji: set[str] = {ch}
    words = _top_words(ch, limit)
    for w in words:
        wid = f"w:{w['term']}"
        nodes.append({"id": wid, "type": "word", "label": w["term"], "reading": w["reading"], "meaningEn": w["meaningEn"],
                      "jlpt": w["jlpt"], "hanViet": w["hanViet"], "key": w["key"], "expandable": False})
        edges.append({"from": f"k:{ch}", "to": wid, "type": "compound"})
        for other in dict.fromkeys(w["term"]):
            if other == ch or not _is_real_kanji(other):
                continue
            if other not in seen_kanji:
                seen_kanji.add(other)
                nodes.append(_kanji_node(other, "kanji", expandable=True))
            edges.append({"from": wid, "to": f"k:{other}", "type": "contains"})
    d = detail(ch)
    d["compounds"] = words
    return {"nodes": nodes, "edges": edges, "detail": d, "stats": _stats(nodes)}


# ----------------------------------------------------------------------------- endpoint

def diagram(q: str, mode: str = "structure") -> dict:
    """Payload {query, mode, center, candidates, nodes, edges, detail, stats}; mode lạ → ValueError (router đổi thành 400).
    Không tìm được chữ / phải chọn chữ → đồ thị rỗng, detail None."""
    if mode not in MODES:
        raise ValueError(f"mode không hợp lệ: {mode} (chỉ nhận {', '.join(MODES)})")
    r = resolve(q)
    base = {"query": q, "mode": mode, "center": None, "candidates": r["candidates"], "nodes": [], "edges": [],
            "detail": None, "stats": _stats([])}
    if not r["center"]:
        return base
    ch = r["center"]
    body = structure(ch) if mode == "structure" else compounds(ch)
    base.update(body)
    base["center"] = f"k:{ch}"
    return base
