"""Tải + chuyển mô hình dịch offline Nhật ↔ Việt cho tab Dịch (dự phòng khi không có bản dịch Gemini, D34).

    python scripts/fetch_offline_mt.py                 # tải facebook/m2m100_418M (MIT, ~1,9 GB) rồi chuyển CTranslate2 int8
    python scripts/fetch_offline_mt.py --drop-source   # xong thì xoá bản PyTorch (mất lớp dự phòng thứ hai, tiết kiệm 1,9 GB)

Kết quả: models/mt/m2m100_418M-ct2/ (model.bin, config.json, shared_vocabulary.*, sentencepiece.bpe.model) — lớp chính của
app/extract/offline_mt.py, chỉ cần ctranslate2 + sentencepiece. Bản PyTorch ở models/mt/m2m100_418M/ là lớp dự phòng khi
CTranslate2 không chạy được (cần torch + transformers) và là nguồn để chuyển lại mà không tải lại. Không commit: ai-service/models/*
nằm trong .gitignore.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MT_DIR = Path(os.getenv("OFFLINE_MT_DIR") or ROOT / "models" / "mt")
REPO = "facebook/m2m100_418M"
SRC = MT_DIR / "m2m100_418M"
OUT = MT_DIR / "m2m100_418M-ct2"
FILES = ["config.json", "generation_config.json", "pytorch_model.bin", "sentencepiece.bpe.model",
         "special_tokens_map.json", "tokenizer_config.json", "vocab.json"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drop-source", action="store_true", help="xoá models/mt/m2m100_418M sau khi chuyển xong")
    args = ap.parse_args()

    if (OUT / "model.bin").exists() and (OUT / "sentencepiece.bpe.model").exists():
        print(f"✓ {OUT} đã có")
    else:
        from huggingface_hub import hf_hub_download  # noqa: PLC0415

        SRC.mkdir(parents=True, exist_ok=True)
        for f in FILES:
            if (SRC / f).exists():
                print(f"✓ {SRC.name}/{f}")
                continue
            try:
                hf_hub_download(REPO, f, local_dir=SRC)
                print(f"→ {SRC.name}/{f}")
            except Exception as exc:  # noqa: BLE001 — generation_config… có thể không có
                print(f"! {SRC.name}/{f}: {exc.__class__.__name__}: {exc}")
                if f in ("config.json", "pytorch_model.bin", "sentencepiece.bpe.model"):
                    return 1
        import ctranslate2.converters as conv  # noqa: PLC0415

        print(f"→ chuyển CTranslate2 int8 → {OUT}")
        conv.TransformersConverter(str(SRC)).convert(str(OUT), quantization="int8", force=True)
        shutil.copy2(SRC / "sentencepiece.bpe.model", OUT / "sentencepiece.bpe.model")
        print(f"✓ {OUT}")
    if args.drop_source and SRC.exists():
        shutil.rmtree(SRC)
        print(f"✓ đã xoá bản PyTorch {SRC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
