"""Endpoint nội bộ ngữ pháp (C7): quiz chia động từ từ danh sách từ của bộ thẻ / tài liệu.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY; khi env rỗng (dev) bỏ kiểm tra.
Kết quả xác định theo ``seed`` (chọn dạng và xáo phương án bằng random.Random riêng cho từng động từ) để backend
tạo lại cùng một bộ câu hỏi, còn cache / so đáp án không lệch giữa hai lần gọi. Động từ không nhận diện được hay không
có dạng nào dùng được thì đưa vào ``skipped`` kèm lý do thay vì làm hỏng cả lô.
"""
from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.extract import conjugate, tokenizer

MAX_VERBS = 200
MAX_EXAMPLE_SENTENCES = 2000
OPTIONS_PER_ITEM = 4

# Câu mẫu khi tài liệu không có câu chứa dạng đúng; {} = dạng đã chia
TEMPLATES_JA = {
    "te": "{}ください。",
    "ta": "昨日、{}。",
    "nai": "今日は{}。",
    "masu": "毎日{}。",
    "potential": "{}ようになりました。",
    "passive": "先生に{}。",
    "causative": "先生は学生に{}。",
    "causative_passive": "私は先生に{}。",
    "volitional": "一緒に{}。",
    "imperative": "早く{}！",
    "honorific_o_ni_naru": "先生が{}。",
    "humble_o_suru": "私が{}。",
}

router = APIRouter(prefix="/grammar", tags=["Ngữ pháp"], dependencies=[Depends(require_internal_key)])


def available() -> bool:
    """Cờ health cho quiz chia động từ (cần Sudachi để biết nhóm động từ)."""
    return conjugate.available()


class QuizVerb(BaseModel):
    term: str = Field(..., min_length=1, max_length=64)
    reading: Optional[str] = Field(default=None, max_length=64)


class ConjugationQuizRequest(BaseModel):
    verbs: list[QuizVerb] = Field(default_factory=list)
    forms: Optional[list[str]] = None            # mặc định: mọi dạng trong conjugate.FORMS
    perVerb: int = Field(default=1, ge=1, le=5)
    exampleSentences: Optional[list[str]] = None  # câu trong tài liệu, ưu tiên làm ví dụ nếu chứa dạng đúng
    seed: int = 0


def pick_example(correct: str, sentences: list[str], form: str) -> str:
    """Câu đầu tiên trong tài liệu chứa dạng đúng; không có → câu mẫu theo dạng."""
    for s in sentences:
        if correct and correct in s:
            return s.strip()
    return TEMPLATES_JA.get(form, "{}。").format(correct)


def _prompt_vi(lemma: str, reading: Optional[str], form: str) -> str:
    shown = f"{lemma}（{reading}）" if reading and reading != lemma else lemma
    return f"Chia động từ 「{shown}」 sang {conjugate.label_vi(form)}."


def build_quiz(verbs: list[dict], forms: Optional[list[str]], per_verb: int,
               sentences: Optional[list[str]], seed: int) -> dict:
    """Hàm thuần dựng {items, skipped}; router chỉ kiểm tra đầu vào rồi gọi. Mỗi động từ có RNG riêng
    (seed + vị trí + lemma) nên thêm / bớt động từ khác không làm đổi câu hỏi của động từ này."""
    wanted = list(forms) if forms else list(conjugate.FORMS)
    sentences = [s for s in (sentences or []) if s and s.strip()][:MAX_EXAMPLE_SENTENCES]
    items: list[dict] = []
    skipped: list[dict] = []
    seen_lemmas: set[str] = set()
    for idx, v in enumerate(verbs):
        term = (v.get("term") or "").strip()
        if not term:
            skipped.append({"term": term, "reason": "empty"})
            continue
        info = conjugate.analyze(term, v.get("reading"))
        if info is None:
            skipped.append({"term": term, "reason": "not_a_verb"})
            continue
        if info.lemma in seen_lemmas:
            skipped.append({"term": term, "reason": "duplicate"})
            continue
        seen_lemmas.add(info.lemma)
        all_forms = conjugate.forms(info.lemma, info.group, info.reading, info.compound)
        usable = [f for f in wanted if all_forms.get(f)]
        if not usable:
            skipped.append({"term": term, "reason": "no_forms"})
            continue
        rng = random.Random(f"{seed}:{idx}:{info.lemma}")
        chosen = rng.sample(usable, min(per_verb, len(usable)))
        for form in chosen:
            correct = all_forms[form]
            wrongs = conjugate.wrong_forms(info.lemma, info.group, form, OPTIONS_PER_ITEM - 1,
                                           info.reading, info.compound)
            options = [correct, *wrongs]
            rng.shuffle(options)
            items.append({
                "term": term,
                "lemma": info.lemma,
                "reading": info.reading,
                "group": info.group,
                "form": form,
                "formLabelVi": conjugate.label_vi(form),
                "prompt": _prompt_vi(info.lemma, info.reading, form),
                "correct": correct,
                "options": options,
                "example": pick_example(correct, sentences, form),
            })
    return {"items": items, "skipped": skipped}


@router.post("/conjugation-quiz")
def conjugation_quiz(req: ConjugationQuizRequest) -> dict:
    """Quiz chia động từ: mỗi item một (động từ, dạng) với 4 phương án đã xáo (xác định theo ``seed``)."""
    if len(req.verbs) > MAX_VERBS:
        raise HTTPException(status_code=400, detail=f"Tối đa {MAX_VERBS} động từ mỗi lần")
    if req.forms:
        unknown = sorted(set(req.forms) - set(conjugate.FORMS))
        if unknown:
            raise HTTPException(status_code=400, detail=f"forms không hợp lệ: {', '.join(unknown)}")
    return build_quiz([v.model_dump() for v in req.verbs], req.forms, req.perVerb, req.exampleSentences, req.seed)


@router.get("/health")
def grammar_health() -> dict:
    return {"sudachi": tokenizer.available(), "conjugation": available()}
