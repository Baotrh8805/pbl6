"""Sơ đồ chữ Hán cho trang /graph (spec 2026-10-30 §3.4): cấu tạo (thành phần, bộ thủ, thành phần chỉ âm, họ chữ cùng chỉ âm)
và từ ghép, dựng hoàn toàn từ dữ liệu tĩnh — kanji_parts.csv (KanjiVG), Unihan, danh sách JLPT, JMdict nếu có — không cần Neo4j.

Tâm sơ đồ là một chữ Hán; người dùng có thể gõ âm Hán-Việt: một chữ → tâm ngay, nhiều chữ → ``candidates`` để frontend cho
chọn. Nhãn trung thực (D2): chữ cùng họ chỉ âm nhưng không trùng âm On với thành phần chỉ âm (待 không đọc ジ) nối bằng cạnh
``family`` thay vì ``phon``. Backend chỉ ghép thêm ``meaningVi`` theo ``id`` (k:X) và ``key`` (w:<id> / w:jlpt:…) rồi cache.
"""
from __future__ import annotations

from typing import Optional

from app.extract import han_viet, han_viet_graph, jmdict, kanji_meanings, kanjidata, radicals
from app.extract.jachars import is_kanji
from app.extract.jlpt import classifier
from app.extract.kanji_readings import readings_split

MODES = ("structure", "compounds")
MAX_FAMILY = 12          # họ chỉ âm lớn nhất trong JLPT là 8 chữ (莫, 方); trần để canvas không quá tải
MAX_WORDS = 12           # từ ghép trên sơ đồ / panel
MAX_CANDIDATES = 24      # âm Hán-Việt nhiều chữ (THỊ, HOÀ…): đủ để chọn, chữ hiếm không có từ bị cắt
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
    """(part mang chỉ âm, chữ chỉ âm, có phải suy đoán) — KanjiVG trước, heuristic sau."""
    if not p:
        return None, None, False
    if p.phon and p.phon_part:
        return p.phon_part, p.phon, False
    g = _guess_phon(ch, p)
    return (g[0], g[1], True) if g else (None, None, False)


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

def resolve(q: str) -> dict:
    """{center: chữ | None, candidates: [{kanji, hanViet, jlpt, meaningEn}]}. Chữ Hán (hoặc chuỗi chứa chữ Hán: lấy chữ đầu)
    → tâm; âm Hán-Việt (có / không dấu) → một chữ thì làm tâm, nhiều chữ thì liệt kê ứng viên cấp dễ trước; không khớp → rỗng."""
    text = (q or "").strip()
    empty = {"center": None, "candidates": []}
    if not text:
        return empty
    for ch in text:
        if _is_real_kanji(ch):
            return {"center": ch, "candidates": []}
    if any(is_kanji(ch) for ch in text):
        return empty  # chỉ có 々〆ヶ
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
        return {"center": found[0][0], "candidates": []}
    cands = [{"kanji": ch, "hanViet": display, "jlpt": _jlpt(ch), "meaningEn": kanji_meanings.meaning(ch)}
             for ch, display in found]
    cands.sort(key=lambda c: classifier.level_index(c["jlpt"]))  # ổn định: giữ xếp hạng của kanji_for trong cùng cấp
    return {"center": None, "candidates": cands[:MAX_CANDIDATES]}


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
        for part, original, position in zip(p.parts, p.originals, p.positions):
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
        for part, original, position in zip(p.parts, p.originals, p.positions):
            role = _role(p, part, phon_part)
            if part not in seen_parts:
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
            for k in _family(phon):
                if k == ch:
                    continue
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
