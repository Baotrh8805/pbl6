"""Model ViHSD 3 lớp (CNN 4 tầng + BiLSTM 2 tầng + Dense) chạy bằng numpy từ trọng số Keras đã xuất.

Kiến trúc (vihsd.ipynb cell 13, `lstm_model((140,), 50000, 128)`): Embedding(50000, 128) → 4 × [Conv1D(same, relu) + BatchNorm +
MaxPool(2)] (128/8, 128/8, 64/4, 32/4) → BiLSTM(128, trả chuỗi) → BiLSTM(64) → Dense(64, relu) → Dense(16, relu) → Dense(3, softmax).
Dropout bỏ qua lúc suy luận. File trọng số: `models/vihsd_cnn_lstm.npz`, khoá `<tên lớp>__<i>` theo thứ tự `get_weights()`
(Conv1D: kernel (k, in, out), bias; BatchNorm: gamma, beta, mean, var, eps 1e-3; LSTM: kernel (in, 4u), recurrent (u, 4u), bias (4u),
cổng i f c o; Bidirectional: 3 mảng xuôi rồi 3 mảng ngược). Kết quả đã đối chiếu với Keras trên tập test (xem tests/test_moderation_vihsd.py).
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

import numpy as np

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
WEIGHTS_FILE = MODELS_DIR / "vihsd_cnn_lstm.npz"
LABELS = ("clean", "offensive", "hate")
_BN_EPS = 1e-3

_model: Optional["Vihsd"] = None
_lock = threading.Lock()


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _conv1d_same(x: np.ndarray, kernel: np.ndarray, bias: np.ndarray) -> np.ndarray:
    """x (L, C_in), kernel (k, C_in, C_out) → (L, C_out), padding 'same' của TF với stride 1: trái (k-1)//2, phải phần còn lại."""
    k = kernel.shape[0]
    left = (k - 1) // 2
    right = k - 1 - left
    xp = np.pad(x, ((left, right), (0, 0)))
    L = x.shape[0]
    # (L, k, C_in) cửa sổ trượt rồi nhân với kernel gộp (k*C_in, C_out)
    win = np.lib.stride_tricks.sliding_window_view(xp, k, axis=0)   # (L, C_in, k)
    win = win.transpose(0, 2, 1).reshape(L, k * kernel.shape[1])
    return win @ kernel.reshape(k * kernel.shape[1], kernel.shape[2]) + bias


def _batchnorm(x: np.ndarray, gamma, beta, mean, var) -> np.ndarray:
    return (x - mean) / np.sqrt(var + _BN_EPS) * gamma + beta


def _maxpool2(x: np.ndarray) -> np.ndarray:
    L = x.shape[0] // 2
    return x[: 2 * L].reshape(L, 2, x.shape[1]).max(axis=1)


def _lstm(x: np.ndarray, kernel: np.ndarray, recurrent: np.ndarray, bias: np.ndarray, return_sequences: bool) -> np.ndarray:
    """LSTM Keras (activation tanh, recurrent sigmoid), x (L, in) → (L, u) hoặc (u,)."""
    u = recurrent.shape[0]
    h = np.zeros(u, dtype=np.float32)
    c = np.zeros(u, dtype=np.float32)
    xw = x @ kernel + bias            # (L, 4u) tính trước phần phụ thuộc đầu vào
    outs = []
    for t in range(x.shape[0]):
        z = xw[t] + h @ recurrent
        i = _sigmoid(z[:u])
        f = _sigmoid(z[u:2 * u])
        g = np.tanh(z[2 * u:3 * u])
        o = _sigmoid(z[3 * u:])
        c = f * c + i * g
        h = o * np.tanh(c)
        if return_sequences:
            outs.append(h)
    return np.stack(outs) if return_sequences else h


def _bilstm(x: np.ndarray, w: list[np.ndarray], return_sequences: bool) -> np.ndarray:
    fwd = _lstm(x, w[0], w[1], w[2], return_sequences)
    bwd = _lstm(x[::-1], w[3], w[4], w[5], return_sequences)
    if return_sequences:
        return np.concatenate([fwd, bwd[::-1]], axis=1)
    return np.concatenate([fwd, bwd])


class Vihsd:
    def __init__(self, weights: dict[str, np.ndarray]):
        g = lambda name, i: np.asarray(weights[f"{name}__{i}"], dtype=np.float32)  # noqa: E731
        self.embedding = g("embedding", 0)
        self.convs = []
        for idx, name in enumerate(["conv1d", "conv1d_1", "conv1d_2", "conv1d_3"]):
            bn = "batch_normalization" if idx == 0 else f"batch_normalization_{idx}"
            self.convs.append((g(name, 0), g(name, 1), tuple(g(bn, i) for i in range(4))))
        self.lstm1 = [g("bidirectional", i) for i in range(6)]
        self.lstm2 = [g("bidirectional_1", i) for i in range(6)]
        self.dense1 = (g("dense", 0), g("dense", 1))
        self.dense2 = (g("dense_1", 0), g("dense_1", 1))
        self.out = (g("mfcc_unit", 0), g("mfcc_unit", 1))
        self.vocab = self.embedding.shape[0]

    def predict_proba(self, seq: list[int]) -> np.ndarray:
        """seq: 140 id (0 = pad) → xác suất 3 lớp."""
        ids = np.asarray(seq, dtype=np.int64)
        ids = np.where((ids < 0) | (ids >= self.vocab), 1, ids)   # ngoài từ vựng của embedding → OOV (notebook vocab_size 500000 > 50000)
        x = self.embedding[ids]
        for kernel, bias, bn in self.convs:
            x = np.maximum(_conv1d_same(x, kernel, bias), 0.0)
            x = _batchnorm(x, *bn)
            x = _maxpool2(x)
        x = _bilstm(x, self.lstm1, True)
        x = _bilstm(x, self.lstm2, False)
        x = np.maximum(x @ self.dense1[0] + self.dense1[1], 0.0)
        x = np.maximum(x @ self.dense2[0] + self.dense2[1], 0.0)
        logits = x @ self.out[0] + self.out[1]
        e = np.exp(logits - logits.max())
        return e / e.sum()


def load(path: Path = WEIGHTS_FILE) -> Vihsd:
    with np.load(path) as z:
        return Vihsd({k: z[k] for k in z.files})


def get() -> Optional[Vihsd]:
    """Nạp một lần (khoá kép); thiếu file → None."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None and WEIGHTS_FILE.exists():
            _model = load()
    return _model


def set_model(m: Optional[Vihsd]) -> None:
    """Cho test."""
    global _model
    with _lock:
        _model = m


def available() -> bool:
    return WEIGHTS_FILE.exists()
