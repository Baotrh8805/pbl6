"""Tải / chép model tự huấn luyện vào ai-service/models/ theo models/MANIFEST.json (spec 2026-10-27 đêm §9).

    python scripts/fetch_models.py                     # tải các file thiếu / sai sha256 từ url trong MANIFEST
    python scripts/fetch_models.py --from D:/thu-muc   # chép từ thư mục trên máy (ưu tiên hơn url)
    python scripts/fetch_models.py --only vihsd_cnn_lstm.npz
    python scripts/fetch_models.py --phobert-tokenizer # vocab.txt / bpe.codes / config.json từ cache Hugging Face hoặc Hub

Mã thoát 1 khi còn file bắt buộc thiếu. Không bao giờ xoá file đang có.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = Path(os.getenv("MODELS_DIR") or ROOT / "models")
MANIFEST = MODELS_DIR / "MANIFEST.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ok(path: Path, want: str) -> bool:
    return path.exists() and (not want or sha256(path) == want)


def download(url: str, dest: Path) -> None:
    import requests  # noqa: PLC0415

    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0)
        done = 0
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {dest.name}: {done / 1e6:.0f}/{total / 1e6:.0f} MB", end="", flush=True)
        print()
    tmp.replace(dest)


def fetch_files(manifest: dict, src: Path | None, only: str | None) -> int:
    missing = 0
    for item in manifest["files"]:
        name, want = item["name"], item.get("sha256", "")
        if only and only != name:
            continue
        dest = MODELS_DIR / name
        if ok(dest, want):
            print(f"✓ {name} (đã có, sha đúng)")
            continue
        if dest.exists():
            print(f"! {name}: sha256 khác MANIFEST — tải lại")
        cand = src / name if src else None
        if cand and cand.exists():
            shutil.copy2(cand, dest)
            print(f"→ {name}: chép từ {cand}")
        elif item.get("url"):
            print(f"→ {name}: tải {item['url']}")
            download(item["url"], dest)
        else:
            print(f"✗ {name}: thiếu và MANIFEST chưa có url (dùng --from hoặc điền url). {item.get('note', '')}")
            missing += 1
            continue
        if not ok(dest, want):
            print(f"✗ {name}: sha256 sau khi lấy không khớp ({sha256(dest)})")
            missing += 1
    return missing


def fetch_phobert_tokenizer(manifest: dict) -> int:
    spec = manifest.get("phobertTokenizer") or {}
    repo, files = spec.get("repo", "vinai/phobert-base"), spec.get("files", ["vocab.txt", "bpe.codes", "config.json"])
    dest_dir = MODELS_DIR / spec.get("dir", "phobert-base")
    dest_dir.mkdir(parents=True, exist_ok=True)
    need = [f for f in files if not (dest_dir / f).exists()]
    if not need:
        print(f"✓ {dest_dir.name}/ đủ {len(files)} file")
        return 0
    # 1. cache Hugging Face trên máy
    hub = Path(os.getenv("HF_HOME") or Path.home() / ".cache" / "huggingface") / "hub" / ("models--" + repo.replace("/", "--")) / "snapshots"
    for snap in sorted(hub.glob("*")) if hub.exists() else []:
        if all((snap / f).exists() for f in need):
            for f in need:
                shutil.copy2(snap / f, dest_dir / f)
            print(f"→ {dest_dir.name}/: chép {need} từ cache {snap}")
            return 0
    # 2. tải từ Hub
    try:
        from huggingface_hub import hf_hub_download  # noqa: PLC0415
    except ImportError:
        print("✗ thiếu huggingface_hub (cài requirements-ml.txt) để tải tokenizer PhoBERT")
        return 1
    for f in need:
        p = hf_hub_download(repo, f)
        shutil.copy2(p, dest_dir / f)
        print(f"→ {dest_dir.name}/{f}: tải từ Hub")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", help="thư mục có sẵn file model để chép")
    ap.add_argument("--only", help="chỉ một file")
    ap.add_argument("--phobert-tokenizer", action="store_true", help="chỉ lấy tokenizer PhoBERT")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if args.phobert_tokenizer:
        return fetch_phobert_tokenizer(manifest)
    missing = fetch_files(manifest, Path(args.src) if args.src else None, args.only)
    missing += fetch_phobert_tokenizer(manifest)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
