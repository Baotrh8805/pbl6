"""OCR ảnh bằng Tesseract (jpn / jpn_vert), fallback Gemini Vision khi confidence thấp.

Luồng: Pillow tiền xử lý → pytesseract.image_to_data → gom dòng/khối theo bbox (chữ dọc sắp
cột phải → trái) → loại furigana (từ kana nhỏ chen trong dòng, dòng kana nhỏ) thành ruby hint → mean(conf) <
ngưỡng (theo request, mặc định OCR_FALLBACK_CONFIDENCE) và có GEMINI_API_KEY → Gemini chép lại.
Không có Tesseract → OcrUnavailable (router trả 503).
"""
from __future__ import annotations

import os

import io
import re
import statistics
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings
from app.extract import gemini
from app.extract.jachars import has_japanese, has_kanji, is_kana_only
from app.extract.readers import Block, OcrOverloaded, OcrUnavailable, ReaderError, TextResult
from app.extract.readers.text_reader import normalize

MIN_SHORT_SIDE = 1000
MAX_LONG_SIDE = 4000
BG_DOWNSCALE = 4            # ước lượng nền trên ảnh thu nhỏ 1/4 (đủ mịn cho bóng đổ, ~10-60 ms thay vì 0.2-3 s)
DESKEW_MAX_DEG = 5          # chỉ sửa nghiêng nhỏ; xoay 90/180 do OSD lo
DESKEW_MIN_DEG = 0.3        # dưới mức này coi như thẳng, không xoay (tránh làm mờ ảnh)
DESKEW_THUMB = 800          # cạnh ảnh thu nhỏ khi dò góc
DESKEW_MIN_GAIN = 1.2       # điểm ở góc tốt nhất phải hơn điểm ở 0° ít nhất 20% mới tin là nghiêng
OSD_SCORE_THRESHOLD = 0.5   # điểm hướng tốt nhất dưới mức này → hỏi OSD xem ảnh có bị xoay 90/180 không
GUTTER_MIN_LINES = 1.5      # rãnh trắng rộng ≥ 1.5 lần chiều cao dòng mới coi là 2 cột
ORIENT_FULL_LINE_LEN = 8   # dòng trung vị đạt độ dài này mới được tính trọn mean_conf khi chấm điểm hướng
GEMINI_LEN_RATIO = 3.0      # bản Gemini lệch độ dài quá mức này so với bản Tesseract → low_confidence
GEMINI_REJECT_CHARS = 3000  # dài hơn Tesseract > GEMINI_LEN_RATIO lần VÀ vượt mức này → ảo giác, bỏ bản Gemini
PAGE_WORKERS = 3           # số trang PDF OCR song song (mỗi trang lại chạy 2 lượt jpn/jpn_vert song song → ≤ 6 tesseract);
                            # đo 20 trang trên máy 4 nhân: 1 worker 44 s, 2 → 35 s, 3 → 22 s, 4 không nhanh hơn
FURIGANA_RATIO = 0.60       # kana nhỏ hơn 60% dòng lân cận → furigana
INLINE_RUBY_RATIO = 0.60    # từ kana thấp hơn 60% trung vị các từ có kanji trong cùng dòng → furigana chen dòng
INLINE_RUBY_DIP = 0.35      # đáy furigana ≤ đỉnh chữ gốc + 35% chiều cao gốc (dọc: mép trái ≥ 65% bề rộng gốc)
INLINE_RUBY_EDGE = 0.75     # dải furigana phải tới gần hai đầu phần kanji của từ gốc (≤ 0.75 bề một chữ) mới gợi ý ruby
MAX_READING_PER_KANJI = 4   # gốc n kanji đọc n..4n kana; ngoài khoảng đó là ghép nhầm
NOISE_CONF = 60             # dòng không có chữ Nhật và conf < 60 → nhiễu
TESS_TIMEOUT = 120

_JA_LETTERS_RE = re.compile(r"[^ぁ-ゖァ-ヺー一-鿿㐀-䶿々〆ヶ]")   # mọi thứ KHÔNG phải kana/kanji (dấu câu, số, Latin)
_RUBY_BASE_RE = re.compile(r"([一-鿿㐀-䶿豈-﫿々〆ヶ]{1,6})([ぁ-ゖ]*)")   # gốc ruby: 1–6 kanji + okurigana

_available: Optional[bool] = None
_languages: Optional[set[str]] = None


# --- Tesseract ---------------------------------------------------------------

def _configure() -> None:
    if settings.TESSERACT_CMD:
        import pytesseract

        cmd = settings.TESSERACT_CMD
        # Người dùng hay dán đường dẫn thư mục cài đặt thay vì file .exe -> tự bổ sung
        if os.path.isdir(cmd):
            cmd = os.path.join(cmd, "tesseract.exe" if os.name == "nt" else "tesseract")
        pytesseract.pytesseract.tesseract_cmd = cmd


def languages() -> set[str]:
    global _languages
    if _languages is None:
        try:
            import pytesseract
            _configure()
            _languages = set(pytesseract.get_languages(config=""))
        except Exception:  # noqa: BLE001
            _languages = set()
    return _languages


def available() -> bool:
    """Gọi được binary Tesseract và có traineddata jpn (cache kết quả)."""
    global _available
    if _available is None:
        try:
            import pytesseract
            _configure()
            pytesseract.get_tesseract_version()
            langs = languages()
            _available = ("jpn" in langs) if langs else True  # không liệt kê được → tin là có
        except Exception:  # noqa: BLE001
            _available = False
    return _available


def _preprocess(data: bytes):
    """Grayscale, auto-contrast, phóng to để cạnh ngắn ≥ 1000px (cạnh dài ≤ 4000), khử nhiễu nhẹ."""
    from PIL import Image, ImageFilter, ImageOps
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise ReaderError("Không đọc được file ảnh") from exc
    mime = Image.MIME.get(img.format or "", "image/png")
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        # convert("L") bỏ kênh alpha: pixel trong suốt thường là (0,0,0,0) → nền đen, chữ đen chìm mất
        img = img.convert("RGBA")
        img = Image.alpha_composite(Image.new("RGBA", img.size, (255, 255, 255, 255)), img)
    img = img.convert("L")
    img = _flatten_background(img)
    img = ImageOps.autocontrast(img, cutoff=1)
    w, h = img.size
    scale = max(1.0, MIN_SHORT_SIDE / max(1, min(w, h)))
    scale = min(scale, MAX_LONG_SIDE / max(1, max(w, h)))
    if scale > 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        img = img.filter(ImageFilter.MedianFilter(3))
    return _deskew(img), mime


def _flatten_background(img):
    """Khử bóng đổ / nền không đều: ước lượng nền (max-filter + blur trên bản thu nhỏ 1/4) rồi chia ảnh cho nền.
    Tesseract nhị phân hoá bằng một ngưỡng toàn cục nên ảnh có bóng mất hẳn chữ ở phần tối (đo: shadow CER 0.48 → 0.08)."""
    import numpy as np
    from PIL import Image, ImageFilter
    f = BG_DOWNSCALE
    small = img.resize((max(1, img.width // f), max(1, img.height // f)), Image.BOX)
    bg = small.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(8)).resize(img.size, Image.BILINEAR)
    a = np.asarray(img, dtype=np.float32)
    b = np.maximum(np.asarray(bg, dtype=np.float32), 1.0)
    return Image.fromarray(np.clip(a / b * 255.0, 0, 255).astype("uint8"), "L")


def _skew_angle(img) -> float:
    """Góc nghiêng (độ, dương = ngược chiều kim đồng hồ) trong ±DESKEW_MAX_DEG bằng projection profile:
    thu nhỏ, thử từng góc, góc đúng cho profile hàng/cột "sắc" nhất (phương sai lớn nhất)."""
    import numpy as np
    from PIL import Image
    small = img.copy()
    small.thumbnail((DESKEW_THUMB, DESKEW_THUMB))
    cache: dict[float, float] = {}

    def score(angle: float) -> float:
        if angle not in cache:
            r = small.rotate(angle, resample=Image.BILINEAR, fillcolor=255)
            ink = np.asarray(r) < 128
            cache[angle] = float(max(ink.sum(axis=1).var(), ink.sum(axis=0).var()))
        return cache[angle]

    coarse = max(range(-DESKEW_MAX_DEG, DESKEW_MAX_DEG + 1), key=lambda a: (score(a), -abs(a)))
    fine = [coarse + d / 4 for d in range(-3, 4)]
    best = max(fine, key=lambda a: (score(a), -abs(a)))
    # Chữ dọc cột đơn / bóng đổ cho profile yếu, góc "tốt nhất" chỉ hơn 0° ~1–7%; nghiêng thật hơn ≥60%
    if score(best) < DESKEW_MIN_GAIN * score(0.0):
        return 0.0
    return best


def _deskew(img):
    from PIL import Image
    angle = _skew_angle(img)
    if abs(angle) < DESKEW_MIN_DEG:
        return img
    return img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)


def _osd_rotation(img) -> int:
    """Góc cần xoay (0/90/180/270, theo chiều kim đồng hồ) do Tesseract OSD đề xuất; 0 nếu không rõ/lỗi."""
    import pytesseract
    if "osd" not in languages():
        return 0
    try:
        out = pytesseract.image_to_osd(img, config="--psm 0", timeout=TESS_TIMEOUT)
    except Exception:  # noqa: BLE001 - OSD lỗi (ảnh quá ít chữ...) thì giữ nguyên hướng
        return 0
    m = re.search(r"Rotate:\s*(\d+)", out)
    return int(m.group(1)) % 360 if m else 0


@dataclass
class _Word:
    """Một từ Tesseract (image_to_data level 5): giữ lại hộp để tách furigana bị gộp vào giữa dòng."""
    text: str
    conf: float               # -1 = Tesseract không chấm
    left: int
    top: int
    width: int
    height: int

    def size(self, vertical: bool) -> int:
        """Cỡ chữ: chiều cao (ngang) hoặc chiều rộng (dọc), cùng quy ước với _Line.sizes."""
        return self.width if vertical else self.height

    def span(self, vertical: bool) -> tuple[int, int]:
        """Dải theo trục dòng: chữ ngang theo x, chữ dọc theo y."""
        return (self.top, self.top + self.height) if vertical else (self.left, self.left + self.width)


@dataclass
class _Line:
    block: int
    text: str
    confs: list[float]
    sizes: list[int]          # chiều cao chữ (ngang) hoặc chiều rộng (dọc) từng từ
    x: int
    y: int
    drop: bool = False
    words: list[_Word] = field(default_factory=list)

    @property
    def size(self) -> float:
        return statistics.median(self.sizes) if self.sizes else 0.0

    @property
    def conf(self) -> float:
        return statistics.fmean(self.confs) if self.confs else -1.0


def _run(img, lang: str, psm: int) -> dict:
    import pytesseract
    from pytesseract import Output
    # Đã A/B (scripts/ocr_eval.py): "--oem 1 -c user_defined_dpi=300" không đổi kết quả, "jpn+eng" làm CER tệ hơn
    return pytesseract.image_to_data(img, lang=lang, config=f"--psm {psm}", output_type=Output.DICT,
                                     timeout=TESS_TIMEOUT)


def _is_latin_word_char(c: str) -> bool:
    return c.isascii() and c.isalnum()


def _line_from_words(block: int, words: list[_Word], vertical: bool) -> _Line:
    """Ghép từ thành dòng; nối không khoảng trắng vì tiếng Nhật (trừ giữa hai từ Latin/số).
    x = mép phải xa nhất (dọc, để sắp cột phải → trái) / mép trái gần nhất (ngang); y = đỉnh cao nhất."""
    text = ""
    for w in words:
        if text and _is_latin_word_char(text[-1]) and _is_latin_word_char(w.text[0]):
            text += " "  # hai từ tiếng Anh liền nhau (bảng song ngữ); chữ Nhật vẫn nối liền
        text += w.text
    return _Line(block=block, text=text, confs=[w.conf for w in words if w.conf >= 0],
                 sizes=[w.size(vertical) for w in words],
                 x=max(w.left + w.width for w in words) if vertical else min(w.left for w in words),
                 y=min(w.top for w in words), words=list(words))


def _lines_from_data(d: dict, vertical: bool) -> list[_Line]:
    """Gom từ theo (block, par, line) rồi ghép thành dòng (_line_from_words)."""
    groups: dict[tuple, list[_Word]] = {}
    n = len(d.get("text", []))
    for i in range(n):
        text = normalize((d["text"][i] or "").strip())
        if not text:
            continue
        try:
            conf = float(d["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        key = (int(d["block_num"][i]), int(d["par_num"][i]), int(d["line_num"][i]))
        groups.setdefault(key, []).append(_Word(text=text, conf=conf, left=int(d["left"][i]), top=int(d["top"][i]),
                                                width=int(d["width"][i]), height=int(d["height"][i])))
    return [_line_from_words(key[0], words, vertical) for key, words in groups.items()]


def _ruby_hint(base: str, reading: str) -> Optional[dict]:
    """Ruby hint khi ``base`` là một từ 1–6 kanji (+ okurigana hiragana tuỳ chọn) và cách đọc dài 1–4 kana mỗi kanji.
    Gốc có okurigana (行き + furigana い) → reading nối thêm okurigana (いき): cặp vẫn là mặt chữ ↔ cách đọc của cùng
    một chuỗi, như ruby cả cụm 読み/よみ mà pipeline đã hiểu. Không khớp → None (bỏ furigana nhưng không đoán gốc)."""
    m = _RUBY_BASE_RE.fullmatch(base)
    if not m:
        return None
    kanji, okurigana = m.groups()
    if not len(kanji) <= len(reading) <= MAX_READING_PER_KANJI * len(kanji):
        return None
    return {"base": base, "reading": reading + okurigana}


def _span_overlap(a: tuple[int, int], b: tuple[int, int]) -> int:
    return min(a[1], b[1]) - max(a[0], b[0])


def _sits_over(ruby: _Word, base: _Word, vertical: bool) -> bool:
    """Furigana nằm ngay trên (ngang) / ngay phải (dọc) từ gốc và chồng lên nó theo trục dòng.
    Kana nhỏ trong chữ (ゃ っ ...) nằm ở đáy ô chữ (ngang) / lệch nửa phải ô chữ (dọc) nên không lọt qua."""
    if _span_overlap(ruby.span(vertical), base.span(vertical)) <= 0:
        return False
    if vertical:
        return base.left + (1 - INLINE_RUBY_DIP) * base.width <= ruby.left <= base.left + 2 * base.width
    bottom = ruby.top + ruby.height
    return base.top - base.height <= bottom <= base.top + INLINE_RUBY_DIP * base.height


def _split_inline_rubies(line: _Line, vertical: bool) -> list[dict]:
    """Tesseract hay gộp furigana sát trên chữ gốc vào chính dòng đó (hộp dòng phủ cả hai) → "がっこう学校に行く".
    Từ kana-only thấp hơn INLINE_RUBY_RATIO × trung vị các từ có kanji của dòng, nằm ngay trên (dọc: ngay phải) một từ
    có kanji → bỏ khỏi dòng (sửa lại text / conf / cỡ chữ) và thành ruby hint cho từ đó. Trung vị chỉ tính từ có kanji:
    kana tròn thấp hơn kanji, và khi dòng ít từ chính furigana kéo trung vị cả dòng xuống. Dòng thường giữ nguyên."""
    words = line.words
    kanji_words = [w for w in words if has_kanji(w.text)]
    if len(words) < 2 or not kanji_words:
        return []
    ref = statistics.median(w.size(vertical) for w in kanji_words)
    over: dict[int, tuple[_Word, list[_Word]]] = {}      # id(từ gốc) → (từ gốc, các từ furigana phía trên)
    for w in words:
        if (has_kanji(w.text) or not is_kana_only(_JA_LETTERS_RE.sub("", w.text))
                or w.size(vertical) >= INLINE_RUBY_RATIO * ref):
            continue
        cands = [b for b in kanji_words if _sits_over(w, b, vertical)]
        if cands:
            base = max(cands, key=lambda b: _span_overlap(w.span(vertical), b.span(vertical)))
            over.setdefault(id(base), (base, []))[1].append(w)
    if not over:
        return []
    rubies: list[dict] = []
    for base, rubs in over.values():
        # Ruby từng chữ (がっ trên 学, こう trên 校) Tesseract tách thành nhiều từ → nối theo trục dòng
        rubs.sort(key=lambda r: r.span(vertical)[0])
        reading = "".join(_JA_LETTERS_RE.sub("", r.text) for r in rubs)
        hint = _ruby_hint(base.text, reading)
        if hint:
            # Furigana chỉ phủ một phần phần kanji (にほん trên 日本 của từ 日本語) → cách đọc thiếu, không gợi ý.
            # Ước lượng bề một chữ đều nhau (chữ Nhật toàn khổ) rồi đòi dải furigana chạm gần hai đầu phần kanji
            n_kanji = len(_RUBY_BASE_RE.fullmatch(base.text).group(1))
            b0, b1 = base.span(vertical)
            unit = (b1 - b0) / len(base.text)
            k0, k1 = b0, b0 + n_kanji * unit
            r0, r1 = rubs[0].span(vertical)[0], max(r.span(vertical)[1] for r in rubs)
            if r0 <= k0 + INLINE_RUBY_EDGE * unit and r1 >= k1 - INLINE_RUBY_EDGE * unit:
                rubies.append(hint)
    dropped = {id(r) for _, rubs in over.values() for r in rubs}
    rebuilt = _line_from_words(line.block, [w for w in words if id(w) not in dropped], vertical)
    line.text, line.confs, line.sizes, line.x, line.y, line.words = (
        rebuilt.text, rebuilt.confs, rebuilt.sizes, rebuilt.x, rebuilt.y, rebuilt.words)
    return rubies


def _filter_lines(lines: list[_Line], vertical: bool = False) -> tuple[list[_Line], list[dict]]:
    """Bỏ furigana chen trong dòng, dòng nhiễu và dòng furigana; trả thêm ruby hint khi furigana đứng cạnh một từ
    kanji (có thể kèm okurigana)."""
    rubies: list[dict] = []
    for ln in lines:
        rubies.extend(_split_inline_rubies(ln, vertical))
    for ln in lines:
        if not has_japanese(ln.text) and ln.conf < NOISE_CONF:
            ln.drop = True
    kept = [ln for ln in lines if not ln.drop]
    by_block: dict[int, list[_Line]] = {}
    for ln in kept:
        by_block.setdefault(ln.block, []).append(ln)
    for group in by_block.values():
        for idx, ln in enumerate(group):
            # Tesseract hay gộp cả hàng furigana thành một dòng kèm dấu câu đọc nhầm ("みなみ。しつもん") → bỏ dấu
            # trước khi xét kana-only, nếu không dòng furigana lọt vào văn bản (đo: furigana CER 0.28 → ?)
            reading = _JA_LETTERS_RE.sub("", ln.text)
            if not is_kana_only(reading):
                continue
            neighbours = [group[j] for j in (idx - 1, idx + 1) if 0 <= j < len(group) and group[j] is not ln]
            sizes = [nb.size for nb in neighbours if nb.size > 0 and not is_kana_only(_JA_LETTERS_RE.sub("", nb.text))]
            if not sizes or ln.size >= FURIGANA_RATIO * statistics.median(sizes):
                continue
            ln.drop = True
            # chỉ gợi ý ruby khi dòng bên là một từ kanji (+ okurigana, độ dài hợp lý), tránh gán sai
            hint = next((h for h in (_ruby_hint(nb.text, reading) for nb in neighbours) if h), None)
            if hint:
                rubies.append(hint)
    return [ln for ln in kept if not ln.drop], rubies


def _assemble(lines: list[_Line], vertical: bool, page: int) -> tuple[list[Block], Optional[float], list[dict]]:
    lines, rubies = _filter_lines(lines, vertical)
    blocks_map: dict[int, list[_Line]] = {}
    for ln in lines:
        blocks_map.setdefault(ln.block, []).append(ln)
    ordered: list[tuple[int, list[_Line]]] = []
    for bid, group in blocks_map.items():
        if vertical:
            group.sort(key=lambda l: (-l.x, l.y))   # cột phải → trái, trong cột trên → dưới
        else:
            group.sort(key=lambda l: (l.y, l.x))
        ordered.append((bid, group))
    if vertical:
        ordered.sort(key=lambda bg: (-max(l.x for l in bg[1]), min(l.y for l in bg[1])))
    else:
        ordered.sort(key=lambda bg: bg[0])
    blocks: list[Block] = []
    for bid, group in ordered:
        text = "\n".join(l.text for l in group)
        # ruby của dòng furigana có gốc = cả dòng bên cạnh; ruby chen trong dòng có gốc = một từ trong dòng
        block_rubies = [r for r in rubies if any(r["base"] in l.text for l in group)]
        # conf từng dòng để FE tô dòng nghi sai cho người dùng sửa đúng chỗ (-1 = Tesseract không chấm)
        line_confs = [{"text": l.text, "conf": round(l.conf / 100, 2) if l.confs else None} for l in group]
        blocks.append(Block(text=text, page=page, is_vertical=vertical, rubies=block_rubies, lines=line_confs))
    confs = [c for ln in lines for c in ln.confs]
    mean_conf = round(statistics.fmean(confs) / 100, 4) if confs else None
    return blocks, mean_conf, rubies


def _orientation_score(blocks: list[Block], mean_conf: Optional[float]) -> float:
    if mean_conf is None:
        return -1.0
    lengths = [len(line) for b in blocks for line in b.text.splitlines() if line.strip()]
    if not lengths:
        return -1.0
    # Đo trên bộ ảnh tổng hợp (scripts/ocr_eval.py): đọc đúng hướng cho dòng trung vị ≥ 11 ký tự, đọc sai hướng
    # chỉ 3-5 (mỗi "dòng" = một lát cắt ngang qua các cột) nhưng conf vẫn 0.7-0.85 → phạt theo độ dài dòng
    median_len = statistics.median(lengths)
    return mean_conf * min(1.0, median_len / ORIENT_FULL_LINE_LEN)


def _vertical_lang() -> str:
    # Thiếu jpn_vert thì vẫn thử psm 5 với jpn (kém hơn nhưng không chết)
    return "jpn_vert" if "jpn_vert" in languages() else "jpn"


def _column_gutter(img) -> Optional[int]:
    """Toạ độ x của rãnh trắng tách 2 cột chữ ngang, hoặc None.
    Tesseract gộp 2 cột thành một dòng ở mọi psm vì chữ Nhật không có khoảng trắng giữa từ (đo: two_col CER 0.58).
    Rãnh hợp lệ = dải cột không có mực, rộng ≥ GUTTER_MIN_LINES × chiều cao dòng, nằm trong 1/4–3/4 bề rộng phần có chữ.
    Chữ dọc không bị tách nhầm: khe giữa các cột dọc chỉ ~0.5 cỡ chữ, nhỏ hơn ngưỡng."""
    import numpy as np
    ink = np.asarray(img) < 128
    rows = ink.sum(axis=1) > 0
    cols = ink.sum(axis=0) > 0
    if not rows.any():
        return None
    # chiều cao dòng = độ dài trung vị các đoạn hàng liên tiếp có mực
    edges = np.flatnonzero(np.diff(np.concatenate(([0], rows.astype(np.int8), [0]))))
    run_lengths = edges[1::2] - edges[0::2]
    line_h = float(np.median(run_lengths))
    xs = np.flatnonzero(cols)
    x0, x1 = int(xs[0]), int(xs[-1])
    gaps = np.flatnonzero(np.diff(np.concatenate(([1], cols[x0:x1 + 1].astype(np.int8), [1]))))
    best = None
    for g0, g1 in zip(gaps[0::2], gaps[1::2]):          # (bắt đầu rãnh, kết thúc rãnh) tương đối so với x0
        width = int(g1 - g0)
        centre = x0 + (g0 + g1) / 2
        if width >= GUTTER_MIN_LINES * line_h and x0 + 0.25 * (x1 - x0) <= centre <= x0 + 0.75 * (x1 - x0):
            if best is None or width > best[0]:
                best = (width, int(centre))
    return best[1] if best else None


def _ocr_variant(img, vertical: bool, page: int):
    lang, psm = (_vertical_lang(), 5) if vertical else ("jpn", 6)
    gutter = None if vertical else _column_gutter(img)
    if gutter is None:
        data = _run(img, lang, psm)
        blocks, mean_conf, _ = _assemble(_lines_from_data(data, vertical), vertical, page)
        return blocks, mean_conf
    # 2 cột: OCR từng nửa rồi nối cột trái trước cột phải
    halves = (img.crop((0, 0, gutter, img.height)), img.crop((gutter, 0, img.width, img.height)))
    with ThreadPoolExecutor(max_workers=2) as pool:
        parts = list(pool.map(lambda h: _assemble(_lines_from_data(_run(h, lang, psm), vertical), vertical, page), halves))
    blocks = [b for p in parts for b in p[0]]
    weighted = [(p[1], sum(len(b.text) for b in p[0])) for p in parts if p[1] is not None]
    mean_conf = round(sum(c * n for c, n in weighted) / max(1, sum(n for _, n in weighted)), 4) if weighted else None
    return blocks, mean_conf


def _gemini_blocks(text: str, vertical: Optional[bool], page: int) -> list[Block]:
    paras = [p.strip() for p in normalize(text).split("\n\n") if p.strip()]
    return [Block(text=p, page=page, is_vertical=vertical) for p in paras]


def read_image(data: bytes, ocr_mode: str = "auto", page: int = 1,
               fallback_confidence: Optional[float] = None, gemini_model: Optional[str] = None,
               deadline: Optional[float] = None) -> TextResult:
    """``fallback_confidence``: mean conf Tesseract (0..1) dưới mức này → nhờ Gemini chép lại; None →
    settings.OCR_FALLBACK_CONFIDENCE. Backend gửi theo từng request để chỉnh ngưỡng mà không phải khởi động lại service;
    ``gemini_model`` (model Admin chọn) cũng vậy, None → GEMINI_MODEL. ``deadline``: mốc gemini._now() chung của cả tài liệu
    (read_source tạo); qua mốc đó trang này không nhờ Gemini nữa (gemini_error = "budget")."""
    threshold = settings.OCR_FALLBACK_CONFIDENCE if fallback_confidence is None else fallback_confidence
    mode = ocr_mode if ocr_mode in ("auto", "vertical", "horizontal") else "auto"
    if not available():
        # Chưa cài Tesseract nhưng có Gemini: chép bằng Gemini Vision luôn, không bắt người dùng cài thêm
        if gemini.available():
            return _gemini_only(data, mode, page, gemini_model, deadline)
        raise OcrUnavailable("OCR engine unavailable: chưa cài Tesseract (jpn, jpn_vert) và không có GEMINI_API_KEY")
    img, mime = _preprocess(data)

    def run(im):
        verticals = {"auto": (False, True), "horizontal": (False,), "vertical": (True,)}[mode]
        # auto: chạy 2 lượt song song (mỗi lượt là một tiến trình tesseract riêng) rồi chọn bản đọc tốt hơn.
        # Không dừng sớm sau lượt ngang: trang sách dọc nhiều cột đọc ngang vẫn cho conf ~0.75 và dòng dài = số cột.
        with ThreadPoolExecutor(max_workers=len(verticals)) as pool:
            results = list(pool.map(lambda v: (v, *_ocr_variant(im, v, page)), verticals))
        best = max(results, key=lambda c: _orientation_score(c[1], c[2]))
        return best, _orientation_score(best[1], best[2])

    best, score = run(img)
    if score < OSD_SCORE_THRESHOLD:
        # Ảnh chụp xoay 90/180 không có EXIF: cả hai lượt đều đọc rất kém → hỏi OSD rồi đọc lại, giữ bản tốt hơn
        rot = _osd_rotation(img)
        if rot:
            from PIL import Image
            rotated = img.rotate(-rot, resample=Image.BICUBIC, expand=True, fillcolor=255)
            best2, score2 = run(rotated)
            if score2 > score:
                best, score, img = best2, score2, rotated
    vertical, blocks, mean_conf = best

    text = "\n".join(b.text for b in blocks)
    low = mean_conf is None or mean_conf < threshold
    result = TextResult(text=text, source_type="image", engine="tesseract", blocks=blocks, pages=1,
                        mean_confidence=mean_conf, is_vertical=vertical, low_confidence=low)

    if low and gemini.available():
        # Gửi ảnh đã khử nền / deskew / xoay đúng hướng thay vì bytes gốc (A/B: CER 0.054 → 0.052, trả lời nhanh hơn)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        try:
            g_text = normalize(gemini.vision_transcribe(buf.getvalue(), "image/png",
                                                       "vertical" if vertical else "horizontal",
                                                       model=gemini_model, deadline=deadline)).strip()
        except gemini.GeminiError as e:
            g_text = ""
            result.gemini_error = e.reason
            if e.retryable or e.reason in ("quota", "budget"):
                # Quá tải / hết quota / hết ngân sách: giữ bản Tesseract có đánh dấu (spec 21/10), không làm job thất bại
                result.degraded_pages = 1
                result.degraded_reason = e.reason
        if g_text and has_japanese(g_text) and _gemini_runaway(g_text, text):
            # Model suy thoái (lặp vô tận) sinh hàng chục nghìn ký tự cho một trang -> giữ bản Tesseract
            result.gemini_error = "implausible"
        elif g_text and has_japanese(g_text):
            # Gemini không có confidence riêng; giữ số của Tesseract thì FE hiện "63%" cho văn bản không phải của
            # Tesseract → để None. Chỉ gắn cờ low_confidence khi độ dài lệch hẳn so với bản Tesseract (nghi ảo giác)
            result.text = g_text
            result.engine = "gemini"
            result.blocks = _gemini_blocks(g_text, vertical, page)
            result.mean_confidence = None
            result.low_confidence = not _gemini_plausible(g_text, text)
    return result


def _gemini_runaway(g_text: str, tess_text: str) -> bool:
    """Bản Gemini vừa dài hơn GEMINI_LEN_RATIO lần bản Tesseract vừa vượt GEMINI_REJECT_CHARS ký tự → ảo giác."""
    n_g, n_t = len(_JA_LETTERS_RE.sub("", g_text)), len(_JA_LETTERS_RE.sub("", tess_text))
    return n_g > GEMINI_REJECT_CHARS and n_g > GEMINI_LEN_RATIO * max(n_t, 1)


def _gemini_plausible(g_text: str, tess_text: str) -> bool:
    """Bản Gemini dài gấp > GEMINI_LEN_RATIO lần (hoặc ngắn hơn 1/GEMINI_LEN_RATIO) bản Tesseract → nghi ngờ."""
    n_g, n_t = len(_JA_LETTERS_RE.sub("", g_text)), len(_JA_LETTERS_RE.sub("", tess_text))
    if n_t == 0:
        return True
    return 1 / GEMINI_LEN_RATIO <= n_g / n_t <= GEMINI_LEN_RATIO


def _gemini_only(data: bytes, mode: str, page: int, gemini_model: Optional[str] = None,
                 deadline: Optional[float] = None) -> TextResult:
    _, mime = _preprocess(data)
    vertical = None if mode == "auto" else mode == "vertical"
    try:
        g_text = gemini.vision_transcribe(data, mime, mode, model=gemini_model, deadline=deadline)
    except gemini.GeminiError as e:
        if e.retryable or e.reason in ("quota", "budget"):
            # Không có Tesseract để hạ cấp: báo quá tải để backend không tính lượt (spec 21/10)
            raise OcrOverloaded(f"OCR engine unavailable: Gemini quá tải ({e.reason})") from e
        raise OcrUnavailable(f"OCR engine unavailable: Gemini lỗi ({e.reason})") from e
    if not g_text.strip():
        raise ReaderError("Gemini không đọc được chữ nào trong ảnh")
    return TextResult(text=normalize(g_text).strip(), source_type="image", engine="gemini",
                      blocks=_gemini_blocks(g_text, vertical, page), pages=1,
                      mean_confidence=None, is_vertical=vertical, low_confidence=False)


def ocr_pages(result: TextResult, ocr_mode: str = "auto", fallback_confidence: Optional[float] = None,
              gemini_model: Optional[str] = None, deadline: Optional[float] = None) -> TextResult:
    """OCR từng trang PDF scan (result.page_images) và gộp thành một TextResult source_type=pdf. ``deadline``: ngân sách
    Gemini chung cho mọi trang (xem read_image)."""
    if not result.page_images:
        raise ReaderError("PDF không có trang nào để OCR")
    with ThreadPoolExecutor(max_workers=PAGE_WORKERS) as pool:
        pages: list[TextResult] = list(pool.map(
            lambda ip: read_image(ip[1], ocr_mode, page=ip[0] + 1, fallback_confidence=fallback_confidence,
                                  gemini_model=gemini_model, deadline=deadline),
            enumerate(result.page_images)))
    blocks: list[Block] = []
    for i, pg in enumerate(pages):
        for b in pg.blocks:
            b.page = i + 1
            blocks.append(b)
    confs = [pg.mean_confidence for pg in pages if pg.mean_confidence is not None]
    verticals = [pg.is_vertical for pg in pages if pg.is_vertical is not None]
    return TextResult(
        text="\n\n".join(pg.text for pg in pages if pg.text.strip()),
        source_type="pdf",
        # có trang nào phải nhờ Gemini thì ghi "gemini" để biết văn bản không thuần Tesseract
        engine="gemini" if any(pg.engine == "gemini" for pg in pages) else "tesseract",
        blocks=blocks,
        pages=result.pages or len(pages),
        mean_confidence=round(statistics.fmean(confs), 4) if confs else None,
        is_vertical=(sum(verticals) * 2 >= len(verticals)) if verticals else None,
        low_confidence=any(pg.low_confidence for pg in pages),
        truncated=result.truncated,
        truncated_pages=result.truncated_pages,
        gemini_error=next((pg.gemini_error for pg in pages if pg.gemini_error), None),
        degraded_pages=sum(pg.degraded_pages for pg in pages),
        degraded_reason=next((pg.degraded_reason for pg in pages if pg.degraded_reason), None),
    )
