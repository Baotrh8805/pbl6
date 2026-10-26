"""Stage ANALYZE (plan §4): văn bản → từ vựng + ngữ pháp + cấp JLPT (contract §B2).

Bố cục (`extractMode` auto/list/prose, nhận dạng bằng entries.detect_layout): `list` = danh sách / bảng từ vựng,
mỗi dòng một cụm + nghĩa in sẵn (không tách từ bên trong, không ngữ pháp); `prose` = các bước dưới đây.

Các bước: tách câu → Sudachi mode C (ứng viên) + mode A (thành phần từ ghép, ngữ pháp)
→ lọc POS → gộp theo lemma → furigana / Hán-Việt / nghĩa → phân tầng → lọc theo tuỳ chọn
→ giới hạn 600 từ vựng + 100 ngữ pháp → sắp theo vị trí → thống kê.

Tách chương (`splitChapters`, lộ trình học tập): cap từ vựng 900 cho cả tài liệu, chia cho từng chương theo tỉ lệ
số ứng viên (LP-17, xem _chapter_caps) thay vì cắt theo tần suất toàn tài liệu — cách cũ làm chương sau "mỏng".

Từ ghép (B4): Sudachi mode C trả về MỘT morpheme có trong SudachiDict (自動販売機, 銀行口座, 東京大学) → giữ nguyên
dù JLPT / JMdict không có; chỉ cụm OOV mới xét tách thành phần (_expand_compound). Từ ghép giữ nguyên mà không có cấp
→ cấp khó nhất của thành phần (phrase_level, như cụm trong bố cục danh sách) và trên OCR chỉ bị nghi ngờ khi OOV.
Cấp toàn tài liệu (B6): stats.byLevelAll (+ byLevelAllVocab / byLevelAllGrammar) / levelPct / overallLevel đếm MỌI
ứng viên — mỗi term một lần, ngữ pháp kể cả khi includeGrammar tắt — trước khi lọc theo tuỳ chọn người dùng (_level_stats).

Mâu thuẫn tài liệu ↔ tham chiếu (F2, conflicts.py): mỗi item trả về mang `conflicts` (luôn là list) = cảnh báo có
confidence ≥ `conflictMinConfidence` (mặc định 0.6) khi `warnConflicts` bật (mặc định); `references` = mục tham chiếu
quản trị ghi đè từ điển, `docLevel` = cấp JLPT tài liệu tự khai (tag "N5" trên dòng danh sách ghi đè). Chỉ so cái tài liệu
KHAI BÁO (cột kana / ruby / nghĩa EN in sẵn), không so cách đọc Sudachi đoán hay nghĩa từ điển điền vào — xem _attach_conflicts.
Các khai báo đó trả công khai trên mọi item: `docReading` / `docMeaningEn` / `docLevel` (None = tài liệu không ghi) để backend
lưu và gửi nguyên lại POST /extract/conflicts.

Furigana theo ngữ cảnh (B5): cách đọc dạng từ điển của từ đã chia suy từ cách đọc TRONG CÂU (_lemma_reading); từ đồng tự
dị âm trong data/heteronyms.yaml (辛い からい / つらい, 開く あく / ひらく…) đổi cách đọc khi ngữ cảnh có cue của cách đọc
khác (heteronyms.resolve) — item mang `readingNote`, levelConfidence giảm 0.1 và levelSources thêm `heteronym:<cue>` để
người dùng xem lại (câu ví dụ của thẻ đó là câu đọc đúng cách đọc đã chọn, _example_for_reading). Mọi item có câu ví
dụ mang `exampleSegments` = [{text, reading|null}] (ruby từng token, _example_segments);
`includeFurigana` tắt → readingSegments / exampleSegments đều None.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Iterable, Optional

from app.extract import conflicts
from app.extract import dictionary, overrides  # từ điển: dictKey + cách đọc ghi đè (spec 2026-10-26)
from app.extract import han_viet as hv
from app.extract import heteronyms
from app.extract import jmdict
from app.extract.chapters import Chapter, SplitResult, split_chapters_ex
from app.extract.entries import detect_layout, is_japanese_char, parse_line
from app.extract.furigana import align, ruby_segments, swap_okurigana
from app.extract.grammar import match_document
from app.extract.jachars import has_japanese, has_kanji, is_kana, is_kana_only, is_kanji, kata_to_hira
from app.extract.jlpt import LEVELS, classify, level_index, meaning_hint, phrase_level
from app.extract.kanji_readings import readings as unihan_readings
from app.extract.readers.text_reader import extract_paren_rubies
from app.extract.tokenizer import Token, reading_of, tokenize

MAX_TEXT_CHARS = 50_000
MAX_VOCAB = 600
MAX_GRAMMAR = 100
# LP-17: tài liệu tách được ≥ 2 chương → cap từ vựng cao hơn và chia theo chương; mỗi chương giữ ít nhất
# min(CHAPTER_VOCAB_FLOOR, số ứng viên) để chương cuối (thường ít từ lặp) không bị cắt sạch
MAX_VOCAB_CHAPTERED = 900
CHAPTER_VOCAB_FLOOR = 20
EXAMPLE_MAX = 500
# B6: cấp tổng thể của tài liệu = cấp L thấp nhất (N5 → N1) sao cho N5..L gom ≥ 80 % từ vựng CÓ cấp (cách giáo viên
# đọc: "80 % từ vựng ở cấp ≤ L"); dưới 10 từ có cấp thì mẫu quá nhỏ để kết luận → null. Tên quy tắc trả kèm để client
# không phải đoán khi quy tắc đổi.
OVERALL_RULE = "cumulative80"
OVERALL_SHARE_PCT = 80
OVERALL_MIN_KNOWN = 10

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
    # F2: cảnh báo mâu thuẫn tài liệu ↔ từ điển / mục tham chiếu quản trị (conflicts.py)
    "warnConflicts": True,
    "conflictMinConfidence": 0.6,   # nghĩa / ngữ pháp (0.5) chỉ hiện khi người dùng hạ ngưỡng — hay báo nhầm do diễn đạt
    "references": [],               # [{term, reading?, meaning?, level?, sourceId?}] do quản trị cung cấp, ghi đè từ điển
    "docLevel": None,               # cấp JLPT tài liệu tự khai ("N4"); tag trên dòng danh sách ghi đè cho dòng đó
}
PHRASE_MAX_CHARS = 40          # cụm dài hơn mức này trong danh sách thường là dòng OCR dính → suspect
_PHRASE_INNER = set("、・「」『』〜～")
# Dấu tách giữa cụm và cách đọc ghi liền trên cùng dòng danh sách ("学校：がくこう - school", "本 ほん book")
_INLINE_SEP = " \t　：:（(「『［[-–—・、"


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
    """Cách đọc dạng từ điển của token (B5). Dạng chia khác lemma (開いて, 行って, 辛かった) → suy từ cách đọc TRONG CÂU
    của chính dạng đó (furigana.swap_okurigana: 開い ひらい → 開く ひらく, 辛かっ つらかっ → 辛い つらい): reading_of(lemma)
    đọc lại lemma đứng một mình nên bỏ mất lựa chọn Sudachi đã làm theo ngữ cảnh. Chỉ khi gốc khác chữ / không suy được
    mới reading_of(lemma). カ変 đổi âm gốc (来 き → 来る くる, không phải きる) nên luôn reading_of; サ変 viết kanji 為る
    (為 し → しる) cũng vậy — サ変 có gốc Hán (愛し あいし → 愛する あいする) vẫn suy được."""
    if tok.surface == tok.lemma:
        return tok.reading
    derived = None
    if not tok.conj_type.startswith("カ行変格"):
        derived = swap_okurigana(tok.surface, tok.reading, tok.lemma)
        if derived and tok.conj_type.startswith("サ行変格") and not derived.endswith(("する", "ずる")):
            derived = None
    return derived or reading_of(tok.lemma) or tok.reading


READING_NOTE = "khử nhập nhằng theo ngữ cảnh: {cue}"
HETERONYM_CONF_PENALTY = 0.1
MAX_CONTEXTS = 8   # số cửa sổ ngữ cảnh giữ cho một từ đồng tự dị âm (đủ để chấm cue, không phình bộ nhớ ở tài liệu dài)


def _disambiguate(term: str, reading: Optional[str], contexts: list[str],
                  declared: bool) -> tuple[Optional[str], Optional[str]]:
    """(cách đọc, cue | None) — B5. Cách đọc TÀI LIỆU khai báo (ruby / cột kana) không bao giờ bị đổi: tài liệu biết
    mình viết gì hơn heuristic; chỉ cách đọc Sudachi / reading_of mới đem khử nhập nhằng."""
    if declared or not contexts:
        return reading, None
    return heteronyms.resolve(term, reading, contexts) or (reading, None)


def _example_for_reading(term: str, reading: Optional[str], switched: bool,
                         contexts: list[tuple[Optional[str], str]]) -> Optional[str]:
    """Câu ví dụ (B5) cho thẻ đồng tự dị âm: mọi lần xuất hiện gộp vào MỘT thẻ, cách đọc chọn theo đa số cue của mọi câu,
    còn exampleSegments chấm lại cách đọc chỉ trong câu ví dụ → lấy nguyên câu đầu ("窓を開いて…。ドアが開いた。ドアが
    開いている。": thẻ 開く あく nhưng ví dụ 窓を開いて hiện 開/ひら) thì thẻ dạy một cách đọc bằng câu đọc cách khác.

    Lấy câu đầu tiên mà cửa sổ của chính nó chọn đúng ``reading``; khi cách đọc KHÔNG bị đổi (vẫn là của Sudachi) thì
    câu không có cue nào cũng hợp (ruby ví dụ cũng là cách đọc Sudachi). Không câu nào hợp → None (người gọi giữ câu
    đầu như trước). ``contexts``: [(câu ví dụ | None, cửa sổ ngữ cảnh)] theo thứ tự xuất hiện."""
    want = kata_to_hira(reading) if reading else None
    for example, win in contexts:
        if not example:
            continue
        hit = heteronyms.resolve(term, None, [win])
        if (hit[0] == want) if hit else not switched:
            return example
    return None


def _flag_switched(conf: float, sources: list[str], cue: Optional[str]) -> tuple[float, list[str], Optional[str]]:
    """Đổi cách đọc theo ngữ cảnh là heuristic → giảm levelConfidence (cấp tính trên cách đọc mới), thêm nguồn
    `heteronym:<cue>` vào CUỐI levelSources (phần tử đầu `phrase:` / `jlpt_list:` giữ nguyên nghĩa) và trả readingNote.
    Không đổi (cue None) → giữ nguyên, readingNote None."""
    if cue is None:
        return conf, sources, None
    return (max(0.0, conf - HETERONYM_CONF_PENALTY), list(sources) + [f"heteronym:{cue}"],
            READING_NOTE.format(cue=cue))


def _components(c_tok: Token, a_tokens: list[Token]) -> list[Token]:
    return [a for a in a_tokens if a.begin >= c_tok.begin and a.end <= c_tok.end]


def _part_words(tok: Token, a_tokens: list[Token]) -> list[tuple[str, str]]:
    """(lemma, reading) của các thành phần mode A là từ nội dung trong một từ ghép giữ nguyên (B4); từ đơn → [].
    Cho phrase_level khi JLPT / JMdict / wordfreq không có cả từ ghép: 銀行口座 → 銀行 (N4) + 口座 (N2) → N2, thay vì
    `level = null` khiến từ bị coi là unknown (rơi khi treatUnknownAs = drop) dù từng thành phần đều có cấp."""
    parts = _components(tok, a_tokens)
    if len(parts) < 2:
        return []
    return [(p.lemma, _lemma_reading(p)) for p in parts if _is_candidate(p, None)]


def _expand_compound(c_tok: Token, a_tokens: list[Token]) -> list[Token]:
    """Từ ghép (mode C gồm ≥2 token mode A).

    B4: mode C trả về MỘT morpheme có trong SudachiDict (`oov` False: 自動販売機, 銀行口座, 東京大学…) → từ ghép tự nhiên,
    giữ nguyên dù JLPT / JMdict không có — trước đây thiếu jmdict.sqlite (CI) hoặc JMdict bản common không có mục
    (銀行口座) là bị tách thành 自動/販売/機, người học mất đúng từ cần học. Chỉ cụm OOV mới xét tách: có trong JLPT /
    JMdict → giữ; không có nhưng mọi thành phần có → trả về thành phần; còn lại giữ compound (unknown). (Sudachi không
    tách OOV ở mode A nên nhánh này thực tế hiếm khi chạy; giữ làm lưới an toàn cho từ điển / phiên bản khác.)"""
    if c_tok.pos1 != "名詞":
        return [c_tok]
    parts = _components(c_tok, a_tokens)
    if len(parts) < 2 or not c_tok.oov:
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
    sr = split_chapters_ex(text, blocks) if split else SplitResult([Chapter(1, None, text, 0, 0)], False, [])
    chapters, detected = sr.chapters, sr.detected
    items, grammar_items, n_sentences, total_tokens, layouts = [], [], 0, 0, []
    # B6: cấp của MỌI ứng viên (trước levelFilter / minFrequency / cap) theo (loại, term); cùng term ở nhiều chương
    # đếm một lần như _merge_chapters
    candidates: dict[str, dict[str, Optional[str]]] = {"vocab": {}, "grammar": {}}
    # tần suất là số đếm toàn tài liệu → khi tách chương, lọc minFrequency sau khi gộp
    ch_opts = {**opts, "minFrequency": 1} if split else opts
    for ch in chapters:
        layout = mode if mode in ("list", "prose") else detect_layout(ch.text)
        ci, gi, s, t, cand = [], [], 0, 0, {"vocab": {}, "grammar": {}}
        if layout == "list":
            ci, gi, s, t, cand = _list_items(ch.text, ch_opts, rubies, ocr_lines)
            if not ci and mode != "list":
                # auto nhận nhầm (vd. toàn dòng chú thích có dấu tách) → đừng trả rỗng im lặng, chạy văn xuôi
                layout = "prose"
        if layout == "prose":
            ci, gi, s, t, cand = _prose_items(ch.text, ch_opts, rubies, ocr_lines)
        for it in ci + gi:
            it["chapter"] = ch.index if split else None
            it["_order"] = (ch.index,) + tuple(it["_order"])  # sắp theo chương trước
        for kind in ("vocab", "grammar"):
            for term, lv in cand[kind].items():
                candidates[kind].setdefault(term, lv)
        items += ci
        grammar_items += gi
        n_sentences += s
        total_tokens += t
        layouts.append(layout)
    cap_report: Optional[list[dict]] = None
    max_vocab: Optional[int] = None
    if split:
        min_freq = int(opts.get("minFrequency") or 1)
        items = [it for it in _merge_chapters(items) if it["frequency"] >= min_freq]
        grammar_items = [it for it in _merge_chapters(grammar_items) if it["frequency"] >= min_freq]
        if detected:
            # LP-17: cắt theo cap từng chương; _finish chỉ còn là lưới an toàn (tổng cap ≤ MAX_VOCAB_CHAPTERED)
            items, cap_report = _cap_by_chapter(items, chapters, MAX_VOCAB_CHAPTERED, CHAPTER_VOCAB_FLOOR)
            max_vocab = MAX_VOCAB_CHAPTERED
        else:
            cap_report = [{"index": 1, "cap": MAX_VOCAB, "candidates": len(items), "kept": min(len(items), MAX_VOCAB)}]
    layout = "list" if layouts and all(l == "list" for l in layouts) else "prose"
    result = _finish(items, grammar_items, n_sentences, total_tokens, layout, truncated, max_vocab, candidates)
    _attach_dictionary(result, opts)
    _attach_conflicts(result, opts)
    _attach_example_segments(result, opts, rubies)
    if split:
        counts = Counter((it["chapter"], it["kind"]) for it in result["items"])
        result["stats"]["chaptersDetected"] = detected
        result["stats"]["skippedSections"] = sr.skipped  # mục lục / lời nói đầu / phụ lục đã bỏ (hiện cho người dùng)
        result["stats"]["chapters"] = [
            {"index": ch.index, "title": ch.title,
             "vocab": counts[(ch.index, "vocab")], "grammar": counts[(ch.index, "grammar")]}
            for ch in chapters]
        result["stats"]["capPerChapter"] = cap_report  # minh bạch: mỗi chương được cấp bao nhiêu / giữ bao nhiêu từ
    return result


DOC_KEYS = ("docReading", "docMeaningEn", "docLevel")


def _attach_dictionary(result: dict, opts: dict) -> None:
    """Từ điển (spec 2026-10-26 §9.3): item vocab mang `dictKey` ("w:<id JMdict>" hoặc None) để backend lấy nghĩa Việt đã có
    thay vì gọi Gemini; cách đọc admin đã sửa (overrides) thay cách đọc Sudachi / JMdict và dựng lại readingSegments.
    Cách đọc tài liệu tự ghi vẫn nằm ở docReading (kiểm mâu thuẫn so với cách đọc mới). Thiếu bảng words → mọi dictKey None."""
    have = dictionary.available()
    for it in result["items"]:
        if it.get("kind") != "vocab":
            it["dictKey"] = None   # ngữ pháp: không có mục từ điển, khoá vẫn có để client xử lý một kiểu
            continue
        key = dictionary.key_for(it["term"], it.get("reading")) if have else None
        it["dictKey"] = key
        fixed = overrides.word(key, "reading") if key else None
        if fixed and fixed != it.get("reading"):
            it["reading"] = fixed
            if it.get("readingSegments") is not None or (opts.get("includeFurigana") and has_kanji(it["term"])):
                it["readingSegments"] = align(it["term"], fixed)


def _attach_conflicts(result: dict, opts: dict) -> None:
    """F2: gắn item.conflicts (luôn là list) + stats.conflicts / conflictsByField cho các item ĐÃ trả về — chạy sau _finish
    (sau cap) để stats đếm đúng những gì người dùng thấy và không tốn công kiểm tra thẻ bị cắt. Khoá riêng `_doc` do
    _list_items / _prose_items gắn (cách đọc / nghĩa EN / cấp mà TÀI LIỆU khai báo; None = không khai báo) được gỡ khỏi
    item kể cả khi warnConflicts tắt — khi tắt, conflicts = [] và stats = 0 để client xử lý một kiểu.

    Khai báo của tài liệu được trả công khai trên MỌI item (vocab lẫn grammar, cả hai bố cục, bất kể warnConflicts) dưới
    DOC_KEYS, None khi tài liệu không nói gì: backend phải lưu được chúng (mục nguồn tri thức, POST /extract/conflicts
    kiểm lại job cũ) — chỉ gỡ `_doc` thì backend không bao giờ biết tài liệu đã ghi gì, và gửi lại thiếu khoá thì
    ConflictItem coi cách đọc Sudachi / gloss từ điển là của tài liệu. Tên khoá trùng ConflictItem nên item lưu lại gửi
    nguyên được. `docLevel` chỉ là tag trên dòng của thẻ (scope "item" = mặc định của ConflictItem); docLevel tuỳ chọn là
    cấp chung backend đã tự gửi nên không chép vào từng item (chép vào thì gửi lại sẽ thành scope "item", báo cả từ dễ)."""
    warn = bool(opts.get("warnConflicts", True))
    min_conf = opts.get("conflictMinConfidence")
    min_conf = DEFAULT_OPTIONS["conflictMinConfidence"] if min_conf is None else float(min_conf)
    refs = [r for r in (opts.get("references") or []) if isinstance(r, dict)]
    doc_level = conflicts.parse_level(opts.get("docLevel"))
    cache: dict = {}
    lists: list[list[dict]] = []
    for it in result["items"]:
        doc = it.pop("_doc", None) or {}
        for key in DOC_KEYS:
            it[key] = doc.get(key)
        found: list[dict] = []
        if warn:
            # tag cấp trên dòng là khai báo cho đúng thẻ đó (scope item); docLevel tuỳ chọn là cấp chung của tài liệu
            # (scope document: chỉ từ khó hơn hẳn mới đáng ngờ — tài liệu N1 có từ N5 là bình thường)
            line_level = it["docLevel"]
            probe = {**it, "docLevel": line_level or doc_level, "docLevelScope": "item" if line_level else "document"}
            found = [c for c in conflicts.check_item(probe, refs, cache) if c["confidence"] >= min_conf]
        it["conflicts"] = found
        lists.append(found)
    result["stats"].update(conflicts.summarize(lists))


def _attach_example_segments(result: dict, opts: dict, rubies: dict[str, str]) -> None:
    """B5: item.exampleSegments (mọi loại item — câu ví dụ ngữ pháp cũng cần furigana) + readingNote luôn có mặt (None
    cho item ngữ pháp / không đổi cách đọc) để client xử lý một kiểu. Chạy sau _finish (sau cap, sau gộp chương) để
    không tokenize câu của thẻ bị cắt; nhiều thẻ chung một câu ví dụ → tokenize một lần (cache), mỗi item một bản sao.
    includeFurigana tắt → None như readingSegments."""
    on = bool(opts.get("includeFurigana", True))
    cache: dict[str, Optional[list[dict]]] = {}
    for it in result["items"]:
        it.setdefault("readingNote", None)
        ex = it.get("example")
        if not on or not ex:
            it["exampleSegments"] = None
            continue
        if ex not in cache:
            cache[ex] = _example_segments(ex, rubies)
        segs = cache[ex]
        it["exampleSegments"] = [dict(sg) for sg in segs] if segs is not None else None


def _example_segments(example: Optional[str], rubies: Optional[dict[str, str]] = None) -> Optional[list[dict]]:
    """Furigana cho câu ví dụ (B5): [{"text", "reading" | None}] theo token Sudachi mode C — run kanji của token mang
    cách đọc trong câu (furigana.ruby_segments: 行き → 行/い + き), kana / dấu câu / khoảng trắng là chữ thường.
    "".join(text) luôn bằng câu (khoảng trống giữa token được lấp; lệch vị trí → một đoạn chữ thường cả câu).

    Cách đọc mỗi token: ruby tài liệu cho đúng surface đó → cách đọc Sudachi trong câu, trừ từ đồng tự dị âm có cue
    trong cửa sổ quanh nó (カレーが辛かった → 辛/から + かった). Từ trong bảng mà Sudachi tách nhiều token (一日 = 一 + 日)
    được ghép thành một đoạn để chọn cách đọc cả từ (四月一日 → 一日/ついたち). Câu rỗng → None; không có Sudachi →
    None (giữ hành vi không furigana thay vì lỗi)."""
    if not example:
        return None
    try:
        toks = tokenize(example, "C")
    except Exception:
        return None
    rubies = rubies or {}
    segs: list[dict] = []
    pos = i = 0
    while i < len(toks):
        n = _heteronym_span(toks, i)
        group = toks[i:i + n]
        begin, end = group[0].begin, group[-1].end
        if begin < pos:   # vị trí chồng lấn (không xảy ra với Sudachi hiện tại) → đừng nhân đôi chữ
            return [{"text": example, "reading": None}]
        if begin > pos:
            segs.append({"text": example[pos:begin], "reading": None})
        surface = example[begin:end]
        if n > 1:
            base = "".join(t.reading for t in group)
            hit = heteronyms.resolve(surface, base, [heteronyms.window(example, begin, end)])
            reading = rubies.get(surface) or (hit[0] if hit else base)
        else:
            reading = _example_token_reading(group[0], example, rubies)
        segs.extend(ruby_segments(surface, reading))
        pos = end
        i += n
    if pos < len(example):
        segs.append({"text": example[pos:], "reading": None})
    if "".join(sg["text"] for sg in segs) != example:
        return [{"text": example, "reading": None}]
    return segs


def _heteronym_span(toks: list[Token], i: int) -> int:
    """Số token (≥ 2) bắt đầu từ ``i`` ghép liền thành một từ trong bảng đồng tự dị âm (一 + 日 → 一日); 1 nếu không.
    Không ghép khi token trước là số liền kề (十一日, 二十一日: 一日 chỉ là đuôi của một con số khác)."""
    if i > 0 and toks[i - 1].pos2 == "数詞" and toks[i - 1].end == toks[i].begin:
        return 1
    for n in range(min(heteronyms.MAX_SPAN_TOKENS, len(toks) - i), 1, -1):
        group = toks[i:i + n]
        contiguous = all(a.end == b.begin for a, b in zip(group, group[1:]))
        if contiguous and heteronyms.is_heteronym("".join(t.surface for t in group)):
            return n
    return 1


def _example_token_reading(tok: Token, sent: str, rubies: dict[str, str]) -> Optional[str]:
    """Cách đọc một token trong câu ví dụ: ruby tài liệu → cách đọc Sudachi, đổi theo cue nếu lemma là từ đồng tự dị âm
    (cách đọc dạng từ điển được chọn rồi chuyển về dạng chia: 辛い からい → 辛かっ からかっ). Không chuyển được → Sudachi."""
    if tok.surface in rubies:
        return rubies[tok.surface]
    if has_kanji(tok.surface) and heteronyms.is_heteronym(tok.lemma):
        hit = heteronyms.resolve(tok.lemma, _lemma_reading(tok), [heteronyms.window(sent, tok.begin, tok.end)])
        if hit:
            switched = hit[0] if tok.surface == tok.lemma else swap_okurigana(tok.lemma, hit[0], tok.surface)
            if switched:
                return switched
    return tok.reading


def _reading_shape(term: str) -> re.Pattern:
    """Regex một cách đọc "có hình" của ``term`` phải khớp: mỗi run kanji ≥ 1 kana mỗi chữ, kana của term (okurigana)
    đúng chỗ, ký tự khác tuỳ chọn — để "行く つもり" không nhận つもり làm cách đọc của 行く, "日本語 を" không nhận を."""
    parts: list[str] = []
    n_kanji = 0
    for ch in term:
        if is_kanji(ch):
            n_kanji += 1
            continue
        if n_kanji:
            parts.append(f".{{{n_kanji},}}")
            n_kanji = 0
        parts.append(re.escape(kata_to_hira(ch)) if is_kana(ch) else f"(?:{re.escape(ch)})?")
    if n_kanji:
        parts.append(f".{{{n_kanji},}}")
    return re.compile("".join(parts))


def _inline_reading(line: str, term: str) -> Optional[str]:
    """Cách đọc ghi liền sau cụm trên dòng danh sách không có cột riêng ("学校：がくこう - school", "本 ほん book"):
    parse_line chỉ lấy cột kana khi có dấu tách cột (TAB / |) nên dạng này rơi mất. Chỉ dùng làm cách đọc TÀI LIỆU khai
    báo cho F2, không thay reading của thẻ (giữ hành vi cũ). Nhận run kana ngay sau cụm (bỏ dấu tách) khi sau nó là hết
    dòng / chữ không phải tiếng Nhật (nghĩa) — đứng trước kanji / kana khác là cụm tiếp diễn — và kana phải khớp hình
    của cụm (_reading_shape). Không chắc → None (bỏ sót còn hơn báo nhầm 0.9)."""
    i = line.find(term)
    if i < 0:
        return None
    rest = line[i + len(term):].lstrip(_INLINE_SEP)
    j = 0
    while j < len(rest) and (is_kana(rest[j]) or rest[j] == "ー"):
        j += 1
    if j == 0:
        return None
    tail = rest[j:].lstrip(" \t　")
    if tail and has_japanese(tail[0]):
        return None
    reading = kata_to_hira(rest[:j])
    if not _reading_shape(term).fullmatch(reading):
        return None
    if len(term) == 1:
        # chữ đơn: hình "≥ 1 kana" khớp mọi run kana nên trợ từ / từ kế tiếp trên dòng OCR có khoảng trắng ("本 だけ",
        # "人 が") cũng lọt → đòi dài ít nhất bằng cách đọc Unihan ngắn nhất của chữ và không phải trợ từ / trợ động từ
        if len(reading) < min((len(r) for r in unihan_readings(term)), default=1):
            return None
        if any(t.pos1 in _INLINE_REJECT_POS for t in tokenize(reading, "C")):
            return None
    return reading


_INLINE_REJECT_POS = frozenset({"助詞", "助動詞", "接続詞"})   # が đứng một mình Sudachi gán 接続詞


def _partial_head(line: str, term: str) -> bool:
    """``term`` chỉ là phần sau của cụm đầu dòng: entries._first_ja_run bỏ chữ số / chữ Latin đứng trước ("4時" → 時,
    "1日" → 日) nên cột kana (よじ, ついたち) và nghĩa in sẵn ("four o'clock") là của cả cụm, không phải của ``term`` →
    không đem so với từ điển (F2). Cụm bị cắt là lỗi cũ của entries; ở đây chỉ không đổ lỗi cho tài liệu."""
    i = line.find(term)
    if i <= 0:
        return False
    prev = line[i - 1]
    return prev.isalnum() and not is_japanese_char(prev)


def _ruby_reading(tok: Token, rubies: dict[str, str]) -> Optional[str]:
    """Ruby của tài liệu (DOCX / ngoặc) cho dạng từ điển của token: ruby trên lemma dùng thẳng; ruby trên dạng đã chia
    (読み của 読みます → よみ, cách đặt ruby cả cụm trong giáo trình thể ます) thì đổi đuôi okurigana về lemma (よむ) — chỉ
    khi phép đổi đó áp lên cách đọc Sudachi của chính dạng đó cho đúng cách đọc lemma (来 き → 来る くる thì không: gốc đổi
    âm). Không suy được → None (không lấy よみ làm cách đọc của 読む rồi báo tài liệu sai)."""
    r = rubies.get(tok.lemma)
    if r or tok.surface == tok.lemma:
        return r or None
    r = rubies.get(tok.surface)
    if not r:
        return None
    k = 0
    while k < min(len(tok.surface), len(tok.lemma)) and tok.surface[k] == tok.lemma[k]:
        k += 1
    s_tail, l_tail = kata_to_hira(tok.surface[k:]), kata_to_hira(tok.lemma[k:])
    if (s_tail and not is_kana_only(s_tail)) or (l_tail and not is_kana_only(l_tail)):
        return None

    def swap(reading: str) -> Optional[str]:
        if s_tail and not reading.endswith(s_tail):
            return None
        return (reading[:-len(s_tail)] if s_tail else reading) + l_tail

    if swap(kata_to_hira(tok.reading)) != _lemma_reading(tok):
        return None
    return swap(r)


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


def _chapter_caps(counts: list[int], masses: list[list[int]], total: int, floor: int) -> list[int]:
    """LP-17: chia cap `total` cho các chương theo tỉ lệ số ứng viên `counts[i]`; chương nào phần tỉ lệ thấp hơn
    sàn min(floor, counts[i]) thì được ghim ở sàn và phần còn lại chia lại cho các chương kia. Phần dư do chia
    nguyên cấp từng suất cho chương còn bị cắt nhiều "khối lượng tần suất" nhất (`masses[i]` = tần suất ứng viên
    chương i, giảm dần; hoà → chương trước). Sàn hiệu lực là f lớn nhất trong 0..floor sao cho Σ min(counts[i], f)
    ≤ total: quá nhiều chương thì sàn hạ dần (50 chương × 40 ứng viên @900 → 18), còn vài chương lớn + nhiều chương
    vừa vẫn giữ đủ 20 khi còn chỗ. Vì Σ sàn ≤ total nên ngân sách không bao giờ âm và tổng cap luôn ≤ total.
    Hàm thuần, luôn trả cap[i] ≤ counts[i]."""
    k = len(counts)
    if sum(counts) <= total:
        return list(counts)
    # Sàn theo khả năng chi trả thay vì total // số chương: không hạ sàn oan khi chỉ vài chương lớn kéo số chương lên,
    # và khi số chương có ứng viên > total thì sàn = 0 (hết chia cho 0 / tổng vượt cap), phần dư cấp từng suất theo tần suất.
    eff = max((f for f in range(floor + 1) if sum(min(c, f) for c in counts) <= total), default=0)
    floors = [min(c, eff) for c in counts]
    caps, pinned = [0] * k, [False] * k
    while True:
        free = [i for i in range(k) if not pinned[i]]
        budget = total - sum(caps[i] for i in range(k) if pinned[i])
        n_free = sum(counts[i] for i in free)
        if n_free <= budget:
            for i in free:
                caps[i] = counts[i]
            break
        targets = {i: budget * counts[i] // n_free for i in free}
        below = [i for i in free if targets[i] < floors[i]]
        if not below:
            for i in free:
                caps[i] = targets[i]
            break
        for i in below:   # ghim ở sàn rồi chia lại cho phần còn lại (mỗi vòng ghim ≥ 1 chương → kết thúc)
            caps[i], pinned[i] = floors[i], True
    remaining = [sum(m[c:]) for m, c in zip(masses, caps)]
    for _ in range(total - sum(caps)):
        open_ = [i for i in range(k) if caps[i] < counts[i]]
        if not open_:
            break
        i = max(open_, key=lambda j: (remaining[j], -j))
        remaining[i] -= masses[i][caps[i]]
        caps[i] += 1
    return caps


def _cap_by_chapter(items: list[dict], chapters: list[Chapter], total: int, floor: int) -> tuple[list[dict], list[dict]]:
    """LP-17: giữ trong mỗi chương `cap` từ tần suất cao nhất (cùng thứ tự ưu tiên với _finish._limit).
    Trả (items giữ lại, stats.capPerChapter = [{index, cap, candidates, kept}])."""
    by_ch: dict[int, list[dict]] = {ch.index: [] for ch in chapters}
    for it in items:
        by_ch.setdefault(it["chapter"], []).append(it)
    idx = sorted(by_ch)
    ranked = [sorted(by_ch[i], key=lambda x: (-x["frequency"], x["_order"])) for i in idx]
    caps = _chapter_caps([len(r) for r in ranked], [[it["frequency"] for it in r] for r in ranked], total, floor)
    kept: list[dict] = []
    report: list[dict] = []
    for i, r, cap in zip(idx, ranked, caps):
        kept += r[:cap]
        report.append({"index": i, "cap": cap, "candidates": len(r), "kept": min(cap, len(r))})
    return kept, report


def _dict_meaning(lemma: str, reading: Optional[str], kana_only: bool) -> Optional[str]:
    """Nghĩa EN từ từ điển: từ toàn kana (こと, とても…) tra JMdict theo kana dễ trúng từ đồng âm → ưu tiên danh sách JLPT."""
    hint = meaning_hint(lemma, reading)
    entry = jmdict.lookup(lemma, reading)
    if kana_only and hint:
        return hint
    return (entry["gloss"] if entry else None) or hint


def _prose_items(text: str, opts: dict, rubies: dict[str, str], ocr_lines: list[tuple[str, float]]):
    """Văn xuôi: tách câu → Sudachi → từ đơn + mẫu ngữ pháp.
    Trả (items, grammar_items, số câu, số token, cấp MỌI ứng viên {vocab: {term: cấp}, grammar: {term: cấp}})."""
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
        grammar_input.append((s_idx, sent, a_tokens))   # luôn: ứng viên ngữ pháp đếm vào byLevelAll dù includeGrammar tắt
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
                    ruby = _ruby_reading(tok, rubies)
                    entry = vocab[key] = {
                        "lemma": tok.lemma, "pos": tok.pos1, "surface": tok.surface,
                        "reading": ruby or _lemma_reading(tok),
                        "frequency": 1, "order": (s_idx, tok.begin), "example": example, "conf": conf,
                        "oov": tok.oov, "parts": _part_words(tok, a_tokens),
                        # F2: chỉ ruby (DOCX / ngoặc, quy về dạng từ điển) là cách đọc TÀI LIỆU khai báo; cách đọc
                        # Sudachi không đem so
                        "doc_reading": ruby,
                        "contexts": [],
                    }
                else:
                    entry["frequency"] += 1
                    entry["example"] = entry["example"] or example  # lần đầu ở dòng kém → lấy ví dụ ở dòng sau
                    if entry["conf"] is not None:
                        entry["conf"] = None if conf is None else max(entry["conf"], conf)
                # B5: ngữ cảnh mọi lần xuất hiện (chỉ với từ có trong bảng đồng tự dị âm) để chọn cách đọc, kèm câu ví
                # dụ của lần đó để chọn lại ví dụ khớp cách đọc đã chọn (_example_for_reading)
                if len(entry["contexts"]) < MAX_CONTEXTS and heteronyms.is_heteronym(tok.lemma):
                    entry["contexts"].append((example, heteronyms.window(sent, tok.begin, tok.end)))
            prev = c_tok

    items: list[dict] = []
    cand_vocab: dict[str, Optional[str]] = {}
    for v in vocab.values():
        lemma = v["lemma"]
        # B5: trước classify — cấp JLPT tra theo cách đọc đã chọn (辛い からい N5 ≠ つらい N3)
        declared = bool(v["doc_reading"])
        reading, cue = _disambiguate(lemma, v["reading"] or None, [w for _, w in v["contexts"]], declared)
        example = v["example"]
        if v["contexts"] and not declared:
            example = _example_for_reading(lemma, reading, cue is not None, v["contexts"]) or example
        kana_only = is_kana_only(lemma)
        level, conf, sources = classify(lemma, reading, kana_only)
        if level is None and v["parts"]:
            level, conf, sources = phrase_level(v["parts"])   # từ ghép SudachiDict giữ nguyên (B4) → cấp thành phần
        conf, sources, note = _flag_switched(conf, sources, cue)
        # B6: đếm trước khi lọc → cấp tài liệu không phụ thuộc tuỳ chọn người dùng. Khoá theo lemma (không kèm POS) để
        # "ứng viên" cùng nghĩa với _merge_chapters khi tách chương: 大変 (形状詞) + 大変 (副詞) là hai item, một ứng viên
        cand_vocab.setdefault(lemma, level)
        if not _passes_level_filter(level, opts) or v["frequency"] < int(opts.get("minFrequency") or 1):
            continue
        meaning_en = _dict_meaning(lemma, reading, kana_only)
        # Chỉ với OCR: bỏ chọn sẵn để người dùng xem lại (vẫn hiện, tick lại được). Thiếu nghĩa từ điển chỉ đáng ngờ
        # khi Sudachi cũng không biết từ (OOV: 覆公, chuỗi rác); từ ghép SudachiDict mà JMdict common thiếu (銀行口座,
        # 電気代) là từ thật, không bỏ chọn sẵn
        best = v["conf"]
        suspect = best is not None and (
            (not meaning_en and v["oov"])
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
            "readingNote": note,
            "hanViet": hv.han_viet(lemma) if opts["includeHanViet"] else None,
            "pos": v["pos"],
            "meaningEn": meaning_en,
            "meaningVi": None,
            "level": level,
            "levelConfidence": round(conf, 3),
            "levelSources": sources,
            "frequency": v["frequency"],
            "example": example,
            "exampleVi": None,
            "suspect": suspect,
            "_doc": {"docReading": v["doc_reading"]},
        })

    grammar_items: list[dict] = []
    cand_grammar: dict[str, Optional[str]] = {}
    # B6: matcher chạy cả khi includeGrammar tắt để byLevelAll / levelPct không nhảy theo một nút hiển thị
    # (a_tokens đã có sẵn; includeGrammar chỉ quyết định có TRẢ item ngữ pháp hay không)
    for g in match_document(grammar_input):
        cand_grammar.setdefault(g["term"], g["level"])
        if not opts["includeGrammar"]:
            continue
        if _passes_level_filter(g["level"], opts) and g["frequency"] >= int(opts.get("minFrequency") or 1):
            conf = sent_confs[g["_order"][0]]
            if conf is not None:
                # matcher không giữ vị trí ký tự → lấy cụm tiếng Nhật dài nhất của dòng OCR
                runs = [_clean_run(r) for r in _JA_RUN_RE.findall(g["example"] or "")]
                g["example"] = max(runs, key=len, default=None) if conf >= EXAMPLE_MIN_CONF else None
            g["suspect"] = False
            grammar_items.append(g)
    return items, grammar_items, len(sentences), total_tokens, {"vocab": cand_vocab, "grammar": cand_grammar}


def _list_items(text: str, opts: dict, rubies: dict[str, str], ocr_lines: list[tuple[str, float]]):
    """Danh sách từ vựng: mỗi dòng một (vài) cụm + nghĩa in sẵn; không tách từ bên trong cụm, không ngữ pháp
    (spec §2.4, Q1/Q3/Q4). Trả (items, [], số dòng tiếng Nhật, số token, cấp MỌI ứng viên {vocab: {term: cấp}, grammar: {}})."""
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
                           "reading": entry.reading, "frequency": 1, "order": (idx, 0), "conf": conf, "line": line}

    min_freq = int(opts.get("minFrequency") or 1)
    items: list[dict] = []
    cand_vocab: dict[str, Optional[str]] = {}
    for v in vocab.values():
        term, c_tokens = v["term"], v["tokens"]
        declared = v["reading"] or rubies.get(term)
        # B5: cả dòng (gồm nghĩa in sẵn: "一日 – ngày đầu tháng") là ngữ cảnh; cách đọc tài liệu khai báo không đổi
        reading, cue = _disambiguate(term, declared or reading_of(term) or None, [v["line"]], bool(declared))
        if len(c_tokens) == 1:
            tok = c_tokens[0]
            kana_only = is_kana_only(tok.lemma)
            level, conf, sources = classify(tok.lemma, reading, kana_only)
            if level is None:
                # một morpheme SudachiDict là từ ghép (銀行口座) mà JLPT / JMdict không có → cấp thành phần như văn xuôi
                parts = _part_words(tok, tokenize(term, "A"))
                if parts:
                    level, conf, sources = phrase_level(parts)
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
        conf, sources, note = _flag_switched(conf, sources, cue)
        cand_vocab.setdefault(term, level)   # B6: đếm trước khi lọc
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
        # F2: chỉ những gì TÀI LIỆU khai báo mới đem so với tham chiếu — cột kana / ruby / kana ghi liền sau cụm (không
        # phải reading_of Sudachi), nghĩa EN in sẵn (không phải gloss từ điển điền vào), tag cấp "N5" trên dòng; cụm đầu
        # dòng bị cắt mất chữ số ("4時" → 時) thì cột kana / nghĩa là của cả cụm → không khai báo gì cho thẻ này
        partial = _partial_head(v["line"], term)
        doc_reading = None if partial else (
            v["reading"] or rubies.get(term) or (_inline_reading(v["line"], term) if has_kanji(term) else None))
        items.append({
            "kind": "vocab",
            "position": 0,
            "_order": v["order"],
            "term": term,
            "surface": term,
            "reading": reading,
            "readingSegments": segments,
            "readingNote": note,
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
            "_doc": {"docReading": doc_reading,
                     "docMeaningEn": v["gloss"] if v["gloss_lang"] == "en" and not partial else None,
                     "docLevel": conflicts.parse_level(v["line"])},
        })
    return items, [], n_lines, total_tokens, {"vocab": cand_vocab, "grammar": {}}


def _level_stats(vocab_levels: Iterable[Optional[str]], grammar_levels: Iterable[Optional[str]]) -> dict[str, Any]:
    """B6: phân bố cấp JLPT của MỌI ứng viên (trước levelFilter / treatUnknownAs / minFrequency / cap) — trả lời
    "tài liệu này ở cấp nào" độc lập với trình độ người dùng, khác stats.byLevel chỉ đếm item được giữ lại. Hàm thuần.
    "Ứng viên" = một term một lần (như _merge_chapters khi tách chương: 大変 形状詞 + 副詞 là hai item nhưng một ứng
    viên, nên byLevelAll có thể nhỏ hơn byLevel) và gồm ngữ pháp cả khi includeGrammar tắt.
    - byLevelAll: {N5..N1, unknown: int} (vocab + grammar), cùng hình với byLevel để client xử lý như nhau;
      byLevelAllVocab / byLevelAllGrammar: cùng hình, tách theo loại (không lồng vào byLevelAll để khỏi trộn int / dict).
    - levelPct: % từng cấp trên các ứng viên CÓ cấp (vocab + grammar), làm tròn 0.1 nên tổng ≈ 100 (±0.2);
      không có ứng viên có cấp → 0.0 hết.
    - overallLevel: quy tắc OVERALL_RULE trên từ vựng CÓ cấp (ngữ pháp không tính: matcher phủ hẹp, vài mẫu N4 kéo
      lệch); dưới OVERALL_MIN_KNOWN từ có cấp → None."""
    vc = Counter(lv if lv in LEVELS else "unknown" for lv in vocab_levels)
    gc = Counter(lv if lv in LEVELS else "unknown" for lv in grammar_levels)
    keys = LEVELS + ["unknown"]
    by_all = {k: vc[k] + gc[k] for k in keys}
    known_all = sum(by_all[lv] for lv in LEVELS)
    pct = {lv: (round(100.0 * by_all[lv] / known_all, 1) if known_all else 0.0) for lv in LEVELS}
    known_vocab = sum(vc[lv] for lv in LEVELS)
    overall: Optional[str] = None
    if known_vocab >= OVERALL_MIN_KNOWN:
        cum = 0
        for lv in LEVELS:                                     # dễ → khó
            cum += vc[lv]
            if cum * 100 >= OVERALL_SHARE_PCT * known_vocab:  # số nguyên, tránh sai số float ở đúng ngưỡng
                overall = lv
                break
    return {"byLevelAll": by_all, "byLevelAllVocab": {k: vc[k] for k in keys},
            "byLevelAllGrammar": {k: gc[k] for k in keys},
            "levelPct": pct, "overallLevel": overall, "overallRule": OVERALL_RULE}


def _finish(items: list[dict], grammar_items: list[dict], n_sentences: int, total_tokens: int,
            layout: str, truncated: bool, max_vocab: Optional[int] = None,
            candidates: Optional[dict[str, dict[str, Optional[str]]]] = None) -> dict:
    """Giới hạn số lượng, gộp và đánh số vị trí, thống kê (chung cho cả hai bố cục).
    `max_vocab` None → MAX_VOCAB (đọc lúc gọi để test monkeypatch được); tách chương truyền MAX_VOCAB_CHAPTERED.
    `candidates` = {vocab: {term: cấp}, grammar: {term: cấp}} của MỌI ứng viên trước khi lọc (B6, _level_stats);
    None → suy từ items đã lọc (chỉ cho gọi lẻ / test; analyze luôn truyền)."""
    if candidates is None:
        candidates = {"vocab": {it["term"]: it["level"] for it in items},
                      "grammar": {it["term"]: it["level"] for it in grammar_items}}

    def _limit(lst: list[dict], n: int) -> list[dict]:
        if len(lst) <= n:
            return lst
        return sorted(lst, key=lambda x: (-x["frequency"], x["_order"]))[:n]

    items = _limit(items, MAX_VOCAB if max_vocab is None else max_vocab)
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
            **_level_stats(candidates["vocab"].values(), candidates["grammar"].values()),
            "sentences": n_sentences,
            "tokens": total_tokens,
            "layout": layout,
        },
        "truncated": truncated,
    }
