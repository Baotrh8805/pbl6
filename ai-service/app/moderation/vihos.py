"""ViHOS — đánh dấu từ vi phạm bằng PhoBERT (vihos.ipynb): mỗi từ (pyvi) lấy sub-token đầu, softmax 3 nhãn O / B-T / I-T,
t_score = P(B) + P(I) ≥ THRESHOLD → từ bị đánh dấu. Cần torch + transformers (requirements-ml.txt) và hai file trong `models/`:
`phobert_hatespeech_best.pt` (state_dict: phobert.* + classifier.*) và thư mục `phobert-base/` (vocab.txt, bpe.codes).

Thiếu bất kỳ thứ gì → `get()` trả None, router trả spans rỗng (`spanModel: false`); MODERATION_SPANS=0 tắt hẳn (máy ít RAM: model
fp32 tốn thêm ≈ 400 MB). Suy luận giữ một khoá: PhoBERT trên CPU 4 luồng ≈ 80 ms/câu, hai request song song chỉ tranh luồng.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import unicodedata
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings
from app.moderation.preprocess import vi_tokenize

_log = logging.getLogger(__name__)

MODELS_DIR = Path(os.getenv("MODELS_DIR") or Path(__file__).resolve().parents[2] / "models")
MODEL_FILE = MODELS_DIR / "phobert_hatespeech_best.pt"
TOKENIZER_DIR = MODELS_DIR / "phobert-base"
THRESHOLD = 0.5          # notebook tune 0,35–0,55 trên dev; best_threshold.txt của bản v3 = 0,55, bản dùng ở đây mặc định 0,5
MAX_LEN = 128
# vinai/phobert-base (config.json trên Hub); dựng từ config nên không cần tải pytorch_model.bin của Hub
PHOBERT_CONFIG: dict[str, Any] = dict(vocab_size=64001, hidden_size=768, num_hidden_layers=12, num_attention_heads=12,
                                      intermediate_size=3072, max_position_embeddings=258, type_vocab_size=1,
                                      layer_norm_eps=1e-5, pad_token_id=1, bos_token_id=0, eos_token_id=2, hidden_act="gelu")
_lock = threading.Lock()
_infer_lock = threading.Lock()
_model: Optional["Vihos"] = None
_failed = False


def clean_word_deep(word: str) -> str:
    """Như notebook: thường, NFC, regex bỏ dấu chấm / gạch giữa chữ (notebook viết `(r[a-z])` nên thực tế chỉ khớp "v.rl" → "vrl",
    "v.l" giữ nguyên — giữ y hệt vì model huấn luyện với hàm này), chỉ giữ chữ, số, vài dấu câu và `_`."""
    word = str(word).lower().strip()
    word = unicodedata.normalize("NFC", word)
    word = re.sub(r"([a-z])[\.\-](r[a-z])", r"\1\2", word)
    word = re.sub(r"[^\s\w\d.,!?:)_]", "", word)
    return word if word != "" else " "


def align_words(text: str, words: list[str]) -> list[tuple[int, int]]:
    """Vị trí (start, end) của từng từ pyvi trong văn bản gốc (`_` = khoảng trắng; tìm không phân biệt hoa thường, tiến dần);
    không tìm thấy → (-1, -1). Dùng để backend che đúng chỗ."""
    low = text.lower()
    pos = 0
    out = []
    for w in words:
        cand = w.replace("_", " ").lower()
        i = low.find(cand, pos) if cand.strip() else -1
        if i < 0 and "_" in w:
            first = w.split("_")[0].lower()
            i = low.find(first, pos) if first else -1
            cand = first
        if i < 0:
            out.append((-1, -1))
            continue
        out.append((i, i + len(cand)))
        pos = i + len(cand)
    return out


def decode(t_scores: list[float], threshold: float = THRESHOLD) -> list[bool]:
    return [s >= threshold for s in t_scores]


class Vihos:
    def __init__(self, tokenizer, model, classifier, torch_mod):
        self.tok = tokenizer
        self.bert = model
        self.classifier = classifier
        self.torch = torch_mod
        self.device = "cpu"

    def scores(self, text: str) -> list[tuple[str, int, int, float]]:
        """[(từ pyvi, start, end, t_score)] cho mọi từ (kể cả dưới ngưỡng); văn bản rỗng → []."""
        raw_words = [w for w in vi_tokenize(text).split() if w]
        if not raw_words:
            return []
        offsets = align_words(text, raw_words)
        ids = [self.tok.cls_token_id]
        first: list[Optional[int]] = []
        for w in raw_words:
            wt = self.tok.encode(clean_word_deep(w), add_special_tokens=False)
            if not wt or len(ids) + len(wt) >= MAX_LEN - 1:
                first.append(None)      # không mã hoá được hoặc quá dài: từ đó không có điểm
                continue
            first.append(len(ids))
            ids.extend(wt)
        ids.append(self.tok.sep_token_id)
        torch = self.torch
        with _infer_lock, torch.no_grad():
            x = torch.tensor([ids], dtype=torch.long)
            h = self.bert(input_ids=x, attention_mask=torch.ones_like(x)).last_hidden_state
            probs = torch.softmax(self.classifier(h)[0], dim=-1)
            t = (probs[:, 1] + probs[:, 2]).tolist()
        return [(w, s, e, float(t[i]) if i is not None else 0.0) for w, (s, e), i in zip(raw_words, offsets, first)]

    def predict(self, text: str, threshold: float = THRESHOLD) -> list[dict]:
        return [{"word": w, "start": s, "end": e, "score": round(sc, 4)}
                for w, s, e, sc in self.scores(text) if sc >= threshold]


def enabled() -> bool:
    return settings.MODERATION_SPANS


def files_present() -> bool:
    return MODEL_FILE.exists() and (TOKENIZER_DIR / "vocab.txt").exists() and (TOKENIZER_DIR / "bpe.codes").exists()


def _load() -> Optional[Vihos]:
    try:
        import torch  # noqa: PLC0415
        from transformers import PhobertTokenizer, RobertaConfig, RobertaModel  # noqa: PLC0415
    except ImportError as e:
        _log.warning("PhoBERT tắt: thiếu torch / transformers (%s). Cài requirements-ml.txt để có từ đánh dấu.", e)
        return None
    if not files_present():
        _log.warning("PhoBERT tắt: thiếu %s hoặc %s (scripts/fetch_models.py).", MODEL_FILE, TOKENIZER_DIR)
        return None
    torch.set_num_threads(max(1, settings.MODERATION_THREADS))
    tok = PhobertTokenizer(str(TOKENIZER_DIR / "vocab.txt"), str(TOKENIZER_DIR / "bpe.codes"))
    bert = RobertaModel(RobertaConfig(**PHOBERT_CONFIG))
    classifier = torch.nn.Linear(PHOBERT_CONFIG["hidden_size"], 3)
    sd = torch.load(MODEL_FILE, map_location="cpu", weights_only=True)
    bert_sd = {k[len("phobert."):]: v for k, v in sd.items() if k.startswith("phobert.")}
    missing, unexpected = bert.load_state_dict(bert_sd, strict=False)
    missing = [k for k in missing if not k.startswith("pooler.")]
    if missing or unexpected:
        _log.warning("PhoBERT state_dict lệch: thiếu %s, thừa %s", missing[:5], unexpected[:5])
    classifier.load_state_dict({"weight": sd["classifier.weight"], "bias": sd["classifier.bias"]})
    bert.eval()
    classifier.eval()
    return Vihos(tok, bert, classifier, torch)


def get() -> Optional[Vihos]:
    """Nạp lười một lần; lỗi nạp ghi log một lần rồi trả None (không thử lại mỗi request)."""
    global _model, _failed
    if _model is not None:
        return _model
    if _failed or not enabled():
        return None
    with _lock:
        if _model is None and not _failed:
            try:
                _model = _load()
            except Exception:  # noqa: BLE001
                _log.exception("Nạp PhoBERT thất bại")
            if _model is None:
                _failed = True
    return _model


def set_model(m: Optional[Vihos], failed: bool = False) -> None:
    """Cho test."""
    global _model, _failed
    with _lock:
        _model = m
        _failed = failed


def available() -> bool:
    """Cờ health: đã nạp xong hoặc có thể nạp (file + thư viện có, chưa thử)."""
    if _model is not None:
        return True
    if _failed or not enabled() or not files_present():
        return False
    try:
        import torch  # noqa: F401, PLC0415
        import transformers  # noqa: F401, PLC0415
    except ImportError:
        return False
    return True
