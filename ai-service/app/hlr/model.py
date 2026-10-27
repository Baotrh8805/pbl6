"""Suy luận HLR portable bằng numpy, đúng từng bước với notebook (HLRNet arch='mlp' use_ids=False, curve='logistic', isotonic).

Đầu vào một thẻ: seen = số lượt đã chấm (không tính học nhanh), correct = số lượt không phải "Lại", delta_days = ngày kể từ lượt
chấm trước (≥ 1 phút). Đặc trưng: f_right = √(1+correct), f_wrong = √(1+seen−correct), f_log_seen = log1p(seen),
f_hist_acc = (correct+1)/(seen+2), chuẩn hoá theo mu/sd của tập train. MLP 4→256→128→2 (Linear, LayerNorm, GELU) cho (o0, o1):
    a = softplus(o1) + 1e-3 ;  p_raw(Δ) = sigmoid(o0 − a·log1p(Δ))  (kẹp [p_min, p_max])
    p = nội suy tuyến tính trên bảng isotonic (calib_x → calib_y)         ← "hiệu chỉnh"
    half-life = expm1(o0 / a) kẹp [h_min, h_max]  (p_raw = 0,5)
    interval(target) = expm1((o0 − logit(target_raw)) / a) kẹp [0, h_max], target_raw = điểm calib_x đầu tiên có calib_y ≥ target
Nhãn "Quên" khi p < threshold (0,8235, chọn theo macro-F1 trên tập val). Vì đường cong rất phẳng theo thời gian (a ≈ 0,12) nên
interval chỉ mang tính tham khảo (xem spec §8.3, D32): backend dùng p / forget để "phanh" SM-2 và hiển thị, không lập lịch từ interval.
"""
from __future__ import annotations

import json
import math
import threading
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from scipy.special import erf

DATA_FILE = Path(__file__).resolve().parent / "data" / "hlr_portable.json"
MIN_DELTA_DAYS = 1.0 / 1440.0   # 1 phút, như notebook
MAX_BATCH = 500
_lock = threading.Lock()


class HlrModel:
    def __init__(self, bundle: dict):
        self.name: str = bundle["name"]
        self.key: str = bundle["key"]
        self.curve: str = bundle["curve"]
        if self.curve != "logistic":
            raise ValueError(f"curve {self.curve!r} chưa hỗ trợ")
        self.mu = np.asarray(bundle["mu"], dtype=np.float64)
        self.sd = np.asarray(bundle["sd"], dtype=np.float64)
        self.layers = []
        for layer in bundle["layers"]:
            t = layer["type"]
            if t in ("linear", "layernorm"):
                self.layers.append((t, np.asarray(layer["w"], dtype=np.float64), np.asarray(layer["b"], dtype=np.float64),
                                    float(layer.get("eps", 1e-5))))
            else:
                self.layers.append((t, None, None, 0.0))
        self.calibrated: bool = bool(bundle.get("calibrated"))
        self.calib_x = np.asarray(bundle["calib_x"], dtype=np.float64)
        self.calib_y = np.asarray(bundle["calib_y"], dtype=np.float64)
        self.threshold = float(bundle["threshold"])
        self.target_p = float(bundle["target_p"])
        self.h_min = float(bundle["h_min"])
        self.h_max = float(bundle["h_max"])
        self.p_min = float(bundle["p_min"])
        self.p_max = float(bundle["p_max"])
        self.test_metrics: dict = bundle.get("test_metrics", {})
        self.baseline_logloss: Optional[float] = bundle.get("baseline_logloss")

    # ------------------------------------------------------------------ mạng
    @staticmethod
    def features(seen: int, correct: int) -> np.ndarray:
        seen = max(0, int(seen))
        correct = min(max(0, int(correct)), seen)
        wrong = seen - correct
        return np.array([math.sqrt(1 + correct), math.sqrt(1 + wrong), math.log1p(seen), (correct + 1) / (seen + 2)],
                        dtype=np.float64)

    def forward(self, x: np.ndarray) -> np.ndarray:
        """x (n, 4) đặc trưng thô → (n, 2) đầu ra o."""
        h = (x - self.mu) / self.sd
        for t, w, b, eps in self.layers:
            if t == "linear":
                h = h @ w.T + b
            elif t == "layernorm":
                mean = h.mean(axis=1, keepdims=True)
                var = h.var(axis=1, keepdims=True)
                h = (h - mean) / np.sqrt(var + eps) * w + b
            elif t == "gelu":
                h = 0.5 * h * (1.0 + erf(h / math.sqrt(2.0)))
            else:
                raise ValueError(t)
        return h

    # ------------------------------------------------------------------ đường cong
    def calibrate(self, p_raw: np.ndarray) -> np.ndarray:
        if not self.calibrated:
            return p_raw
        return np.interp(p_raw, self.calib_x, self.calib_y)

    def raw_target(self, target: float) -> float:
        """Ngưỡng p_raw tương ứng với p hiệu chỉnh = target (nghịch đảo bậc thang isotonic, như notebook raw_target)."""
        if not self.calibrated:
            return target
        i = int(np.searchsorted(self.calib_y, target, side="left"))
        return float(self.calib_x[min(i, len(self.calib_x) - 1)])

    def predict(self, seen, correct, delta_days, target_p: Optional[float] = None) -> list[dict]:
        """Mảng cùng độ dài → danh sách dict {recallRaw, recall, halfLifeDays, intervalDays, forget}."""
        seen = np.asarray(seen, dtype=np.int64).reshape(-1)
        correct = np.asarray(correct, dtype=np.int64).reshape(-1)
        d = np.maximum(np.asarray(delta_days, dtype=np.float64).reshape(-1), MIN_DELTA_DAYS)
        x = np.stack([self.features(s, c) for s, c in zip(seen, correct)]) if len(seen) else np.zeros((0, 4))
        o = self.forward(x) if len(seen) else np.zeros((0, 2))
        o0, o1 = o[:, 0], o[:, 1]
        a = np.logaddexp(0.0, o1) + 1e-3                      # softplus
        p_raw = np.clip(1.0 / (1.0 + np.exp(-(o0 - a * np.log1p(d)))), self.p_min, self.p_max)
        p = self.calibrate(p_raw)
        half = np.clip(np.expm1(np.clip(o0 / a, 0.0, 20.0)), self.h_min, self.h_max)
        target = self.target_p if target_p is None else float(min(max(target_p, 1e-4), 0.9999))
        t_raw = min(max(self.raw_target(target), 1e-4), 1 - 1e-4)
        L = (o0 - math.log(t_raw / (1 - t_raw))) / a
        interval = np.clip(np.expm1(np.clip(L, 0.0, 20.0)), 0.0, self.h_max)
        out = []
        for i in range(len(seen)):
            out.append({
                "recallRaw": round(float(p_raw[i]), 4),
                "recall": round(float(p[i]), 4),
                "halfLifeDays": round(float(half[i]), 2),
                "intervalDays": round(float(interval[i]), 2),
                "forget": bool(p[i] < self.threshold),
            })
        return out

    def info(self) -> dict:
        return {
            "name": self.name, "key": self.key, "curve": self.curve, "calibrated": self.calibrated,
            "threshold": round(self.threshold, 4), "targetP": self.target_p, "hMaxDays": self.h_max,
            "testLogLoss": self.test_metrics.get("LogLoss"), "baselineLogLoss": self.baseline_logloss,
            "testRocAuc": self.test_metrics.get("ROC_AUC"),
        }


_model: Optional[HlrModel] = None


def get(path: Optional[Path] = None) -> Optional[HlrModel]:
    global _model
    if _model is not None:
        return _model
    path = DATA_FILE if path is None else path
    with _lock:
        if _model is None and path.exists():
            with path.open(encoding="utf-8") as f:
                _model = HlrModel(json.load(f))
    return _model


def set_model(m: Optional[HlrModel]) -> None:
    """Cho test."""
    global _model
    with _lock:
        _model = m


def available() -> bool:
    return get() is not None
