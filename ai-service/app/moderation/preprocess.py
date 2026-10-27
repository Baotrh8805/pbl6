"""Tiền xử lý đúng như notebook huấn luyện ViHSD (vihsd.ipynb cell 3, 5, 9): pyvi tách từ → demojize → bỏ URL → chữ thường →
bỏ dấu câu (giữ `_`) → bỏ stopword (trừ 5 từ phủ định) → bỏ chữ số → gộp khoảng trắng; rồi Keras Tokenizer tách lại theo bộ lọc
mặc định (CÓ `_`, nên từ ghép của pyvi bị tách thành âm tiết) và tra word_index (OOV = 1), pad sau tới 140.

word_index được dựng lại từ train.csv (notebook không lưu tokenizer): 9 425 từ, kiểm bằng độ chính xác trên test.csv 0,8437 so với
0,8443 của notebook. Thiếu pyvi / emoji_vietnamese → ImportError khi gọi, caller coi như model chưa sẵn sàng.
"""
from __future__ import annotations

import json
import re
import string
import threading
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
STOPWORDS_FILE = DATA_DIR / "vietnamese-stopwords-dash.txt"
WORD_INDEX_FILE = DATA_DIR / "vihsd_word_index.json"
MAX_LEN = 140
OOV_INDEX = 1
KEEP_WORDS = ("không", "không_có", "không_thể", "chưa", "được")

_PUNCT_RE = re.compile("[" + re.escape(string.punctuation.replace("_", "")) + "]")
_URL_RE = re.compile(r"http\S+")
_WWW_RE = re.compile(r"www\S+")
_DIGIT_RE = re.compile(r"\d+")
_SPACE_RE = re.compile(r"\s+")
# Bộ lọc mặc định của keras.preprocessing.text.Tokenizer (có `_`, tab, xuống dòng)
_KERAS_FILTERS = '!"#$%&()*+,-./:;<=>?@[\\]^_`{|}~\t\n'
_KERAS_TABLE = str.maketrans({c: " " for c in _KERAS_FILTERS})
_lock = threading.Lock()


@lru_cache(maxsize=1)
def stopwords() -> frozenset[str]:
    words = STOPWORDS_FILE.read_text(encoding="utf-8").splitlines()
    for w in KEEP_WORDS:
        if w in words:
            words.remove(w)
    return frozenset(words)


@lru_cache(maxsize=1)
def word_index() -> dict[str, int]:
    with WORD_INDEX_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def vi_tokenize(text: str) -> str:
    """pyvi.ViTokenizer.tokenize; chuỗi rỗng trả rỗng (như notebook)."""
    if not isinstance(text, str):
        text = "" if text is None else str(text)
    if text.strip() == "":
        return ""
    from pyvi import ViTokenizer  # noqa: PLC0415 (nạp muộn: không bắt buộc khi không dùng kiểm duyệt)
    with _lock:  # CRF của pyvi không an toàn đa luồng
        return ViTokenizer.tokenize(text)


def clean(text: str) -> str:
    """Chuỗi đã pyvi → chuỗi đã làm sạch (các bước preprocess_data của notebook, thứ tự giữ nguyên)."""
    import emoji_vietnamese  # noqa: PLC0415
    t = emoji_vietnamese.demojize(text)
    t = _WWW_RE.sub("", _URL_RE.sub("", t))
    t = t.lower()
    t = _PUNCT_RE.sub(" ", t)
    sw = stopwords()
    t = " ".join(w for w in t.split() if w not in sw)
    t = _DIGIT_RE.sub("", t)
    return _SPACE_RE.sub(" ", t).strip()


def preprocess(text: str) -> str:
    return clean(vi_tokenize(text))


def keras_words(text: str) -> list[str]:
    """keras text_to_word_sequence với bộ lọc mặc định: thay ký tự lọc bằng khoảng trắng, lower, split."""
    return [w for w in text.lower().translate(_KERAS_TABLE).split(" ") if w]


def to_sequence(cleaned: str, max_len: int = MAX_LEN) -> list[int]:
    """Dãy id (pad 0 phía sau / cắt phía sau tới max_len) như texts_to_sequences + pad_sequences(padding='post', truncating='post')."""
    idx = word_index()
    seq = [idx.get(w, OOV_INDEX) for w in keras_words(cleaned)][:max_len]
    return seq + [0] * (max_len - len(seq))


def available() -> bool:
    try:
        import emoji_vietnamese  # noqa: F401, PLC0415
        import pyvi  # noqa: F401, PLC0415
    except ImportError:
        return False
    return STOPWORDS_FILE.exists() and WORD_INDEX_FILE.exists()
