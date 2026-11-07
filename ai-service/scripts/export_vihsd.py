"""Xuất trọng số Keras của ViHSD (best_model_12-0.85.keras) sang models/vihsd_cnn_lstm.npz cho app/moderation/vihsd.py (numpy),
và dựng lại word_index đúng như notebook (fit Tokenizer trên train.csv đã tiền xử lý). Chạy một lần trên máy có TensorFlow:

    python scripts/export_vihsd.py --keras D:/.../best_model_12-0.85.keras --train D:/.../train.csv [--test D:/.../test.csv]

Kết quả: models/vihsd_cnn_lstm.npz (khoá `<tên lớp>__<i>` theo get_weights()), app/moderation/data/vihsd_word_index.json; với --test
in độ chính xác (kỳ vọng ≈ 0,8437) và ghi tests/fixtures/vihsd_reference.json (30 câu: dãy id + xác suất Keras) để test parity.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keras", required=True)
    ap.add_argument("--train", required=True, help="train.csv của ViHSD (free_text, label_id)")
    ap.add_argument("--test", help="test.csv để kiểm độ chính xác + sinh fixture")
    ap.add_argument("--out", default=str(ROOT / "models" / "vihsd_cnn_lstm.npz"))
    args = ap.parse_args()

    import numpy as np  # noqa: PLC0415
    import pandas as pd  # noqa: PLC0415
    import tensorflow as tf  # noqa: PLC0415
    from tensorflow.keras.preprocessing.text import Tokenizer  # noqa: PLC0415

    from app.moderation import preprocess as pp  # noqa: PLC0415

    model = tf.keras.models.load_model(args.keras)
    arrs = {}
    for layer in model.layers:
        for i, w in enumerate(layer.get_weights()):
            arrs[f"{layer.name}__{i}"] = w.astype(np.float32)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out, **arrs)
    print(f"✓ {args.out}: {len(arrs)} mảng, {os.path.getsize(args.out) / 1e6:.1f} MB")

    train = pd.read_csv(args.train).rename(columns={"free_text": "text", "label_id": "label"})
    texts = [pp.preprocess(t) for t in train["text"].astype(str)]
    texts = [t for t in texts if t]
    tk = Tokenizer(num_words=500000, oov_token="<OOV>")
    tk.fit_on_texts(texts)
    pp.WORD_INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    json.dump(tk.word_index, pp.WORD_INDEX_FILE.open("w", encoding="utf-8"), ensure_ascii=False)
    pp.word_index.cache_clear()
    print(f"✓ {pp.WORD_INDEX_FILE}: {len(tk.word_index)} từ (train {len(texts)} dòng)")

    if args.test:
        test = pd.read_csv(args.test).rename(columns={"free_text": "text", "label_id": "label"})
        cleaned = [pp.preprocess(t) for t in test["text"].astype(str)]
        keep = [i for i, t in enumerate(cleaned) if t]
        X = np.asarray([pp.to_sequence(cleaned[i]) for i in keep])
        y = test["label"].astype(int).values[keep]
        P = model.predict(X, batch_size=64, verbose=0)
        print(f"test: {len(keep)} câu, acc Keras {np.mean(P.argmax(1) == y):.4f} (notebook 0,8443)")
        rng = np.random.default_rng(0)
        pick = sorted(set(rng.choice(len(keep), 24, replace=False).tolist()) | set(np.where(y == 2)[0][:3].tolist())
                      | set(np.where(y == 1)[0][:3].tolist()))
        fix = [{"seq": X[i].tolist(), "probs": [round(float(v), 6) for v in P[i]], "label": int(P[i].argmax())} for i in pick]
        out = ROOT / "tests" / "fixtures" / "vihsd_reference.json"
        json.dump(fix, out.open("w", encoding="utf-8"))
        print(f"✓ {out}: {len(fix)} câu")
    return 0


if __name__ == "__main__":
    sys.exit(main())
