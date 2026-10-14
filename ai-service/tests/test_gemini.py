import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.extract import gemini
from app.main import app

client = TestClient(app)


class _FakeModels:
    def __init__(self, responder):
        self.responder = responder
        self.calls = []

    def generate_content(self, model, contents, config=None):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return SimpleNamespace(text=self.responder(contents, config))


@pytest.fixture
def fake_client(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    holder = {}

    def install(responder):
        models = _FakeModels(responder)
        monkeypatch.setattr(gemini, "_client", SimpleNamespace(models=models))
        holder["models"] = models
        return models
    yield install
    monkeypatch.setattr(gemini, "_client", None)










def _echo_translate(contents, config):
    # Lấy items từ prompt (JSON sau "Items:") và trả bản dịch giả theo ref
    items = json.loads(contents.split("Items:\n", 1)[1])
    return json.dumps([{"ref": it["ref"], "meaningVi": f"nghĩa {it['ref']}", "exampleVi": ""} for it in items])


def test_translate_batches_of_40_and_parses_json(fake_client):
    models = fake_client(_echo_translate)
    items = [{"ref": str(i), "term": f"語{i}", "reading": None, "example": None} for i in range(45)]
    out = gemini.translate_items(items, "vi")
    assert len(models.calls) == 2
    assert len(out) == 45
    assert out[0] == {"ref": "0", "meaningVi": "nghĩa 0", "exampleVi": None}
    cfg = models.calls[0]["config"]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema is not None
    assert models.calls[0]["model"] == gemini.MODEL
    # Giá trị None bị bỏ khỏi prompt
    assert '"reading"' not in models.calls[0]["contents"]


def test_translate_accepts_code_fence_and_dict_wrapper(fake_client):
    fake_client(lambda c, cfg: '```json\n{"items": [{"ref": "a", "meaningVi": "học", "exampleVi": "Ví dụ."}]}\n```')
    out = gemini.translate_items([{"ref": "a", "term": "勉強"}])
    assert out == [{"ref": "a", "meaningVi": "học", "exampleVi": "Ví dụ."}]


def test_invalid_json_is_error(fake_client):
    fake_client(lambda c, cfg: "not json")
    with pytest.raises(gemini.GeminiError) as ei:
        gemini.translate_items([{"ref": "a", "term": "勉強"}])
    assert ei.value.reason == "error"


def test_quota_mapping(fake_client):
    from google.genai import errors

    def raise_quota(contents, config):
        raise errors.APIError(429, {"error": {"message": "RESOURCE_EXHAUSTED", "status": "RESOURCE_EXHAUSTED"}})
    fake_client(raise_quota)
    with pytest.raises(gemini.GeminiError) as ei:
        gemini.translate_items([{"ref": "a", "term": "勉強"}])
    assert ei.value.reason == "quota"


def test_generic_error_mapping_hides_details(fake_client):
    def raise_err(contents, config):
        raise RuntimeError("secret test-key leaked?")
    fake_client(raise_err)
    with pytest.raises(gemini.GeminiError) as ei:
        gemini.vision_transcribe(b"png", "image/png", "vertical")
    assert ei.value.reason == "error"
    assert "test-key" not in str(ei.value)


def test_no_api_key(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    assert gemini.available() is False
    with pytest.raises(gemini.GeminiError) as ei:
        gemini.translate_items([{"ref": "a", "term": "勉強"}])
    assert ei.value.reason == "no_api_key"


def test_vision_prompt_mentions_orientation(fake_client):
    models = fake_client(lambda c, cfg: " 日本語 ")
    assert gemini.vision_transcribe(b"png", "image/png", "vertical") == "日本語"
    contents = models.calls[0]["contents"]
    assert "right to left" in contents[1]
    assert contents[0].inline_data.mime_type == "image/png"


# --- /api/extract/enrich qua TestClient ----------------------------------------









ITEMS = [
    {"ref": "1", "term": "勉強", "reading": "べんきょう", "pos": "名詞", "meaningEn": "study", "example": "毎日漢字を勉強します。"},
    {"ref": "2", "term": "食べる", "reading": "たべる", "pos": "動詞", "meaningEn": "to eat"},
    {"ref": "3", "term": "学校", "reading": "がっこう", "pos": "名詞", "meaningEn": "school"},
    {"ref": "4", "term": "映画", "reading": "えいが", "pos": "名詞", "meaningEn": "movie"},
    {"ref": "5", "term": "山", "reading": "やま", "pos": "名詞", "meaningEn": "mountain", "example": "山は高い。"},
]


def test_enrich_filters_bad_outputs(monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "translate_items", lambda items, lang: [
        {"ref": "1", "meaningVi": "học, học tập", "exampleVi": "Mỗi ngày tôi học kanji."},
        {"ref": "2", "meaningVi": "ăn (食べる)", "exampleVi": None},           # còn chữ Nhật → bỏ
        {"ref": "3", "meaningVi": "", "exampleVi": "x"},                        # rỗng → bỏ
        {"ref": "4", "meaningVi": "a" * 121, "exampleVi": None},                # quá dài → bỏ
        {"ref": "5", "meaningVi": "núi", "exampleVi": "Núi 山 cao."},            # ví dụ xấu → null
        {"ref": "99", "meaningVi": "lạ", "exampleVi": None},                    # ref lạ → bỏ
    ])
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": ITEMS})
    assert r.status_code == 200
    assert r.json() == {"enriched": True, "reason": None, "items": [
        {"ref": "1", "meaningVi": "học, học tập", "exampleVi": "Mỗi ngày tôi học kanji."},
        {"ref": "5", "meaningVi": "núi", "exampleVi": None},
    ]}


@pytest.mark.parametrize("reason", ["quota", "error"])
def test_enrich_reports_gemini_failure(monkeypatch, reason):
    monkeypatch.setattr(gemini, "available", lambda: True)
    def boom(items, lang):
        raise gemini.GeminiError(reason)
    monkeypatch.setattr(gemini, "translate_items", boom)
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": ITEMS})
    assert r.json() == {"enriched": False, "items": [], "reason": reason}


def test_enrich_no_key(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": ITEMS})
    assert r.json() == {"enriched": False, "items": [], "reason": "no_api_key"}


def test_health_gemini_flag(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    assert client.get("/api/extract/health").json()["gemini"] is True
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    assert client.get("/api/extract/health").json()["gemini"] is False


# --- Thử lại 429/503, model dự phòng, prompt bảng từ vựng (spec §2.3, §2.5, §2.7) --------------------------

class _Boom(Exception):
    def __init__(self, code):
        super().__init__(f"{code} error")
        self.code = code


def _flaky(fails, code):
    state = {"n": 0}

    def responder(contents, config):
        state["n"] += 1
        if state["n"] <= fails:
            raise _Boom(code)
        return "銀行口座\tbank account"
    return responder


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(gemini, "_sleep", lambda s: None)
    monkeypatch.setattr(gemini, "_cooldown_until", 0.0)  # cầu dao quota là trạng thái module, không để rò giữa các test
    monkeypatch.setattr(gemini, "_primary_quota_until", 0.0)


def test_retries_503_then_succeeds(fake_client):
    models = fake_client(_flaky(2, 503))
    assert gemini.vision_transcribe(b"png", "image/png", "horizontal") == "銀行口座\tbank account"
    assert len(models.calls) == 3 and all(c["model"] == gemini.MODEL for c in models.calls)


def test_fallback_model_after_retries(fake_client, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "fallback-model")
    models = fake_client(_flaky(4, 429))
    assert gemini.vision_transcribe(b"png", "image/png", "horizontal")
    assert [c["model"] for c in models.calls] == [gemini.MODEL] * 4 + ["fallback-model"]


def test_retry_exhausted_keeps_quota_reason(fake_client, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "fallback-model")
    models = fake_client(_flaky(99, 429))
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.translate_items([{"ref": "1", "term": "語"}], "vi")
    assert exc.value.reason == "quota" and len(models.calls) == 5


def test_slow_failures_stop_within_total_budget(fake_client, monkeypatch):
    # Model treo tới timeout 60 s mỗi lần (504 thấy thật 14/10): tổng vòng thử lại phải dừng trước AI_SERVICE_READ_TIMEOUT
    # của backend (3 phút), nếu không backend timeout và cả job FAILED dù dịch nghĩa chỉ là bước làm giàu.
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "fallback-model")
    clock = {"t": 0.0}

    def fake_now():
        clock["t"] += 70.0  # mỗi lần hỏi giờ ≈ một lượt gọi treo 60 s + giãn cách
        return clock["t"]

    monkeypatch.setattr(gemini, "_now", fake_now)
    models = fake_client(_flaky(99, 504))
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.translate_items([{"ref": "1", "term": "語"}], "vi")
    assert exc.value.reason == "error" and exc.value.retryable
    assert len(models.calls) == 2  # lượt 3 sẽ vượt ngân sách 150 s -> không gọi nữa, không sang model dự phòng


def test_non_retryable_error_not_retried(fake_client):
    models = fake_client(_flaky(99, 404))
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.vision_transcribe(b"png", "image/png", "auto")
    assert exc.value.reason == "error" and len(models.calls) == 1


def test_prompts_mention_vocab_table_and_source_gloss(fake_client):
    models = fake_client(lambda c, cfg: "x")
    gemini.vision_transcribe(b"png", "image/png", "horizontal")
    prompt = models.calls[0]["contents"][1]
    assert "TAB" in prompt and "vocabulary" in prompt and "furigana" in prompt
    fake_client(_echo_translate)
    gemini.translate_items([{"ref": "1", "term": "語", "meaningEn": "word"}], "vi")
    assert "original gloss" in gemini._client.models.calls[0]["contents"]


def test_504_is_retried_then_fallback(fake_client, monkeypatch):
    # Model quá tải trả 503 rồi 504 DEADLINE_EXCEEDED (thấy thật ngày 12/10): 504 cũng phải thử lại / sang model dự phòng
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "fallback-model")
    models = fake_client(_flaky(4, 504))
    assert gemini.vision_transcribe(b"png", "image/png", "horizontal")
    assert [c["model"] for c in models.calls] == [gemini.MODEL] * 4 + ["fallback-model"]


def test_quota_cooldown_skips_calls_until_expiry(fake_client, monkeypatch):
    # Hết quota (429) ở một trang -> các lượt gọi tiếp theo trong COOLDOWN_S không gọi Gemini nữa (OCR 18 trang
    # scan không thể chờ 14 s/trang khi quota đã hết); hết thời gian nguội thì gọi lại bình thường.
    clock = {"t": 1000.0}
    monkeypatch.setattr(gemini, "_now", lambda: clock["t"])
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "")
    models = fake_client(_flaky(99, 429))
    with pytest.raises(gemini.GeminiError):
        gemini.vision_transcribe(b"png", "image/png", "auto")
    n = len(models.calls)
    assert n == 4
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.vision_transcribe(b"png", "image/png", "auto")
    assert exc.value.reason == "quota" and len(models.calls) == n  # không gọi thêm
    clock["t"] += gemini.COOLDOWN_S + 1
    fake_client(lambda c, cfg: "ok")
    assert gemini.vision_transcribe(b"png", "image/png", "auto") == "ok"


def test_primary_quota_goes_straight_to_fallback_next_calls(fake_client, monkeypatch):
    # Model chính 429 nhưng model dự phòng chạy được: lượt sau không thử lại model chính nữa (OCR 18 trang scan
    # không thể tốn 2+4+8 s mỗi trang), đi thẳng dự phòng cho tới hết thời gian nguội.
    clock = {"t": 5000.0}
    monkeypatch.setattr(gemini, "_now", lambda: clock["t"])
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "fallback-model")

    box = {}

    def primary_429_fallback_ok(contents, cfg):
        if box["models"].calls[-1]["model"] == "fallback-model":
            return "ok"
        raise _Boom(429)

    models = box["models"] = fake_client(primary_429_fallback_ok)
    assert gemini.vision_transcribe(b"png", "image/png", "auto") == "ok"
    assert [c["model"] for c in models.calls] == [gemini.MODEL] * 4 + ["fallback-model"]
    assert gemini.vision_transcribe(b"png", "image/png", "auto") == "ok"
    assert [c["model"] for c in models.calls[5:]] == ["fallback-model"]  # không gọi model chính
    clock["t"] += gemini.COOLDOWN_S + 1
    gemini.vision_transcribe(b"png", "image/png", "auto")
    assert models.calls[6]["model"] == gemini.MODEL  # hết thời gian nguội -> thử lại model chính
