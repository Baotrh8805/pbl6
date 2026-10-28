"""Dịch máy offline Nhật ↔ Việt — dự phòng cho tab Dịch khi không có bản dịch Gemini (không khoá, hết lượt, quá tải, lỗi; D34).

Mô hình: facebook/m2m100_418M (giấy phép MIT, dùng thương mại được — NLLB CC-BY-NC bị loại ở D33), chuyển sang CTranslate2 int8
(~470 MB, nhanh gấp 3–5 lần PyTorch trên CPU) bằng ``scripts/fetch_offline_mt.py`` vào ``models/mt/m2m100_418M-ct2`` (không
commit). Lúc chạy chỉ cần ``ctranslate2`` + ``sentencepiece`` (requirements-ml.txt), không cần torch.

Đo 28/10 trên máy dev (16 luồng): đoạn 1 000 ký tự Nhật → Việt 9 s (beam 4) / 6 s (beam 2), Việt → Nhật 6 s / 3 s; câu ngắn < 1 s.
Chất lượng thấp hơn Gemini (đôi khi sai từ, sát chữ) — giao diện ghi rõ "dịch máy offline"; bản offline không vào bộ nhớ dịch
chung để lần sau Gemini còn dịch lại.

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
MODEL_NAME = "m2m100_418M-ct2"
SPM_FILE = "sentencepiece.bpe.model"
LANGS = {"ja-vi": ("ja", "vi"), "vi-ja": ("vi", "ja")}

MAX_SENTENCE_CHARS = 300   # câu dài hơn (không dấu câu) cắt mềm theo dấu phẩy để mô hình không cụt
BATCH = 8                  # số câu một lô; giữa các lô kiểm hạn chót
# Ước lượng giây / ký tự với beam 4 (đo ở trên, có dư) để chọn beam vừa hạn chót: đủ giờ → 4, sát → 2, gấp → 1 (greedy)
SEC_PER_CHAR_BEAM4 = 0.012

# Tách câu: giữ dấu kết câu Nhật / Việt (và ngoặc đóng) dính vào câu trước
_SENT_RE = re.compile(r"[^。！？!?.…]+[。！？!?.…」』）)\"']*|[。！？!?.…]+")
_SOFT_RE = re.compile(r"(?<=[、，,;；])")
_REPEAT_RE = re.compile(r"(.{2,}?)\1{3,}")     # cùng một cụm lặp ≥ 4 lần: mô hình nhỏ "kẹt"

_lock = threading.Lock()          # nạp mô hình một lần
_infer_lock = threading.Lock()    # một lượt dịch một lúc: tránh hai lượt tranh luồng CPU làm chậm cả hai
_state: dict = {}                 # translator, sp
_failed = False


def model_dir() -> Path:
    return MT_DIR / MODEL_NAME


def _present() -> bool:
    d = model_dir()
    return (d / "model.bin").exists() and (d / SPM_FILE).exists()


def _deps() -> bool:
    try:
        import ctranslate2  # noqa: F401, PLC0415
        import sentencepiece  # noqa: F401, PLC0415
    except Exception:  # noqa: BLE001 — thiếu requirements-ml: coi như không có dịch offline
        return False
    return True


def available() -> bool:
    return not _failed and _present() and _deps()


def _load():
    if _state:
        return _state["translator"], _state["sp"]
    with _lock:
        if _state:
            return _state["translator"], _state["sp"]
        import ctranslate2  # noqa: PLC0415
        import sentencepiece as spm  # noqa: PLC0415

        t0 = time.monotonic()
        threads = max(1, min(8, os.cpu_count() or 1))
        translator = ctranslate2.Translator(str(model_dir()), device="cpu", compute_type="int8",
                                            inter_threads=1, intra_threads=threads)
        sp = spm.SentencePieceProcessor(model_file=str(model_dir() / SPM_FILE))
        _state.update(translator=translator, sp=sp)
        log.info("Dịch offline: nạp %s trong %.1f s", MODEL_NAME, time.monotonic() - t0)
        return translator, sp


def preload() -> None:
    """Nạp sẵn mô hình (luồng nền lúc khởi động) để lượt dịch đầu không phải chờ nạp."""
    global _failed
    if not (_present() and _deps()):
        return
    try:
        _load()
    except Exception as exc:  # noqa: BLE001
        _failed = True
        log.warning("Dịch offline: nạp %s lỗi: %s", MODEL_NAME, exc)


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


def _beam_for(chars: int, deadline: Optional[float]) -> int:
    if deadline is None:
        return 4
    left = deadline - time.monotonic()
    need = chars * SEC_PER_CHAR_BEAM4
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


def _translate_sentences(sents: list[str], direction: str, deadline: Optional[float]) -> list[Optional[str]]:
    translator, sp = _load()
    src, tgt = LANGS[direction]
    beam = _beam_for(sum(len(s) for s in sents), deadline)
    out: list[Optional[str]] = []
    for i in range(0, len(sents), BATCH):
        if deadline is not None and time.monotonic() > deadline:
            raise TimeoutError("offline_mt deadline")
        chunk = sents[i:i + BATCH]
        tokens = [[f"__{src}__"] + sp.encode(s, out_type=str)[:250] + ["</s>"] for s in chunk]
        with _infer_lock:
            res = translator.translate_batch(tokens, target_prefix=[[f"__{tgt}__"]] * len(tokens), beam_size=beam,
                                             max_batch_size=BATCH, no_repeat_ngram_size=4, max_decoding_length=256)
        for r in res:
            hyp = r.hypotheses[0] if r.hypotheses else []
            out.append(_clean(sp.decode(hyp[1:] if hyp and hyp[0] == f"__{tgt}__" else hyp), direction))
    return out


def translate(text: str, direction: str, deadline: Optional[float] = None) -> Optional[tuple[str, str]]:
    """Dịch cả đoạn → (bản dịch, tên mô hình) hoặc None khi không có mô hình / quá hạn chót / quá nửa số câu hỏng.
    Không bao giờ ném."""
    if direction not in LANGS or not text or not text.strip() or not available():
        return None
    lines = split_sentences(text)
    flat = [s for line in lines for s in line]
    if not flat:
        return None
    src_sents = [romanize_names(s) for s in flat] if direction == "ja-vi" else flat
    try:
        done = _translate_sentences(src_sents, direction, deadline)
    except TimeoutError:
        log.warning("Dịch offline: hết hạn chót (%d câu)", len(flat))
        return None
    except Exception as exc:  # noqa: BLE001
        log.warning("Dịch offline: lỗi: %s", exc)
        return None
    if sum(1 for c in done if c is None) * 2 > len(done):
        return None
    joiner = "" if direction == "vi-ja" else " "
    it = iter(done)
    paragraphs = [joiner.join(c for c in (next(it) for _ in line) if c) for line in lines]
    result = re.sub(r"\n{3,}", "\n\n", "\n".join(paragraphs)).strip()
    return (result, MODEL_NAME) if result else None
