"""Stage ANALYZE (plan §4): văn bản → từ vựng + ngữ pháp + cấp JLPT (contract §B2).

Bố cục (`extractMode` auto/list/prose, nhận dạng bằng entries.detect_layout): `list` = danh sách / bảng từ vựng,
mỗi dòng một cụm + nghĩa in sẵn (không tách từ bên trong, không ngữ pháp); `prose` = các bước dưới đây.

Các bước: tách câu → Sudachi mode C (ứng viên) + mode A (thành phần từ ghép, ngữ pháp)
→ lọc POS → gộp theo lemma → furigana / Hán-Việt / nghĩa → phân tầng → lọc theo tuỳ chọn
→ giới hạn 600 từ vựng + 100 ngữ pháp → sắp theo vị trí → thống kê.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Optional

from app.extract import han_viet as hv
from app.extract import jmdict
from app.extract.chapters import Chapter, split_chapters
from app.extract.entries import detect_layout, is_japanese_char, parse_line
from app.extract.furigana import align
from app.extract.grammar import match_document
from app.extract.jachars import has_japanese, has_kanji, is_kana_only, kata_to_hira
from app.extract.jlpt import LEVELS, classify, level_index, meaning_hint, phrase_level
from app.extract.readers.text_reader import extract_paren_rubies
from app.extract.tokenizer import Token, reading_of, tokenize

MAX_TEXT_CHARS = 50_000
MAX_VOCAB = 600
MAX_GRAMMAR = 100
EXAMPLE_MAX = 500

# Văn bản OCR (blocks có lines + conf): dòng đọc kém lẫn chữ Anh dính liền và ký hiệu rác ("銀行でお金を[まっッmetmoney…")
# conf là của cả dòng; bảng song ngữ có dòng ~0.4-0.6 dù phần tiếng Nhật đúng → không dùng conf để loại từ có nghĩa.
EXAMPLE_MIN_CONF = 0.40        # dòng dưới mức này không dùng làm ví dụ
SINGLE_CHAR_MIN_CONF = 0.75    # từ 1 ký tự trên dòng dưới mức này thường là chữ Trung/Hàn bị đọc nhầm (具, 戸, 肌…)
UNLEVELED_MIN_CONF = 0.60      # từ không có cấp JLPT trên dòng dưới mức này cũng đáng ngờ (生生, 交直…)
# Chữ số ASCII không tính: OCR hay đọc nhầm nét thành "9", "6" ngay giữa cụm chữ Nhật
_JA_RUN_RE = re.compile(r"[ぁ-ゖァ-ヺー一-鿿㐀-䶿々〆ヶ０-９、。，．・「」『』（）〜～！？]+")

_SENT_SPLIT_RE = re.compile(r"(?<=[。！？．!?])|\n")

# POS lớp 1 được giữ làm ứng viên từ vựng
_KEEP_POS1 = {"名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞"}
# Động từ 非自立可能 bị bỏ khi đứng sau て/で (vai trò bổ trợ) hoặc nằm trong nhóm chức năng
_FUNCTIONAL_VERBS = {"する", "なる", "ある", "いる", "できる", "いける", "しれる", "くださる", "なさる",
                     "おる", "ござる", "いたす", "致す", "いう", "言う"}
_FUNCTIONAL_ADJ = {"ない", "無い", "いい", "よい", "良い", "ほしい", "欲しい"}

DEFAULT_OPTIONS: dict[str, Any] = {
    "userLevel": "N5",
    "levelFilter": "all",
    "includeGrammar": True,
    "includeFurigana": True,
    "includeHanViet": True,
    "meaningLang": "vi",
    "treatUnknownAs": "above",
    "minFrequency": 1,
    "ocrMode": "auto",
    "extractMode": "auto",   # auto | list | prose — bố cục danh sách từ vựng (cụm + nghĩa in sẵn) hay văn xuôi
}
PHRASE_MAX_CHARS = 40          # cụm dài hơn mức này trong danh sách thường là dòng OCR dính → suspect
_PHRASE_INNER = set("、・「」『』〜～")


def split_sentences(text: str) -> list[str]:
    """Tách theo 。！？．!? và xuống dòng; bỏ câu không có kana/kanji."""
    out = []
    for part in _SENT_SPLIT_RE.split(text):
        s = (part or "").strip()
        if s and has_japanese(s):
            out.append(s)
    return out


def _line_confs(blocks: Optional[list[dict]]) -> list[tuple[str, float]]:
    """(dòng, conf) của các dòng OCR Tesseract; rỗng với văn bản thường / DOCX / PDF có chữ / Gemini."""
    out = []
    for b in blocks or []:
        for ln in b.get("lines") or []:
            if ln.get("text") and isinstance(ln.get("conf"), (int, float)):
                out.append((ln["text"], float(ln["conf"])))
    return out


def _sentence_conf(sent: str, lines: list[tuple[str, float]]) -> Optional[float]:
    """conf của dòng OCR chứa câu (câu là một dòng hoặc một phần dòng tách ở 。); None = không phải OCR."""
    for line, conf in lines:
        if sent in line:
            return conf
    return None


def _clean_run(run: str) -> str:
    return run.strip("、・，")


def _ocr_example(sent: str, begin: int, surface: str) -> Optional[str]:
    """Cụm tiếng Nhật liền mạch quanh từ (cắt ở chữ Latin / ký hiệu lạ); quá ngắn thì bỏ."""
    for m in _JA_RUN_RE.finditer(sent):
        if m.start() <= begin and begin + len(surface) <= m.end():
            run = _clean_run(m.group())
            return run[:EXAMPLE_MAX] if len(run) >= len(surface) + 2 else None
    return None


def _is_candidate(tok: Token, prev: Optional[Token]) -> bool:
    p1, p2 = tok.pos1, tok.pos2
    if p1 not in _KEEP_POS1:
        return False
    if not has_japanese(tok.lemma) or not has_japanese(tok.surface):
        return False
    if is_kana_only(tok.lemma) and len(tok.lemma) == 1:
        return False
    if p1 == "名詞" and p2 == "数詞":
        return False
    if p1 == "名詞" and p2 == "固有名詞":
        # Tên người / địa danh không phải từ vựng để học, trừ khi giáo trình JLPT có dạy (日本, 東京...)
        _, _, sources = classify(tok.lemma, tok.reading, False)
        return any(src.startswith("jlpt_list") for src in sources)
    if p1 == "形状詞" and p2 == "助動詞語幹":   # よう / そう / みたい
        return False
    if p1 == "名詞" and p2 == "助動詞語幹":     # そう (伝聞)
        return False
    if p1 == "動詞" and p2 == "非自立可能":
        if prev is not None and prev.pos1 == "助詞" and prev.surface in ("て", "で"):
            return False
        if tok.lemma in _FUNCTIONAL_VERBS:
            return False
    if p1 == "形容詞" and p2 == "非自立可能" and tok.lemma in _FUNCTIONAL_ADJ:
        return False
    return True


def _in_dictionary(lemma: str, reading: Optional[str]) -> bool:
    lv, _, _ = classify(lemma, reading, is_kana_only(lemma))
    if lv is not None and not _is_wordfreq_only(lemma, reading):
        return True
    return jmdict.lookup(lemma, reading) is not None


def _is_wordfreq_only(lemma: str, reading: Optional[str]) -> bool:
    _, _, sources = classify(lemma, reading, is_kana_only(lemma))
    return bool(sources) and all(s.startswith("wordfreq:") for s in sources)


def _lemma_reading(tok: Token) -> str:
    if tok.surface == tok.lemma:
        return tok.reading
    return reading_of(tok.lemma) or tok.reading


def _components(c_tok: Token, a_tokens: list[Token]) -> list[Token]:
    return [a for a in a_tokens if a.begin >= c_tok.begin and a.end <= c_tok.end]


def _expand_compound(c_tok: Token, a_tokens: list[Token]) -> list[Token]:
    """Từ ghép (mode C gồm ≥2 token mode A): có trong từ điển → giữ; không có nhưng
    mọi thành phần có → trả về thành phần; còn lại giữ compound (unknown)."""
    if c_tok.pos1 != "名詞":
        return [c_tok]
    parts = _components(c_tok, a_tokens)
    if len(parts) < 2:
        return [c_tok]
    if _in_dictionary(c_tok.lemma, _lemma_reading(c_tok)):
        return [c_tok]
    parts = [p for p in parts if _is_candidate(p, None)]
    if parts and all(_in_dictionary(p.lemma, _lemma_reading(p)) for p in parts):
        return parts
    return [c_tok]


def _passes_level_filter(level: Optional[str], opts: dict) -> bool:
    if level is None:
        return opts["treatUnknownAs"] != "drop"
    mode = opts["levelFilter"]
    if mode == "all":
        return True
    user_idx = level_index(opts["userLevel"])
    idx = level_index(level)
    if mode == "at_or_above":
        return idx >= user_idx
    if mode == "only_unknown_to_me":
        return idx > user_idx
    return True


def analyze(text: str, blocks: Optional[list[dict]], options: Optional[dict]) -> dict:
    opts = {**DEFAULT_OPTIONS, **(options or {})}
    if opts.get("userLevel") not in LEVELS:
        opts["userLevel"] = "N5"
    truncated = False
    if len(text) > MAX_TEXT_CHARS:
        text, truncated = text[:MAX_TEXT_CHARS], True

    # Ruby từ nguồn (DOCX / ngoặc) → base → reading; văn bản dán thẳng cũng có thể còn 漢字（かんじ）
    text, paren_rubies = extract_paren_rubies(text)
    rubies: dict[str, str] = {}
    for b in list(blocks or []) + [{"rubies": paren_rubies}]:
        for rb in b.get("rubies") or []:
            if rb.get("base") and rb.get("reading"):
                rubies.setdefault(rb["base"], kata_to_hira(rb["reading"]))

    ocr_lines = _line_confs(blocks)
    mode = opts.get("extractMode")
    # Tách chương (nếu bật): mỗi chương chạy pipeline riêng rồi gộp lại, cap vẫn áp toàn tài liệu trong _finish
    split = bool(opts.get("splitChapters"))
    chapters, detected = split_chapters(text, blocks) if split else ([Chapter(1, None, text, 0, 0)], False)
    items, grammar_items, n_sentences, total_tokens, layouts = [], [], 0, 0, []
    # tần suất là số đếm toàn tài liệu → khi tách chương, lọc minFrequency sau khi gộp
    ch_opts = {**opts, "minFrequency": 1} if split else opts
    for ch in chapters:
        layout = mode if mode in ("list", "prose") else detect_layout(ch.text)
        ci, gi, s, t = [], [], 0, 0
        if layout == "list":
            ci, gi, s, t = _list_items(ch.text, ch_opts, rubies, ocr_lines)
            if not ci and mode != "list":
                # auto nhận nhầm (vd. toàn dòng chú thích có dấu tách) → đừng trả rỗng im lặng, chạy văn xuôi
                layout = "prose"
        if layout == "prose":
            ci, gi, s, t = _prose_items(ch.text, ch_opts, rubies, ocr_lines)
        for it in ci + gi:
            it["chapter"] = ch.index if split else None
            it["_order"] = (ch.index,) + tuple(it["_order"])  # sắp theo chương trước
        items += ci
        grammar_items += gi
        n_sentences += s
        total_tokens += t
        layouts.append(layout)
    if split:
        min_freq = int(opts.get("minFrequency") or 1)
        items = [it for it in _merge_chapters(items) if it["frequency"] >= min_freq]
        grammar_items = [it for it in _merge_chapters(grammar_items) if it["frequency"] >= min_freq]
    layout = "list" if layouts and all(l == "list" for l in layouts) else "prose"
    result = _finish(items, grammar_items, n_sentences, total_tokens, layout, truncated)
    if split:
        counts = Counter((it["chapter"], it["kind"]) for it in result["items"])
        result["stats"]["chaptersDetected"] = detected
        result["stats"]["chapters"] = [
            {"index": ch.index, "title": ch.title,
             "vocab": counts[(ch.index, "vocab")], "grammar": counts[(ch.index, "grammar")]}
            for ch in chapters]
    return result


def _merge_chapters(lst: list[dict]) -> list[dict]:
    """Cùng (kind, term) xuất hiện ở nhiều chương → giữ bản ở chương đầu, cộng tần suất, bỏ cờ suspect nếu có bản đáng tin."""
    merged: dict[tuple, dict] = {}
    for it in sorted(lst, key=lambda x: x["_order"]):
        key = (it["kind"], it["term"])
        first = merged.get(key)
        if first is None:
            merged[key] = it
            continue
        first["frequency"] += it["frequency"]
        first["suspect"] = first["suspect"] and it["suspect"]  # xuất hiện tốt ở chương khác → không nghi ngờ
    return list(merged.values())


def _dict_meaning(lemma: str, reading: Optional[str], kana_only: bool) -> Optional[str]:
    """Nghĩa EN từ từ điển: từ toàn kana (こと, とても…) tra JMdict theo kana dễ trúng từ đồng âm → ưu tiên danh sách JLPT."""
    hint = meaning_hint(lemma, reading)
    entry = jmdict.lookup(lemma, reading)
    if kana_only and hint:
        return hint
    return (entry["gloss"] if entry else None) or hint


def _prose_items(text: str, opts: dict, rubies: dict[str, str], ocr_lines: list[tuple[str, float]]):
    """Văn xuôi: tách câu → Sudachi → từ đơn + mẫu ngữ pháp. Trả (items, grammar_items, số câu, số token)."""
    sentences = split_sentences(text)
    sent_confs: list[Optional[float]] = []
    vocab: dict[tuple[str, str], dict] = {}
    grammar_input: list[tuple[int, str, list[Token]]] = []
    total_tokens = 0

    for s_idx, sent in enumerate(sentences):
        conf = _sentence_conf(sent, ocr_lines) if ocr_lines else None
        sent_confs.append(conf)
        c_tokens = tokenize(sent, "C")
        a_tokens = tokenize(sent, "A")
        total_tokens += len(c_tokens)
        if opts["includeGrammar"]:
            grammar_input.append((s_idx, sent, a_tokens))
        prev: Optional[Token] = None
        for c_tok in c_tokens:
            if not _is_candidate(c_tok, prev):
                prev = c_tok
                continue
            for tok in _expand_compound(c_tok, a_tokens):
                key = (tok.lemma, tok.pos1)
                if conf is None:
                    example = sent[:EXAMPLE_MAX]
                else:
                    example = _ocr_example(sent, tok.begin, tok.surface) if conf >= EXAMPLE_MIN_CONF else None
                entry = vocab.get(key)
                if entry is None:
                    vocab[key] = {
                        "lemma": tok.lemma, "pos": tok.pos1, "surface": tok.surface,
                        "reading": rubies.get(tok.surface) or rubies.get(tok.lemma) or _lemma_reading(tok),
                        "frequency": 1, "order": (s_idx, tok.begin), "example": example, "conf": conf,
                    }
                else:
                    entry["frequency"] += 1
                    entry["example"] = entry["example"] or example  # lần đầu ở dòng kém → lấy ví dụ ở dòng sau
                    if entry["conf"] is not None:
                        entry["conf"] = None if conf is None else max(entry["conf"], conf)
            prev = c_tok

    items: list[dict] = []
    for v in vocab.values():
        lemma, reading = v["lemma"], v["reading"] or None
        kana_only = is_kana_only(lemma)
        level, conf, sources = classify(lemma, reading, kana_only)
        if not _passes_level_filter(level, opts) or v["frequency"] < int(opts.get("minFrequency") or 1):
            continue
        meaning_en = _dict_meaning(lemma, reading, kana_only)
        # Chỉ với OCR: bỏ chọn sẵn để người dùng xem lại (vẫn hiện, tick lại được)
        best = v["conf"]
        suspect = best is not None and (
            not meaning_en
            or (len(lemma) == 1 and best < SINGLE_CHAR_MIN_CONF)
            or (level is None and best < UNLEVELED_MIN_CONF))
        segments = None
        if opts["includeFurigana"] and reading and has_kanji(lemma):
            segments = align(lemma, reading)
        items.append({
            "kind": "vocab",
            "position": 0,
            "_order": v["order"],
            "term": lemma,
            "surface": v["surface"],
            "reading": reading,
            "readingSegments": segments,
            "hanViet": hv.han_viet(lemma) if opts["includeHanViet"] else None,
            "pos": v["pos"],
            "meaningEn": meaning_en,
            "meaningVi": None,
            "level": level,
            "levelConfidence": round(conf, 3),
            "levelSources": sources,
            "frequency": v["frequency"],
            "example": v["example"],
            "exampleVi": None,
            "suspect": suspect,
        })

    grammar_items: list[dict] = []
    if opts["includeGrammar"]:
        for g in match_document(grammar_input):
            if _passes_level_filter(g["level"], opts) and g["frequency"] >= int(opts.get("minFrequency") or 1):
                conf = sent_confs[g["_order"][0]]
                if conf is not None:
                    # matcher không giữ vị trí ký tự → lấy cụm tiếng Nhật dài nhất của dòng OCR
                    runs = [_clean_run(r) for r in _JA_RUN_RE.findall(g["example"] or "")]
                    g["example"] = max(runs, key=len, default=None) if conf >= EXAMPLE_MIN_CONF else None
                g["suspect"] = False
                grammar_items.append(g)
    return items, grammar_items, len(sentences), total_tokens


def _list_items(text: str, opts: dict, rubies: dict[str, str], ocr_lines: list[tuple[str, float]]):
    """Danh sách từ vựng: mỗi dòng một (vài) cụm + nghĩa in sẵn; không tách từ bên trong cụm, không ngữ pháp
    (spec §2.4, Q1/Q3/Q4). Trả (items, [], số dòng tiếng Nhật, số token)."""
    vocab: dict[str, dict] = {}
    n_lines = total_tokens = 0
    for idx, line in enumerate(text.splitlines()):
        if not has_japanese(line):
            continue
        n_lines += 1
        entry = parse_line(line)
        if entry is None:
            continue
        conf = _sentence_conf(line.strip(), ocr_lines) if ocr_lines else None
        for term in entry.headwords:
            v = vocab.get(term)
            if v is not None:
                v["frequency"] += 1
                if v["conf"] is not None:
                    v["conf"] = None if conf is None else max(v["conf"], conf)
                if not v["gloss"] and entry.gloss:
                    v["gloss"], v["gloss_lang"] = entry.gloss, entry.gloss_lang
                continue
            c_tokens = tokenize(term, "C")
            total_tokens += len(c_tokens)
            vocab[term] = {"term": term, "tokens": c_tokens, "gloss": entry.gloss, "gloss_lang": entry.gloss_lang,
                           "reading": entry.reading, "frequency": 1, "order": (idx, 0), "conf": conf}

    min_freq = int(opts.get("minFrequency") or 1)
    items: list[dict] = []
    for v in vocab.values():
        term, c_tokens = v["term"], v["tokens"]
        reading = v["reading"] or rubies.get(term) or reading_of(term) or None
        if len(c_tokens) == 1:
            tok = c_tokens[0]
            kana_only = is_kana_only(tok.lemma)
            level, conf, sources = classify(tok.lemma, reading, kana_only)
            dict_en = _dict_meaning(tok.lemma, reading, kana_only)
            pos = tok.pos1
            han = hv.han_viet(term) if opts["includeHanViet"] and has_kanji(term) else None
        else:
            level, conf, sources = classify(term, reading, False)
            if level is None:
                content, prev = [], None
                for t in c_tokens:
                    if _is_candidate(t, prev):
                        content.append(t)
                    prev = t
                level, conf, sources = phrase_level([(t.lemma, _lemma_reading(t)) for t in content])
            found = jmdict.lookup(term, reading)
            dict_en = found["gloss"] if found else None
            pos, han = "句", None
        if not _passes_level_filter(level, opts) or v["frequency"] < min_freq:
            continue
        meaning_en = meaning_vi = None
        if v["gloss_lang"] == "vi":
            meaning_vi, meaning_en = v["gloss"], dict_en
        elif v["gloss_lang"] == "en":
            meaning_en = v["gloss"]
        else:
            meaning_en = dict_en
        best = v["conf"]
        suspect = (
            (best is not None and (
                (not dict_en and best < UNLEVELED_MIN_CONF)
                or (len(term) == 1 and best < SINGLE_CHAR_MIN_CONF)))
            or any(not (is_japanese_char(c) or c in _PHRASE_INNER) for c in term)
            or len(term) > PHRASE_MAX_CHARS)
        segments = align(term, reading) if opts["includeFurigana"] and reading and has_kanji(term) else None
        items.append({
            "kind": "vocab",
            "position": 0,
            "_order": v["order"],
            "term": term,
            "surface": term,
            "reading": reading,
            "readingSegments": segments,
            "hanViet": han,
            "pos": pos,
            "meaningEn": meaning_en,
            "meaningVi": meaning_vi,
            "level": level,
            "levelConfidence": round(conf, 3),
            "levelSources": sources,
            "frequency": v["frequency"],
            "example": None,
            "exampleVi": None,
            "suspect": suspect,
        })
    return items, [], n_lines, total_tokens


def _finish(items: list[dict], grammar_items: list[dict], n_sentences: int, total_tokens: int,
            layout: str, truncated: bool) -> dict:
    """Giới hạn số lượng, gộp và đánh số vị trí, thống kê (chung cho cả hai bố cục)."""
    def _limit(lst: list[dict], n: int) -> list[dict]:
        if len(lst) <= n:
            return lst
        return sorted(lst, key=lambda x: (-x["frequency"], x["_order"]))[:n]

    items = _limit(items, MAX_VOCAB)
    grammar_items = _limit(grammar_items, MAX_GRAMMAR)
    merged = sorted(items + grammar_items, key=lambda x: x["_order"])
    by_level = {lv: 0 for lv in LEVELS}
    by_level["unknown"] = 0
    for pos, it in enumerate(merged, start=1):
        it["position"] = pos
        it.pop("_order", None)
        by_level[it["level"] or "unknown"] += 1

    return {
        "items": merged,
        "stats": {
            "vocab": len(items),
            "grammar": len(grammar_items),
            "byLevel": by_level,
            "sentences": n_sentences,
            "tokens": total_tokens,
            "layout": layout,
        },
        "truncated": truncated,
    }
