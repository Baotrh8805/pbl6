"""Đo chất lượng OCR (CER, tỉ lệ Gemini, thời gian, vocab F1) trên ảnh tổng hợp + ảnh thật.

Chạy (từ thư mục ai-service):
  venv/Scripts/python.exe scripts/ocr_eval.py                 # chỉ Tesseract, không tốn quota Gemini
  venv/Scripts/python.exe scripts/ocr_eval.py --gemini        # có fallback Gemini như production
  venv/Scripts/python.exe scripts/ocr_eval.py --n 3 --only clean_h,skew
  venv/Scripts/python.exe scripts/ocr_eval.py --real tests/fixtures/ocr/real
  venv/Scripts/python.exe scripts/ocr_eval.py --json out.json  # để so sánh trước/sau

Ảnh tổng hợp dựng từ từ vựng JLPT có sẵn (app/extract/data/jlpt) với seed cố định, nên mỗi lần chạy
cho cùng một bộ ảnh. Ảnh thật: thư mục chứa a.png + a.txt (đáp án gõ tay).
A/B một hằng số: dùng --set image_reader.MIN_SHORT_SIDE=1500 (có thể lặp lại cờ).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import random
import statistics
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image, ImageDraw, ImageFont, ImageOps  # noqa: E402

JLPT_DIR = ROOT / "app" / "extract" / "data" / "jlpt"
FONT_CANDIDATES = [
    "C:/Windows/Fonts/msgothic.ttc", "C:/Windows/Fonts/meiryo.ttc", "C:/Windows/Fonts/YuGothR.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]
PARTICLES = ["の", "を", "は", "が", "に", "で", "と"]
CATEGORIES = ["clean_h", "clean_v", "small_text", "skew", "rot90", "rot180", "lowcontrast",
              "shadow", "noise", "furigana", "two_col", "alpha"]


# --- dữ liệu ---------------------------------------------------------------

def load_words() -> list[tuple[str, str]]:
    words: list[tuple[str, str]] = []
    for n in (5, 4, 3):
        with open(JLPT_DIR / f"n{n}.csv", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                expr, reading = row["expression"].strip(), row["reading"].strip()
                if 1 <= len(expr) <= 5 and "～" not in expr and "〜" not in expr and "(" not in expr:
                    words.append((expr, reading))
    return words


def make_line(rng: random.Random, words: list[tuple[str, str]], n_words: int = 4,
              allow_long_mark: bool = True) -> list[tuple[str, str]]:
    """Một dòng = danh sách (từ, cách đọc) xen trợ từ; ground truth = nối các từ."""
    pool = words if allow_long_mark else [w for w in words if "ー" not in w[0]]
    parts: list[tuple[str, str]] = []
    for i in range(n_words):
        parts.append(rng.choice(pool))
        if i < n_words - 1:
            p = rng.choice(PARTICLES)
            parts.append((p, p))
    parts.append(("です。", "です。"))
    return parts


def line_text(parts: list[tuple[str, str]]) -> str:
    return "".join(w for w, _ in parts)


def has_kanji(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in s)


# --- dựng ảnh --------------------------------------------------------------

def get_font(idx: int, size: int):
    paths = [p for p in FONT_CANDIDATES if Path(p).exists()]
    if not paths:
        sys.exit("Không có font tiếng Nhật trên máy (cần msgothic/meiryo/YuGothic/NotoSansCJK)")
    return ImageFont.truetype(paths[idx % len(paths)], size)


def render_h(lines: list[list[tuple[str, str]]], font_idx: int, size: int = 40, furigana: bool = False) -> Image.Image:
    font = get_font(font_idx, size)
    ruby_font = get_font(font_idx, max(8, size // 2))
    gap = int(size * (1.9 if furigana else 1.4))
    width = max(int(sum(font.getlength(w) for w, _ in ln)) for ln in lines) + 2 * size
    img = Image.new("L", (width, gap * len(lines) + size * 2), 255)
    d = ImageDraw.Draw(img)
    for i, ln in enumerate(lines):
        x, y = size, size + i * gap + (size // 2 if furigana else 0)
        for w, r in ln:
            d.text((x, y), w, font=font, fill=0)
            if furigana and has_kanji(w):
                rw = ruby_font.getlength(r)
                d.text((x + (font.getlength(w) - rw) / 2, y - size // 2 - 2), r, font=ruby_font, fill=0)
            x += font.getlength(w)
    return img


def render_v(lines: list[list[tuple[str, str]]], font_idx: int, size: int = 40) -> Image.Image:
    font = get_font(font_idx, size)
    col_w = int(size * 1.6)
    height = max(len(line_text(ln)) for ln in lines) * int(size * 1.15) + 2 * size
    img = Image.new("L", (col_w * len(lines) + 2 * size, height), 255)
    d = ImageDraw.Draw(img)
    for i, ln in enumerate(lines):                 # cột đầu ở bên PHẢI
        x = img.width - size - (i + 1) * col_w + (col_w - size) // 2
        for j, ch in enumerate(line_text(ln)):
            d.text((x, size + j * int(size * 1.15)), ch, font=font, fill=0)
    return img


def render_two_col(left: list, right: list, font_idx: int, size: int = 32) -> Image.Image:
    a, b = render_h(left, font_idx, size), render_h(right, font_idx, size)
    gutter = size * 2
    img = Image.new("L", (a.width + gutter + b.width, max(a.height, b.height)), 255)
    img.paste(a, (0, 0))
    img.paste(b, (a.width + gutter, 0))
    return img


# --- làm hỏng ảnh ----------------------------------------------------------

def d_skew(img: Image.Image, rng: random.Random) -> Image.Image:
    angle = rng.choice([-1, 1]) * rng.uniform(2.0, 5.0)
    return img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)


def d_lowcontrast(img: Image.Image, rng: random.Random) -> Image.Image:
    return img.point(lambda p: 150 + p * 70 // 255)       # 0..255 → 150..220


def d_shadow(img: Image.Image, rng: random.Random) -> Image.Image:
    w, h = img.size
    # xoay khi còn là ảnh vuông 256x256 rồi mới resize, nếu không gradient bị cắt thành bậc thang
    grad = Image.linear_gradient("L").rotate(rng.choice([0, 90, 180, 270])).resize((w, h))
    grad = grad.point(lambda p: 110 + p * 145 // 255)     # 110..255
    from PIL import ImageChops
    return ImageChops.multiply(img, grad)


def d_noise(img: Image.Image, rng: random.Random) -> Image.Image:
    noise = Image.effect_noise(img.size, 28)              # trung bình ~128
    from PIL import ImageChops
    return ImageChops.add(ImageChops.multiply(img, Image.new("L", img.size, 235)), noise, scale=1.0, offset=-96)


def d_lowres(img: Image.Image, rng: random.Random) -> Image.Image:
    return img.resize((max(1, img.width // 3), max(1, img.height // 3)), Image.BILINEAR)


def make_sample(cat: str, idx: int, words: list[tuple[str, str]]) -> tuple[Image.Image, str]:
    rng = random.Random(f"{cat}-{idx}")
    font_idx = idx
    n_lines = rng.choice([3, 4, 5])
    if cat == "clean_v":
        lines = [make_line(rng, words, 3, allow_long_mark=False) for _ in range(rng.choice([3, 4]))]
        return render_v(lines, font_idx), "".join(line_text(ln) for ln in lines)
    if cat == "two_col":
        left = [make_line(rng, words, 3) for _ in range(4)]
        right = [make_line(rng, words, 3) for _ in range(4)]
        return render_two_col(left, right, font_idx), "".join(line_text(ln) for ln in left + right)
    lines = [make_line(rng, words) for _ in range(n_lines)]
    truth = "".join(line_text(ln) for ln in lines)
    if cat == "furigana":
        return render_h(lines, font_idx, furigana=True), truth
    if cat == "small_text":
        return d_lowres(render_h(lines, font_idx), rng), truth
    img = render_h(lines, font_idx)
    if cat == "skew":
        img = d_skew(img, rng)
    elif cat == "rot90":
        img = img.rotate(rng.choice([90, 270]), expand=True)
    elif cat == "rot180":
        img = img.rotate(180, expand=True)
    elif cat == "lowcontrast":
        img = d_lowcontrast(img, rng)
    elif cat == "shadow":
        img = d_shadow(img, rng)
    elif cat == "noise":
        img = d_noise(img, rng)
    elif cat == "alpha":                                   # PNG chữ đen trên nền trong suốt (ảnh chụp màn hình, logo)
        rgba = Image.new("RGBA", img.size, (0, 0, 0, 0))
        rgba.putalpha(ImageOps.invert(img))
        return rgba, truth
    return img, truth


# --- chỉ số ----------------------------------------------------------------

def norm(s: str) -> str:
    return "".join(unicodedata.normalize("NFKC", s).split())


def levenshtein(a: str, b: str) -> int:
    if not a:
        return len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def cer(ref: str, hyp: str) -> float:
    ref, hyp = norm(ref), norm(hyp)
    return levenshtein(ref, hyp) / max(1, len(ref))


def vocab_set(text: str) -> set[str]:
    from app.extract import pipeline
    res = pipeline.analyze(text, None, {"includeGrammar": False})
    return {it["term"] for it in res["items"] if it.get("kind", "vocab") == "vocab"}


def f1(ref: set[str], hyp: set[str]) -> float:
    if not ref and not hyp:
        return 1.0
    tp = len(ref & hyp)
    if tp == 0:
        return 0.0
    p, r = tp / len(hyp), tp / len(ref)
    return 2 * p * r / (p + r)


def pct(vals: list[float], q: float) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[min(len(s) - 1, round(q * (len(s) - 1)))]


# --- chạy ------------------------------------------------------------------

def to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def apply_overrides(pairs: list[str]) -> None:
    """--set image_reader.MIN_SHORT_SIDE=1500 → gán hằng số module (kiểu int/float/str)."""
    import importlib
    for pair in pairs:
        target, _, raw = pair.partition("=")
        mod_name, _, attr = target.rpartition(".")
        mod = importlib.import_module(f"app.extract.readers.{mod_name}" if "." not in mod_name
                                      and mod_name in ("image_reader", "pdf_reader") else mod_name)
        old = getattr(mod, attr)
        val = type(old)(raw) if not isinstance(old, bool) else raw.lower() in ("1", "true", "yes")
        setattr(mod, attr, val)
        print(f"[override] {mod.__name__}.{attr}: {old!r} → {val!r}")


def collect_real(real_dir: Path) -> list[tuple[str, str, bytes, str]]:
    out = []
    for p in sorted(real_dir.iterdir()):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            gt = p.with_suffix(".txt")
            if gt.exists():
                out.append(("real", p.name, p.read_bytes(), gt.read_text(encoding="utf-8")))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=6, help="số ảnh mỗi nhóm tổng hợp")
    ap.add_argument("--only", default="", help="danh sách nhóm, phân tách bằng dấu phẩy")
    ap.add_argument("--gemini", action="store_true", help="cho phép fallback Gemini (tốn quota)")
    ap.add_argument("--real", default="", help="thư mục ảnh thật (a.png + a.txt)")
    ap.add_argument("--mode", default="auto", choices=["auto", "horizontal", "vertical"])
    ap.add_argument("--set", action="append", default=[], metavar="MODULE.ATTR=VALUE")
    ap.add_argument("--save", default="", help="lưu ảnh tổng hợp ra thư mục này để xem bằng mắt")
    ap.add_argument("--json", default="", help="ghi kết quả chi tiết ra file JSON")
    ap.add_argument("--no-vocab", action="store_true", help="bỏ qua vocab F1 (nhanh hơn)")
    args = ap.parse_args()

    from app.core.config import settings
    from app.extract.readers import ReaderError, OcrUnavailable, image_reader

    if not args.gemini:
        settings.GEMINI_API_KEY = ""
    apply_overrides(args.set)
    if not image_reader.available():
        sys.exit("Tesseract không dùng được (đặt TESSERACT_CMD trong .env)")

    cats = [c for c in (args.only.split(",") if args.only else CATEGORIES) if c]
    unknown = [c for c in cats if c not in CATEGORIES]
    if unknown:
        sys.exit(f"Nhóm không tồn tại: {unknown}. Có: {CATEGORIES}")

    samples: list[tuple[str, str, bytes, str]] = []
    words = load_words()
    for cat in cats:
        for i in range(args.n):
            img, truth = make_sample(cat, i, words)
            samples.append((cat, f"{cat}_{i}", to_png(img), truth))
            if args.save:
                Path(args.save).mkdir(parents=True, exist_ok=True)
                img.save(Path(args.save) / f"{cat}_{i}.png")
    if args.real:
        samples += collect_real(Path(args.real))

    rows = []
    for cat, name, png, truth in samples:
        t0 = time.perf_counter()
        try:
            res = image_reader.read_image(png, args.mode)
            text, engine, conf, low = res.text, res.engine, res.mean_confidence, res.low_confidence
        except (ReaderError, OcrUnavailable) as e:
            text, engine, conf, low = "", f"error:{type(e).__name__}", None, True
        dt = time.perf_counter() - t0
        row = {"cat": cat, "name": name, "cer": cer(truth, text), "engine": engine, "conf": conf,
               "low": low, "sec": dt, "len_ref": len(norm(truth)), "len_hyp": len(norm(text)),
               "ref": truth, "hyp": text}
        if not args.no_vocab:
            row["vocab_f1"] = f1(vocab_set(truth), vocab_set(text))
        rows.append(row)
        print(f"  {name:<18} CER={row['cer']:.3f} engine={engine:<9} conf={conf if conf is None else round(conf, 2)} "
              f"{dt:5.1f}s", flush=True)

    def summarize(label: str, rs: list[dict]) -> None:
        cers = [r["cer"] for r in rs]
        gem = sum(1 for r in rs if r["engine"] == "gemini") / len(rs)
        secs = [r["sec"] for r in rs]
        vf = [r["vocab_f1"] for r in rs if "vocab_f1" in r]
        print(f"{label:<14}{len(rs):>4}  CER mean={statistics.fmean(cers):.3f} med={statistics.median(cers):.3f}"
              f"  ≤5%={sum(c <= 0.05 for c in cers) / len(cers):4.0%}  gemini={gem:4.0%}"
              f"  p50={pct(secs, .5):5.1f}s p95={pct(secs, .95):5.1f}s"
              + (f"  vocabF1={statistics.fmean(vf):.3f}" if vf else ""))

    print("\n=== Kết quả" + (" (có Gemini)" if args.gemini else " (chỉ Tesseract)") + " ===")
    for cat in dict.fromkeys(r["cat"] for r in rows):
        summarize(cat, [r for r in rows if r["cat"] == cat])
    summarize("TẤT CẢ", rows)

    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"đã ghi {args.json}")


if __name__ == "__main__":
    main()
