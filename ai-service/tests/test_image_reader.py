import io
import os

import pytest
from PIL import Image

from app.core.config import settings
from app.extract import gemini
from app.extract.readers import OcrUnavailable, TextResult
from app.extract.readers import image_reader

KEYS = ("level", "page_num", "block_num", "par_num", "line_num", "word_num",
        "left", "top", "width", "height", "conf", "text")


def _data(words):
    """words: (block, par, line, left, top, width, height, conf, text) → DICT như pytesseract."""
    d = {k: [] for k in KEYS}
    for i, (b, p, l, x, y, w, h, c, t) in enumerate(words):
        d["level"].append(5); d["page_num"].append(1); d["block_num"].append(b); d["par_num"].append(p)
        d["line_num"].append(l); d["word_num"].append(i + 1); d["left"].append(x); d["top"].append(y)
        d["width"].append(w); d["height"].append(h); d["conf"].append(c); d["text"].append(t)
    return d


# Bản ngang: 1 dòng, conf 70 → thấp
HORIZONTAL = _data([
    (1, 1, 1, 10, 10, 60, 30, 70, "日本語の"),
    (1, 1, 1, 70, 10, 40, 30, 70, "勉強"),
    (1, 1, 2, 10, 50, 40, 30, -1, ""),
])
# Bản dọc: block 1 bên phải (x=300) có cột "日本語" + cột furigana nhỏ "にほんご" (rộng 10 < 60% của 30),
# block 2 bên trái (x=100) "勉強するのが好きです"; dòng "***" không phải tiếng Nhật, conf thấp → nhiễu
VERTICAL = _data([
    (2, 1, 1, 100, 10, 30, 300, 90, "勉強するのが好きです"),
    (1, 1, 1, 300, 10, 30, 90, 92, "日本語"),
    (1, 1, 2, 332, 10, 10, 90, 95, "にほんご"),
    (2, 1, 2, 60, 10, 30, 40, 20, "***"),
])


def _png(w=50, h=50) -> bytes:
    buf = io.BytesIO()
    Image.new("L", (w, h), 255).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def fake_tesseract(monkeypatch):
    import pytesseract
    calls = []

    def fake_image_to_data(img, lang="", config="", output_type=None, timeout=0):
        calls.append((lang, config))
        return VERTICAL if lang == "jpn_vert" else HORIZONTAL

    monkeypatch.setattr(pytesseract, "image_to_data", fake_image_to_data)
    monkeypatch.setattr(image_reader, "available", lambda: True)
    monkeypatch.setattr(image_reader, "languages", lambda: {"jpn", "jpn_vert"})
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    return calls


def test_auto_picks_vertical_orders_right_to_left_and_drops_furigana(fake_tesseract):
    r = image_reader.read_image(_png(), "auto")
    # hai lượt chạy song song nên thứ tự ghi nhận không cố định
    assert sorted(fake_tesseract) == [("jpn", "--psm 6"), ("jpn_vert", "--psm 5")]
    assert r.engine == "tesseract" and r.source_type == "image"
    assert r.is_vertical is True
    assert r.text == "日本語\n勉強するのが好きです"   # cột phải (x=300) trước cột trái (x=100)
    assert [b.text for b in r.blocks] == ["日本語", "勉強するのが好きです"]
    assert all(b.is_vertical for b in r.blocks)
    assert r.blocks[0].rubies == [{"base": "日本語", "reading": "にほんご"}]
    assert r.blocks[0].lines == [{"text": "日本語", "conf": 0.92}]          # conf từng dòng cho FE soát
    assert r.blocks[0].to_dict()["lines"] == [{"text": "日本語", "conf": 0.92}]
    assert r.mean_confidence == pytest.approx(0.91)  # (92+90)/2, furigana và nhiễu không tính
    assert r.low_confidence is False


def test_horizontal_mode_low_confidence_without_gemini(fake_tesseract):
    r = image_reader.read_image(_png(), "horizontal")
    assert [c[0] for c in fake_tesseract] == ["jpn"]
    assert r.is_vertical is False
    assert r.text == "日本語の勉強"
    assert r.mean_confidence == pytest.approx(0.70)
    assert r.low_confidence is True
    assert r.engine == "tesseract"


def test_gemini_fallback_when_low_confidence(fake_tesseract, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    seen = {}

    def fake_vision(image_bytes, mime, mode):
        seen.update(mime=mime, mode=mode)
        return "日本語の勉強は面白い。\n\n漢字を練習する。"

    monkeypatch.setattr(gemini, "vision_transcribe", fake_vision)
    r = image_reader.read_image(_png(), "horizontal")
    assert seen == {"mime": "image/png", "mode": "horizontal"}
    assert r.engine == "gemini"
    assert r.low_confidence is False
    assert r.mean_confidence is None                  # conf của Tesseract không nói gì về văn bản Gemini
    assert [b.text for b in r.blocks] == ["日本語の勉強は面白い。", "漢字を練習する。"]


def test_gemini_output_far_longer_than_tesseract_is_flagged(fake_tesseract, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(gemini, "vision_transcribe", lambda *a: "日本語" * 20)   # 60 ký tự so với 6 của Tesseract
    r = image_reader.read_image(_png(), "horizontal")
    assert r.engine == "gemini" and r.low_confidence is True


def test_gemini_output_without_japanese_keeps_tesseract(fake_tesseract, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(gemini, "vision_transcribe", lambda *a: "I cannot see any text.")
    r = image_reader.read_image(_png(), "horizontal")
    assert r.engine == "tesseract" and r.text == "日本語の勉強" and r.low_confidence is True


def test_gemini_failure_keeps_tesseract_result(fake_tesseract, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    def boom(*a, **k):
        raise gemini.GeminiError("quota")
    monkeypatch.setattr(gemini, "vision_transcribe", boom)
    r = image_reader.read_image(_png(), "horizontal")
    assert r.engine == "tesseract" and r.low_confidence is True
    assert r.to_dict()["meta"]["geminiError"] == "quota"   # FE báo "AI hết hạn mức" thay vì im lặng


def test_ocr_pages_reports_first_gemini_error(monkeypatch):
    def fake_read(data, mode, page=1, fallback_confidence=None):
        return TextResult(text="ページ", source_type="image", engine="tesseract", pages=1,
                          gemini_error="quota" if page == 2 else None)
    monkeypatch.setattr(image_reader, "read_image", fake_read)
    src = TextResult(text="", source_type="pdf", engine="pdf-text", pages=2, needs_ocr=True,
                     page_images=[_png(), _png()])
    assert image_reader.ocr_pages(src, "auto").gemini_error == "quota"


def test_ocr_unavailable(monkeypatch):
    monkeypatch.setattr(image_reader, "available", lambda: False)
    monkeypatch.setattr(image_reader.gemini, "available", lambda: False)
    with pytest.raises(OcrUnavailable):
        image_reader.read_image(_png(), "auto")


def test_gemini_only_when_tesseract_missing(monkeypatch):
    # Không có Tesseract nhưng có key -> chép bằng Gemini Vision, không báo 503
    monkeypatch.setattr(image_reader, "available", lambda: False)
    monkeypatch.setattr(image_reader.gemini, "available", lambda: True)
    two_paras = "日本語の文" + chr(10) * 2 + "二段目"
    monkeypatch.setattr(image_reader.gemini, "vision_transcribe", lambda data, mime, mode: two_paras)
    r = image_reader.read_image(_png(), "vertical")
    assert r.engine == "gemini" and r.low_confidence is False and r.is_vertical is True
    assert r.text == two_paras and len(r.blocks) == 2
    # Gemini lỗi (quota) -> 503 có lý do
    def boom(data, mime, mode):
        raise image_reader.gemini.GeminiError("quota")
    monkeypatch.setattr(image_reader.gemini, "vision_transcribe", boom)
    with pytest.raises(OcrUnavailable, match="quota"):
        image_reader.read_image(_png(), "auto")


def test_corrupt_image_is_reader_error(monkeypatch):
    from app.extract.readers import ReaderError
    monkeypatch.setattr(image_reader, "available", lambda: True)
    with pytest.raises(ReaderError):
        image_reader.read_image(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, "auto")


def test_ocr_pages_merges(monkeypatch):
    seen_thresholds = []

    def fake_read(data, ocr_mode="auto", page=1, fallback_confidence=None):
        seen_thresholds.append(fallback_confidence)
        if page == 1:
            return TextResult(text="一ページ", source_type="image", engine="tesseract", pages=1,
                              blocks=[image_reader.Block(text="一ページ")], mean_confidence=0.9, is_vertical=True)
        return TextResult(text="二ページ", source_type="image", engine="gemini", pages=1,
                          blocks=[image_reader.Block(text="二ページ")], mean_confidence=0.7, is_vertical=False,
                          low_confidence=False)
    monkeypatch.setattr(image_reader, "read_image", fake_read)
    src = TextResult(text="", source_type="pdf", engine="pdf-text", pages=2, needs_ocr=True,
                     page_images=[_png(), _png()], truncated=True, truncated_pages=3)
    r = image_reader.ocr_pages(src, "auto", fallback_confidence=0.5)
    assert seen_thresholds == [0.5, 0.5]           # ngưỡng của request tới được từng trang
    assert r.truncated is True and r.truncated_pages == 3
    assert r.source_type == "pdf" and r.pages == 2
    assert r.text == "一ページ\n\n二ページ"
    assert [b.page for b in r.blocks] == [1, 2]
    assert r.mean_confidence == pytest.approx(0.8)
    assert r.engine == "gemini"
    assert r.is_vertical is True   # hoà → True
    assert r.low_confidence is False


def test_preprocess_flattens_transparent_png_onto_white():
    img = Image.new("RGBA", (40, 40), (0, 0, 0, 0))         # nền trong suốt dạng (0,0,0,0)
    for x in range(10, 20):
        for y in range(10, 20):
            img.putpixel((x, y), (0, 0, 0, 255))            # nét chữ đen đục
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out, _ = image_reader._preprocess(buf.getvalue())
    assert out.mode == "L"
    s = out.width / 40                      # _preprocess phóng to ảnh nhỏ → quy đổi toạ độ
    assert out.getpixel((int(2 * s), int(2 * s))) > 200     # nền phải trắng, không phải đen
    assert out.getpixel((int(15 * s), int(15 * s))) < 60    # nét chữ vẫn đen


def test_image_text_is_nfkc_normalized(monkeypatch):
    import pytesseract
    data = _data([(1, 1, 1, 10, 10, 200, 30, 90, "ＡＢＣ１２３ﾆﾎﾝｺﾞ")])
    monkeypatch.setattr(pytesseract, "image_to_data", lambda *a, **k: data)
    monkeypatch.setattr(image_reader, "available", lambda: True)
    monkeypatch.setattr(image_reader, "languages", lambda: {"jpn", "jpn_vert"})
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = image_reader.read_image(_png(), "horizontal")
    assert r.text == "ABC123ニホンゴ"
    assert r.blocks[0].text == "ABC123ニホンゴ"


def _text_image(angle: float = 0.0) -> Image.Image:
    """Ảnh 'chữ' giả: các vạch ngang đen như dòng text, xoay angle độ (ngược chiều kim đồng hồ)."""
    img = Image.new("L", (600, 400), 255)
    px = img.load()
    for row in range(60, 340, 40):
        for y in range(row, row + 14):
            for x in range(60, 540):
                px[x, y] = 0
    return img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)


def test_flatten_background_removes_shadow_gradient():
    img = Image.new("L", (400, 200), 255)
    px = img.load()
    for x in range(400):                      # nền sáng dần từ 90 (trái) tới 255 (phải), chữ đen ở giữa
        for y in range(200):
            px[x, y] = 90 + (255 - 90) * x // 399
    for x in range(180, 220):
        for y in range(90, 110):
            px[x, y] = 0
    out = image_reader._flatten_background(img)
    assert out.getpixel((10, 100)) > 230 and out.getpixel((390, 100)) > 230   # nền hai bên đều trắng
    assert out.getpixel((200, 100)) < 40                                       # chữ vẫn đen


def test_furigana_line_with_punctuation_is_dropped():
    d = _data([
        (1, 1, 1, 10, 10, 60, 14, 85, "みなみ。しつもん"),   # hàng furigana (cao 14) có dấu câu đọc nhầm
        (1, 1, 2, 10, 30, 200, 40, 92, "南が質問です"),
    ])
    lines, rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False))
    assert [ln.text for ln in lines] == ["南が質問です"]
    assert rubies == []


def _two_col_image(gutter_w: int) -> Image.Image:
    """Hai khối 'chữ' (vạch ngang cao 20) rộng 300 px cách nhau gutter_w px."""
    img = Image.new("L", (640 + gutter_w, 300), 255)
    px = img.load()
    for x0 in (20, 320 + gutter_w):
        for row in range(30, 270, 50):
            for y in range(row, row + 20):
                for x in range(x0, x0 + 300):
                    px[x, y] = 0
    return img


def test_column_gutter_found_only_when_wide_enough():
    assert image_reader._column_gutter(_two_col_image(60)) is not None       # 3 × chiều cao dòng
    assert image_reader._column_gutter(_two_col_image(10)) is None           # 0.5 × → không phải 2 cột
    assert image_reader._column_gutter(_text_image(0.0)) is None


def test_two_columns_are_read_left_then_right(monkeypatch):
    import pytesseract
    seen = []

    def fake_data(img, lang="", config="", output_type=None, timeout=0):
        seen.append(img.width)
        # nửa trái có mực từ x=20, nửa phải (cắt tại 350) có mực từ x=30 → pixel (25, 40) đen chỉ ở nửa trái
        text = "左の列です" if img.getpixel((25, 40)) == 0 else "右の列です"
        return _data([(1, 1, 1, 10, 10, 200, 30, 90, text)])

    monkeypatch.setattr(pytesseract, "image_to_data", fake_data)
    monkeypatch.setattr(image_reader, "available", lambda: True)
    monkeypatch.setattr(image_reader, "languages", lambda: {"jpn", "jpn_vert"})
    monkeypatch.setattr(image_reader, "_preprocess", lambda data: (_two_col_image(60), "image/png"))
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = image_reader.read_image(_png(), "horizontal")
    assert len(seen) == 2 and sorted(seen) == [350, 350]     # cắt đúng giữa rãnh
    assert r.text == "左の列です\n右の列です"
    assert r.mean_confidence == pytest.approx(0.9)


def test_skew_angle_detects_small_tilt():
    assert abs(image_reader._skew_angle(_text_image(0.0))) < 0.3
    assert abs(image_reader._skew_angle(_text_image(3.0)) - (-3.0)) <= 0.5   # xoay ngược để sửa
    assert abs(image_reader._skew_angle(_text_image(-2.5)) - 2.5) <= 0.5


def test_deskew_leaves_straight_image_untouched():
    img = _text_image(0.0)
    assert image_reader._deskew(img) is img


def test_low_score_triggers_osd_and_reocr(monkeypatch):
    import pytesseract
    bad = _data([(1, 1, 1, 10, 10, 20, 30, 20, "日"), (1, 1, 2, 10, 50, 20, 30, 25, "本")])   # vụn, conf thấp
    good = _data([(1, 1, 1, 10, 10, 200, 30, 90, "日本語の勉強")])
    calls = {"data": 0, "osd": 0}

    def fake_data(img, lang="", config="", output_type=None, timeout=0):
        calls["data"] += 1
        return bad if calls["data"] <= 2 else good       # 2 lượt đầu (trước xoay) kém, sau xoay tốt

    monkeypatch.setattr(pytesseract, "image_to_data", fake_data)
    monkeypatch.setattr(pytesseract, "image_to_osd", lambda *a, **k: (calls.__setitem__("osd", calls["osd"] + 1)
                                                                      or "Orientation in degrees: 180\nRotate: 180\n"))
    monkeypatch.setattr(image_reader, "available", lambda: True)
    monkeypatch.setattr(image_reader, "languages", lambda: {"jpn", "jpn_vert", "osd"})
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = image_reader.read_image(_png(), "auto")
    assert calls["osd"] == 1 and calls["data"] == 4
    assert r.text == "日本語の勉強" and r.mean_confidence == pytest.approx(0.9)


def test_good_score_skips_osd(fake_tesseract, monkeypatch):
    import pytesseract
    monkeypatch.setattr(pytesseract, "image_to_osd", lambda *a, **k: pytest.fail("không được gọi OSD"))
    image_reader.read_image(_png(), "auto")


# --- Tesseract thật (bỏ qua khi máy không cài) -------------------------------

_FONTS = ["C:/Windows/Fonts/msgothic.ttc", "C:/Windows/Fonts/meiryo.ttc",
          "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]


def _render(text: str) -> bytes:
    from PIL import ImageDraw, ImageFont
    font_path = next((f for f in _FONTS if os.path.exists(f)), None)
    if font_path is None:
        pytest.skip("Không có font tiếng Nhật")
    font = ImageFont.truetype(font_path, 40)
    img = Image.new("L", (900, 160), 255)
    ImageDraw.Draw(img).text((30, 50), text, font=font, fill=0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.skipif(not image_reader.available(), reason="Tesseract chưa cài")
def test_real_tesseract_horizontal(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    r = image_reader.read_image(_render("日本語の勉強はとても面白いです。"), "horizontal")
    assert r.engine == "tesseract"
    assert "勉強" in r.text
    assert r.mean_confidence is not None and r.mean_confidence > 0.5


def test_adjacent_latin_words_keep_a_space_but_japanese_words_join():
    # Bảng song ngữ: Tesseract jpn tách đúng từng từ tiếng Anh, chỉ là trước đây bị nối liền "metmoneyfrom…"
    d = _data([(1, 1, 1, 0, 0, 40, 30, 80, "銀行"), (1, 1, 1, 40, 0, 20, 30, 80, "で"),
               (1, 1, 1, 60, 0, 30, 30, 80, "met"), (1, 1, 1, 90, 0, 50, 30, 80, "money"),
               (1, 1, 1, 140, 0, 20, 30, 80, "2"), (1, 1, 1, 160, 0, 40, 30, 80, "預け"),
               (1, 1, 1, 200, 0, 20, 30, 80, "る")])
    [line] = image_reader._lines_from_data(d, False)
    assert line.text == "銀行でmet money 2預ける"


def test_gemini_output_absurdly_long_is_rejected(fake_tesseract, monkeypatch):
    # Gemini suy thoái sinh hàng chục nghìn ký tự cho một trang (thấy thật 14/10): giữ bản Tesseract, không để
    # một trang rác chiếm hết giới hạn 50 000 ký tự của cả tài liệu
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(gemini, "vision_transcribe", lambda *a: "日本語の勉強。" * 1000)   # 7 000 ký tự so với 6
    r = image_reader.read_image(_png(), "horizontal")
    assert r.engine == "tesseract" and r.gemini_error == "implausible"
    assert len(r.text) < 100


# --- B3: furigana Tesseract gộp vào giữa dòng ----------------------------------

def test_inline_furigana_word_is_removed_and_becomes_ruby():
    # Tesseract gộp hàng furigana sát trên vào chính dòng: "がっこう" (cao 14, đáy y=26) nằm trên "学校" (cao 30, đỉnh y=30)
    d = _data([
        (1, 1, 1, 0, 30, 60, 30, 90, "私は"),
        (1, 1, 1, 62, 12, 56, 14, 40, "がっこう"),
        (1, 1, 1, 60, 30, 60, 30, 90, "学校"),
        (1, 1, 1, 120, 30, 150, 30, 90, "に行きます"),
    ])
    lines, rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False), False)
    [line] = lines
    assert line.text == "私は学校に行きます"
    assert line.confs == [90, 90, 90]          # conf thấp của furigana không kéo mean_conf xuống
    assert line.y == 30                        # đỉnh dòng tính lại không còn furigana
    assert rubies == [{"base": "学校", "reading": "がっこう"}]
    blocks, mean_conf, _ = image_reader._assemble(image_reader._lines_from_data(d, False), False, 1)
    assert blocks[0].text == "私は学校に行きます"
    assert blocks[0].rubies == [{"base": "学校", "reading": "がっこう"}]   # gốc là một từ trong dòng
    assert mean_conf == pytest.approx(0.9)


def test_inline_furigana_over_okurigana_word_and_split_mono_ruby():
    # "い" trên 行 của "行き" → gốc có okurigana, reading nối okurigana; がっ|こう Tesseract tách 2 từ trên 学|校 → nối
    d = _data([
        (1, 1, 1, 0, 30, 60, 30, 90, "学校"),
        (1, 1, 1, 2, 12, 26, 14, 50, "がっ"),
        (1, 1, 1, 32, 12, 26, 14, 50, "こう"),
        (1, 1, 1, 60, 30, 30, 30, 90, "に"),
        (1, 1, 1, 90, 30, 60, 30, 90, "行き"),
        (1, 1, 1, 98, 12, 14, 14, 50, "い"),
        (1, 1, 1, 150, 30, 60, 30, 90, "ます"),
    ])
    [line], rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False))
    assert line.text == "学校に行きます"
    assert rubies == [{"base": "学校", "reading": "がっこう"}, {"base": "行き", "reading": "いき"}]


def test_inline_furigana_covering_part_of_word_is_dropped_without_ruby():
    # "にほん" chỉ phủ 日本 trong từ Tesseract "日本語" → cách đọc thiếu ご, không gợi ý ruby sai nhưng vẫn bỏ khỏi văn bản
    d = _data([
        (1, 1, 1, 0, 30, 90, 30, 90, "日本語"),
        (1, 1, 1, 8, 12, 44, 14, 50, "にほん"),
        (1, 1, 1, 90, 30, 60, 30, 90, "です"),
    ])
    [line], rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False))
    assert line.text == "日本語です"
    assert rubies == []


def test_inline_filter_leaves_normal_lines_alone():
    # Kana nhỏ nằm ở đáy dòng (ゃ / っ tách thành từ riêng) không phải furigana; kana cao bình thường cũng giữ nguyên
    d = _data([
        (1, 1, 1, 0, 30, 60, 30, 90, "東京"),
        (1, 1, 1, 60, 44, 16, 16, 80, "っ"),
        (1, 1, 1, 76, 30, 90, 26, 90, "てきます"),
        (1, 1, 2, 0, 80, 60, 30, 90, "勉強"),
        (1, 1, 2, 60, 84, 60, 24, 90, "します"),
    ])
    lines, rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False))
    assert [ln.text for ln in lines] == ["東京ってきます", "勉強します"]
    assert [ln.confs for ln in lines] == [[90, 80, 90], [90, 90]]
    assert rubies == []


def test_inline_furigana_in_vertical_column():
    # Chữ dọc: cỡ chữ = bề rộng; "がっこう" (rộng 12) nằm ngay phải cột "学校" (x 300..330)
    d = _data([
        (1, 1, 1, 300, 10, 30, 60, 90, "学校"),
        (1, 1, 1, 332, 12, 12, 56, 40, "がっこう"),
        (1, 1, 1, 300, 70, 30, 90, 90, "に行く"),
    ])
    [line], rubies = image_reader._filter_lines(image_reader._lines_from_data(d, True), True)
    assert line.text == "学校に行く"
    assert line.x == 330                       # mép phải cột tính lại không còn furigana
    assert rubies == [{"base": "学校", "reading": "がっこう"}]


def test_furigana_line_over_okurigana_word_gives_ruby_hint():
    # Dòng furigana riêng (cơ chế cũ) giờ cũng nhận gốc có okurigana: た trên 食 của "食べる" → 食べる/たべる
    d = _data([
        (1, 1, 1, 6, 10, 14, 14, 85, "た"),
        (1, 1, 2, 0, 30, 90, 30, 92, "食べる"),
    ])
    lines, rubies = image_reader._filter_lines(image_reader._lines_from_data(d, False))
    assert [ln.text for ln in lines] == ["食べる"]
    assert rubies == [{"base": "食べる", "reading": "たべる"}]


def test_read_image_uses_request_fallback_confidence(fake_tesseract, monkeypatch):
    # HORIZONTAL có conf 0.7: ngưỡng mặc định 0.85 → low; ngưỡng request 0.6 → không low, không gọi Gemini
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(gemini, "vision_transcribe", lambda *a: pytest.fail("không được nhờ Gemini"))
    r = image_reader.read_image(_png(), "horizontal", fallback_confidence=0.6)
    assert r.engine == "tesseract" and r.low_confidence is False
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    assert image_reader.read_image(_png(), "horizontal").low_confidence is True
