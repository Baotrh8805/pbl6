"""Thẻ bộ thủ + mẹo nhớ (C4) — endpoint nội bộ cho backend.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY (require_internal_key, như mọi router khác).
POST /radicals/cards     thẻ cho một lô chữ: bộ thủ, âm Hán-Việt, nghĩa, ví dụ JLPT, mẹo nhớ (Gemini, dự phòng template)
GET  /radicals           bảng 214 bộ thủ Khang Hi
GET  /radicals/{no}/kanji chữ JLPT thuộc một bộ (lọc theo cấp)

Mẹo nhớ: gọi gemini.generate_mnemonics một lần cho cả lô; chữ nào Gemini không trả / bị lọc / Gemini lỗi thì điền
radicals.template_mnemonic và ghi mnemonicSource="template", ``reason`` ghi lý do Gemini (no_key / quota / error) để
backend hiển thị. Thẻ không bao giờ thiếu mẹo khi withMnemonic=true; admin duyệt mẹo ở backend trước khi công khai.
Dữ liệu thiếu không phải lỗi: chữ không tra được bộ → radical None, vẫn có thẻ. Cờ health: available() (fix phase gắn
vào /extract/health).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import gemini, han_viet, han_viet_graph, kanji_cards, kanjidata, radicals
from app.extract.jachars import is_kanji
from app.extract.jlpt import classifier

MAX_KANJI = 200     # một bộ thẻ gửi một lần (như /kanji-info/kanji-cards); Gemini chia batch 40 bên trong
MAX_EXAMPLES = 3
_SKIP_CHARS = frozenset("々〆ヶ")  # jachars coi là kanji nhưng không có bộ / âm riêng (như kanji_cards)

router = APIRouter(prefix="/radicals", tags=["Bộ thủ"], dependencies=[Depends(require_internal_key)])


def available() -> bool:
    """Cờ health: bảng 214 bộ thủ nạp được."""
    return radicals.available()


class RadicalCardsRequest(BaseModel):
    kanji: list[str] = Field(default_factory=list, max_length=MAX_KANJI)
    levels: Optional[list[str]] = None   # N5…N1: ví dụ đúng cấp xếp trước (không lọc bỏ — chữ hiếm vẫn có ví dụ)
    withMnemonic: bool = True            # false: không gọi Gemini, mnemonicVi None (tiết kiệm quota khi chỉ cần bộ)


def _check_levels(levels: Optional[list[str]]) -> Optional[list[str]]:
    """Nhận cả dạng lặp (?levels=N5&levels=N4) lẫn gộp dấu phẩy ("N5,N4"); rỗng → None; giá trị ngoài N5…N1 → 400
    (không âm thầm bỏ để backend thấy lỗi sớm, như kanji_info_router)."""
    out: list[str] = []
    for raw in levels or []:
        for lv in (raw or "").split(","):
            lv = lv.strip()
            if not lv:
                continue
            if lv not in classifier.LEVELS:
                raise HTTPException(status_code=400,
                                    detail=f"levels không hợp lệ: {lv} (chỉ nhận {', '.join(classifier.LEVELS)})")
            if lv not in out:
                out.append(lv)
    return out or None


def _radical_view(row: Optional[dict]) -> Optional[dict]:
    """Dòng bảng → {no, char, nameVi, meaningVi, hanViet} cho thẻ; ``char`` là chữ CJK thống nhất (水) vì ký tự khối
    Kangxi (⽔) nhiều font không có."""
    if not row:
        return None
    return {"no": row["no"], "char": row["unified"], "nameVi": row["name_vi"], "meaningVi": row["meaning_vi"],
            "hanViet": row["han_viet"]}


def _table_view(row: dict) -> dict:
    return {"no": row["no"], "char": row["char"], "unified": row["unified"], "strokes": row["strokes"],
            "nameVi": row["name_vi"], "meaningVi": row["meaning_vi"], "hanViet": row["han_viet"]}


def _examples(ch: str, levels: Optional[list[str]]) -> list[dict]:
    """≤ MAX_EXAMPLES từ JLPT chứa chữ: từ đúng cấp ``levels`` trước (nếu có), rồi cấp dễ → khó, cùng cấp từ thông dụng
    trước (han_viet_graph.word_frequency, như kanji_cards). Mỗi từ một lần."""
    wanted = set(levels or [])
    seen: set[str] = set()
    items: list[dict] = []
    for term, reading, meaning, level in classifier.entries_containing(ch):
        if term in seen:
            continue
        seen.add(term)
        items.append({"term": term, "reading": reading or None, "meaning": meaning or None, "level": level})
    items.sort(key=lambda ex: (0 if ex["level"] in wanted else 1, classifier.level_index(ex["level"]),
                               -han_viet_graph.word_frequency(ex["term"])))
    return items[:MAX_EXAMPLES]


def _clean_kanji(kanji_list: list[str]) -> list[str]:
    """Giữ thứ tự, bỏ trùng; mục không phải một chữ Hán (chuỗi dài, kana, 々) bị bỏ qua thay vì báo lỗi để backend gửi
    cả bộ thẻ mà không phải lọc trước (như kanji_cards.cards)."""
    out: list[str] = []
    for item in kanji_list:
        ch = (item or "").strip()
        if len(ch) == 1 and is_kanji(ch) and ch not in _SKIP_CHARS and ch not in out:
            out.append(ch)
    return out


def _meaning_en(ch: str) -> Optional[str]:
    """Nghĩa EN cho thẻ / prompt Gemini: cùng nguồn với thẻ chữ Hán C5 (JMdict rồi cột meaning JLPT) nhưng bỏ nghĩa là
    phụ tố / lượng từ (人 → "-ian (e.g. Italian)", 回 → "counter for…"); JMdict chỉ còn phụ tố → thử cột JLPT, rồi mọi
    mục JLPT của đúng chữ đó (meaning_hint chỉ trả mục đầu: 人 じん / にん "counter for people" đứng trước ひと "man,
    person"); vẫn không → None (template bỏ phần nghĩa, nghĩa bộ thủ tiếng Việt vẫn có)."""
    found = radicals.clean_meaning(kanji_cards._meaning_en(ch)) or radicals.clean_meaning(classifier.meaning_hint(ch))
    if found:
        return found
    return next((m for _, meaning, _ in classifier.entries_of(ch) if (m := radicals.clean_meaning(meaning))), None)


def build_cards(kanji_list: list[str], levels: Optional[list[str]] = None) -> list[dict]:
    """Thẻ chưa có mẹo (mnemonicVi / mnemonicSource = None) cho các chữ hợp lệ, giữ thứ tự gửi lên."""
    cards: list[dict] = []
    for ch in _clean_kanji(kanji_list):
        rs = kanjidata.radical_strokes(ch)
        cards.append({
            "kanji": ch,
            "hanViet": han_viet.han_viet(ch),
            "meaningEn": _meaning_en(ch),
            "strokeCount": rs[1] if rs else None,
            "radical": _radical_view(radicals.radical_of(ch)),
            "mnemonicVi": None,
            "mnemonicSource": None,
            "examples": _examples(ch, levels),
        })
    return cards


def _mnemonic_item(card: dict) -> dict:
    rad = card["radical"] or {}
    return {"kanji": card["kanji"], "hanViet": card["hanViet"], "radicalName": rad.get("nameVi"),
            "radicalChar": rad.get("char"), "radicalVariants": list(radicals.variants(rad.get("no") or 0)),
            "meaningEn": card["meaningEn"], "examples": [ex["term"] for ex in card["examples"]]}


def fill_mnemonics(cards: list[dict], with_mnemonic: bool = True) -> Optional[str]:
    """Điền mnemonicVi / mnemonicSource tại chỗ; trả ``reason`` của Gemini (None khi mọi chữ đều có mẹo Gemini hoặc
    không gọi). Chỉ hỏi Gemini những chữ có âm Hán-Việt hoặc bộ (bộ lọc gemini.mnemonic_ok đòi mẹo nhắc một trong
    hai, chữ không có cả hai thì hỏi cũng bị bỏ); phần còn lại và mọi chữ khi Gemini hỏng → template."""
    if not with_mnemonic:
        return None
    got: dict[str, str] = {}
    reason: Optional[str] = None
    ask = [c for c in cards if c["hanViet"] or c["radical"]]
    if ask:
        result = gemini.generate_mnemonics([_mnemonic_item(c) for c in ask])
        reason = result.get("reason")
        got = {m["kanji"]: m["mnemonicVi"] for m in result.get("items", []) if m.get("mnemonicVi")}
    for c in cards:
        text = got.get(c["kanji"])
        if text:
            c["mnemonicVi"], c["mnemonicSource"] = text, "gemini"
        else:
            c["mnemonicVi"] = radicals.template_mnemonic(c["kanji"], c["radical"], c["hanViet"], c["meaningEn"])
            c["mnemonicSource"] = "template"
    return reason


@router.post("/cards")
def post_radical_cards(req: RadicalCardsRequest) -> dict:
    """Thẻ bộ thủ cho một lô chữ (≤ MAX_KANJI; quá → 422): {items: [{kanji, hanViet, meaningEn, strokeCount,
    radical: {no, char, nameVi, meaningVi, hanViet} | null, mnemonicVi, mnemonicSource: "gemini" | "template" | null,
    examples: [{term, reading, meaning, level}]}], groups: [{radical, kanji: [...]}], reason}."""
    levels = _check_levels(req.levels)
    cards = build_cards(req.kanji, levels)
    reason = fill_mnemonics(cards, req.withMnemonic)
    groups = [{"radical": _radical_view(g["radical"]), "kanji": g["kanji"]}
              for g in radicals.group_kanji([c["kanji"] for c in cards])]
    return {"items": cards, "groups": groups, "reason": reason}


@router.get("")
def get_radicals() -> dict:
    """Bảng 214 bộ thủ Khang Hi: {items: [{no, char, unified, strokes, nameVi, meaningVi, hanViet}]} (rỗng khi thiếu
    file dữ liệu — health báo radicals=false)."""
    return {"items": [_table_view(r) for r in radicals.table()]}


@router.get("/{no}/kanji")
def get_kanji_by_radical(
    no: int = Path(..., ge=1, le=radicals.RADICAL_COUNT, description="Số bộ thủ Khang Hi 1..214"),
    levels: Optional[list[str]] = Query(default=None, description="N5…N1, lặp hoặc gộp dấu phẩy; rỗng = mọi cấp"),
) -> dict:
    """Chữ JLPT thuộc bộ ``no``: {radical, levels, items: [{kanji, level, strokeCount}]} (cấp dễ → khó, ít nét trước).
    Bộ không có trong bảng (thiếu file dữ liệu) → 404."""
    row = radicals.radical(no)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Không có bộ thủ số {no}")
    wanted = _check_levels(levels)
    return {"radical": _radical_view(row), "levels": wanted, "items": radicals.kanji_by_radical(no, wanted)}
