"""Lớp mỏng bọc google-genai: Vision OCR fallback, dịch nghĩa VN theo batch, dịch câu Nhật ↔ Việt (tab Dịch).

Mọi lỗi SDK được gói thành GeminiError(reason) với reason ∈ {no_api_key, quota, error}
để router/reader quyết định bỏ qua; không bao giờ log API key.
"""
from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 40
TIMEOUT_MS = 60_000
MODEL = settings.GEMINI_MODEL
# Model chính đổi được theo từng request (backend gửi Admin > Cấu hình > ai_model_primary kèm mỗi lượt OCR / dịch nghĩa / mẹo
# nhớ) nhưng chỉ trong danh sách cho phép: GEMINI_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_ALLOWED_MODELS và các model dưới đây.
# Tên gõ sai mà gửi thẳng lên Google thì MỌI lượt gọi 404 -> bỏ qua, dùng GEMINI_MODEL. Chỉ ghi model đã ĐO với key của dự án
# (12/10/2026); model khác (họ 2.5 đã có lịch ngừng, bản -lite chưa thử) thêm qua GEMINI_ALLOWED_MODELS sau khi tự gọi thử.
KNOWN_MODELS = ("gemini-3.8-flash", "gemini-3.7-flash")
_MAX_WARNED = 100           # tên lạ đã ghi log (mỗi tên một lần); trần SỐ tên để request lạ không làm phình bộ nhớ
_WARN_KEY_CHARS = 60        # ... và trần ĐỘ DÀI mỗi tên lưu lại: form / JSON không giới hạn độ dài (tên lạ không được 422)
_warned_models: set[str] = set()
# 429 / 503: thử lại với giãn cách rồi mới sang GEMINI_FALLBACK_MODEL (spec §2.7). Giãn cách chỉ 14 s nhưng mỗi lượt gọi
# có thể treo tới TIMEOUT_MS (504 DEADLINE_EXCEEDED) -> giới hạn tổng thời gian dưới AI_SERVICE_READ_TIMEOUT (3 phút)
# của backend, nếu không backend timeout và cả job FAILED dù dịch nghĩa chỉ là bước làm giàu.
RETRY_DELAYS = (2, 4, 8)
TOTAL_BUDGET_S = 150
# Hết quota / quá tải sau khi đã thử lại hết -> tạm ngưng gọi Gemini COOLDOWN_S giây (mọi lượt gọi: OCR từng trang,
# dịch nghĩa) để một tài liệu 18 trang scan không chờ 14 s x 18 trang vô ích.
COOLDOWN_S = 120


@dataclass(frozen=True)
class CallProfile:
    """Cách thử lại của một lượt gọi. budget_s None = không có ngân sách riêng (caller truyền deadline chung)."""
    timeout_ms: int
    delays: tuple[int, ...]
    budget_s: Optional[int]


DEFAULT_PROFILE = CallProfile(TIMEOUT_MS, RETRY_DELAYS, TOTAL_BUDGET_S)
# OCR Vision (spec 21/10): Gemini chỉ là bước nâng chất lượng (Tesseract đã có bản dự phòng) nên không chờ lâu: timeout 30 s,
# thử lại 1 lần, và deadline CHUNG cho cả tài liệu do image_reader truyền (OCR_GEMINI_BUDGET_S, mặc định 60 s) — nhiều trang
# không được cộng dồn tới 3 phút read-timeout của backend như trước.
OCR_PROFILE = CallProfile(30_000, (3,), None)
# Sát deadline chung, một lượt OCR vẫn được gọi với timeout = phần còn lại (kẹp dưới profile.timeout_ms) thay vì bị từ chối chỉ
# vì không đủ 30 s (review 21/10: nếu không, tài liệu dài chỉ có ~30 s đầu được nhờ Gemini). Dưới MIN_TIMEOUT_S thì thôi.
MIN_TIMEOUT_S = 8
_cooldown_until = 0.0        # cả model chính lẫn dự phòng đều hỏng -> không gọi Gemini
# model chính -> hạn: chỉ model chính đó hết quota -> đi thẳng model dự phòng, không thử lại nó. Theo từng model vì model chính
# đổi theo request: model Admin chọn hết quota không được đẩy lượt gọi dùng GEMINI_MODEL sang dự phòng
_primary_quota_until: dict[str, float] = {}
# Model Admin chọn mà Google trả 404 (đã ngừng / key không thấy) -> quay về GEMINI_MODEL ngay trong lượt đó và các lượt sau
# bỏ qua model này UNUSABLE_S giây (404 không tự khỏi sau vài phút như quá tải; chờ Admin đổi lại cấu hình)
UNUSABLE_S = 30 * 60
_unusable_until: dict[str, float] = {}
_sleep = time.sleep   # tách ra để test thay bằng no-op
_now = time.monotonic  # tách ra để test giả lập lượt gọi treo lâu

_client: Any = None


class GeminiError(RuntimeError):
    def __init__(self, reason: str, message: str = "", retryable: bool = False, code: Optional[int] = None):
        super().__init__(message or reason)
        self.reason = reason  # no_api_key | quota | error | budget (hết ngân sách OCR của tài liệu)
        self.retryable = retryable  # 429 / 503: đáng thử lại hoặc chuyển model dự phòng
        self.code = code  # mã HTTP của Google (404 = model không dùng được với key); None khi không rõ


def available() -> bool:
    return bool(settings.GEMINI_API_KEY)


def allowed_models() -> list[str]:
    """Model backend được chọn theo request, model cấu hình đứng trước; đọc settings mỗi lần (test / .env đổi không cần
    nạp lại module)."""
    extra = settings.GEMINI_ALLOWED_MODELS.split(",")
    out: list[str] = []
    for name in (MODEL, settings.GEMINI_FALLBACK_MODEL, *extra, *KNOWN_MODELS):
        name = (name or "").strip().lower()
        if name and name not in out:
            out.append(name)
    return out


def _norm(name: Optional[str]) -> str:
    return (name or "").strip().lower()


def resolve_model(requested: Optional[str]) -> str:
    """Model chính cho một lượt gọi: ``requested`` (không phân biệt hoa thường, bỏ khoảng trắng) khi nằm trong
    allowed_models(); rỗng / trùng GEMINI_MODEL → GEMINI_MODEL; tên lạ → GEMINI_MODEL và ghi log một lần cho tên đó (backend
    gửi lại cùng giá trị ở mọi request, log mỗi lần thì ngập log)."""
    name = _norm(requested)
    if not name or name == _norm(MODEL):
        return MODEL
    if name in allowed_models():
        return name
    key = name[:_WARN_KEY_CHARS]
    if key not in _warned_models and len(_warned_models) < _MAX_WARNED:
        _warned_models.add(key)
        logger.warning("gemini: model %r không nằm trong danh sách cho phép, dùng %s (thêm vào GEMINI_ALLOWED_MODELS "
                       "nếu đúng là model của key)", key, MODEL)
    return MODEL


def _get_client():
    """Khởi tạo client lười, dùng lại giữa các lần gọi."""
    global _client
    if _client is None:
        if not available():
            raise GeminiError("no_api_key")
        from google import genai
        from google.genai import types
        _client = genai.Client(api_key=settings.GEMINI_API_KEY,
                               http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    return _client


def _map_error(exc: Exception, model: str = MODEL) -> GeminiError:
    """429 / RESOURCE_EXHAUSTED → quota; còn lại → error. Message chỉ mang mã HTTP + status của Google (không có
    body / key) để log và thông điệp lỗi cho người dùng đủ chẩn đoán (model sai, model quá tải...)."""
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    text = str(exc)
    if code == 429 or "RESOURCE_EXHAUSTED" in text or "429" in text[:40]:
        return GeminiError("quota", "Gemini quota exceeded", retryable=True)
    status = re.search(r"'status':\s*'([A-Z_]+)'", text)
    label = f"{code or ''} {status.group(1) if status else type(exc).__name__}".strip()
    hint = ""
    if code == 404:
        hint = f" (model {model} không dùng được với key này, đổi GEMINI_MODEL / Model AI chính ở Admin)"
    elif code in (503, 504):
        hint = " (model đang quá tải, thử lại sau)"
    # 503 UNAVAILABLE và 504 DEADLINE_EXCEEDED đều là model quá tải (đo 12/10/2026 với gemini-3.7/3.8-flash) → thử lại / đổi model
    retryable = code in (503, 504) or "UNAVAILABLE" in text or "DEADLINE_EXCEEDED" in text
    return GeminiError("error", f"Gemini {label}{hint}", retryable=retryable,
                       code=code if isinstance(code, int) else None)


def _generate(contents: Any, config: Optional[dict] = None, model: Optional[str] = None, *,
              profile: CallProfile = DEFAULT_PROFILE, deadline: Optional[float] = None) -> str:
    return _generate_with_model(contents, config, model, profile=profile, deadline=deadline)[0]


def _generate_with_model(contents: Any, config: Optional[dict] = None, model: Optional[str] = None, *,
                         profile: CallProfile = DEFAULT_PROFILE, deadline: Optional[float] = None) -> tuple[str, str]:
    """Gọi model chính (``model`` qua resolve_model, mặc định GEMINI_MODEL), thử lại theo RETRY_DELAYS khi 429/503, rồi
    mỗi model sau một lần → (văn bản, model đã trả lời). Chuỗi model: model chính → GEMINI_MODEL (khi model chính là model
    Admin chọn) → GEMINI_FALLBACK_MODEL (nếu đặt). Lỗi cuối cùng được raise nguyên `reason` để router/backend ghi
    `quota` / `error`."""
    global _cooldown_until
    if _now() < _cooldown_until:
        raise GeminiError("quota", "Gemini quota exceeded (đang tạm ngưng gọi)", retryable=True)
    client = _get_client()
    from google.genai import types
    cfg_kw = dict(config or {})

    def make_cfg(timeout_ms: int):
        if timeout_ms != TIMEOUT_MS:
            return types.GenerateContentConfig(**cfg_kw, http_options=types.HttpOptions(timeout=timeout_ms))
        return types.GenerateContentConfig(**cfg_kw)   # client tạo với TIMEOUT_MS, không cần đè
    cfg = make_cfg(profile.timeout_ms)
    primary = resolve_model(model)
    if primary != MODEL and _now() < max(_unusable_until.get(primary, 0.0), _primary_quota_until.get(primary, 0.0)):
        primary = MODEL  # model Admin chọn vừa 404 / hết quota -> lượt này như chưa chọn (chuỗi mặc định, có thử lại)
    # Model Admin chọn hỏng thì về GEMINI_MODEL trước rồi mới tới dự phòng: GEMINI_MODEL có quota riêng và chạy được; bỏ nó
    # khỏi chuỗi thì chọn trùng model dự phòng / không đặt dự phòng = chỉ còn một model, một sự cố là tạm ngưng cả Gemini.
    chain = [primary]
    for name in (MODEL, (settings.GEMINI_FALLBACK_MODEL or "").strip()):
        if name and _norm(name) not in {_norm(n) for n in chain}:
            chain.append(name)
    if len(chain) > 1 and _now() < _primary_quota_until.get(primary, 0.0):
        chain = chain[1:]  # model chính vừa hết quota -> model sau ngay, không thử lại model chính
    last: Optional[GeminiError] = None
    started = _now()
    prev: Optional[tuple[str, tuple[int, ...]]] = None
    gave_up_primary = False  # model Admin chọn trả 404 -> GEMINI_MODEL được thử lại đủ như khi chưa chọn
    for name in chain:
        delays = profile.delays if name == chain[0] == primary or (gave_up_primary and name == MODEL) else ()
        if prev is not None and prev[1] and last is not None and last.retryable:
            # đã thử lại đủ mà vẫn 429/503 -> các lượt sau bỏ qua model đó (đi thẳng model sau) trong COOLDOWN_S
            _primary_quota_until[prev[0]] = _now() + COOLDOWN_S
            logger.warning("gemini: model %s %s, dùng model %s trong %ss", prev[0], last, name, COOLDOWN_S)
        prev = (name, delays)
        for attempt in range(len(delays) + 1):
            if deadline is not None:
                remaining = deadline - _now()
                if remaining < MIN_TIMEOUT_S:
                    # Hết ngân sách của MỘT tài liệu (OCR nhiều trang): không phải Gemini hỏng -> không tạm ngưng toàn cục
                    budget = GeminiError("budget", "Gemini: hết ngân sách OCR của tài liệu"
                                         + (f" (lỗi cuối: {last})" if last is not None else ""), retryable=True)
                    logger.warning("gemini: %s", budget)
                    raise budget from None
                cfg = make_cfg(min(profile.timeout_ms, int(remaining * 1000)))
            if (profile.budget_s is not None and last is not None
                    and _now() - started + profile.timeout_ms / 1000 > profile.budget_s):
                logger.warning("gemini: %s (hết ngân sách %ss, không thử thêm)", last, profile.budget_s)
                _cooldown_until = _now() + COOLDOWN_S
                raise last from None
            try:
                resp = client.models.generate_content(model=name, contents=contents, config=cfg)
                return (getattr(resp, "text", None) or "").strip(), name
            except GeminiError:
                raise
            except Exception as exc:  # noqa: BLE001 — mọi lỗi SDK/mạng đều gói lại
                last = _map_error(exc, name)
                if last.code == 404 and name == primary != MODEL:
                    # model Admin chọn không dùng được với key (Google đã ngừng / chưa mở): không để một ô cấu hình tắt Gemini
                    # của mọi lượt gọi -> về GEMINI_MODEL ngay, nhớ UNUSABLE_S để các lượt sau không tốn thêm một lần 404
                    _unusable_until[primary] = _now() + UNUSABLE_S
                    gave_up_primary = True
                    logger.warning("gemini: %s — dùng %s, bỏ qua model này %ss", last, MODEL, UNUSABLE_S)
                    break
                if not last.retryable:
                    logger.warning("gemini: %s", last)
                    raise last from None
                if attempt < len(delays):
                    logger.warning("gemini: %s — thử lại sau %ss (model %s)", last, delays[attempt], name)
                    _sleep(delays[attempt])
    assert last is not None
    _cooldown_until = _now() + COOLDOWN_S
    logger.warning("gemini: %s (đã hết lượt thử lại, tạm ngưng gọi Gemini %ss)", last, COOLDOWN_S)
    raise last from None


# --- Vision OCR ---------------------------------------------------------------

# Bảng / danh sách từ vựng → mỗi mục một dòng `cụm<TAB>nghĩa` (spec §2.3); văn xuôi → chép nguyên văn như trước.
_TRANSCRIBE_PROMPT = (
    "Transcribe the Japanese text in this image.\n"
    "- {orientation}\n"
    "- Omit small furigana (ruby) readings printed above or beside kanji.\n"
    "- If the image is a vocabulary table or word list (Japanese headwords with translations next to them), "
    "output ONE entry per line as: <Japanese headword><TAB><English gloss>. Use the English gloss if present, "
    "otherwise the Vietnamese one; omit Chinese and Korean glosses. Omit arrows/markers (↔ ⇔ ➔ ●) and labels "
    "like (N), (V). Expand bracketed alternatives into full phrases, e.g. \"お金を[下ろす/引き出す\" becomes two "
    "lines \"お金を下ろす\" and \"お金を引き出す\" sharing the gloss. Entries in a right-hand column (antonyms, "
    "nouns) are separate lines with their own gloss. Keep note lines starting with ＊ or ※ as their own line, "
    "verbatim.\n"
    "- Otherwise (prose), transcribe verbatim: keep line breaks, separate paragraphs with a blank line.\n"
    "- Do not translate, explain, or add any commentary. Output only the text.\n"
    "- If the image contains no Japanese text, output an empty string."
)
_ORIENTATION = {
    "vertical": "The text is written vertically: read columns from right to left, top to bottom.",
    "horizontal": "The text is written horizontally, left to right, top to bottom.",
    "auto": "Detect whether the text is vertical (columns right to left) or horizontal and read it in the natural order.",
}


_REPEAT_RE = re.compile(r"(.)\1{9,}", re.DOTALL)


def _collapse_repeats(text: str) -> str:
    """Model suy thoái lặp một ký tự vô tận (dấu chấm dẫn mục lục '·····', 'ーーー'): giữ tối đa 3 lần."""
    return _REPEAT_RE.sub(lambda m: m.group(1) * 3, text)


def vision_transcribe(image_bytes: bytes, mime: str = "image/png", mode: str = "auto",
                      model: Optional[str] = None, deadline: Optional[float] = None) -> str:
    """Chép lại nguyên văn tiếng Nhật trong ảnh. Trả "" khi model không thấy chữ. ``model``: model chính backend chọn
    (qua resolve_model; None = GEMINI_MODEL). ``deadline``: mốc ``_now()`` chung của cả tài liệu (OCR_PROFILE) — không còn
    đủ chỗ cho một lượt gọi thì raise GeminiError("budget") ngay, không gọi."""
    from google.genai import types
    prompt = _TRANSCRIBE_PROMPT.format(orientation=_ORIENTATION.get(mode, _ORIENTATION["auto"]))
    contents = [types.Part.from_bytes(data=image_bytes, mime_type=mime), prompt]
    return _collapse_repeats(_generate(contents, {"temperature": 0.0}, model, profile=OCR_PROFILE, deadline=deadline))


# --- Dịch nghĩa --------------------------------------------------------------

_LANG_NAME = {"vi": "Vietnamese", "en": "English"}

_TRANSLATE_PROMPT = (
    "You are a Japanese-{lang} dictionary editor for JLPT learners.\n"
    "For each input item give:\n"
    "- \"meaningVi\": a short {lang} gloss of the term (max 100 characters, 1-3 senses separated by commas, "
    "no Japanese characters, no romaji, do not repeat the term).\n"
    "- If \"meaningEn\" is given it is the original gloss from the learner's document: translate that gloss "
    "faithfully into {lang}; do not replace it with other dictionary senses.\n"
    "- \"exampleVi\": a natural {lang} translation of \"example\" if present, else an empty string.\n"
    "Keep \"ref\" exactly as given. Return ONLY a JSON array of objects {{\"ref\", \"meaningVi\", \"exampleVi\"}}, "
    "one per input item, same order.\n\nItems:\n{items}"
)

_TRANSLATE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "ref": {"type": "string"},
            "meaningVi": {"type": "string"},
            "exampleVi": {"type": "string"},
        },
        "required": ["ref", "meaningVi", "exampleVi"],
    },
}


def _parse_json_list(raw: str) -> list[dict]:
    text = raw.strip()
    if text.startswith("```"):  # model đôi khi bọc code fence dù đã yêu cầu JSON
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiError("error", "Gemini returned invalid JSON") from exc
    if isinstance(data, dict):
        data = data.get("items", [])
    if not isinstance(data, list):
        raise GeminiError("error", "Gemini JSON is not a list")
    return [d for d in data if isinstance(d, dict)]


def translate_items(items: list[dict], target_lang: str = "vi", model: Optional[str] = None) -> list[dict]:
    """Dịch theo batch 40 → [{ref, meaningVi, exampleVi}] (chưa lọc; router lọc sau). ``model`` như vision_transcribe."""
    if not available():
        raise GeminiError("no_api_key")
    lang = _LANG_NAME.get(target_lang, "Vietnamese")
    out: list[dict] = []
    for i in range(0, len(items), BATCH_SIZE):
        batch = [{k: v for k, v in it.items() if v not in (None, "")} for it in items[i:i + BATCH_SIZE]]
        prompt = _TRANSLATE_PROMPT.format(lang=lang, items=json.dumps(batch, ensure_ascii=False))
        raw = _generate(prompt, {
            "temperature": 0.2,
            "response_mime_type": "application/json",
            "response_schema": _TRANSLATE_SCHEMA,
        }, model)
        for d in _parse_json_list(raw):
            out.append({
                "ref": str(d.get("ref", "")),
                "meaningVi": (d.get("meaningVi") or "").strip(),
                "exampleVi": (d.get("exampleVi") or "").strip() or None,
            })
    return out


# --- Từ điển: nghĩa tiếng Việt + dịch câu ví dụ lúc tra (spec 2026-10-26-tu-dien-design §4.5) -------------

_DICT_PROMPT = (
    "You are a Japanese-Vietnamese dictionary editor for Vietnamese learners of Japanese.\n"
    "For each input item (a Japanese headword with its English JMdict glosses and part-of-speech codes) give:\n"
    "- \"meaningVi\": a concise Vietnamese dictionary meaning (max 120 characters). Several senses separated by \"; \", "
    "synonyms inside one sense separated by \", \". Most common sense first. Verbs and adjectives in bare form. "
    "For particles, conjunctions, interjections, counters, prefixes, suffixes, honorific or humble words and place "
    "names start with a Vietnamese label in parentheses, e.g. \"(trợ từ) ...\", \"(kính ngữ) ...\", \"(địa danh) ...\". "
    "Translate the real meaning of the Japanese word (the English gloss is only a hint). No Japanese characters, "
    "no romaji, no English except well-known international terms.\n"
    "- \"examples\": for each given example sentence (\"id\", \"jpn\", \"eng\") a natural Vietnamese translation "
    "of the Japanese sentence as {{\"id\", \"vi\"}}, keeping \"id\" exactly.\n"
    "Keep \"ref\" exactly as given. Return ONLY a JSON array of objects {{\"ref\", \"meaningVi\", \"examples\"}}, "
    "one per input item, same order.\n\nItems:\n{items}"
)

_DICT_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "ref": {"type": "string"},
            "meaningVi": {"type": "string"},
            "examples": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "vi": {"type": "string"}}, "required": ["id", "vi"]}},
        },
        "required": ["ref", "meaningVi", "examples"],
    },
}


def translate_dictionary(items: list[dict], model: Optional[str] = None) -> list[dict]:
    """Lô mục từ điển → [{ref, meaningVi, examples: [{id, vi}]}] (chưa lọc; router lọc). Lô BATCH_SIZE như translate_items."""
    if not available():
        raise GeminiError("no_api_key")
    out: list[dict] = []
    for i in range(0, len(items), BATCH_SIZE):
        batch = [{k: v for k, v in it.items() if v not in (None, "", [])} for it in items[i:i + BATCH_SIZE]]
        prompt = _DICT_PROMPT.format(items=json.dumps(batch, ensure_ascii=False))
        raw = _generate(prompt, {"temperature": 0.2, "response_mime_type": "application/json",
                                 "response_schema": _DICT_SCHEMA}, model)
        for d in _parse_json_list(raw):
            exs = [{"id": str(e.get("id", "")), "vi": (e.get("vi") or "").strip()}
                   for e in (d.get("examples") or []) if isinstance(e, dict)]
            out.append({"ref": str(d.get("ref", "")), "meaningVi": (d.get("meaningVi") or "").strip(), "examples": exs})
    return out


# --- Dịch câu / đoạn Nhật ↔ Việt (tab Dịch, spec 2026-10-28-dich-cau-design §3, D33) ----------------------------

# Lời gọi tương tác: người học đang chờ và backend chỉ đọc 30 s (postJson) → timeout 20 s, thử lại 1 lần, hạn chót chung
# TEXT_DEADLINE_S như OCR: hết hạn → GeminiError("budget", retryable) → router trả aiOverloaded, KHÔNG tạm ngưng Gemini toàn cục
# (một câu dịch chậm không được tắt dịch nghĩa từ điển của mọi người trong COOLDOWN_S).
TEXT_PROFILE = CallProfile(20_000, (2,), None)
TEXT_DEADLINE_S = 26

# Bản dịch luôn do model dịch CẢ đoạn (ngữ cảnh, chủ ngữ bị bỏ, trật tự SOV → SVO, kính ngữ, thành ngữ); phần "words" chỉ xin
# nghĩa theo ngữ cảnh cho từng token Sudachi mà ai-service đã tách, để lớp phân tích khớp bản dịch — không bao giờ ghép lại thành câu.
_TEXT_PROMPT_JA_VI = (
    "You are a professional Japanese-to-Vietnamese translator helping Vietnamese learners of Japanese.\n"
    "Translate the WHOLE Japanese text below into natural, fluent Vietnamese.\n"
    "Rules:\n"
    "- Translate meaning, not words: natural Vietnamese word order, no literal calques; keep the register (polite / casual) "
    "and the tone of the original.\n"
    "- Japanese often omits the subject: infer it from context (first person -> \"tôi\" unless the text shows otherwise) and "
    "keep it consistent across sentences.\n"
    "- Keep names, numbers and quoted terms; never add explanations inside the translation.\n"
    "Return ONLY a JSON object with:\n"
    "- \"translation\": the natural Vietnamese translation of the whole text (keep paragraph breaks as \n).\n"
    "- \"literal\": a close, phrase-by-phrase Vietnamese rendering that follows the Japanese order, phrases separated by "
    "\" / \" (a study aid; may sound awkward). Empty string when the text is a single word.\n"
    "- \"alternatives\": up to 2 other natural Vietnamese translations ONLY when the Japanese is genuinely ambiguous "
    "(e.g. a different omitted subject or reading), otherwise [].\n"
    "- \"notes\": one short Vietnamese note (max 200 characters) on a grammar point or nuance that matters for this "
    "translation, or \"\".\n"
    "- \"words\": for EACH item of \"Words\" below (tokens of the text with index \"i\"), the meaning of that word IN THIS "
    "CONTEXT in Vietnamese (max 8 words, no Japanese characters, no romaji); for particles and auxiliaries give the "
    "function instead (e.g. \"trợ từ chỉ tân ngữ\", \"quá khứ lịch sự\"). Keep \"i\" exactly.\n\n"
    "Text:\n{text}\n\nWords:\n{words}"
)

_TEXT_PROMPT_VI_JA = (
    "You are a professional Vietnamese-to-Japanese translator helping Vietnamese learners of Japanese.\n"
    "Translate the WHOLE Vietnamese text below into natural Japanese.\n"
    "Rules:\n"
    "- Japanese as a native speaker would write it; use the polite です・ます style unless the Vietnamese is clearly casual, "
    "a title or a heading.\n"
    "- Prefer common vocabulary (JLPT N5-N3) when it is natural; write kanji as commonly written (with okurigana), "
    "katakana for loanwords.\n"
    "- Translate meaning, not words; keep names and numbers; never add explanations inside the translation.\n"
    "Return ONLY a JSON object with:\n"
    "- \"translation\": the Japanese translation of the whole text (keep paragraph breaks as \n).\n"
    "- \"reading\": the full reading of \"translation\" in hiragana (katakana words may stay in katakana), same punctuation.\n"
    "- \"alternatives\": up to 2 other natural renderings worth knowing (e.g. the casual form, a more formal one), each an "
    "object {{\"text\", \"reading\", \"note\"}} where \"note\" is a short Vietnamese label such as \"thể thường\" or "
    "\"lịch sự hơn\"; [] when none.\n"
    "- \"notes\": one short Vietnamese note (max 200 characters) on a grammar point or word choice in the translation, "
    "or \"\".\n\n"
    "Text:\n{text}"
)

_TEXT_PROMPT = {"ja-vi": _TEXT_PROMPT_JA_VI, "vi-ja": _TEXT_PROMPT_VI_JA}

_TEXT_SCHEMA = {
    "ja-vi": {
        "type": "object",
        "properties": {
            "translation": {"type": "string"},
            "literal": {"type": "string"},
            "alternatives": {"type": "array", "items": {"type": "string"}},
            "notes": {"type": "string"},
            "words": {"type": "array", "items": {"type": "object", "properties": {
                "i": {"type": "integer"}, "meaning": {"type": "string"}}, "required": ["i", "meaning"]}},
        },
        "required": ["translation", "literal", "alternatives", "notes", "words"],
    },
    "vi-ja": {
        "type": "object",
        "properties": {
            "translation": {"type": "string"},
            "reading": {"type": "string"},
            "alternatives": {"type": "array", "items": {"type": "object", "properties": {
                "text": {"type": "string"}, "reading": {"type": "string"}, "note": {"type": "string"}},
                "required": ["text", "reading", "note"]}},
            "notes": {"type": "string"},
        },
        "required": ["translation", "reading", "alternatives", "notes"],
    },
}


def _parse_json_object(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):  # model đôi khi bọc code fence dù đã yêu cầu JSON
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiError("error", "Gemini returned invalid JSON") from exc
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        data = data[0]
    if not isinstance(data, dict):
        raise GeminiError("error", "Gemini JSON is not an object")
    return data


def translate_text(text: str, direction: str, words: Optional[list[dict]] = None,
                   model: Optional[str] = None) -> tuple[dict, str]:
    """Dịch cả đoạn ``text`` theo ``direction`` ("ja-vi" | "vi-ja") → (JSON thô của model, model đã trả lời). ``words``: token Sudachi
    [{i, surface, lemma, reading}] để xin nghĩa theo ngữ cảnh (chỉ ja-vi). Chưa lọc: translate_text.clean_result lọc sau. Lỗi
    SDK / hết hạn chót → GeminiError (reason như vision_transcribe; "budget" khi quá TEXT_DEADLINE_S)."""
    if not available():
        raise GeminiError("no_api_key")
    if direction not in _TEXT_PROMPT:
        raise ValueError(f"direction lạ: {direction}")
    prompt = _TEXT_PROMPT[direction].format(text=text, words=json.dumps(words or [], ensure_ascii=False))
    raw, used = _generate_with_model(prompt, {
        "temperature": 0.2,
        "response_mime_type": "application/json",
        "response_schema": _TEXT_SCHEMA[direction],
    }, model, profile=TEXT_PROFILE, deadline=_now() + TEXT_DEADLINE_S)
    return _parse_json_object(raw), used


# --- Mẹo nhớ bộ thủ (C4) ------------------------------------------------------

MNEMONIC_MAX_CHARS = 300   # Gemini được yêu cầu ≤ 200; quá 300 là model lan man → bỏ, router dùng template
MNEMONIC_EXAMPLES = 3

_MNEMONIC_PROMPT = (
    "Bạn là giáo viên tiếng Nhật dạy người Việt nhớ chữ Hán qua bộ thủ và âm Hán-Việt.\n"
    "Với mỗi chữ trong danh sách, viết MỘT câu mẹo nhớ bằng tiếng Việt (\"mnemonicVi\"):\n"
    "- Sinh động, dễ hình dung, tối đa 200 ký tự.\n"
    "- Bắt buộc nhắc tên bộ thủ (\"radicalName\") và âm Hán-Việt (\"hanViet\") của chữ, gắn chúng với nghĩa "
    "(\"meaningEn\"); có thể lấy ý từ \"examples\" (từ chứa chữ) nhưng diễn đạt bằng tiếng Việt.\n"
    "- Không dùng romaji. Không viết chữ Nhật nào khác (kana hay kanji) ngoài chính chữ kanji đó và bộ thủ của nó "
    "(\"radicalChar\", hoặc dạng viết khác của bộ trong \"radicalVariants\").\n"
    "- Không nội dung phản cảm, thô tục, bạo lực, chính trị, tôn giáo, phân biệt đối xử.\n"
    "Giữ \"kanji\" đúng như đầu vào. Chỉ trả về một mảng JSON các object {{\"kanji\", \"mnemonicVi\"}}, mỗi chữ một "
    "object, cùng thứ tự.\n\nDanh sách:\n{items}"
)

_MNEMONIC_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"kanji": {"type": "string"}, "mnemonicVi": {"type": "string"}},
        "required": ["kanji", "mnemonicVi"],
    },
}


def _fold_vi(s: str) -> str:
    """Bỏ dấu tiếng Việt + viết hoa để so "thuỷ" / "THỦY" / "Thủy" như nhau (như han_viet_graph.fold; chép lại 3 dòng
    thay vì import để gemini.py không kéo theo JMdict / Unihan)."""
    nfd = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in nfd if not unicodedata.combining(c)).replace("Đ", "D").replace("đ", "d").upper()


def _mentions(text: str, needle: Optional[str]) -> bool:
    """``needle`` (âm Hán-Việt / tên bộ) xuất hiện trong ``text`` như một từ trọn vẹn sau khi bỏ dấu, nên "HẢI" khớp
    "hải" / "Hải sản" nhưng âm một chữ như "Y" (衣) không khớp bừa bất kỳ chữ y nào trong câu."""
    needle = _fold_vi((needle or "").strip())
    if not needle:
        return False
    return re.search(r"(?<!\w)" + re.escape(needle) + r"(?!\w)", _fold_vi(text)) is not None


def mnemonic_ok(text: str, item: dict) -> bool:
    """Bộ lọc mẹo nhớ: không rỗng, ≤ MNEMONIC_MAX_CHARS, không chứa chữ Nhật nào ngoài chính chữ đang học và bộ thủ
    của nó — kể cả dạng viết trong chữ (氵 艹 辶…, ``radicalVariants`` từ radicals.variants) vì giáo viên Việt viết
    "bộ Thủy 氵" (model hay chèn từ ví dụ 日本海 — người học N5 không đọc được, và vi phạm yêu cầu "chỉ tiếng Việt"), và
    phải nhắc âm Hán-Việt hoặc tên bộ (nếu không thì mẹo không gắn với cách người Việt nhớ chữ → thà dùng template)."""
    from app.extract.jachars import JA_RE
    text = (text or "").strip()
    if not text or len(text) > MNEMONIC_MAX_CHARS:
        return False
    allowed = {item.get("kanji") or ""}
    rad = item.get("radicalChar") or ""
    variants = item.get("radicalVariants")
    if variants is None and rad:
        from app.extract import radicals   # nạp lười: chỉ bảng 214 bộ, caller không gửi sẵn (test / gọi tay)
        row = radicals.radical_of(rad)
        # cả dạng bảng ghi (青 cho 靑, 戸 cho 戶): caller gửi dạng cũ thì mẹo viết dạng JIS vẫn hợp lệ
        variants = (row["unified"], *radicals.variants(row["no"])) if row else ()
    for glyph in [rad] + list(variants or ()):
        allowed.update({glyph, unicodedata.normalize("NFKC", glyph)})
    if any(JA_RE.fullmatch(c) and c not in allowed for c in text):
        return False
    return _mentions(text, item.get("hanViet")) or _mentions(text, item.get("radicalName"))


def _mnemonic_input(item: dict) -> dict:
    """Mục gửi vào prompt: bỏ giá trị rỗng, ví dụ chỉ giữ ``term`` (≤ MNEMONIC_EXAMPLES) để prompt gọn."""
    out: dict = {}
    for key in ("kanji", "hanViet", "radicalName", "radicalChar", "radicalVariants", "meaningEn"):
        if item.get(key):
            out[key] = list(item[key]) if key == "radicalVariants" else item[key]
    examples = [(ex.get("term") if isinstance(ex, dict) else ex) for ex in (item.get("examples") or [])]
    examples = [e for e in examples if e][:MNEMONIC_EXAMPLES]
    if examples:
        out["examples"] = examples
    return out


def generate_mnemonics(items: list[dict], model: Optional[str] = None) -> dict:
    """Mẹo nhớ tiếng Việt cho thẻ bộ thủ (C4): ``items`` = [{kanji, hanViet, radicalName, radicalChar?, meaningEn,
    examples}] → {"items": [{kanji, mnemonicVi}], "reason": None | "no_key" | "quota" | "error", "model": str | None}.
    ``model`` như vision_transcribe; ``model`` trả về là model THẬT SỰ viết các mẹo đã nhận (có thể là model dự phòng;
    lô nhiều batch thì lấy batch đầu có mẹo), None khi không mẹo nào từ Gemini — backend ghi vào generated_model.

    Khác translate_items, hàm này không raise: mẹo chỉ là bước làm giàu nên lỗi Gemini trả về ``reason`` kèm các mẹo
    đã sinh được ở batch trước để router điền template cho phần còn lại thay vì làm hỏng cả bộ thẻ. Mẹo không qua
    mnemonic_ok bị bỏ (router dùng template cho chữ đó); mỗi chữ lấy mẹo đầu tiên. ``reason`` dùng "no_key" (không
    phải "no_api_key" của /extract/enrich) theo hợp đồng /radicals/cards; thử lại / model dự phòng / tạm ngưng khi hết
    quota theo _generate như mọi lượt gọi khác."""
    if not available():
        return {"items": [], "reason": "no_key", "model": None}
    by_kanji = {it["kanji"]: it for it in items if it.get("kanji")}
    out: list[dict] = []
    seen: set[str] = set()
    used: Optional[str] = None
    try:
        for i in range(0, len(items), BATCH_SIZE):
            batch = [_mnemonic_input(it) for it in items[i:i + BATCH_SIZE]]
            prompt = _MNEMONIC_PROMPT.format(items=json.dumps(batch, ensure_ascii=False))
            raw, name = _generate_with_model(prompt, {
                "temperature": 0.7,   # mẹo nhớ cần chút sáng tạo; 0.2 của dịch nghĩa cho câu khô và giống nhau
                "response_mime_type": "application/json",
                "response_schema": _MNEMONIC_SCHEMA,
            }, model)
            for d in _parse_json_list(raw):
                kanji = str(d.get("kanji") or "").strip()
                text = (d.get("mnemonicVi") or "").strip()
                item = by_kanji.get(kanji)
                if item is None or kanji in seen or not mnemonic_ok(text, item):
                    continue
                seen.add(kanji)
                out.append({"kanji": kanji, "mnemonicVi": text})
                used = used or name
    except GeminiError as exc:
        return {"items": out, "reason": "no_key" if exc.reason == "no_api_key" else exc.reason, "model": used}
    return {"items": out, "reason": None, "model": used}
