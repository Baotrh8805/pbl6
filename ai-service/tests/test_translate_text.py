"""Dịch câu Nhật ↔ Việt (tab Dịch, spec 2026-10-28-dich-cau-design, D33): phân tích câu tại chỗ, lọc đầu ra Gemini, prompt / hồ sơ
gọi của gemini.translate_text. Router /api/dict/translate-text kiểm ở test_dictionary.py (cần fixture JMdict)."""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.extract import gemini
from app.extract import translate_text as tt


# ----------------------------------------------------------------------------- hướng dịch + phân tích câu

def test_detect_direction():
    assert tt.detect_direction("ご飯を食べました。") == "ja-vi"
    assert tt.detect_direction("Tôi ăn cơm.") == "vi-ja"
    assert tt.detect_direction("Từ 食べる nghĩa là gì?") == "ja-vi", "văn bản trộn coi là tiếng Nhật"


def test_analyse_merges_auxiliaries_and_labels_tokens():
    toks = tt.analyse("昨日は友達と映画を見ました。")
    assert [t["surface"] for t in toks] == ["昨日", "は", "友達", "と", "映画", "を", "見ました", "。"]
    assert [t["i"] for t in toks] == list(range(8))
    eiga = toks[4]
    assert eiga["reading"] == "えいが" and eiga["romaji"] == "eiga" and eiga["posVi"] == "danh từ" and eiga["jlpt"] == "N5"
    assert eiga["rubies"] == [{"text": "映画", "reading": "えいが"}] and not eiga["symbol"] and not eiga["particle"]
    assert eiga["glossEn"] and "movie" in eiga["glossEn"]
    mimashita = toks[6]
    assert mimashita["lemma"] == "見る" and mimashita["reading"] == "みました" and mimashita["romaji"] == "mimashita"
    assert mimashita["pos"] == "動詞" and mimashita["rubies"] == [{"text": "見", "reading": "み"}, {"text": "ました", "reading": None}]
    wo = toks[5]
    assert wo["particle"] and wo["glossEn"] is None and wo["jlpt"] is None and wo["posVi"] == "trợ từ"
    dot = toks[7]
    assert dot["symbol"] and dot["key"] is None and dot["reading"] is None and dot["posVi"] == "dấu"
    assert all(t["meaning"] is None for t in toks), "nghĩa theo ngữ cảnh chỉ do Gemini điền"
    # danh sách gửi AI: bỏ dấu, giữ chỉ số
    words = tt.ai_words(toks)
    assert [w["i"] for w in words] == [0, 1, 2, 3, 4, 5, 6]
    assert words[6] == {"i": 6, "surface": "見ました", "lemma": "見る", "reading": "みました"}


def test_analyse_te_form_and_adjective_merge_but_not_desu_after_noun():
    assert [t["surface"] for t in tt.analyse("高くて食べて学生です")] == ["高くて", "食べて", "学生", "です"]


def test_analyse_latin_digits_are_symbols_and_caps(monkeypatch):
    toks = tt.analyse("ABC 123。")
    assert all(t["symbol"] for t in toks) and all(t["lemma"] is None for t in toks)
    assert tt.ai_words(toks) == []
    monkeypatch.setattr(tt, "MAX_TOKENS", 3)
    assert len(tt.analyse("私は毎日日本語を勉強します。")) == 3
    monkeypatch.setattr(tt, "MAX_AI_WORDS", 2)
    assert len(tt.ai_words(tt.analyse("昨日は友達と映画を見ました。"))) == 2


def test_romaji_and_reading_agreement():
    toks = tt.analyse("ご飯を食べました。")
    assert tt.romaji_of(toks) == "gohan o tabemashita。"
    assert tt.reading_agrees(toks, "ごはんをたべました。") is True
    assert tt.reading_agrees(toks, "ゴハンヲ タベマシタ") is True, "so phần kana, katakana / khoảng trắng không tính"
    assert tt.reading_agrees(toks, "ごはんをのみました。") is False
    assert tt.reading_agrees(toks, None) is None and tt.reading_agrees([], "ごはん") is None
    assert tt.romaji_of([]) is None


# ----------------------------------------------------------------------------- lọc đầu ra Gemini

def test_clean_result_ja_vi_filters_and_attaches_word_meanings():
    toks = tt.analyse("ご飯を食べました。")
    raw = {
        "translation": " Tôi đã ăn cơm. ",
        "literal": "cơm / (tân ngữ) / đã ăn",
        "alternatives": ["Tôi đã ăn cơm.", "Anh ấy đã ăn cơm.", "食べた", "Cô ấy đã ăn cơm.", "Thứ tư"],
        "notes": "ました: quá khứ lịch sự",
        "words": [{"i": 0, "meaning": "cơm, bữa ăn"}, {"i": 1, "meaning": "trợ từ chỉ tân ngữ"}, {"i": 99, "meaning": "lạ"},
                  {"i": "x", "meaning": "sai"}, {"i": 2, "meaning": "食べる còn chữ Nhật"}, {"i": 3, "meaning": "dấu chấm"}, "rác"],
    }
    out = tt.clean_result(raw, "ja-vi", toks)
    assert out["translation"] == "Tôi đã ăn cơm."
    assert out["literal"] == "cơm / (tân ngữ) / đã ăn"
    assert [a["text"] for a in out["alternatives"]] == ["Anh ấy đã ăn cơm.", "Cô ấy đã ăn cơm."], "trùng bản dịch / chữ Nhật bỏ, tối đa 2"
    assert out["alternatives"][0] == {"text": "Anh ấy đã ăn cơm.", "reading": None, "note": None}
    assert out["notes"] == "ました: quá khứ lịch sự" and out["reading"] is None
    assert toks[0]["meaning"] == "cơm, bữa ăn" and toks[1]["meaning"] == "trợ từ chỉ tân ngữ"
    assert toks[2]["meaning"] is None, "nghĩa còn chữ Nhật bị bỏ"
    assert toks[3]["meaning"] is None, "dấu câu không nhận nghĩa"


def test_clean_result_rejects_unusable_translation():
    assert tt.clean_result({"translation": "食べました"}, "ja-vi", []) is None, "ja-vi mà còn chữ Nhật"
    assert tt.clean_result({"translation": "Tôi ăn"}, "vi-ja", []) is None, "vi-ja mà không có chữ Nhật"
    assert tt.clean_result({"translation": "   "}, "ja-vi", []) is None
    assert tt.clean_result({"translation": "x" * (tt.MAX_TRANSLATION_CHARS + 1)}, "ja-vi", []) is None
    assert tt.clean_result("rác", "ja-vi", []) is None
    assert tt.clean_result({}, "ja-vi", []) is None


def test_clean_result_vi_ja_reading_literal_and_alternatives():
    raw = {
        "translation": "ご飯を食べました。",
        "reading": "ごはんをたべました。",
        "literal": "không dùng ở chiều này",
        "alternatives": [{"text": "ご飯を食べた。", "reading": "ごはんを食べた。", "note": "thể thường"}, {"text": "Tôi ăn", "reading": "", "note": ""}],
        "notes": "",
    }
    out = tt.clean_result(raw, "vi-ja", [])
    assert out["reading"] == "ごはんをたべました。" and out["literal"] is None and out["notes"] is None
    assert out["alternatives"] == [{"text": "ご飯を食べた。", "reading": None, "note": "thể thường"}], "reading còn kanji → bỏ; phương án Việt → bỏ"
    assert tt.clean_result({"translation": "ご飯", "reading": "ご飯"}, "vi-ja", [])["reading"] is None
    assert tt.clean_result({"translation": "ご飯", "reading": "ゴハン"}, "vi-ja", [])["reading"] == "ごはん"
    long_note = "x" * (tt.MAX_NOTE_CHARS + 1)
    assert tt.clean_result({"translation": "ご飯", "notes": long_note}, "vi-ja", [])["notes"] is None


def test_clean_result_drops_literal_equal_to_translation_and_normalises_whitespace():
    out = tt.clean_result({"translation": "Tôi  ăn\r\n  cơm.", "literal": "Tôi ăn\ncơm."}, "ja-vi", [])
    assert out["translation"] == "Tôi ăn\ncơm." and out["literal"] is None


# ----------------------------------------------------------------------------- gemini.translate_text

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
    monkeypatch.setattr(gemini, "_sleep", lambda s: None)
    monkeypatch.setattr(gemini, "_cooldown_until", 0.0)
    monkeypatch.setattr(gemini, "_primary_quota_until", {})
    monkeypatch.setattr(gemini, "_unusable_until", {})

    def install(responder):
        models = _FakeModels(responder)
        monkeypatch.setattr(gemini, "_client", SimpleNamespace(models=models))
        return models
    yield install
    monkeypatch.setattr(gemini, "_client", None)


def test_translate_text_ja_vi_prompt_schema_and_parse(fake_client):
    models = fake_client(lambda c, cfg: json.dumps({"translation": "Tôi đã ăn cơm.", "literal": "", "alternatives": [],
                                                    "notes": "", "words": [{"i": 0, "meaning": "cơm"}]}))
    words = [{"i": 0, "surface": "ご飯", "lemma": "ご飯", "reading": "ごはん"}]
    raw, used = gemini.translate_text("ご飯を食べました。", "ja-vi", words)
    assert raw["translation"] == "Tôi đã ăn cơm." and raw["words"] == [{"i": 0, "meaning": "cơm"}] and used == gemini.MODEL
    call = models.calls[0]
    prompt = call["contents"]
    assert "ご飯を食べました。" in prompt and '"i": 0' in prompt and "ごはん" in prompt
    low = prompt.lower()
    assert "whole" in low and "subject" in low and "literal" in low and "in this context" in low, "dịch cả đoạn, suy chủ ngữ, sát nghĩa, nghĩa theo ngữ cảnh"
    cfg = call["config"]
    assert cfg.response_mime_type == "application/json" and cfg.temperature == 0.2
    assert cfg.response_schema["required"] == ["translation", "literal", "alternatives", "notes", "words"]
    assert cfg.http_options.timeout == gemini.TEXT_PROFILE.timeout_ms, "hồ sơ tương tác 12 s, không phải 60 s mặc định"


def test_translate_text_vi_ja_prompt_and_schema(fake_client):
    models = fake_client(lambda c, cfg: json.dumps({"translation": "ご飯を食べました。", "reading": "ごはんをたべました。",
                                                    "alternatives": [], "notes": ""}))
    raw, _ = gemini.translate_text("Tôi đã ăn cơm.", "vi-ja")
    assert raw["reading"] == "ごはんをたべました。"
    prompt = models.calls[0]["contents"]
    assert "Tôi đã ăn cơm." in prompt and "です・ます" in prompt and "N5-N3" in prompt and "Words:" not in prompt
    assert models.calls[0]["config"].response_schema["required"] == ["translation", "reading", "alternatives", "notes"]


def test_translate_text_accepts_code_fence_and_single_item_list(fake_client):
    fake_client(lambda c, cfg: "```json\n[{\"translation\": \"Tôi ăn.\", \"literal\": \"\", \"alternatives\": [], \"notes\": \"\", \"words\": []}]\n```")
    raw, _ = gemini.translate_text("食べる", "ja-vi", [])
    assert raw["translation"] == "Tôi ăn."


def test_translate_text_errors(fake_client, monkeypatch):
    fake_client(lambda c, cfg: "rác không phải JSON")
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.translate_text("食べる", "ja-vi", [])
    assert exc.value.reason == "error"
    fake_client(lambda c, cfg: json.dumps(["một", "danh sách"]))
    with pytest.raises(gemini.GeminiError):
        gemini.translate_text("食べる", "ja-vi", [])
    with pytest.raises(ValueError):
        gemini.translate_text("食べる", "en-vi", [])
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.translate_text("食べる", "ja-vi", [])
    assert exc.value.reason == "no_api_key"


class _Boom(Exception):
    def __init__(self, code):
        super().__init__(f"{code} error")
        self.code = code


def test_translate_text_retries_once_then_hits_deadline_without_global_cooldown(fake_client, monkeypatch):
    # Model trả 503 và mỗi lượt treo tới timeout 12 s: lượt 2 sẽ vượt hạn chót 16 s -> dừng với "budget" (thử lại được), KHÔNG
    # tạm ngưng Gemini toàn cục như hồ sơ mặc định (một câu dịch chậm không được tắt dịch nghĩa từ điển của mọi người).
    clock = {"t": 100.0}
    monkeypatch.setattr(gemini, "_now", lambda: clock["t"])

    def responder(contents, config):
        clock["t"] += 13.0   # lượt gọi treo tới timeout 12 s rồi mới trả 503
        raise _Boom(503)
    models = fake_client(responder)
    with pytest.raises(gemini.GeminiError) as exc:
        gemini.translate_text("食べる", "ja-vi", [])
    assert exc.value.reason == "budget" and exc.value.retryable
    assert len(models.calls) == 1
    assert gemini._cooldown_until == 0.0, "hết hạn chót của một lời gọi không phải Gemini hỏng"


def test_translate_text_retries_503_then_succeeds(fake_client):
    state = {"n": 0}

    def responder(contents, config):
        state["n"] += 1
        if state["n"] == 1:
            raise _Boom(503)
        return json.dumps({"translation": "Tôi ăn.", "literal": "", "alternatives": [], "notes": "", "words": []})
    models = fake_client(responder)
    raw, _ = gemini.translate_text("食べる", "ja-vi", [])
    assert raw["translation"] == "Tôi ăn." and len(models.calls) == 2
