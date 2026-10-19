"""Đọc PDF: pypdf lấy text theo trang; nếu không có text layer (gần như rỗng, < 30 ký tự/trang)
→ coi là scan, render từng trang bằng pypdfium2 (200 dpi, ≤ 20 trang) và
trả needs_ocr=True với page_images để image_reader OCR (giai đoạn 2).

Furigana trong text layer (B3): extract_text() trả cả chữ ruby lẫn vào thân bài ("学校\\nがっこう\\nに行きます")
→ từ điển nhận "がっこう" là một từ riêng và câu bị cắt đôi. Lượt duyệt từng ký tự bằng PdfTextPage (cỡ chữ + hộp chữ)
tìm cụm kana nhỏ nằm sát trên (chữ ngang) / sát phải (chữ dọc) một cụm kanji → bỏ khỏi thân bài, ghi thành
Block.rubies [{"base", "reading"}] như docx_reader. Trang không có furigana / API ký tự lỗi → giữ nguyên extract_text().
Cụm kana gần kanji phía đối diện hơn hẳn (cách đọc in DƯỚI từ trong bảng từ vựng) không phải ruby; cụm một ký tự chỉ thử
theo hướng chữ của trang; quyết định "scan" đếm ký tự trên text layer gốc (trước khi bỏ furigana).
"""
from __future__ import annotations

import bisect
import io
import math
import statistics
from dataclasses import dataclass, field
from typing import Optional

from app.extract.jachars import has_kanji, is_kana, is_kanji
from app.extract.readers import Block, ReaderError, TextResult
from app.extract.readers.text_reader import extract_paren_rubies, normalize

MAX_PAGES = 20
RENDER_DPI = 200
MIN_CHARS_PER_PAGE = 30   # ít hơn mức này (vd. chỉ watermark "Scanned by ...") → coi là scan

FURIGANA_RATIO = 0.7      # kana cỡ < 70% trung vị trang (và < 70% chữ gốc bên dưới) → ứng viên furigana
RUBY_MAX_GAP = 0.5        # khe ruby ↔ chữ gốc ≤ 0.5 × cỡ chữ gốc: ruby nằm sát, không phải dòng chữ nhỏ ở xa
RUBY_MAX_OVERLAP = 0.3    # ruby được lấn xuống chữ gốc ≤ 0.3 × cỡ ruby (hộp chữ "loose" có phần ascent/descent)
RUBY_MIN_COVER = 0.5      # kanji gốc phải chồng ≥ 50% (theo trục dòng) với dải ruby; ruby dài tràn sang kanji bên
                          # cạnh (しょうがっこう 42pt trên 小学校 36pt) chỉ chạm mép chữ đó ~25% nên không kéo nó vào gốc
RUN_MAX_GAP = 0.5         # hai ký tự ruby cách ≤ 0.5 × cỡ ruby mới cùng một cụm (ruby từng chữ がっ|こう vẫn gộp)
MAX_RUBY_PER_KANJI = 4    # mỗi kanji đọc ≤ 4 kana (như image_reader) — dài hơn là ghép nhầm
WORD_GAP = 0.5            # dựng lại văn bản: hai chữ cùng dòng cách > 0.5 × cỡ chữ (chữ Nhật vốn liền nhau) → dấu cách
RUBY_RIVAL_RATIO = 0.5    # kanji phía đối diện cách cụm kana < 0.5 × khe tới gốc → cách đọc in dưới từ khác (_find_base)


@dataclass
class _Char:
    """Một ký tự của PdfTextPage; hộp (left, bottom, right, top) theo toạ độ PDF (y hướng lên)."""
    ch: str
    generated: bool = False          # PDFium tự chèn (xuống dòng / khoảng trắng), không có trên trang
    size: float = 0.0                # cỡ chữ thực = cỡ Tf × hệ số co giãn của ma trận (Tm × CTM)
    left: float = 0.0
    bottom: float = 0.0
    right: float = 0.0
    top: float = 0.0
    # ký tự thật có hình trên trang; tính một lần (mỗi trang duyệt ký tự nhiều lượt, property tốn ~15% thời gian)
    visible: bool = field(init=False)

    def __post_init__(self) -> None:
        self.visible = not self.generated and bool(self.ch) and not self.ch.isspace()


def _render_pages(data: bytes, n_pages: int) -> list[bytes]:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(data)
    images: list[bytes] = []
    try:
        for i in range(min(len(pdf), n_pages)):
            page = pdf[i]
            bitmap = page.render(scale=RENDER_DPI / 72)
            pil = bitmap.to_pil()
            buf = io.BytesIO()
            pil.save(buf, format="PNG")
            images.append(buf.getvalue())
            page.close()
    finally:
        pdf.close()
    return images


# --- Furigana trong text layer ------------------------------------------------

def _page_median(chars: list[_Char]) -> float:
    """Trung vị cỡ chữ của trang, chỉ tính ký tự không phải kana: trang dày kanji (日本語学校 + にほんごがっこう)
    có số ký tự ruby ≥ số ký tự thân bài → trung vị trên mọi ký tự rơi xuống đúng cỡ ruby và không tìm được gì."""
    sizes = [c.size for c in chars if c.visible and c.size > 0 and not is_kana(c.ch)]
    return statistics.median(sizes) if sizes else 0.0


def _is_ruby_candidate(c: _Char, median: float) -> bool:
    return c.visible and is_kana(c.ch) and 0 < c.size < FURIGANA_RATIO * median


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return min(a1, b1) - max(a0, b0)


def _ruby_runs(chars: list[_Char], median: float) -> list[list[int]]:
    """Cụm ký tự kana nhỏ liên tiếp trong luồng văn bản và sát nhau trên trang (chỉ số trong ``chars``).
    Ký tự PDFium chèn (xuống dòng giữa hai ruby không liền nhau) hoặc khoảng cách lớn → cụm mới."""
    runs: list[list[int]] = []
    cur: list[int] = []
    for i, c in enumerate(chars):
        if not _is_ruby_candidate(c, median):
            if cur:
                runs.append(cur)
            cur = []
            continue
        if cur:
            p = chars[cur[-1]]
            gap = max(c.left - p.right, p.left - c.right, c.bottom - p.top, p.bottom - c.top)
            if gap > RUN_MAX_GAP * max(p.size, c.size):
                runs.append(cur)
                cur = []
        cur.append(i)
    if cur:
        runs.append(cur)
    return runs


class _KanjiIndex:
    """Kanji của trang (chỉ kanji mới làm gốc ruby) sắp theo mép trên (gốc dưới ruby ngang) và mép phải (gốc bên trái
    ruby dọc): mỗi cụm ruby chỉ xét kanji trong dải sát mép nó (~một dòng) thay vì cả trang — trang giáo trình dày
    furigana có hàng trăm cụm ruby × hàng nghìn kanji (đo 20 trang dày: 6.9 s → ~3 s, phần lớn còn lại là pypdf).
    Thêm mép dưới / mép trái cho phía đối diện (kanji ngay trên ruby ngang / ngay phải ruby dọc, xem _find_base)."""

    def __init__(self, chars: list[_Char]):
        kanji = [j for j, c in enumerate(chars) if c.visible and is_kanji(c.ch)]
        self.max_size = max((chars[j].size for j in kanji), default=0.0)
        self._edges: dict[str, tuple[list[float], list[int]]] = {}
        for name in ("top", "right", "bottom", "left"):
            idx = sorted(kanji, key=lambda j: getattr(chars[j], name))
            self._edges[name] = ([getattr(chars[j], name) for j in idx], idx)

    def near(self, lo: float, hi: float, vertical: bool, opposite: bool = False) -> list[int]:
        """Kanji có mép phải (dọc) / mép trên (ngang) trong [lo, hi]; ``opposite``: mép trái (dọc) / mép dưới (ngang)."""
        name = ("left" if opposite else "right") if vertical else ("bottom" if opposite else "top")
        keys, idx = self._edges[name]
        return idx[bisect.bisect_left(keys, lo):bisect.bisect_right(keys, hi)]


def _neighbours(chars: list[_Char], index: _KanjiIndex, lo: float, hi: float, edge: float, ruby_size: float,
                vertical: bool, opposite: bool) -> list[tuple[int, float]]:
    """(chỉ số, khe) các kanji đủ lớn để làm gốc của dải ruby [lo, hi] nằm sát mép ``edge`` của nó: phía gốc (dưới ruby
    ngang / trái ruby dọc) hoặc phía đối diện (``opposite``: trên / phải). Khe ∈ [-RUBY_MAX_OVERLAP × cỡ ruby,
    RUBY_MAX_GAP × cỡ kanji] và kanji chồng ≥ RUBY_MIN_COVER với dải ruby theo trục dòng."""
    # khe ∈ [-RUBY_MAX_OVERLAP × cỡ ruby, RUBY_MAX_GAP × cỡ kanji] → mép kanji gần ruby nằm trong dải dưới đây
    if opposite:
        band = (edge - RUBY_MAX_OVERLAP * ruby_size, edge + RUBY_MAX_GAP * index.max_size)
    else:
        band = (edge - RUBY_MAX_GAP * index.max_size, edge + RUBY_MAX_OVERLAP * ruby_size)
    out: list[tuple[int, float]] = []
    for j in index.near(band[0], band[1], vertical, opposite):
        c = chars[j]
        if not ruby_size < FURIGANA_RATIO * c.size:
            continue
        if vertical:
            gap = (c.left - edge) if opposite else (edge - c.right)
        else:
            gap = (c.bottom - edge) if opposite else (edge - c.top)
        if not -RUBY_MAX_OVERLAP * ruby_size <= gap <= RUBY_MAX_GAP * c.size:
            continue
        c0, c1 = (c.bottom, c.top) if vertical else (c.left, c.right)
        if _overlap(c0, c1, lo, hi) >= RUBY_MIN_COVER * min(c1 - c0, hi - lo) > 0:
            out.append((j, gap))
    return out


def _find_base(chars: list[_Char], run: list[int], index: _KanjiIndex, vertical: bool) -> Optional[list[int]]:
    """Chỉ số các ký tự gốc (một cụm kanji liền nhau) ngay dưới ruby (chữ ngang) / ngay trái ruby (chữ dọc).
    Chỉ kanji làm gốc nên ruby tràn mép sang okurigana / trợ từ bên cạnh (しょうがっこう trên 小学校に) không kéo に vào
    gốc; kana xen giữa (取り扱) để lại khe → không phải một cụm.

    Bảng từ vựng in cách đọc DƯỚI từ (学校 24pt, がっこう 12pt ngay dưới, rồi hàng 先生): cách đọc cũng nằm "trên" từ
    của hàng sau trong tầm RUBY_MAX_GAP → bị bỏ khỏi văn bản và gắn nhầm làm ruby cho 先生. Ruby thật nằm sát gốc của nó
    (~0.2 × cỡ gốc); nên nếu phía đối diện (trên ruby ngang / phải ruby dọc) có kanji đủ lớn, cùng dải, gần HƠN HẲN gốc
    vừa chọn (khe < RUBY_RIVAL_RATIO × khe tới gốc) → cụm kana là cách đọc in cạnh từ kia, không phải furigana. Không
    dùng "gần hơn" trần: Word tiếng Nhật mặc định (10.5pt, lưới dòng 18pt, ruby nâng 11pt) để ruby cách gốc ~1.1pt và
    cách dòng trên cũng ~1.1pt — chênh vài phần trăm điểm không nói lên ruby thuộc dòng nào."""
    rs = [chars[i] for i in run]
    ruby_size = max(c.size for c in rs)
    if vertical:
        lo, hi = min(c.bottom for c in rs), max(c.top for c in rs)   # dải ruby theo trục dòng (y)
        edge, back = min(c.left for c in rs), max(c.right for c in rs)   # gốc bên trái; phía đối diện bên phải
    else:
        lo, hi = min(c.left for c in rs), max(c.right for c in rs)
        edge, back = min(c.bottom for c in rs), max(c.top for c in rs)   # gốc bên dưới; phía đối diện bên trên
    found = _neighbours(chars, index, lo, hi, edge, ruby_size, vertical, opposite=False)
    if not found:
        return None
    base_gap = min(g for _, g in found)
    if any(g < RUBY_RIVAL_RATIO * base_gap
           for _, g in _neighbours(chars, index, lo, hi, back, ruby_size, vertical, opposite=True)):
        return None
    picked = [j for j, _ in found]
    # Theo thứ tự đọc: chữ dọc trên → dưới, chữ ngang trái → phải
    picked.sort(key=lambda j: -chars[j].top if vertical else chars[j].left)
    for a, b in zip(picked, picked[1:]):    # gốc phải là một cụm liền, không phải hai chữ rời nhau
        ca, cb = chars[a], chars[b]
        gap = (ca.bottom - cb.top) if vertical else (cb.left - ca.right)
        if gap > RUN_MAX_GAP * max(ca.size, cb.size):
            return None
    return picked


def _is_vertical_run(chars: list[_Char], run: list[int]) -> Optional[bool]:
    """Hướng cụm ruby theo độ trải của tâm ký tự; một ký tự → None (dùng hướng chữ của trang, _page_vertical)."""
    if len(run) < 2:
        return None
    xs = [(chars[i].left + chars[i].right) / 2 for i in run]
    ys = [(chars[i].bottom + chars[i].top) / 2 for i in run]
    return (max(ys) - min(ys)) > (max(xs) - min(xs))


def _same_line(a: _Char, b: _Char, vertical: bool) -> bool:
    """Hai ký tự cùng một dòng (chữ ngang: chồng theo y) / cùng một cột (chữ dọc: chồng theo x)."""
    a0, a1, b0, b1 = (a.left, a.right, b.left, b.right) if vertical else (a.bottom, a.top, b.bottom, b.top)
    span = min(a1 - a0, b1 - b0)
    return span > 0 and _overlap(a0, a1, b0, b1) >= 0.5 * span


def _page_vertical(chars: list[_Char], median: float) -> Optional[bool]:
    """Hướng chữ của trang theo bước tiến của hai ký tự thân bài liền nhau trong luồng văn bản: cùng dòng ngang (chồng
    theo y, không theo x) → phiếu ngang, cùng cột → phiếu dọc; hoà / không có cặp nào → None.

    Cụm ruby một ký tự không tự cho biết hướng; thử cả hai hướng thì trên trang chữ NGANG không có furigana, kana nhỏ
    đứng ngay sau kanji trên cùng dòng (dấu chú thích ア nâng lên, ノ thu nhỏ sau 第一課) qua được phép thử ruby DỌC (mép
    trái chạm mép phải kanji, chồng theo y ≥ 50%) → bị xoá khỏi văn bản, ghi ruby giả và dòng bị cắt đôi."""
    votes = 0
    prev: Optional[_Char] = None
    for c in chars:
        if not c.visible:
            continue                      # ký tự PDFium chèn giữa các ký tự đặt riêng (chữ dọc) không cắt cặp
        if _is_ruby_candidate(c, median):
            prev = None
            continue
        if prev is not None:
            h, v = _same_line(prev, c, False), _same_line(prev, c, True)
            if h != v:
                votes += 1 if v else -1
        prev = c
    return None if votes == 0 else votes > 0


def strip_furigana(chars: list[_Char]) -> Optional[tuple[str, list[dict]]]:
    """Bỏ furigana khỏi văn bản một trang → (văn bản, rubies); None nếu trang không có furigana (giữ extract_text()).

    Hàm thuần trên danh sách ký tự (đã có cỡ chữ + hộp) theo đúng thứ tự PdfTextPage. Văn bản ghép lại theo thứ tự đó,
    bỏ ký tự ruby; chỗ hở để lại: nếu hai ký tự hai bên cùng dòng (ruby chen giữa 学校|がっこう|に行きます vì được vẽ
    sau chữ gốc) thì nối liền, khác dòng thì một lần xuống dòng."""
    median = _page_median(chars)
    if median <= 0:
        return None
    index = _KanjiIndex(chars)
    page_vertical = _page_vertical(chars, median)
    removed: dict[int, bool] = {}         # chỉ số ký tự ruby → cụm dọc?
    rubies: list[dict] = []
    for run in _ruby_runs(chars, median):
        guess = _is_vertical_run(chars, run)
        if guess is None:
            guess = page_vertical          # cụm một ký tự: theo hướng chữ của trang; không rõ hướng → thử cả hai
        for vertical in ((False, True) if guess is None else (guess,)):
            base = _find_base(chars, run, index, vertical)
            if base is None:
                continue
            reading = "".join(chars[i].ch for i in run)
            if len(reading) > MAX_RUBY_PER_KANJI * len(base):
                break
            pair = {"base": normalize("".join(chars[j].ch for j in base)), "reading": normalize(reading)}
            if pair not in rubies:
                rubies.append(pair)
            removed.update((i, vertical) for i in run)
            break
    if not removed:
        return None

    out: list[str] = []
    gap: list[_Char] = []                 # khoảng trắng / xuống dòng kể từ ký tự giữ lại gần nhất
    gap_vertical: Optional[bool] = None   # hướng của ruby đã bỏ trong chỗ hở (None = chỗ hở không có ruby)
    last: Optional[_Char] = None
    for i, c in enumerate(chars):
        if i in removed:
            gap_vertical = removed[i]
            continue
        if not c.visible:
            gap.append(c)
            continue
        if gap_vertical is None:
            out.append("".join(g.ch for g in gap))
        elif last is not None:
            # cùng dòng: bỏ ký tự PDFium chèn quanh ruby, chỉ giữ dấu cách có thật trên trang
            if _same_line(last, c, gap_vertical):
                kept = "".join(g.ch for g in gap if not g.generated and g.ch == " ")
                # nhưng hai chữ cách xa theo trục dòng (các cột của tờ từ vựng: 学校 …… 先生) → một dấu cách như
                # extract_text(), không dính thành "学校先生勉強" cho bộ tách từ
                along = (last.bottom - c.top) if gap_vertical else (c.left - last.right)
                out.append(kept or (" " if along > WORD_GAP * max(last.size, c.size) else ""))
            else:
                out.append("\n")
        out.append(c.ch)
        last, gap, gap_vertical = c, [], None
    if gap_vertical is None:
        out.append("".join(g.ch for g in gap))
    # Ký tự ngoài BMP có thể về dưới dạng hai nửa surrogate (wchar_t 16 bit trên Windows) → ghép lại
    text = "".join(out).encode("utf-16-le", "surrogatepass").decode("utf-16-le", "ignore")
    return text, rubies


def _page_chars(textpage) -> list[_Char]:
    """Đọc ký tự của PdfTextPage. Hộp chữ chỉ đọc khi trang có ứng viên furigana (trang thường chỉ tốn 4 lệnh/ký tự).
    Hộp "loose" (ascent/descent của font × cỡ chữ) thay vì hộp sát nét: không phụ thuộc hình chữ, ruby và gốc so được."""
    import pypdfium2.raw as pdfium_c

    matrix = pdfium_c.FS_MATRIX()
    chars: list[_Char] = []
    for i in range(textpage.count_chars()):
        code = pdfium_c.FPDFText_GetUnicode(textpage, i)
        c = _Char(ch=chr(code) if code else "", generated=pdfium_c.FPDFText_IsGenerated(textpage, i) == 1)
        if not c.generated:
            size = float(pdfium_c.FPDFText_GetFontSize(textpage, i))
            if pdfium_c.FPDFText_GetMatrix(textpage, i, matrix):
                # Nhiều trình tạo PDF đặt "1 Tf" rồi phóng bằng Tm → cỡ Tf không phải cỡ thật
                size *= math.sqrt(abs(matrix.a * matrix.d - matrix.b * matrix.c))
            c.size = size
        chars.append(c)
    median = _page_median(chars)
    if median <= 0 or not any(_is_ruby_candidate(c, median) for c in chars):
        return []
    rect = pdfium_c.FS_RECTF()     # dùng lại một struct: get_charbox() cấp phát mới mỗi lần, chậm trên trang dày
    for i, c in enumerate(chars):
        if c.visible and pdfium_c.FPDFText_GetLooseCharBox(textpage, i, rect):   # ký tự PDFium chèn không cần hộp
            c.left, c.bottom, c.right, c.top = rect.left, rect.bottom, rect.right, rect.top
    return chars


def _furigana_pass(pdf, index: int) -> Optional[tuple[str, list[dict]]]:
    """Văn bản trang ``index`` đã bỏ furigana + rubies; None khi không có furigana hoặc API ký tự lỗi."""
    try:
        page = pdf[index]
        try:
            textpage = page.get_textpage()
            try:
                chars = _page_chars(textpage)
            finally:
                textpage.close()
        finally:
            page.close()
        return strip_furigana(chars) if chars else None
    except Exception:  # noqa: BLE001 - font lạ / trang hỏng: không làm hỏng cả file, giữ extract_text()
        return None


def _visible_chars(text: str) -> int:
    return sum(1 for c in text if not c.isspace())


def _layer_text(raw: str) -> str:
    """Văn bản trang như khi chưa bỏ furigana (normalize → bỏ cách đọc trong ngoặc như các trang khác) — chỉ để đếm."""
    text = normalize(raw).strip()
    return extract_paren_rubies(text)[0] if text else ""


def _open_pdfium(data: bytes):
    try:
        import pypdfium2 as pdfium
        return pdfium.PdfDocument(data)
    except Exception:  # noqa: BLE001 - pypdf đọc được mà PDFium không (hoặc ngược lại) → bỏ lượt furigana
        return None


def read_pdf(data: bytes, ocr_mode: str = "auto") -> TextResult:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise ReaderError("PDF được mã hoá") from exc
        total = len(reader.pages)
    except ReaderError:
        raise
    except Exception as exc:
        raise ReaderError(f"Không đọc được file PDF: {exc}") from exc

    n_pages = min(total, MAX_PAGES)
    blocks: list[Block] = []
    layer_chars = 0                 # ký tự (khác khoảng trắng) của text layer GỐC, kể cả furigana đã bỏ
    pdf, pdf_opened = None, False   # PDFium chỉ mở khi gặp trang đầu tiên có thể có furigana
    try:
        for i in range(n_pages):
            try:
                raw = reader.pages[i].extract_text() or ""
            except Exception:
                raw = ""
            ruby_pairs: list[dict] = []
            layer: Optional[str] = None   # extract_text() gốc khi trang đã bỏ furigana
            # Chỉ trang có cả kanji lẫn kana mới có thể có furigana → PDF tiếng Việt / Anh không tốn lượt từng ký tự
            if has_kanji(raw) and any(is_kana(ch) for ch in raw):
                if not pdf_opened:
                    pdf, pdf_opened = _open_pdfium(data), True
                stripped = _furigana_pass(pdf, i) if pdf is not None else None
                if stripped:
                    layer = raw
                    raw, ruby_pairs = stripped
            text = normalize(raw).strip()
            if text:
                text, rubies = extract_paren_rubies(text)
                blocks.append(Block(text=text, page=i + 1, rubies=ruby_pairs + rubies))
            layer_chars += _visible_chars(text if layer is None else _layer_text(layer))
    finally:
        if pdf is not None:
            pdf.close()
    full = "\n".join(b.text for b in blocks)
    truncated_pages = max(0, total - MAX_PAGES)

    # Chỉ OCR khi text layer gần như rỗng. Không xét tỉ lệ chữ Nhật: PDF tiếng Việt/Anh có chữ thật
    # từng bị coi là scan rồi OCR bằng jpn → văn bản rác khác hẳn file gốc. Đếm trên text layer TRƯỚC khi bỏ furigana:
    # tờ từ vựng ngắn dày ruby (12 từ hai chữ + furigana) chỉ còn < 30 ký tự sau khi bỏ ruby nhưng vẫn là PDF có chữ
    # thật — đếm sau khi bỏ thì nó bị vứt text layer đem OCR (hoặc 503 khi không có OCR).
    if layer_chars < MIN_CHARS_PER_PAGE * n_pages:
        return TextResult(text="", source_type="pdf", engine="pdf-text", blocks=[], pages=n_pages,
                          truncated=truncated_pages > 0, truncated_pages=truncated_pages, needs_ocr=True,
                          page_images=_render_pages(data, n_pages))
    return TextResult(text=full, source_type="pdf", engine="pdf-text", blocks=blocks, pages=n_pages,
                      truncated=truncated_pages > 0, truncated_pages=truncated_pages)
