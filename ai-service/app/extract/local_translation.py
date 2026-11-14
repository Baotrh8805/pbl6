"""Local HY-MT inference, using the formatting and decoding from the training notebook.

Loading and inference are serialized: the tokenizer and model are shared between requests.
No model files are downloaded and no training code is executed.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
import unicodedata
from pathlib import Path

log = logging.getLogger(__name__)
MODEL_DIR = Path(os.getenv("TRANSLATION_MODEL_DIR") or
                 Path(__file__).resolve().parents[2] / "models" / "translation")
MODEL_NAME = "local:hy-mt1.5-1.8b-ja-vi"
LANGUAGES = {"ja-vi": "Vietnamese", "vi-ja": "Japanese"}
_lock = threading.Lock()
_state: tuple | None = None


class TranslationError(RuntimeError):
    """A failure suitable for mapping to a translation response."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class ChatFormat:
    """Reproduce the notebook's assistant prefix, target suffix and stop tokens."""

    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        placeholder, target = "@@SRC_PLACEHOLDER@@", "@@TGT_PLACEHOLDER@@"
        messages = [{"role": "user", "content": placeholder}]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        full = tokenizer.apply_chat_template(messages + [{"role": "assistant", "content": target}],
                                             tokenize=False)
        if placeholder not in prompt or not full.startswith(prompt) or target not in full[len(prompt):]:
            raise TranslationError("invalid_template")
        self.prefix, self.suffix = full[len(prompt):].split(target, 1)
        if tokenizer.eos_token and tokenizer.eos_token not in self.suffix:
            self.suffix = self.suffix.rstrip() + tokenizer.eos_token
        special = set(tokenizer.all_special_ids)
        special.update(i for i, token in tokenizer.added_tokens_decoder.items() if token.special)
        self.special_strings = sorted(filter(None, (tokenizer.convert_ids_to_tokens(i) for i in special)),
                                      key=len, reverse=True)
        self.stop_ids = sorted({i for i in tokenizer(self.suffix, add_special_tokens=False).input_ids
                                if i in special} |
                               {i for i in (tokenizer.eos_token_id, tokenizer.pad_token_id) if i is not None})
        if not self.stop_ids:
            raise TranslationError("invalid_template")

    def prompt(self, text: str, direction: str) -> str:
        instruction = (f"Translate the following segment into {LANGUAGES[direction]}, "
                       f"without additional explanation.\n\n{text}")
        return self.tokenizer.apply_chat_template(
            [{"role": "user", "content": instruction}], tokenize=False,
            add_generation_prompt=True) + self.prefix

    def decode(self, ids: list[int]) -> str:
        end = next((i for i, token in enumerate(ids) if token in self.stop_ids), len(ids))
        text = self.tokenizer.decode(ids[:end], skip_special_tokens=True)
        for token in self.special_strings:
            text = text.replace(token, "")
        return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def _load():
    global _state
    if _state is not None:
        return _state
    if not all((MODEL_DIR / name).is_file() for name in
               ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json")):
        raise TranslationError("model_missing")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    device = os.getenv("TRANSLATION_DEVICE", "auto")
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device not in ("cpu", "cuda"):
        raise TranslationError("invalid_device")
    if device == "cuda" and not torch.cuda.is_available():
        raise TranslationError("device_unavailable")
    # BF16 keeps FP32 exponent range while using half the weight memory.
    # CPU PyTorch supports these operations even without a CUDA device.
    dtype = torch.bfloat16 if device == "cpu" else (
        torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float32)
    if device == "cpu":
        torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
    started = time.monotonic()
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), local_files_only=True, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"
    fmt = ChatFormat(tokenizer)
    model = AutoModelForCausalLM.from_pretrained(
        str(MODEL_DIR), local_files_only=True, trust_remote_code=False,
        dtype=dtype, use_safetensors=True).to(device).eval()
    model.generation_config.do_sample = False
    model.generation_config.temperature = 1.0
    model.generation_config.top_p = 1.0
    model.generation_config.top_k = 50
    _state = (tokenizer, model, fmt)
    log.info("Loaded local translation model on %s in %.1fs", device, time.monotonic() - started)
    return _state


def translate_segment(text: str, direction: str, *, deadline: float,
                      max_input_tokens: int, max_new_tokens: int = 128) -> str:
    """Translate one segment without truncating input or accepting incomplete output.

    The caller selects segmentation and limits. Deadlines include time waiting for
    another inference and loading; generation stops cooperatively between tokens.
    """
    if direction not in LANGUAGES or not text.strip():
        raise TranslationError("invalid_input")
    if max_input_tokens < 1 or max_new_tokens < 1:
        raise ValueError("Token limits must be positive")
    remaining = deadline - time.monotonic()
    if remaining <= 0 or not _lock.acquire(timeout=max(0, remaining)):
        raise TranslationError("timeout")
    try:
        tokenizer, model, fmt = _load()
        import torch
        from transformers import StoppingCriteria, StoppingCriteriaList

        class Deadline(StoppingCriteria):
            def __call__(self, input_ids, scores, **kwargs):
                return time.monotonic() >= deadline

        enc = tokenizer(fmt.prompt(unicodedata.normalize("NFC", text), direction),
                        return_tensors="pt", add_special_tokens=False, return_token_type_ids=False)
        if enc["input_ids"].shape[1] > max_input_tokens:
            raise TranslationError("input_too_long")
        if time.monotonic() >= deadline:
            raise TranslationError("timeout")
        enc = enc.to(model.device)
        with torch.inference_mode():
            output = model.generate(
                **enc, do_sample=False, num_beams=1, repetition_penalty=1.05,
                max_new_tokens=max_new_tokens, eos_token_id=fmt.stop_ids,
                pad_token_id=tokenizer.pad_token_id, use_cache=True,
                stopping_criteria=StoppingCriteriaList([Deadline()]))
        ids = output[0, enc["input_ids"].shape[1]:].tolist()
        if not any(token in fmt.stop_ids for token in ids):
            raise TranslationError("timeout" if time.monotonic() >= deadline else "output_truncated")
        result = fmt.decode(ids)
        from app.extract.jachars import has_japanese
        if not result or (direction == "vi-ja" and not has_japanese(result)) or (
                direction == "ja-vi" and has_japanese(result)):
            raise TranslationError("invalid_output")
        return result
    except TranslationError:
        raise
    except Exception as exc:
        log.exception("Local translation failed")
        raise TranslationError("model_error") from exc
    finally:
        _lock.release()


def split_lines(text: str, direction: str) -> list[list[str]]:
    """Keep paragraph breaks and sentence-ending punctuation, including Japanese quotes."""
    if direction == "ja-vi":
        sentence = r".+?(?:[。！？!?]+[」』）)】]*|$)"
        return [[s.strip() for s in re.findall(sentence, line) if s.strip()]
                for line in text.replace("\r\n", "\n").split("\n")]
    # Do not split decimal numbers or common abbreviations.
    abbreviations = {"ts.", "ths.", "pgs.", "gs.", "tp.", "mr.", "mrs.", "dr.", "vd."}
    lines = []
    for line in text.replace("\r\n", "\n").split("\n"):
        sentences = []
        parts = re.split(r'(?<=[.!?…])\s+(?=[A-ZÀ-Ỹ0-9“"(])', line.strip())
        for part in parts:
            if sentences and sentences[-1].split()[-1].lower() in abbreviations:
                sentences[-1] += " " + part
            elif part.strip():
                sentences.append(part.strip())
        lines.append(sentences)
    return lines


def translate(text: str, direction: str, *, deadline: float) -> str:
    """Translate all sentences atomically; never return a partially translated paragraph."""
    if direction not in LANGUAGES or not text.strip():
        raise TranslationError("invalid_input")
    lines = split_lines(text, direction)
    results = []
    for line in lines:
        translated = [translate_segment(sentence, direction, deadline=deadline,
                                        max_input_tokens=128, max_new_tokens=128)
                      for sentence in line]
        results.append((" " if direction == "ja-vi" else "").join(translated))
    return "\n".join(results)
