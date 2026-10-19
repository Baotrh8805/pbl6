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


def test_degenerate_repeats_are_collapsed(fake_client):
    # Gemini Vision trang mục lục "この本の使い方 ·····" sinh 50 000 dấu chấm dẫn (thấy thật 14/10) -> cắt chuỗi lặp
    fake_client(lambda c, cfg: "この本の使い方 " + "·" * 5000 + chr(10) + "第1課 あいさつ" + "ー" * 30)
    out = gemini.vision_transcribe(b"png", "image/png", "auto")
    assert out.count("·") <= 3 and "第1課 あいさつ" in out and out.count("ー") <= 3
    assert len(out) < 100


# --- Mẹo nhớ bộ thủ (C4): generate_mnemonics + bộ lọc mnemonic_ok -----------------------------------------------

MNEMONIC_ITEMS = [
    {"kanji": "海", "hanViet": "HẢI", "radicalName": "thủy", "radicalChar": "水", "meaningEn": "sea",
     "examples": [{"term": "海外"}, "航海", None, "海岸", "海水"]},
    {"kanji": "火", "hanViet": "HỎA", "radicalName": "hỏa", "radicalChar": "火", "meaningEn": "fire", "examples": []},
    {"kanji": "花", "hanViet": "HOA", "radicalName": "thảo", "radicalChar": "艸", "meaningEn": "flower"},
    {"kanji": "学", "hanViet": "HỌC", "radicalName": "tử", "radicalChar": "子", "meaningEn": "learning"},
    {"kanji": "道", "hanViet": "ĐẠO", "radicalName": "sước", "radicalChar": "辵", "meaningEn": "road"},
    {"kanji": "人", "hanViet": "NHÂN", "radicalName": "nhân", "radicalChar": "人", "meaningEn": "person"},
]


def _split_items(contents):
    return json.loads(contents.split("Danh sách:\n", 1)[1])


def test_mnemonics_parse_filter_and_prompt(fake_client):
    models = fake_client(lambda c, cfg: json.dumps([
        {"kanji": "海", "mnemonicVi": "Bộ Thuỷ là nước, biển hải mênh mông."},   # dấu / hoa thường khác vẫn nhận
        {"kanji": "火", "mnemonicVi": "Lửa 火 cháy, đọc là ひ hỏa."},             # lẫn kana → bỏ
        {"kanji": "花", "mnemonicVi": "Hoa nở trên cỏ 艸, chữ 花 đẹp."},        # chỉ chữ đích + bộ của nó → nhận
        {"kanji": "学", "mnemonicVi": "Trẻ con đến trường mỗi sáng."},           # không nhắc HỌC / tử → bỏ
        {"kanji": "道", "mnemonicVi": "ĐẠO " + "x" * 300},                        # quá 300 ký tự → bỏ
        {"kanji": "人", "mnemonicVi": "  "},                                      # rỗng → bỏ
        {"kanji": "海", "mnemonicVi": "Mẹo thứ hai cho HẢI."},                    # trùng chữ → giữ mẹo đầu
        {"kanji": "龘", "mnemonicVi": "Chữ lạ không gửi lên: HẢI."},              # kanji không có trong lô → bỏ
        "not a dict",
    ], ensure_ascii=False))
    out = gemini.generate_mnemonics(MNEMONIC_ITEMS)
    assert out == {"items": [{"kanji": "海", "mnemonicVi": "Bộ Thuỷ là nước, biển hải mênh mông."},
                             {"kanji": "花", "mnemonicVi": "Hoa nở trên cỏ 艸, chữ 花 đẹp."}], "reason": None}
    assert len(models.calls) == 1 and models.calls[0]["model"] == gemini.MODEL
    cfg = models.calls[0]["config"]
    assert cfg.response_mime_type == "application/json" and cfg.response_schema is not None and cfg.temperature == 0.7
    prompt = models.calls[0]["contents"]
    assert "Hán-Việt" in prompt and "bộ thủ" in prompt and "romaji" in prompt and "200 ký tự" in prompt
    assert "phản cảm" in prompt and '{"kanji", "mnemonicVi"}' in prompt
    sent = _split_items(prompt)
    # ví dụ ≤ 3, bỏ None, dict → term; khoá rỗng không gửi
    assert sent[0] == {"kanji": "海", "hanViet": "HẢI", "radicalName": "thủy", "radicalChar": "水", "meaningEn": "sea",
                       "examples": ["海外", "航海", "海岸"]}
    assert "examples" not in sent[1] and "examples" not in sent[2]


def test_mnemonics_batches_of_40_keep_order(fake_client):
    def echo(contents, cfg):
        return json.dumps([{"kanji": it["kanji"], "mnemonicVi": f"Bộ {it['radicalName']} nhớ {it['hanViet']}."}
                           for it in _split_items(contents)], ensure_ascii=False)
    models = fake_client(echo)
    items = [{"kanji": chr(0x4E00 + i), "hanViet": f"AM{i}", "radicalName": "thủy"} for i in range(45)]
    out = gemini.generate_mnemonics(items)
    assert len(models.calls) == 2 and out["reason"] is None and len(out["items"]) == 45
    assert out["items"][44] == {"kanji": chr(0x4E00 + 44), "mnemonicVi": "Bộ thủy nhớ AM44."}


def test_mnemonics_quota_keeps_earlier_batches_and_reports_reason(fake_client, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "")
    state = {"n": 0}

    def first_ok_then_quota(contents, cfg):
        state["n"] += 1
        if state["n"] == 1:
            return json.dumps([{"kanji": it["kanji"], "mnemonicVi": f"Nhớ {it['hanViet']}."} for it in _split_items(contents)],
                              ensure_ascii=False)
        raise _Boom(429)
    models = fake_client(first_ok_then_quota)
    items = [{"kanji": chr(0x4E00 + i), "hanViet": f"AM{i}"} for i in range(41)]
    out = gemini.generate_mnemonics(items)
    assert out["reason"] == "quota" and len(out["items"]) == 40          # batch đầu giữ, batch hai hết quota sau thử lại
    assert len(models.calls) == 1 + len(gemini.RETRY_DELAYS) + 1
    # cầu dao đã bật: lượt sau không gọi Gemini, vẫn báo quota để router dùng template
    assert gemini.generate_mnemonics(items[:1]) == {"items": [], "reason": "quota"}
    assert len(models.calls) == 1 + len(gemini.RETRY_DELAYS) + 1


def test_mnemonics_error_and_no_key(fake_client, monkeypatch):
    fake_client(lambda c, cfg: "not json")
    assert gemini.generate_mnemonics(MNEMONIC_ITEMS[:1]) == {"items": [], "reason": "error"}
    models = fake_client(_flaky(99, 404))
    assert gemini.generate_mnemonics(MNEMONIC_ITEMS[:1]) == {"items": [], "reason": "error"}
    assert len(models.calls) == 1                                        # 404 không thử lại
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    assert gemini.generate_mnemonics(MNEMONIC_ITEMS[:1]) == {"items": [], "reason": "no_key"}
    assert gemini.generate_mnemonics([]) == {"items": [], "reason": "no_key"}


@pytest.mark.parametrize("text,ok", [
    ("Biển HẢI thuộc bộ Thủy.", True),
    ("biển hải mênh mông", True),                 # không phân biệt hoa / thường / cách bỏ dấu
    ("Thuỷ là nước.", True),                      # tên bộ, chính tả ỷ ≠ ủy
    ("Hải sản rất ngon.", True),
    ("Chữ 海 (HẢI) có bộ 水 là nước.", True),    # chữ đích và bộ của nó được phép
    ("Bộ Thủy viết ⽔ (khối Kangxi) nằm trong 海.", True),
    ("Bộ Thủy 氵 (nước) + âm HẢI = biển.", True),  # dạng viết trong chữ của bộ (radicals.variants) cũng được phép
    ("Ba chấm thủy 氺 dưới chữ, HẢI.", True),
    ("Chữ 海 có bộ 水 là nước.", False),          # chỉ nghĩa bộ, không có tên bộ / âm → bỏ
    ("Chữ 海 trong 日本海.", False),               # kanji khác → người học N5 không đọc được
    ("Biển đọc là うみ, HẢI.", False),             # kana
    ("Biển rộng mênh mông.", False),              # không nhắc âm Hán-Việt / tên bộ
    ("Hảiyyy.", False),                           # âm phải là một từ trọn vẹn
    ("", False),
    ("   ", False),
    ("HẢI " + "x" * 300, False),
])
def test_mnemonic_ok_filter(text, ok):
    item = {"kanji": "海", "hanViet": "HẢI", "radicalName": "thủy", "radicalChar": "水"}
    assert gemini.mnemonic_ok(text, item) is ok


@pytest.mark.parametrize("text,item,ok", [
    ("Bộ thảo 艹 trên đầu, âm THẢO là cỏ.", {"kanji": "花", "hanViet": "HOA", "radicalName": "thảo", "radicalChar": "艸"}, True),
    ("Bộ sước 辶 chạy dưới, ĐẠO là đường.", {"kanji": "道", "hanViet": "ĐẠO", "radicalName": "sước", "radicalChar": "辵"}, True),
    ("Bộ Thanh 靑 cũ, chữ 静 đọc TĨNH.", {"kanji": "静", "hanViet": "TĨNH", "radicalName": "thanh", "radicalChar": "青"}, True),
    # chiều ngược lại: caller gửi dạng cũ 靑 → dạng JIS 青 người học thấy trong chữ cũng được phép
    ("Bộ Thanh 青, chữ 静 đọc TĨNH.", {"kanji": "静", "hanViet": "TĨNH", "radicalName": "thanh", "radicalChar": "靑"}, True),
    # caller gửi sẵn radicalVariants (router) → không tra bảng; danh sách rỗng → chỉ chữ đích + radicalChar
    ("Bộ Thủy 氵, HẢI.", {"kanji": "海", "hanViet": "HẢI", "radicalChar": "水", "radicalVariants": ["氵"]}, True),
    ("Bộ Thủy 氵, HẢI.", {"kanji": "海", "hanViet": "HẢI", "radicalChar": "水", "radicalVariants": []}, False),
    ("Bộ thảo 艹 nhưng chữ 草 khác.", {"kanji": "花", "hanViet": "HOA", "radicalName": "thảo", "radicalChar": "艸"}, False),
])
def test_mnemonic_ok_accepts_radical_variants(text, item, ok):
    assert gemini.mnemonic_ok(text, item) is ok


def test_mnemonic_ok_single_letter_reading_needs_word_boundary():
    item = {"kanji": "衣", "hanViet": "Y", "radicalName": "y", "radicalChar": "衣"}
    assert gemini.mnemonic_ok("Áo 衣 đọc là Y.", item)
    assert not gemini.mnemonic_ok("Yêu cái áo này.", item)
    assert gemini.mnemonic_ok("Tên bộ: nhân đi.", {"kanji": "兄", "hanViet": None, "radicalName": "nhân đi"})
    assert not gemini.mnemonic_ok("Không có gì để so.", {"kanji": "兄"})
