"""OCR ảnh bằng Tesseract (jpn / jpn_vert), fallback Gemini Vision khi confidence thấp.

Luồng: Pillow tiền xử lý → pytesseract.image_to_data → gom dòng/khối theo bbox (chữ dọc sắp
cột phải → trái) → loại dòng kana nhỏ (furigana) → mean(conf) < OCR_FALLBACK_CONFIDENCE và có
GEMINI_API_KEY → Gemini chép lại. Không có Tesseract → OcrUnavailable (router trả 503).
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
from app.extract.jachars import has_japanese, has_kanji, is_kana_only, is_kanji
from app.extract.readers import Block, OcrUnavailable, ReaderError, TextResult
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
PAGE_WORKERS = 3           # số trang PDF OCR song song (mỗi trang lại chạy 2 lượt jpn/jpn_vert song song → ≤ 6 tesseract);
                            # đo 20 trang trên máy 4 nhân: 1 worker 44 s, 2 → 35 s, 3 → 22 s, 4 không nhanh hơn
FURIGANA_RATIO = 0.60       # kana nhỏ hơn 60% dòng lân cận → furigana
NOISE_CONF = 60             # dòng không có chữ Nhật và conf < 60 → nhiễu
TESS_TIMEOUT = 120

_JA_LETTERS_RE = re.compile(r"[^ぁ-ゖァ-ヺー一-鿿㐀-䶿々〆ヶ]")   # mọi thứ KHÔNG phải kana/kanji (dấu câu, số, Latin)

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
class _Line:
    block: int
    text: str
    confs: list[float]
    sizes: list[int]          # chiều cao chữ (ngang) hoặc chiều rộng (dọc) từng từ
    x: int
    y: int
    drop: bool = False

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


def _lines_from_data(d: dict, vertical: bool) -> list[_Line]:
    """Gom từ theo (block, par, line); nối không khoảng trắng vì tiếng Nhật (trừ giữa hai từ Latin/số)."""
    groups: dict[tuple, _Line] = {}
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
        size = int(d["width"][i]) if vertical else int(d["height"][i])
        line = groups.get(key)
        if line is None:
            line = groups[key] = _Line(block=key[0], text="", confs=[], sizes=[],
                                       x=int(d["left"][i]), y=int(d["top"][i]))
        if line.text and _is_latin_word_char(line.text[-1]) and _is_latin_word_char(text[0]):
            line.text += " "  # hai từ tiếng Anh liền nhau (bảng song ngữ); chữ Nhật vẫn nối liền
        line.text += text
        line.sizes.append(size)
        if conf >= 0:
            line.confs.append(conf)
        line.x = max(line.x, int(d["left"][i]) + int(d["width"][i])) if vertical else min(line.x, int(d["left"][i]))
        line.y = min(line.y, int(d["top"][i]))
    return list(groups.values())


def _filter_lines(lines: list[_Line]) -> tuple[list[_Line], list[dict]]:
    """Bỏ dòng nhiễu và dòng furigana; trả thêm ruby hint khi furigana đứng cạnh dòng toàn kanji."""
    rubies: list[dict] = []
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
            # chỉ gợi ý ruby khi dòng bên là một từ toàn kanji (độ dài hợp lý), tránh gán sai
            base = next((nb.text for nb in neighbours if has_kanji(nb.text) and all(is_kanji(c) for c in nb.text)
                         and len(nb.text) <= 6 and len(nb.text) <= len(reading) <= 4 * len(nb.text)), None)
            if base:
                rubies.append({"base": base, "reading": reading})
    return [ln for ln in kept if not ln.drop], rubies


def _assemble(lines: list[_Line], vertical: bool, page: int) -> tuple[list[Block], Optional[float], list[dict]]:
    lines, rubies = _filter_lines(lines)
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
        block_rubies = [r for r in rubies if any(r["base"] == l.text for l in group)]
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


def read_image(data: bytes, ocr_mode: str = "auto", page: int = 1) -> TextResult:
    mode = ocr_mode if ocr_mode in ("auto", "vertical", "horizontal") else "auto"
    if not available():
        # Chưa cài Tesseract nhưng có Gemini: chép bằng Gemini Vision luôn, không bắt người dùng cài thêm
        if gemini.available():
            return _gemini_only(data, mode, page)
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
    low = mean_conf is None or mean_conf < settings.OCR_FALLBACK_CONFIDENCE
    result = TextResult(text=text, source_type="image", engine="tesseract", blocks=blocks, pages=1,
                        mean_confidence=mean_conf, is_vertical=vertical, low_confidence=low)

    if low and gemini.available():
        # Gửi ảnh đã khử nền / deskew / xoay đúng hướng thay vì bytes gốc (A/B: CER 0.054 → 0.052, trả lời nhanh hơn)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        try:
            g_text = normalize(gemini.vision_transcribe(buf.getvalue(), "image/png",
                                                       "vertical" if vertical else "horizontal")).strip()
        except gemini.GeminiError as e:
            g_text = ""
            result.gemini_error = e.reason
        if g_text and has_japanese(g_text):
            # Gemini không có confidence riêng; giữ số của Tesseract thì FE hiện "63%" cho văn bản không phải của
            # Tesseract → để None. Chỉ gắn cờ low_confidence khi độ dài lệch hẳn so với bản Tesseract (nghi ảo giác)
            result.text = g_text
            result.engine = "gemini"
            result.blocks = _gemini_blocks(g_text, vertical, page)
            result.mean_confidence = None
            result.low_confidence = not _gemini_plausible(g_text, text)
    return result


def _gemini_plausible(g_text: str, tess_text: str) -> bool:
    """Bản Gemini dài gấp > GEMINI_LEN_RATIO lần (hoặc ngắn hơn 1/GEMINI_LEN_RATIO) bản Tesseract → nghi ngờ."""
    n_g, n_t = len(_JA_LETTERS_RE.sub("", g_text)), len(_JA_LETTERS_RE.sub("", tess_text))
    if n_t == 0:
        return True
    return 1 / GEMINI_LEN_RATIO <= n_g / n_t <= GEMINI_LEN_RATIO


def _gemini_only(data: bytes, mode: str, page: int) -> TextResult:
    _, mime = _preprocess(data)
    vertical = None if mode == "auto" else mode == "vertical"
    try:
        g_text = gemini.vision_transcribe(data, mime, mode)
    except gemini.GeminiError as e:
        raise OcrUnavailable(f"OCR engine unavailable: Gemini lỗi ({e.reason})") from e
    if not g_text.strip():
        raise ReaderError("Gemini không đọc được chữ nào trong ảnh")
    return TextResult(text=normalize(g_text).strip(), source_type="image", engine="gemini",
                      blocks=_gemini_blocks(g_text, vertical, page), pages=1,
                      mean_confidence=None, is_vertical=vertical, low_confidence=False)


def ocr_pages(result: TextResult, ocr_mode: str = "auto") -> TextResult:
    """OCR từng trang PDF scan (result.page_images) và gộp thành một TextResult source_type=pdf."""
    if not result.page_images:
        raise ReaderError("PDF không có trang nào để OCR")
    with ThreadPoolExecutor(max_workers=PAGE_WORKERS) as pool:
        pages: list[TextResult] = list(pool.map(
            lambda ip: read_image(ip[1], ocr_mode, page=ip[0] + 1), enumerate(result.page_images)))
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
        gemini_error=next((pg.gemini_error for pg in pages if pg.gemini_error), None),
    )
