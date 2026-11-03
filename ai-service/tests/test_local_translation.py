"""Formatting and request isolation for the local translation runner."""
import time
from types import SimpleNamespace

import pytest

from app.extract import local_translation as mt


class Tokenizer:
    eos_token = "<eos>"
    eos_token_id = 2
    pad_token_id = 0
    all_special_ids = [0, 2, 3]
    added_tokens_decoder = {}

    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=False):
        prefix = "<user>" + messages[0]["content"] + "<assistant>"
        return prefix if add_generation_prompt else prefix + messages[1]["content"] + "<end>"

    def __call__(self, text, **kwargs):
        return SimpleNamespace(input_ids=[3, 2])

    def convert_ids_to_tokens(self, i):
        return {0: "<pad>", 2: "<eos>", 3: "<end>"}[i]

    def decode(self, ids, **kwargs):
        return "<think>internal</think>Tôi là sinh viên.<end>" if ids == [10] else "bad"


def test_prompt_matches_training_instruction_both_directions():
    fmt = mt.ChatFormat(Tokenizer())
    for direction, target in (("ja-vi", "Vietnamese"), ("vi-ja", "Japanese")):
        assert fmt.prompt("source", direction) == (
            f"<user>Translate the following segment into {target}, without additional explanation."
            "\n\nsource<assistant>")


def test_decode_stops_before_suffix_and_removes_special_and_thinking_text():
    fmt = mt.ChatFormat(Tokenizer())
    assert fmt.stop_ids == [0, 2, 3]
    assert fmt.decode([10, 3, 99]) == "Tôi là sinh viên."


def test_expired_request_never_loads_model(monkeypatch):
    monkeypatch.setattr(mt, "_load", lambda: pytest.fail("must not load"))
    with pytest.raises(mt.TranslationError, match="timeout"):
        mt.translate_segment("source", "vi-ja", deadline=time.monotonic() - 1, max_input_tokens=128)


def test_failure_releases_inference_lock(monkeypatch):
    def fail():
        raise mt.TranslationError("model_missing")
    monkeypatch.setattr(mt, "_load", fail)
    for _ in range(2):
        with pytest.raises(mt.TranslationError, match="model_missing"):
            mt.translate_segment("source", "vi-ja", deadline=time.monotonic() + 1, max_input_tokens=128)
    assert not mt._lock.locked()


def test_invalid_direction_does_not_load_model(monkeypatch):
    monkeypatch.setattr(mt, "_load", lambda: pytest.fail("must not load"))
    with pytest.raises(mt.TranslationError, match="invalid_input"):
        mt.translate_segment("source", "en-ja", deadline=time.monotonic() + 1, max_input_tokens=128)


def test_split_keeps_japanese_quotes_punctuation_and_blank_lines():
    assert mt.split_lines("彼は「本当ですか！？」\n\nはい。次です。", "ja-vi") == [
        ["彼は「本当ですか！？」"], [], ["はい。", "次です。"]]


def test_split_vietnamese_preserves_numbers_and_abbreviations():
    assert mt.split_lines("TS. Nam trả 3.5 triệu đồng. Ngày mai tôi đi.\n\nCảm ơn!", "vi-ja") == [
        ["TS. Nam trả 3.5 triệu đồng.", "Ngày mai tôi đi."], [], ["Cảm ơn!"]]


def test_paragraph_runs_all_sentences_without_losing_line_breaks(monkeypatch):
    seen = []
    def segment(text, direction, **kwargs):
        seen.append((text, direction))
        return {"最初です。": "Câu đầu.", "次です。": "Câu sau.", "最後です。": "Câu cuối."}[text]
    monkeypatch.setattr(mt, "translate_segment", segment)
    assert mt.translate("最初です。次です。\n\n最後です。", "ja-vi", deadline=100) == "Câu đầu. Câu sau.\n\nCâu cuối."
    assert [s for s, _ in seen] == ["最初です。", "次です。", "最後です。"]


def test_paragraph_does_not_return_partial_success(monkeypatch):
    def segment(text, direction, **kwargs):
        if text == "次です。":
            raise mt.TranslationError("output_truncated")
        return "Câu đầu."
    monkeypatch.setattr(mt, "translate_segment", segment)
    with pytest.raises(mt.TranslationError, match="output_truncated"):
        mt.translate("最初です。次です。", "ja-vi", deadline=100)
