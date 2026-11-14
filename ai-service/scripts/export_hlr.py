"""Xuất bundle HLR (best-halflife-portable.pt, cần torch) sang app/hlr/data/hlr_portable.json cho app/hlr/model.py (numpy) và sinh
tests/fixtures/hlr_reference.json (giá trị tham chiếu tính bằng torch, đúng code notebook) để test parity.

    python scripts/export_hlr.py [--pt models/best-halflife-portable.pt]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pt", default=str(ROOT / "models" / "best-halflife-portable.pt"))
    args = ap.parse_args()
    import numpy as np  # noqa: PLC0415
    import torch  # noqa: PLC0415
    import torch.nn.functional as F  # noqa: PLC0415

    b = torch.load(args.pt, map_location="cpu", weights_only=False)
    sd = b["state_dict"]
    if b["exp"]["curve"] != "logistic" or b["exp"]["arch"] != "mlp" or b["exp"].get("use_ids"):
        raise SystemExit("chỉ hỗ trợ bản portable logistic (arch mlp, không id)")
    cols = b["portable_cols"]
    r7 = lambda t: np.asarray(t).round(7).tolist()  # noqa: E731
    out = {
        "name": b["name"], "key": b["key"], "curve": "logistic", "cols": cols,
        "mu": [float(b["mu"][c]) for c in cols], "sd": [float(b["sd"][c]) for c in cols],
        "layers": [
            {"type": "linear", "w": r7(sd["mlp.0.weight"]), "b": r7(sd["mlp.0.bias"])},
            {"type": "layernorm", "w": r7(sd["mlp.1.weight"]), "b": r7(sd["mlp.1.bias"]), "eps": 1e-5},
            {"type": "gelu"},
            {"type": "linear", "w": r7(sd["mlp.4.weight"]), "b": r7(sd["mlp.4.bias"])},
            {"type": "layernorm", "w": r7(sd["mlp.5.weight"]), "b": r7(sd["mlp.5.bias"]), "eps": 1e-5},
            {"type": "gelu"},
            {"type": "linear", "w": r7(sd["head.weight"]), "b": r7(sd["head.bias"])},
        ],
        "calibrated": bool(b["calibrated"]), "calib_x": r7(b["calib_x"]), "calib_y": r7(b["calib_y"]),
        "threshold": float(b["threshold"]), "target_p": float(b["target_p"]),
        "h_min": float(b["model_cfg"]["h_min"]), "h_max": float(b["model_cfg"]["h_max"]),
        "p_min": float(b["model_cfg"]["p_min"]), "p_max": float(b["model_cfg"]["p_max"]),
        "test_metrics": {k: float(v) for k, v in b["test_metrics"].items()}, "baseline_logloss": float(b["baseline_logloss"]),
    }
    path = ROOT / "app" / "hlr" / "data" / "hlr_portable.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, path.open("w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"✓ {path} ({os.path.getsize(path) / 1024:.0f} KB)")

    def fwd(seen, correct, d):
        hw = seen - correct
        raw = [math.sqrt(1 + correct), math.sqrt(1 + hw), math.log1p(seen), (correct + 1) / (seen + 2)]
        x = torch.tensor([[(r - m) / s for r, m, s in zip(raw, out["mu"], out["sd"])]], dtype=torch.float32)
        h = F.gelu(F.layer_norm(F.linear(x, sd["mlp.0.weight"], sd["mlp.0.bias"]), (256,), sd["mlp.1.weight"], sd["mlp.1.bias"]))
        h = F.gelu(F.layer_norm(F.linear(h, sd["mlp.4.weight"], sd["mlp.4.bias"]), (128,), sd["mlp.5.weight"], sd["mlp.5.bias"]))
        o = F.linear(h, sd["head.weight"], sd["head.bias"])[0]
        a = F.softplus(o[1]) + 1e-3
        p = torch.sigmoid(o[0] - a * math.log1p(d)).clamp(out["p_min"], out["p_max"]).item()
        p_cal = float(np.interp(p, out["calib_x"], out["calib_y"]))
        h_half = torch.expm1((o[0] / a).clamp(0, 20)).clamp(out["h_min"], out["h_max"]).item()
        xs, ys = np.asarray(out["calib_x"]), np.asarray(out["calib_y"])
        i = int(np.searchsorted(ys, out["target_p"], side="left"))
        t_raw = float(xs[min(i, len(xs) - 1)])
        nxt = torch.expm1(((o[0] - math.log(t_raw / (1 - t_raw))) / a).clamp(0, 20)).clamp(max=out["h_max"]).item()
        return dict(seen=seen, correct=correct, deltaDays=d, o0=o[0].item(), o1=o[1].item(), pRaw=p, pCal=p_cal, halfLife=h_half, interval=nxt)

    cases = [(0, 0, 0.001), (1, 1, 1), (3, 1, 3), (3, 3, 3), (10, 8, 3), (30, 29, 3), (14, 14, 60), (5, 0, 0.5), (200, 190, 30), (2, 2, 0.01)]
    fix = ROOT / "tests" / "fixtures" / "hlr_reference.json"
    json.dump([fwd(*c) for c in cases], fix.open("w"), indent=1)
    print(f"✓ {fix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
