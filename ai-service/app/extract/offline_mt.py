"""Dịch máy offline Nhật ↔ Việt — dự phòng cho tab Dịch khi không có bản dịch Gemini (không khoá, hết lượt, quá tải, lỗi; D34).

Mô hình: facebook/m2m100_418M (giấy phép MIT, dùng thương mại được — NLLB CC-BY-NC bị loại ở D33), tải + chuyển bằng
``scripts/fetch_offline_mt.py`` (không commit). Hai lớp chạy, cùng một mô hình:
1. **CTranslate2 int8** (``models/mt/m2m100_418M-ct2``, ~470 MB, chỉ cần ``ctranslate2`` + ``sentencepiece``) — lớp chính.
2. **PyTorch** (``models/mt/m2m100_418M``, bản gốc 1,9 GB đã tải để chuyển, cần ``torch`` + ``transformers``) — chỉ dùng khi lớp 1
   không có / nạp hỏng / lỗi lúc dịch (vd. máy chủ không cài được ctranslate2). Chậm hơn 3–5 lần nên beam hạ sớm; đoạn quá dài
   có thể không kịp hạn chót (khi đó chỉ có phân tích câu). Chỉ nạp khi cần — bình thường không tốn thêm RAM.

Đo 28/10 trên máy dev (16 luồng), đoạn 1 000 ký tự: CTranslate2 Nhật → Việt 9 s (beam 4) / 6 s (beam 2), Việt → Nhật 6 s / 3 s;
PyTorch 28–45 s (Nhật → Việt), 18–30 s (Việt → Nhật); câu ngắn < 1 s / 1–3 s. Chất lượng thấp hơn Gemini (đôi khi sai từ, sát
chữ) — giao diện ghi rõ "dịch máy offline"; bản offline không vào bộ nhớ dịch chung để lần sau Gemini còn dịch lại.

Vẫn là dịch CẢ câu (seq2seq), không ghép nghĩa từng từ. Đoạn được tách theo câu (mô hình nhỏ dễ bỏ sót / lặp ở câu dài), dịch
theo lô, nối lại giữ xuống dòng. Tên người Nhật (Sudachi 固有名詞・人名) đổi sang romaji trước khi dịch vì mô hình hay dịch sai tên
(田中 → "Tanja"). Thiếu thư viện / mô hình → ``available()`` False; ``translate`` không bao giờ ném.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Optional

from app.extract.jachars import has_japanese, has_kanji, kata_to_hira

log = logging.getLogger(__name__)

MT_DIR = Path(os.getenv("OFFLINE_MT_DIR") or Path(__file__).resolve().parents[2] / "models" / "mt")
MODEL_NAME = "m2m100_418M-ct2"      # lớp chính CTranslate2
TORCH_MODEL_NAME = "m2m100_418M"    # lớp dự phòng PyTorch (bản gốc)
SPM_FILE = "sentencepiece.bpe.model"
LANGS = {"ja-vi": ("ja", "vi"), "vi-ja": ("vi", "ja")}

MAX_SENTENCE_CHARS = 300   # câu dài hơn (không dấu câu) cắt mềm theo dấu phẩy để mô hình không cụt
BATCH = 8                  # số câu một lô; giữa các lô kiểm hạn chót
# Ước lượng giây / ký tự với beam 4 (đo ở trên, có dư) để chọn beam vừa hạn chót: đủ giờ → 4, sát → 2, gấp → 1 (greedy)
SEC_PER_CHAR_BEAM4 = 0.012
SEC_PER_CHAR_BEAM4_TORCH = 0.05
# Nạp bản PyTorch mất ~27 s (đo 28/10): còn ít giờ hơn thì nạp ở luồng nền, lượt này trả None (giao diện: "đợi vài giây rồi dịch
# lại"), lượt sau đã có bản dịch — thay vì giữ request quá 30 s backend chờ.
TORCH_LOAD_S = 30

# Tách câu: giữ dấu kết câu Nhật / Việt (và ngoặc đóng) dính vào câu trước
_SENT_RE = re.compile(r"[^。！？!?.…]+[。！？!?.…」』）)\"']*|[。！？!?.…]+")
_SOFT_RE = re.compile(r"(?<=[、，,;；])")
_REPEAT_RE = re.compile(r"(.{2,}?)\1{3,}")     # cùng một cụm lặp ≥ 4 lần: mô hình nhỏ "kẹt"

_lock = threading.Lock()          # nạp mô hình một lần
_infer_lock = threading.Lock()    # một lượt dịch một lúc: tránh hai lượt tranh luồng CPU làm chậm cả hai
_state: dict = {}                 # "ct2": (translator, sp), "torch": (tokenizer, model)
_failed: set[str] = set()         # lớp đã nạp / chạy hỏng: bỏ qua tới khi khởi động lại


def model_dir() -> Path:
    return MT_DIR / MODEL_NAME


def torch_model_dir() -> Path:
    return MT_DIR / TORCH_MODEL_NAME


def _importable(*mods: str) -> bool:
    try:
        for m in mods:
            __import__(m)
    except Exception:  # noqa: BLE001 — thiếu requirements-ml: lớp đó coi như không có
        return False
    return True


def _ct2_ok() -> bool:
    d = model_dir()
    return ("ct2" not in _failed and (d / "model.bin").exists() and (d / SPM_FILE).exists()
            and _importable("ctranslate2", "sentencepiece"))


def _torch_ok() -> bool:
    d = torch_model_dir()
    return ("torch" not in _failed and (d / "config.json").exists() and (d / "pytorch_model.bin").exists()
            and (d / SPM_FILE).exists() and _importable("torch", "transformers", "sentencepiece"))


def backends() -> list[str]:
    """Các lớp dùng được, theo thứ tự thử: ct2 rồi torch."""
    return [name for name, ok in (("ct2", _ct2_ok), ("torch", _torch_ok)) if ok()]


def available() -> bool:
    return bool(backends())


def _load_ct2():
    if "ct2" in _state:
        return _state["ct2"]
    with _lock:
        if "ct2" not in _state:
            import ctranslate2  # noqa: PLC0415
            import sentencepiece as spm  # noqa: PLC0415

            t0 = time.monotonic()
            threads = max(1, min(8, os.cpu_count() or 1))
            translator = ctranslate2.Translator(str(model_dir()), device="cpu", compute_type="int8",
                                                inter_threads=1, intra_threads=threads)
            sp = spm.SentencePieceProcessor(model_file=str(model_dir() / SPM_FILE))
            _state["ct2"] = (translator, sp)
            log.info("Dịch offline: nạp %s trong %.1f s", MODEL_NAME, time.monotonic() - t0)
        return _state["ct2"]


def _load_torch():
    if "torch" in _state:
        return _state["torch"]
    with _lock:
        if "torch" not in _state:
            import torch  # noqa: PLC0415
            from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer  # noqa: PLC0415

            t0 = time.monotonic()
            path = str(torch_model_dir())
            tok = M2M100Tokenizer.from_pretrained(path)
            model = M2M100ForConditionalGeneration.from_pretrained(path).eval()
            model.generation_config.max_length = None   # dùng max_new_tokens theo độ dài câu; tránh cảnh báo mỗi lô
            try:   # int8 động cho Linear: nhanh ~2 lần, RAM giảm; hỏng thì chạy fp32
                model = torch.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)
            except Exception as exc:  # noqa: BLE001
                log.warning("Dịch offline: không lượng tử hoá được bản PyTorch (%s), chạy fp32", exc)
            _state["torch"] = (tok, model)
            log.info("Dịch offline: nạp lớp dự phòng PyTorch %s trong %.1f s", TORCH_MODEL_NAME, time.monotonic() - t0)
        return _state["torch"]


_LOADERS = {"ct2": _load_ct2, "torch": _load_torch}
_bg_loading: set[str] = set()


def _load_in_background(name: str) -> None:
    """Nạp một lớp ở luồng nền (một lần); hỏng thì đánh dấu để lượt sau không thử nữa."""
    with _lock:
        if name in _bg_loading or name in _state:
            return
        _bg_loading.add(name)

    def work():
        try:
            _LOADERS[name]()
        except Exception as exc:  # noqa: BLE001
            _failed.add(name)
            log.warning("Dịch offline: nạp lớp %s lỗi: %s", name, exc)
        finally:
            _bg_loading.discard(name)
    threading.Thread(target=work, name=f"offline-mt-load-{name}", daemon=True).start()


def preload() -> None:
    """Nạp sẵn lớp đầu tiên dùng được (luồng nền lúc khởi động) để lượt dịch đầu không phải chờ nạp. CTranslate2 nạp hỏng thì
    đánh dấu và nạp bản PyTorch thay."""
    for name in backends():
        try:
            _LOADERS[name]()
            return
        except Exception as exc:  # noqa: BLE001
            _failed.add(name)
            log.warning("Dịch offline: nạp lớp %s lỗi: %s", name, exc)


def split_sentences(text: str) -> list[list[str]]:
    """Đoạn → các dòng (giữ xuống dòng; dòng trống là []) → các câu. Câu quá dài không dấu câu thì cắt mềm theo dấu phẩy."""
    out: list[list[str]] = []
    for line in (text or "").split("\n"):
        line = line.strip()
        if not line:
            out.append([])
            continue
        sents: list[str] = []
        for m in _SENT_RE.finditer(line):
            s = m.group(0).strip()
            if not s:
                continue
            if sents and not re.search(r"\w", s):   # chỉ là dấu câu lẻ: dính vào câu trước
                sents[-1] += s
                continue
            if len(s) <= MAX_SENTENCE_CHARS:
                sents.append(s)
                continue
            buf = ""
            for part in _SOFT_RE.split(s):
                if buf and len(buf) + len(part) > MAX_SENTENCE_CHARS:
                    sents.append(buf.strip())
                    buf = ""
                buf += part
                while len(buf) > MAX_SENTENCE_CHARS:
                    sents.append(buf[:MAX_SENTENCE_CHARS].strip())
                    buf = buf[MAX_SENTENCE_CHARS:]
            if buf.strip():
                sents.append(buf.strip())
        out.append(sents or [line])
    return out


def romanize_names(sentence: str) -> str:
    """Tên người Nhật viết bằng kanji (Sudachi 固有名詞・人名) → romaji viết hoa (田中さん → Tanakaさん): m2m100 hay dịch sai tên."""
    if not has_kanji(sentence):
        return sentence
    try:
        from app.extract import tokenizer  # noqa: PLC0415
        from app.extract.romaji import to_romaji  # noqa: PLC0415

        out = []
        for t in tokenizer.tokenize(sentence, "C"):
            if len(t.pos) > 2 and t.pos[2] == "人名" and has_kanji(t.surface) and t.reading:
                out.append(to_romaji(kata_to_hira(t.reading)).capitalize())
            else:
                out.append(t.surface)
        return "".join(out)
    except Exception:  # noqa: BLE001 — Sudachi lỗi: dịch nguyên câu
        return sentence


def _beam_for(chars: int, deadline: Optional[float], sec_per_char: float = SEC_PER_CHAR_BEAM4) -> int:
    if deadline is None:
        return 4
    left = deadline - time.monotonic()
    need = chars * sec_per_char
    if left > need * 1.3:
        return 4
    if left > need * 0.8:
        return 2
    return 1


def _clean(s: str, direction: str) -> Optional[str]:
    s = re.sub(r"\s+", " ", s or "").strip()
    if not s:
        return None
    s = _REPEAT_RE.sub(r"\1", s)
    if direction == "vi-ja" and not has_japanese(s):
        return None
    if direction == "ja-vi" and has_japanese(s):
        return None
    return s


def _check_deadline(deadline: Optional[float]) -> None:
    if deadline is not None and time.monotonic() > deadline:
        raise TimeoutError("offline_mt deadline")


def _run_ct2(sents: list[str], direction: str, deadline: Optional[float]) -> list[Optional[str]]:
    translator, sp = _load_ct2()
    src, tgt = LANGS[direction]
    beam = _beam_for(sum(len(s) for s in sents), deadline)
    out: list[Optional[str]] = []
    for i in range(0, len(sents), BATCH):
        _check_deadline(deadline)
        chunk = sents[i:i + BATCH]
        tokens = [[f"__{src}__"] + sp.encode(s, out_type=str)[:250] + ["</s>"] for s in chunk]
        with _infer_lock:
            res = translator.translate_batch(tokens, target_prefix=[[f"__{tgt}__"]] * len(tokens), beam_size=beam,
                                             max_batch_size=BATCH, no_repeat_ngram_size=4, max_decoding_length=256)
        for r in res:
            hyp = r.hypotheses[0] if r.hypotheses else []
            out.append(_clean(sp.decode(hyp[1:] if hyp and hyp[0] == f"__{tgt}__" else hyp), direction))
    return out


def _run_torch(sents: list[str], direction: str, deadline: Optional[float]) -> list[Optional[str]]:
    import torch  # noqa: PLC0415

    tok, model = _load_torch()
    src, tgt = LANGS[direction]
    beam = _beam_for(sum(len(s) for s in sents), deadline, SEC_PER_CHAR_BEAM4_TORCH)
    tok.src_lang = src
    out: list[Optional[str]] = []
    for i in range(0, len(sents), BATCH):
        _check_deadline(deadline)
        enc = tok(sents[i:i + BATCH], return_tensors="pt", padding=True, truncation=True, max_length=256)
        max_new = min(256, int(enc["input_ids"].shape[1] * 2.5) + 16)
        with _infer_lock, torch.inference_mode():
            gen = model.generate(**enc, forced_bos_token_id=tok.get_lang_id(tgt), num_beams=beam, max_new_tokens=max_new,
                                 no_repeat_ngram_size=4)
        out.extend(_clean(s, direction) for s in tok.batch_decode(gen, skip_special_tokens=True))
    return out


_RUNNERS = {"ct2": (_run_ct2, MODEL_NAME), "torch": (_run_torch, TORCH_MODEL_NAME)}


def translate(text: str, direction: str, deadline: Optional[float] = None) -> Optional[tuple[str, str]]:
    """Dịch cả đoạn → (bản dịch, tên mô hình) hoặc None khi không có mô hình / quá hạn chót / quá nửa số câu hỏng. Thử CTranslate2
    trước; lớp đó lỗi (không phải hết giờ, không phải đầu ra kém — cùng mô hình thì PyTorch cũng thế) thì đánh dấu hỏng và chuyển
    sang bản PyTorch với phần hạn chót còn lại. Không bao giờ ném."""
    if direction not in LANGS or not text or not text.strip():
        return None
    order = backends()
    if not order:
        return None
    lines = split_sentences(text)
    flat = [s for line in lines for s in line]
    if not flat:
        return None
    src_sents = [romanize_names(s) for s in flat] if direction == "ja-vi" else flat
    for name in order:
        if name == "torch" and "torch" not in _state and deadline is not None and deadline - time.monotonic() < TORCH_LOAD_S:
            _load_in_background("torch")
            log.warning("Dịch offline: đang nạp lớp dự phòng PyTorch ở luồng nền, lượt này không có bản dịch")
            return None
        run, model_name = _RUNNERS[name]
        try:
            done = run(src_sents, direction, deadline)
        except TimeoutError:
            log.warning("Dịch offline (%s): hết hạn chót (%d câu)", name, len(flat))
            return None
        except Exception as exc:  # noqa: BLE001 — lớp này hỏng: thử lớp kế
            _failed.add(name)
            log.warning("Dịch offline: lớp %s lỗi, chuyển lớp dự phòng: %s", name, exc)
            continue
        if sum(1 for c in done if c is None) * 2 > len(done):
            return None
        joiner = "" if direction == "vi-ja" else " "
        it = iter(done)
        paragraphs = [joiner.join(c for c in (next(it) for _ in line) if c) for line in lines]
        result = re.sub(r"\n{3,}", "\n\n", "\n".join(paragraphs)).strip()
        return (result, model_name) if result else None
    return None
