"""Matcher mẫu ngữ pháp: DSL nhỏ → regex chạy trên chuỗi token Sudachi mode A.

Mỗi token của câu được mã hoá thành một đoạn
    \\x1f<surface>|<lemma>|<pos1>/<pos2>|<conj_form>\\x1e
(pos1/pos2 = 2 tầng đầu POS Sudachi, conj_form = 活用形 như 連用形-一般).
Cả câu = nối các đoạn. Mỗi mẫu trong patterns.yaml biên dịch thành regex khớp
một dãy token liên tiếp, nên không cần tự viết automat.

DSL (`pattern`): các spec cách nhau bằng khoảng trắng, mỗi spec khớp đúng 1 token:
    *                   token bất kỳ
    て                  surface đúng bằng "て"
    %方                 surface kết thúc bằng "方"  (dùng cho 使い方 là 1 token)
    ない/助動詞          lemma = ない và POS bắt đầu bằng 助動詞
    /名詞               POS bắt đầu bằng 名詞 (có thể viết /助詞/準体助詞 để khớp tầng 2)
    V  A  N             viết tắt của /動詞  /形容詞  /名詞|/代名詞
    V[連用]              động từ ở 活用形 bắt đầu bằng 連用 (未然 / 連用 / 終止 / 連体 / 仮定 / 命令 / 意志推量 / 語幹)
    A[連用]              tương tự cho 形容詞
    ない/助動詞[仮定]     lemma/POS kèm điều kiện 活用形
    %方/名詞             hậu tố surface kèm POS
    a|b|c               một trong các spec (alternation), vd  て|で   hay  くれる/動詞|あげる/動詞
    spec?               spec tuỳ chọn (0 hoặc 1 token)
Khớp chồng lấn trong một câu → giữ mẫu dài hơn (nhiều token hơn); bằng nhau → mẫu
đứng trước trong catalog. Mỗi mẫu một item cho cả tài liệu: frequency đếm số lần,
example là câu đầu tiên.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.extract.tokenizer import Token

CATALOG_FILE = Path(__file__).parent / "patterns.yaml"
SEP_START, SEP_END = "\x1f", "\x1e"
_FIELD = r"[^\x1e|]*"          # một trường trong token
_REST = r"[^\x1e]*"            # phần còn lại của token

_SHORTCUTS = {"V": "/動詞", "A": "/形容詞", "N": "/名詞|/代名詞"}


@dataclass(frozen=True)
class Pattern:
    id: str
    name: str
    level: str
    pattern: str
    meaning_vi: str
    regex: re.Pattern
    order: int


@dataclass
class Match:
    pattern: Pattern
    start: int   # chỉ số token bắt đầu
    end: int     # chỉ số token kết thúc (exclusive)


def encode(tokens: list[Token]) -> str:
    return "".join(
        f"{SEP_START}{t.surface}|{t.lemma}|{t.pos1}/{t.pos2}|{t.conj_form}{SEP_END}" for t in tokens
    )


def _compile_atom(atom: str) -> str:
    """Một spec đơn (không có | và ?) → regex khớp đúng 1 token."""
    atom = _SHORTCUTS.get(atom, atom)
    if "|" in atom:  # viết tắt N mở rộng thành alternation
        return "(?:" + "|".join(_compile_atom(a) for a in atom.split("|")) + ")"
    if atom == "*":
        return f"{SEP_START}{_REST}{SEP_END}"
    # điều kiện 活用形 trong [...]
    conj = ""
    m = re.fullmatch(r"(.*)\[(.+)\]", atom)
    if m:
        atom, conj = m.group(1), m.group(2)
        atom = _SHORTCUTS.get(atom, atom)
    conj_re = re.escape(conj) + _REST if conj else _FIELD
    if atom.startswith("%"):  # hậu tố surface
        suffix, _, pos = atom[1:].partition("/")
        pos_re = re.escape(pos) + _FIELD if pos else _FIELD
        return f"{SEP_START}{_FIELD}{re.escape(suffix)}\\|{_FIELD}\\|{pos_re}\\|{conj_re}{SEP_END}"
    if "/" in atom:
        lemma, _, pos = atom.partition("/")
        lemma_re = re.escape(lemma) if lemma else _FIELD
        pos_re = re.escape(pos) + _FIELD if pos else _FIELD
        return f"{SEP_START}{_FIELD}\\|{lemma_re}\\|{pos_re}\\|{conj_re}{SEP_END}"
    # surface thuần
    return f"{SEP_START}{re.escape(atom)}\\|{_FIELD}\\|{_FIELD}\\|{conj_re}{SEP_END}"


def compile_pattern(dsl: str) -> re.Pattern:
    parts = []
    for spec in dsl.split():
        optional = spec.endswith("?")
        if optional:
            spec = spec[:-1]
        alts = [_compile_atom(a) for a in spec.split("|")]
        body = alts[0] if len(alts) == 1 else "(?:" + "|".join(alts) + ")"
        parts.append(f"(?:{body})?" if optional else body)
    return re.compile("".join(parts))


_catalog: list[Pattern] | None = None


def load_catalog(path: Path = CATALOG_FILE) -> list[Pattern]:
    global _catalog
    if _catalog is None:
        import yaml
        with open(path, encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or []
        catalog = []
        for i, item in enumerate(raw):
            catalog.append(Pattern(
                id=str(item["id"]), name=str(item["name"]), level=str(item["level"]),
                pattern=str(item["pattern"]), meaning_vi=str(item.get("meaning_vi", "")),
                regex=compile_pattern(str(item["pattern"])), order=i,
            ))
        _catalog = catalog
    return _catalog


def available() -> bool:
    try:
        return len(load_catalog()) > 0
    except Exception:
        return False


def match_sentence(tokens: list[Token], catalog: Optional[list[Pattern]] = None) -> list[Match]:
    """Tất cả mẫu khớp trong câu, đã loại chồng lấn (giữ mẫu dài hơn)."""
    catalog = catalog or load_catalog()
    encoded = encode(tokens)
    found: list[Match] = []
    for pat in catalog:
        for m in pat.regex.finditer(encoded):
            if m.end() == m.start():
                continue
            start = encoded.count(SEP_START, 0, m.start())
            length = encoded.count(SEP_START, m.start(), m.end())
            found.append(Match(pat, start, start + length))
    found.sort(key=lambda x: (-(x.end - x.start), x.pattern.order, x.start))
    taken: list[tuple[int, int]] = []
    kept: list[Match] = []
    for mt in found:
        if any(mt.start < e and s < mt.end for s, e in taken):
            continue
        taken.append((mt.start, mt.end))
        kept.append(mt)
    kept.sort(key=lambda x: x.start)
    return kept


def match_document(sentences: list[tuple[int, str, list[Token]]]) -> list[dict]:
    """sentences: [(sentence_index, text, tokens_mode_A)] → grammar items (chưa áp levelFilter).

    position = thứ tự xuất hiện đầu tiên tính theo (câu, token).
    """
    catalog = load_catalog()
    items: dict[str, dict] = {}
    for sent_idx, text, tokens in sentences:
        for mt in match_sentence(tokens, catalog):
            pat = mt.pattern
            it = items.get(pat.name)  # khoá theo tên: dạng rút gọn (てる/ちゃう) gộp chung mẫu gốc
            if it is None:
                items[pat.name] = {
                    "kind": "grammar",
                    "position": 0,
                    "_order": (sent_idx, mt.start),
                    "term": pat.name,
                    "surface": None,
                    "reading": None,
                    "readingSegments": None,
                    "hanViet": None,
                    "pos": "文法",
                    "meaningEn": None,
                    "meaningVi": pat.meaning_vi or None,
                    "level": pat.level,
                    "levelConfidence": 1.0,
                    "levelSources": [f"grammar_catalog:{pat.level}"],
                    "frequency": 1,
                    "example": text[:500],
                    "exampleVi": None,
                }
            else:
                it["frequency"] += 1
    return sorted(items.values(), key=lambda x: x["_order"])
