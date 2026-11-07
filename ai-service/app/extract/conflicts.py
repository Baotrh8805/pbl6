"""F2 — phát hiện mâu thuẫn giữa tài liệu và nguồn tham chiếu (từ điển + mục tham chiếu quản trị).

Mỗi item (thẻ từ vựng / mẫu ngữ pháp do pipeline dựng, hoặc backend gửi lại từ job cũ qua POST /extract/conflicts) được
so với: danh sách JLPT (``jlpt_list``), JMdict (``jmdict``), Unihan (``unihan``, chỉ chữ đơn), danh mục ngữ pháp
(``grammar``), Sudachi (``sudachi``, chỉ khi không từ điển nào biết từ) và các mục tham chiếu quản trị gửi kèm request
(``admin:<sourceId>``). Kết quả là danh sách cảnh báo ``{field, document, reference, source, confidence, note_vi}`` để
quản trị duyệt (backend lưu / hiển thị); ``confidence`` để lọc theo ngưỡng — pipeline mặc định 0.6 nên luật nghĩa /
ngữ pháp (0.5) chỉ hiện khi người dùng hạ ngưỡng, vì hai luật này hay báo nhầm do cách diễn đạt khác nhau.

Luật (field → nguồn → confidence):
  reading   cách đọc tài liệu khai báo khác MỌI cách đọc được chấp nhận (JLPT ∪ JMdict ∪ Unihan với chữ đơn; ぢ/づ so như
            じ/ず) → jlpt_list 0.9 (0.75 khi thiếu JMdict: mỗi mục JLPT chỉ có một cách đọc) / jmdict 0.8 / unihan 0.6
            (trích nguồn đáng tin nhất có dữ liệu). Bỏ qua từ bắt đầu bằng số đếm (4時, 一分, 五月: lượng từ biến âm,
            từ điển chỉ ghi một phần) và tên riêng Sudachi không có trong danh sách JLPT (上田 ≠ danh từ じょうでん).
  furigana  không từ điển nào biết từ nhưng SudachiDict biết trọn (đúng một token, không số đếm / tên riêng) và đọc khác
            tài liệu → sudachi 0.5 (dưới ngưỡng mặc định: Sudachi đọc sai ~2 % từ thật — 箱 ばこ, 深い ぶかい).
  meaning   chỉ nghĩa tiếng Anh: gloss tài liệu không có từ nội dung nào chung với gloss từ điển → 0.5.
  level     tài liệu gán cấp JLPT lệch ≥ 2 cấp so với classifier (chỉ khi classifier chắc ≥ 0.8) → jlpt_list 0.6.
            ``docLevelScope`` = "item" (tag trên dòng "学校 (N1)"): lệch chiều nào cũng báo; "document" (docLevel chung
            của cả tài liệu): chỉ báo từ KHÓ hơn cấp tài liệu ≥ 2 cấp — tài liệu N1 có từ N5 là chuyện thường.
  grammar   mẫu ngữ pháp có cấp trong danh mục lệch ≥ 2 cấp so với cấp tài liệu khai báo (cùng quy ước scope) → 0.5.
  admin     mục tham chiếu quản trị cho đúng từ đó: khớp → không cảnh báo dù từ điển nói khác; trái → 0.95.

Nguyên tắc (quyết định người dùng 19/10):
  - "Không tìm thấy tham chiếu" KHÔNG phải mâu thuẫn: từ không có trong nguồn nào → im lặng (không bao giờ bịa).
  - Chỉ so cái TÀI LIỆU khai báo. Cách đọc Sudachi đoán hay nghĩa từ điển điền vào thẻ không phải "của tài liệu", nên
    pipeline truyền thêm khoá ``docReading`` / ``docMeaningEn`` / ``docLevel`` (None = tài liệu không nói gì về trường
    đó). Thẻ cũ backend gửi lại KHÔNG có hai khoá đầu → ``reading`` / ``meaningEn`` của thẻ được coi là của tài liệu
    (đó là mục đích kiểm tra lại job cũ khi quản trị thêm mục tham chiếu).
  - Nghĩa tiếng Việt không so với từ điển (không có nguồn), chỉ so với mục quản trị viết bằng tiếng Việt.
Hàm thuần, chỉ tra bảng đã nạp lười (thiếu nguồn nào thì nguồn đó im lặng); tra cứu cache theo lô (``check_items``)
nên 300 thẻ mất vài chục ms.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

from app.extract import jmdict
from app.extract.jachars import has_kanji, is_kana_only, is_kanji, kata_to_hira
from app.extract.jlpt import classifier, level_index
from app.extract.kanji_readings import readings as unihan_readings

FIELDS = ("reading", "furigana", "meaning", "level", "grammar")
CONF_READING = {"jlpt_list": 0.9, "jmdict": 0.8, "unihan": 0.6}
CONF_READING_JLPT_ONLY = 0.75   # thiếu jmdict.sqlite: tập cách đọc chấp nhận chỉ còn một cách / mục JLPT → bớt chắc
CONF_FURIGANA = 0.5             # dưới ngưỡng mặc định 0.6 như meaning / grammar: Sudachi đọc sai ~2 % từ đứng một mình
LEVEL_SCOPES = ("item", "document")
CONF_MEANING = 0.5
CONF_LEVEL = 0.6
CONF_GRAMMAR = 0.5
CONF_ADMIN = 0.95
LEVEL_GAP = 2            # lệch từ 2 cấp trở lên mới coi là mâu thuẫn (N5 ↔ N4 là chuyện thường giữa các giáo trình)
LEVEL_MIN_CONFIDENCE = 0.8   # classifier phải chắc (từ chỉ nằm trong một danh sách); wordfreq 0.4 không bao giờ đủ

_SOURCE_VI = {"jlpt_list": "danh sách JLPT", "jmdict": "JMdict", "unihan": "Unihan", "sudachi": "Sudachi",
              "grammar": "danh mục ngữ pháp"}
_LEVEL_RE = re.compile(r"(?<![A-Z0-9])N\s?([1-5])(?![0-9])")
_WORD_EN_RE = re.compile(r"[a-z]+")
_WORD_VI_RE = re.compile(r"\w+")
# Từ chức năng tiếng Anh trong gloss từ điển ("to go", "(not) at all", "one's") — không tính là từ nội dung. Động từ
# thường (go / come / see / make…) vẫn là nội dung vì chúng chính là nghĩa của từ N5.
_STOP_EN = frozenset("""a an the to of in on at for and or nor but be is are was were been being am do does did have
has had having can could may might must shall should will would it its this that these those with by from as into onto
up down out off over under one ones oneself someone something somebody sb sth etc eg ie not no so than then there their
they them he she his her him hers we us our ours you your yours i me my mine also about after before again against all
any because both each few how if more most other some such only own same too just when where which who whom whose why
what while during through between among per via upon""".split())
_STOP_VI = frozenset("cái sự việc là của và có được bị để một những các hay hoặc thì mà với cho như".split())
_VI_CHARS = "ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ"
_VI_RE = re.compile(f"[{_VI_CHARS}{_VI_CHARS.upper()}]")
ENGLISH_MIN_ZIPF = 3.0   # như entries._looks_english: có một từ tiếng Anh thật thì coi nghĩa quản trị là tiếng Anh
# Một ô cách đọc có thể liệt kê nhiều cách đọc ("いく; ゆく", "いく・ゆく", "なん／なに") và ghi chú trong ngoặc ("けっこん (する)",
# "(を) とお"): ngoặc là ghi chú → bỏ hẳn, phần còn lại tách theo dấu. Khoảng trắng KHÔNG phải dấu tách: cột kana OCR hay
# đứt giữa một cách đọc ("がっ こう") còn danh sách thay thế luôn có dấu
_READING_NOTE_RE = re.compile(r"\([^)]*\)|（[^）]*）")
_READING_SPLIT_RE = re.compile(r"[;,、，/／・]+")


def available() -> bool:
    """Có ít nhất một nguồn tham chiếu để so (danh sách JLPT đã commit hoặc JMdict) — cờ ``conflicts`` ở /extract/health."""
    return classifier.available() or jmdict.available()


# ----------------------------------------------------------------------------- chuẩn hoá

def parse_level(value: object) -> Optional[str]:
    """"N5" / "n5" / "JLPT Ｎ５" / cả dòng "学校 (N5) school" → "N5"; không có hoặc nhiều cấp khác nhau (N4/N5) → None.
    Nhận cả dòng vì bố cục danh sách hay ghi cấp như một tag; đòi đúng một cấp để tiêu đề "N4-N5" không bị gán bừa."""
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value)).upper()
    found = {f"N{m.group(1)}" for m in _LEVEL_RE.finditer(text)}
    return found.pop() if len(found) == 1 else None


def _norm_kana(s: object) -> str:
    """Hiragana, bỏ khoảng trắng (cột kana OCR hay có "ぎんこう こうざ"); ぢ → じ, づ → ず vì hai cách viết đều gặp
    (近々 ちかぢか / ちかじか, 手近 てぢか / てじか) và không nguồn nào thống nhất."""
    return (kata_to_hira(str(s)).replace(" ", "").replace("　", "").strip()
            .replace("ぢ", "じ").replace("づ", "ず"))


def _split_readings(raw: object) -> list[str]:
    """Ô cách đọc (của tài liệu, CSV JLPT hay mục quản trị) → các cách đọc toàn kana, bỏ ghi chú trong ngoặc và phần
    không phải kana (ô ghi lại chính chữ Hán); không còn gì → []."""
    out: list[str] = []
    for tok in _READING_SPLIT_RE.split(_READING_NOTE_RE.sub(" ", str(raw or ""))):
        r = _norm_kana(tok)
        if r and is_kana_only(r) and r not in out:
            out.append(r)
    return out


def _stem(w: str) -> str:
    """Rút gọn thô để "bridges / bridge", "studies / study", "going / go" khớp nhau; cả hai vế cùng rút nên chỉ cần nhất quán."""
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    for suf in ("sses", "shes", "ches", "xes", "zes", "oes"):
        if w.endswith(suf):
            return w[:-2]
    if len(w) > 5 and (w.endswith("ing") or w.endswith("ed")):
        return w[:-3] if w.endswith("ing") else w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def _words_en(text: object) -> frozenset[str]:
    return frozenset(_stem(w) for w in _WORD_EN_RE.findall(str(text or "").lower()) if len(w) >= 2 and w not in _STOP_EN)


def _words_vi(text: object) -> frozenset[str]:
    return frozenset(w for w in _WORD_VI_RE.findall(str(text or "").lower()) if w not in _STOP_VI and not w.isdigit())


def _overlap(a: frozenset[str], b: frozenset[str]) -> bool:
    """Có từ nội dung chung: trùng hẳn, hoặc từ này là tiền tố từ kia (study / studying); tiền tố ≥ 4 ký tự để go / goat không khớp."""
    for x in a:
        for y in b:
            if x == y or (min(len(x), len(y)) >= 4 and (x.startswith(y) or y.startswith(x))):
                return True
    return False


def _lang(text: str) -> Optional[str]:
    """Ngôn ngữ của nghĩa quản trị: có dấu tiếng Việt → vi; có từ tiếng Anh thật (wordfreq) → en; không rõ ("xe") → None
    (so với cả hai vế, chỉ báo khi không vế nào khớp)."""
    if _VI_RE.search(text):
        return "vi"
    try:
        from wordfreq import zipf_frequency
        if any(zipf_frequency(w, "en") >= ENGLISH_MIN_ZIPF for w in _WORD_EN_RE.findall(text.lower()) if len(w) >= 3):
            return "en"
    except Exception:   # thiếu wordfreq → không đoán
        pass
    return None


def _ref_key(term: str) -> str:
    """Khoá khớp mục quản trị: bỏ ～/〜 để "なければならない" khớp mẫu "〜なければならない" trong danh mục."""
    return term.strip().replace("～", "").replace("〜", "")


def _source_vi(source: str) -> str:
    return _SOURCE_VI.get(source) or f"mục tham chiếu quản trị ({source.partition(':')[2]})"


def _admin_source(entry: dict) -> str:
    sid = entry.get("sourceId")
    return f"admin:{sid}" if sid not in (None, "") else "admin:unknown"


def _warn(field: str, document: object, reference: object, source: str, confidence: float, note_vi: str) -> dict:
    return {"field": field, "document": str(document), "reference": str(reference), "source": source,
            "confidence": round(float(confidence), 2), "note_vi": note_vi}


# ----------------------------------------------------------------------------- tra cứu (cache theo lô)

def _admin_index(references: Iterable[dict], cache: dict) -> dict[str, list[dict]]:
    idx = cache.get("_refs")
    if idx is None:
        idx = {}
        for e in references or ():
            if isinstance(e, dict) and str(e.get("term") or "").strip():
                idx.setdefault(_ref_key(str(e["term"])), []).append(e)
        cache["_refs"] = idx
    return idx


def _dictionary(term: str, cache: dict) -> dict:
    """Mọi thứ từ điển nói về ``term``: mục JLPT [(reading, meaning, level)], cách đọc JMdict, gloss JMdict, cách đọc Unihan
    (chỉ chữ đơn). Từ toàn kana không có mục JLPT riêng thì gom mọi từ JLPT cùng cách đọc (はし → 橋 / 箸 / 端) để nghĩa
    nào trong số đó cũng được chấp nhận — không thể biết tài liệu nói về từ nào."""
    key = ("dict", term)
    d = cache.get(key)
    if d is None:
        jl = classifier.entries_of(term)
        if not jl and is_kana_only(term):
            jl = [(term, m, lv) for _, m, lv in classifier.homophones_jlpt(term)]
        entry = jmdict.lookup(term)
        d = {
            "jlpt": jl,
            "jmdict_readings": jmdict.readings_of(term) if has_kanji(term) else [],
            "jmdict_gloss": (entry or {}).get("gloss") or None,
            "unihan": unihan_readings(term) if len(term) == 1 and is_kanji(term) else (),
        }
        cache[key] = d
    return d


def _classified(term: str, reading: Optional[str], cache: dict) -> tuple[Optional[str], float]:
    key = ("level", term, reading)
    if key not in cache:
        level, conf, _ = classifier.classify(term, reading, is_kana_only(term))
        cache[key] = (level, conf)
    return cache[key]


def _sudachi(term: str, cache: dict) -> Optional[dict]:
    """SudachiDict nói gì về ``term``: {reading: cách đọc ghép (None khi có token OOV — không đoán), single: đúng một mục
    SudachiDict, numeral: token đầu là số đếm / có lượng từ (4時, 一分, 1本), proper: mọi token là tên riêng (上田,
    東京大学)}; thiếu Sudachi → None."""
    key = ("sudachi", term)
    if key not in cache:
        info = None
        try:
            from app.extract.tokenizer import tokenize
            toks = tokenize(term, "C")
            if toks:
                info = {
                    "reading": None if any(t.oov for t in toks) else (_norm_kana("".join(t.reading for t in toks)) or None),
                    "single": len(toks) == 1,
                    "numeral": "数詞" in toks[0].pos or any("助数詞" in t.pos for t in toks),
                    "proper": all(t.pos2 == "固有名詞" for t in toks),
                }
        except Exception:
            info = None
        cache[key] = info
    return cache[key]


def _scope(item: dict) -> str:
    """Phạm vi của docLevel: "document" chỉ khi item nói rõ; mọi giá trị khác / thiếu → "item" (hành vi cũ)."""
    return "document" if item.get("docLevelScope") == "document" else "item"


def _level_gap(level: str, doc_level: str, scope: str) -> int:
    """Độ lệch giữa cấp tham chiếu và cấp tài liệu khai: scope "item" lệch chiều nào cũng đáng ngờ; scope "document"
    chỉ khi từ KHÓ hơn cấp tài liệu (dương), từ dễ hơn trong tài liệu khó là bình thường."""
    diff = level_index(level) - level_index(doc_level)
    return diff if scope == "document" else abs(diff)


def _catalog_level(name: str, cache: dict) -> Optional[str]:
    idx = cache.get("_catalog")
    if idx is None:
        idx = {}
        try:
            from app.extract.grammar import load_catalog
            for p in load_catalog():
                idx.setdefault(_ref_key(p.name), p.level)
        except Exception:
            pass
        cache["_catalog"] = idx
    return idx.get(_ref_key(name))


# ----------------------------------------------------------------------------- từng luật

def _doc_readings(item: dict, term: str) -> list[str]:
    """Các cách đọc tài liệu khai báo (ô có thể liệt kê vài cách, mọi cách đều phải đúng): khoá ``docReading`` nếu
    pipeline truyền (None = không khai báo); không có khoá → ruby có base đúng bằng từ, rồi ``reading`` của thẻ, rồi
    ghép ``readingSegments`` (thẻ cũ chỉ còn furigana). Không có gì toàn kana → []."""
    if "docReading" in item:
        r = item["docReading"]
    else:
        r = next((rb.get("reading") for rb in item.get("rubies") or [] if rb.get("base") == term and rb.get("reading")),
                 None) or item.get("reading")
        if not r and item.get("readingSegments"):
            r = "".join(str(s.get("kana") or "") for s in item["readingSegments"])
    return _split_readings(r) if r else []


def _check_reading(term: str, docs: list[str], refs: list[dict], d: dict, su: Optional[dict]) -> tuple[Optional[dict], bool]:
    """→ (cảnh báo | None, có_tham_chiếu). Mục quản trị có cách đọc thì quyết định một mình; không thì hợp mọi cách đọc
    từ điển và trích nguồn đáng tin nhất có dữ liệu khi một cách đọc tài liệu không nằm trong đó. Từ bắt đầu bằng số đếm
    (十分 じゅっぷん / じゅうぶん, 一分 いっぷん, 五月 さつき: từ điển ghi một phần các biến âm) và tên riêng ngoài danh sách
    JLPT (上田 うえだ trùng mặt chữ danh từ じょうでん) không so với từ điển — không có nguồn đúng để so."""
    if not docs or not has_kanji(term):
        return None, False
    doc = " / ".join(docs)
    admin = [(e, r) for e in refs for r in _split_readings(e.get("reading"))]
    if admin:
        if all(any(r == x for _, r in admin) for x in docs):
            return None, True
        ref = " / ".join(dict.fromkeys(r for _, r in admin))
        src = _admin_source(admin[0][0])
        return _warn("reading", doc, ref, src, CONF_ADMIN,
                     f"Tài liệu đọc 「{doc}」 nhưng {_source_vi(src)} ghi 「{ref}」."), True
    if su and (su["numeral"] or (su["proper"] and not d["jlpt"])):
        return None, True   # coi như "đã xét": luật furigana cũng không được đoán hộ
    by_source = [
        ("jlpt_list", [r for row in d["jlpt"] for r in _split_readings(row[0])]),
        ("jmdict", [r for raw in d["jmdict_readings"] for r in _split_readings(raw)]),
        ("unihan", [r for raw in d["unihan"] for r in _split_readings(raw)]),
    ]
    accepted = {r for _, rs in by_source for r in rs}
    if not accepted:
        return None, False
    if all(x in accepted for x in docs):
        return None, True
    src, rs = next((s, rs) for s, rs in by_source if rs)
    ref = " / ".join(dict.fromkeys(rs))
    conf = CONF_READING_JLPT_ONLY if src == "jlpt_list" and not jmdict.available() else CONF_READING[src]
    return _warn("reading", doc, ref, src, conf,
                 f"Tài liệu đọc 「{doc}」 nhưng {_source_vi(src)} ghi 「{ref}」."), True


def _check_furigana(term: str, docs: list[str], su: Optional[dict]) -> Optional[dict]:
    """Từ không có trong JLPT / JMdict / Unihan (luật reading im lặng) nhưng là MỘT mục SudachiDict (銀行口座, 電気代):
    cách đọc Sudachi không nằm trong các cách đọc tài liệu → 0.5. Không dùng Sudachi khi từ điển đã có ý kiến; không ghép
    cách đọc nhiều token (何曜日 → なんようひ, 今日中 → きょうなか: biến âm giữa các token Sudachi không mô hình), không xét
    số đếm / tên riêng; và không so furigana từng chữ với Unihan: thử trên 10 853 đoạn của danh sách JLPT có 0,6 % báo
    nhầm (母 かあ, 父 とう…). Ngay cả một token, Sudachi đọc sai ~2 % từ JLPT đứng một mình (箱 ばこ, 深い ぶかい) nên
    confidence để dưới ngưỡng mặc định — quản trị hạ ngưỡng mới thấy."""
    if not docs or not has_kanji(term) or not su:
        return None
    tok = su["reading"]
    if not tok or not su["single"] or su["numeral"] or su["proper"] or tok in docs:
        return None
    doc = " / ".join(docs)
    return _warn("furigana", doc, tok, "sudachi", CONF_FURIGANA,
                 f"Tài liệu đọc 「{doc}」 nhưng Sudachi đọc 「{tok}」 (từ không có trong danh sách JLPT / JMdict nên "
                 f"độ tin cậy thấp).")


def _check_meaning(term: str, item: dict, refs: list[dict], d: dict) -> Optional[dict]:
    doc_en = item["docMeaningEn"] if "docMeaningEn" in item else item.get("meaningEn")
    doc_en = str(doc_en).strip() if doc_en else ""
    doc_vi = str(item.get("meaningVi") or "").strip()
    # Mục quản trị: so cùng ngôn ngữ (nghĩa VI với meaningVi, nghĩa EN với gloss EN); không rõ ngôn ngữ → vế nào khớp cũng được
    compared: list[tuple[dict, str, str]] = []   # (mục, nghĩa tham chiếu, nghĩa tài liệu) đủ từ để so
    for e in refs:
        ref = str(e.get("meaning") or "").strip()
        if not ref:
            continue
        lang = _lang(ref)
        pairs: list[tuple[str, frozenset[str], frozenset[str]]] = []
        if lang != "en" and doc_vi:
            pairs.append((doc_vi, _words_vi(doc_vi), _words_vi(ref)))
        if lang != "vi" and doc_en:
            pairs.append((doc_en, _words_en(doc_en), _words_en(ref)))
        pairs = [p for p in pairs if p[1] and p[2]]
        if any(_overlap(dw, rw) for _, dw, rw in pairs):
            return None
        compared += [(e, ref, doc) for doc, _, _ in pairs]
    if compared:
        e, ref, doc = compared[0]
        src = _admin_source(e)
        return _warn("meaning", doc, ref, src, CONF_ADMIN,
                     f"Nghĩa trong tài liệu 「{doc}」 không trùng {_source_vi(src)} 「{ref}」.")
    if not doc_en:
        return None
    dw = _words_en(doc_en)
    if not dw:
        return None
    jlpt_meanings = [m for _, m, _ in d["jlpt"] if m]
    ref_words: set[str] = set()
    for m in jlpt_meanings + ([d["jmdict_gloss"]] if d["jmdict_gloss"] else []):
        ref_words |= _words_en(m)
    if not ref_words or _overlap(dw, frozenset(ref_words)):
        return None
    src = "jlpt_list" if jlpt_meanings else "jmdict"
    ref = jlpt_meanings[0] if jlpt_meanings else d["jmdict_gloss"]
    return _warn("meaning", doc_en, ref, src, CONF_MEANING,
                 f"Nghĩa trong tài liệu 「{doc_en}」 không có từ nào trùng với {_source_vi(src)} 「{ref}」 "
                 f"(có thể chỉ khác cách diễn đạt).")


def _level_note(doc_level: str, source_vi: str, ref: str, gap: int, scope: str, what: str = "") -> str:
    if scope == "document":
        return f"Tài liệu tự nhận cấp {doc_level} nhưng {source_vi} xếp {what}{ref} (khó hơn {gap} cấp)."
    return f"Tài liệu xếp {doc_level} nhưng {source_vi} xếp {what}{ref} (lệch {gap} cấp)."


def _check_admin_level(doc_level: str, refs: list[dict], field: str, scope: str) -> tuple[Optional[dict], bool]:
    """→ (cảnh báo | None, quản trị có ý kiến). Nguồn quản trị là chuẩn nên với tag trên dòng (scope item) lệch 1 cấp cũng
    là trái; với cấp chung của tài liệu chỉ trái khi quản trị xếp từ khó hơn ≥ LEVEL_GAP cấp."""
    levels = [lv for e in refs if (lv := parse_level(e.get("level")))]
    if not levels:
        return None, False
    if scope == "document":
        if any(_level_gap(lv, doc_level, scope) < LEVEL_GAP for lv in levels):
            return None, True
    elif doc_level in levels:
        return None, True
    ref = " / ".join(dict.fromkeys(levels))
    src = _admin_source(next(e for e in refs if parse_level(e.get("level"))))
    gap = min(_level_gap(lv, doc_level, scope) for lv in levels)
    return _warn(field, doc_level, ref, src, CONF_ADMIN, _level_note(doc_level, _source_vi(src), ref, gap, scope)), True


def _check_level(term: str, item: dict, docs: list[str], doc_level: Optional[str], refs: list[dict],
                 cache: dict) -> Optional[dict]:
    if not doc_level:
        return None
    scope = _scope(item)
    w, decided = _check_admin_level(doc_level, refs, "level", scope)
    if decided:
        return w
    level, conf = _classified(term, docs[0] if docs else item.get("reading"), cache)
    if level is None or conf < LEVEL_MIN_CONFIDENCE:
        return None
    gap = _level_gap(level, doc_level, scope)
    if gap < LEVEL_GAP:
        return None
    return _warn("level", doc_level, level, "jlpt_list", CONF_LEVEL,
                 _level_note(doc_level, "danh sách JLPT", level, gap, scope))


def _check_grammar(term: str, item: dict, doc_level: Optional[str], refs: list[dict], cache: dict) -> Optional[dict]:
    if not doc_level:
        return None
    scope = _scope(item)
    w, decided = _check_admin_level(doc_level, refs, "grammar", scope)
    if decided:
        return w
    level = parse_level(item.get("level")) or _catalog_level(term, cache)
    if not level:
        return None
    gap = _level_gap(level, doc_level, scope)
    if gap < LEVEL_GAP:
        return None
    return _warn("grammar", doc_level, level, "grammar", CONF_GRAMMAR,
                 _level_note(doc_level, "danh mục ngữ pháp", level, gap, scope, what=f"mẫu {term} ở "))


# ----------------------------------------------------------------------------- API

def check_item(item: dict, references: Iterable[dict] = (), cache: Optional[dict] = None) -> list[dict]:
    """Cảnh báo của MỘT item (chưa lọc theo ngưỡng — caller lọc ``confidence``), thứ tự reading / furigana / meaning /
    level (hoặc grammar với kind = grammar). ``item``: {term, kind?, reading?, meaningEn?, meaningVi?, level?, rubies?,
    readingSegments?, docReading?, docMeaningEn?, docLevel?, docLevelScope?: "item" (mặc định) | "document"};
    ``references``: [{term, reading?, meaning?, level?, sourceId?}]. ``cache`` dùng chung cho một lô (check_items) — mọi
    lần gọi cùng cache phải cùng ``references``."""
    cache = {} if cache is None else cache
    term = str(item.get("term") or "").strip()
    if not term:
        return []
    refs = _admin_index(references, cache).get(_ref_key(term), [])
    doc_level = parse_level(item.get("docLevel"))
    if (item.get("kind") or "vocab") == "grammar":
        w = _check_grammar(term, item, doc_level, refs, cache)
        return [w] if w else []
    docs = _doc_readings(item, term)
    d = _dictionary(term, cache)
    su = _sudachi(term, cache) if docs and has_kanji(term) else None
    out: list[dict] = []
    w, known = _check_reading(term, docs, refs, d, su)
    if w:
        out.append(w)
    elif not known:
        w = _check_furigana(term, docs, su)
        if w:
            out.append(w)
    w = _check_meaning(term, item, refs, d)
    if w:
        out.append(w)
    w = _check_level(term, item, docs, doc_level, refs, cache)
    if w:
        out.append(w)
    return out


def check_items(items: Iterable[dict], references: Iterable[dict] = (), min_confidence: float = 0.0) -> list[list[dict]]:
    """Một lô: cùng thứ tự với ``items``, mỗi phần tử là danh sách cảnh báo đã lọc ``confidence >= min_confidence``
    (luôn là list, [] khi không có). Tra cứu từ điển / mục quản trị cache chung cho cả lô."""
    cache: dict = {}
    refs = list(references or ())
    return [[c for c in check_item(it, refs, cache) if c["confidence"] >= min_confidence] for it in items]


def summarize(conflict_lists: Iterable[list[dict]]) -> dict:
    """stats cho pipeline / endpoint: {conflicts: tổng, conflictsByField: {reading, furigana, meaning, level, grammar}}."""
    by_field = {f: 0 for f in FIELDS}
    for lst in conflict_lists:
        for c in lst:
            by_field[c["field"]] = by_field.get(c["field"], 0) + 1
    return {"conflicts": sum(by_field.values()), "conflictsByField": by_field}
