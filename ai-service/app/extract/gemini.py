"""Lớp mỏng bọc google-genai: Vision OCR fallback và dịch nghĩa VN theo batch.

Mọi lỗi SDK được gói thành GeminiError(reason) với reason ∈ {no_api_key, quota, error}
để router/reader quyết định bỏ qua; không bao giờ log API key.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 40
TIMEOUT_MS = 60_000
MODEL = settings.GEMINI_MODEL
# 429 / 503: thử lại với giãn cách rồi mới sang GEMINI_FALLBACK_MODEL (spec §2.7). Giãn cách chỉ 14 s nhưng mỗi lượt gọi
# có thể treo tới TIMEOUT_MS (504 DEADLINE_EXCEEDED) -> giới hạn tổng thời gian dưới AI_SERVICE_READ_TIMEOUT (3 phút)
# của backend, nếu không backend timeout và cả job FAILED dù dịch nghĩa chỉ là bước làm giàu.
RETRY_DELAYS = (2, 4, 8)
TOTAL_BUDGET_S = 150
_sleep = time.sleep   # tách ra để test thay bằng no-op
_now = time.monotonic  # tách ra để test giả lập lượt gọi treo lâu

_client: Any = None


class GeminiError(RuntimeError):
    def __init__(self, reason: str, message: str = "", retryable: bool = False):
        super().__init__(message or reason)
        self.reason = reason  # no_api_key | quota | error
        self.retryable = retryable  # 429 / 503: đáng thử lại hoặc chuyển model dự phòng


def available() -> bool:
    return bool(settings.GEMINI_API_KEY)


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


def _map_error(exc: Exception) -> GeminiError:
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
        hint = f" (model {MODEL} không dùng được với key này, đổi GEMINI_MODEL)"
    elif code in (503, 504):
        hint = " (model đang quá tải, thử lại sau)"
    # 503 UNAVAILABLE và 504 DEADLINE_EXCEEDED đều là model quá tải (đo 12/10/2026 với gemini-3.7/3.8-flash) → thử lại / đổi model
    retryable = code in (503, 504) or "UNAVAILABLE" in text or "DEADLINE_EXCEEDED" in text
    return GeminiError("error", f"Gemini {label}{hint}", retryable=retryable)


def _generate(contents: Any, config: Optional[dict] = None) -> str:
    """Gọi model chính, thử lại theo RETRY_DELAYS khi 429/503, rồi một lần ở model dự phòng (nếu đặt).
    Lỗi cuối cùng được raise nguyên `reason` để router/backend ghi `quota` / `error`."""
    client = _get_client()
    from google.genai import types
    cfg = types.GenerateContentConfig(**(config or {}))
    plans: list[tuple[str, tuple[int, ...]]] = [(MODEL, RETRY_DELAYS)]
    fallback = settings.GEMINI_FALLBACK_MODEL
    if fallback and fallback != MODEL:
        plans.append((fallback, ()))
    last: Optional[GeminiError] = None
    started = _now()
    for model, delays in plans:
        for attempt in range(len(delays) + 1):
            if last is not None and _now() - started + TIMEOUT_MS / 1000 > TOTAL_BUDGET_S:
                logger.warning("gemini: %s (hết ngân sách %ss, không thử thêm)", last, TOTAL_BUDGET_S)
                raise last from None
            try:
                resp = client.models.generate_content(model=model, contents=contents, config=cfg)
                return (getattr(resp, "text", None) or "").strip()
            except GeminiError:
                raise
            except Exception as exc:  # noqa: BLE001 — mọi lỗi SDK/mạng đều gói lại
                last = _map_error(exc)
                if not last.retryable:
                    logger.warning("gemini: %s", last)
                    raise last from None
                if attempt < len(delays):
                    logger.warning("gemini: %s — thử lại sau %ss (model %s)", last, delays[attempt], model)
                    _sleep(delays[attempt])
    assert last is not None
    logger.warning("gemini: %s (đã hết lượt thử lại)", last)
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


def vision_transcribe(image_bytes: bytes, mime: str = "image/png", mode: str = "auto") -> str:
    """Chép lại nguyên văn tiếng Nhật trong ảnh. Trả "" khi model không thấy chữ."""
    from google.genai import types
    prompt = _TRANSCRIBE_PROMPT.format(orientation=_ORIENTATION.get(mode, _ORIENTATION["auto"]))
    contents = [types.Part.from_bytes(data=image_bytes, mime_type=mime), prompt]
    return _generate(contents, {"temperature": 0.0})


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


def translate_items(items: list[dict], target_lang: str = "vi") -> list[dict]:
    """Dịch theo batch 40 → [{ref, meaningVi, exampleVi}] (chưa lọc; router lọc sau)."""
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
        })
        for d in _parse_json_list(raw):
            out.append({
                "ref": str(d.get("ref", "")),
                "meaningVi": (d.get("meaningVi") or "").strip(),
                "exampleVi": (d.get("exampleVi") or "").strip() or None,
            })
    return out
