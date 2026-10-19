import io

import pytest
from pypdf import PdfReader, PdfWriter

from app.extract.readers import OcrUnavailable, read_source
from app.extract.readers.pdf_reader import read_pdf
from app.extract.readers.text_reader import normalize


def _blank_pdf(pages: int = 2) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_pdf_without_text_layer_is_flagged_for_ocr_with_rendered_pages():
    result = read_pdf(_blank_pdf(2))
    assert result.needs_ocr is True
    assert result.pages == 2
    assert len(result.page_images) == 2
    assert result.page_images[0].startswith(b"\x89PNG")


def test_read_source_raises_ocr_unavailable_for_scanned_pdf(monkeypatch):
    # Không phụ thuộc máy có cài Tesseract / key Gemini hay không
    from app.extract.readers import image_reader
    monkeypatch.setattr(image_reader, "available", lambda: False)
    monkeypatch.setattr(image_reader.gemini, "available", lambda: False)
    with pytest.raises(OcrUnavailable):
        read_source("scan.pdf", _blank_pdf(1), None, "auto")


def test_corrupt_pdf_is_400_style_error():
    from app.extract.readers import ReaderError
    with pytest.raises(ReaderError):
        read_source("bad.pdf", b"%PDF-1.4 garbage", None, "auto")


def _text_pdf(text: str) -> bytes:
    """PDF 1 trang có text layer (font Helvetica chuẩn, chỉ ASCII)."""
    stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Contents 4 0 R"
        b" /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return out


def test_pdf_with_non_japanese_text_layer_keeps_text_instead_of_ocr():
    # PDF tiếng Việt / tiếng Anh có chữ thật: trước đây bị coi là scan và OCR bằng jpn → ra chữ rác
    result = read_pdf(_text_pdf("TRUONG DAI HOC BACH KHOA - CHUONG 1. KHAO SAT BAI TOAN"))
    assert result.needs_ocr is False
    assert "KHAO SAT BAI TOAN" in result.text


# --- B3: furigana trong text layer --------------------------------------------

def _ja_pdf(runs, scale_by_tm: bool = False) -> bytes:
    """PDF 1 trang có chữ Nhật thật trong text layer, không cần file font: font Type3 vẽ mọi mã 1 byte thành cùng một
    ô vuông (PDFium bỏ qua ký tự không có hình chữ nên không dùng được font CID không nhúng), /ToUnicode ánh xạ mã → chữ.
    runs: (text, cỡ chữ, x, y) — mỗi run một khối BT, chữ chạy ngang. ``scale_by_tm``: đặt "1 Tf" rồi phóng bằng Tm như
    nhiều trình tạo PDF (cỡ Tf khi đó không phải cỡ thật)."""
    chars = sorted({c for t, *_ in runs for c in t})
    code = {c: i + 1 for i, c in enumerate(chars)}
    tounicode = (
        "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
        "/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n"
        "1 begincodespacerange <00> <FF> endcodespacerange\n"
        f"{len(chars)} beginbfchar\n" + "\n".join(f"<{code[c]:02X}> <{ord(c):04X}>" for c in chars) +
        "\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end").encode()
    content = b""
    for t, fs, x, y in runs:
        hexs = "".join(f"{code[c]:02X}" for c in t)
        pos = f"/F1 1 Tf {fs} 0 0 {fs} {x} {y} Tm" if scale_by_tm else f"/F1 {fs} Tf {x} {y} Td"
        content += f"BT {pos} <{hexs}> Tj ET\n".encode()
    glyph = b"1000 0 0 -120 1000 880 d1 50 -100 900 950 re f"
    n = len(chars)
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type3 /FontBBox [0 -120 1000 880] /FontMatrix [0.001 0 0 0.001 0 0]"
        b" /CharProcs << /g 6 0 R >> /Encoding << /Type /Encoding /Differences [1 " + b" ".join([b"/g"] * n) + b"] >>"
        b" /FirstChar 1 /LastChar %d /Widths [%s] /ToUnicode 7 0 R /Resources << >> >>" % (n, b" ".join([b"1000"] * n)),
        b"<< /Length %d >>\nstream\n" % len(glyph) + glyph + b"\nendstream",
        b"<< /Length %d >>\nstream\n" % len(tounicode) + tounicode + b"\nendstream",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return out


# 学校 12pt ở (20, 150); がっこう 6pt ngay trên (đáy ruby cách đỉnh 学校 ~3pt), vẽ SAU 学校 nên chen giữa câu trong
# luồng văn bản; phần còn lại của câu vẽ tiếp cùng dòng; dòng thứ hai đủ để trang không bị coi là scan (≥ 30 ký tự)
RUBY_RUNS = [
    ("学校", 12, 20, 150),
    ("がっこう", 6, 20, 164),
    ("へ行って日本語を勉強しています。", 12, 44, 150),
    ("友達と一緒に図書館で本を読みました。", 12, 20, 120),
]
RUBY_TEXT = "学校へ行って日本語を勉強しています。\n友達と一緒に図書館で本を読みました。"


def test_pdf_furigana_above_kanji_moves_to_rubies():
    plain = PdfReader(io.BytesIO(_ja_pdf(RUBY_RUNS))).pages[0].extract_text()
    assert "がっこう" in plain                    # extract_text() trộn ruby vào thân bài, cắt đôi câu
    result = read_pdf(_ja_pdf(RUBY_RUNS))
    assert result.needs_ocr is False
    assert result.text == RUBY_TEXT              # ruby bỏ, câu nối lại liền, dòng sau vẫn xuống dòng
    assert [b.rubies for b in result.blocks] == [[{"base": "学校", "reading": "がっこう"}]]
    assert result.to_dict()["blocks"][0]["rubies"] == [{"base": "学校", "reading": "がっこう"}]


def test_pdf_furigana_detected_when_size_comes_from_text_matrix():
    result = read_pdf(_ja_pdf(RUBY_RUNS, scale_by_tm=True))
    assert result.text == RUBY_TEXT
    assert result.blocks[0].rubies == [{"base": "学校", "reading": "がっこう"}]


def test_pdf_vertical_furigana_right_of_kanji():
    def column(text, size, x, top=380):
        return [(c, size, x, top - size * (k + 1)) for k, c in enumerate(text)]
    runs = (column("学校に行きます。", 12, 300) + column("がっこう", 6, 312, top=380)
            + column("毎日日本語を勉強しています。", 12, 280) + column("友達と本を読みました。", 12, 260))
    result = read_pdf(_ja_pdf(runs))
    assert result.text == "学校に行きます。\n毎日日本語を勉強しています。\n友達と本を読みました。"
    assert result.blocks[0].rubies == [{"base": "学校", "reading": "がっこう"}]


def test_pdf_without_furigana_keeps_extract_text_output():
    # Kana nhỏ (chú thích 6pt) nhưng cách xa, không nằm sát trên kanji nào → không phải furigana, văn bản như cũ
    runs = [("毎日学校へ行って日本語を勉強しています。", 12, 20, 150),
            ("友達と一緒に図書館で本を読みました。", 12, 20, 120),
            ("ちゅうい:これはれいです", 6, 20, 60)]
    data = _ja_pdf(runs)
    expected = normalize(PdfReader(io.BytesIO(data)).pages[0].extract_text()).strip()
    result = read_pdf(data)
    assert result.text == expected and "ちゅうい" in result.text
    assert result.blocks[0].rubies == []


def test_small_kana_above_small_kanji_is_not_furigana():
    # Hai dòng chữ nhỏ cùng cỡ xếp sát nhau (chú thích): kana dòng trên không nhỏ hơn kanji dòng dưới → giữ nguyên
    runs = [("毎日学校へ行って日本語を勉強しています。", 12, 20, 150),
            ("友達と一緒に図書館で本を読みました。", 12, 20, 120),
            ("ここではなし", 6, 20, 67), ("注意事項はこちら", 6, 20, 60)]
    result = read_pdf(_ja_pdf(runs))
    assert "ここではなし" in result.text and result.blocks[0].rubies == []


def test_pdf_char_api_failure_falls_back_to_extract_text(monkeypatch):
    from app.extract.readers import pdf_reader

    def boom(textpage):
        raise RuntimeError("PDFium lỗi")
    monkeypatch.setattr(pdf_reader, "_page_chars", boom)
    result = read_pdf(_ja_pdf(RUBY_RUNS))
    assert "がっこう" in result.text and "学校" in result.text
    assert result.blocks[0].rubies == []


def test_pdf_reports_truncated_pages_beyond_limit():
    result = read_pdf(_blank_pdf(22))
    assert result.pages == 20 and len(result.page_images) == 20
    assert result.truncated is True and result.truncated_pages == 2
    assert result.to_dict()["meta"]["truncatedPages"] == 2
    small = read_pdf(_ja_pdf(RUBY_RUNS))
    assert small.truncated is False and small.truncated_pages == 0


def test_pdf_ruby_overhang_and_single_kana_ruby():
    # しょうがっこう (42pt) rộng hơn 小学校 (36pt) nên tràn sang に ~3pt: に không thành gốc. め (6pt) giữa ô 目 (12pt).
    runs = [("小学校に行く。目が痛い。", 12, 20, 150), ("しょうがっこう", 6, 17, 164), ("め", 6, 107, 164),
            ("いた", 6, 134, 164), ("友達と一緒に図書館で本を読みました。", 12, 20, 120)]
    result = read_pdf(_ja_pdf(runs))
    assert result.text == "小学校に行く。目が痛い。\n友達と一緒に図書館で本を読みました。"
    assert result.blocks[0].rubies == [{"base": "小学校", "reading": "しょうがっこう"},
                                       {"base": "目", "reading": "め"}, {"base": "痛", "reading": "いた"}]


def test_furigana_dense_vocab_sheet_is_not_treated_as_scan():
    # Tờ từ vựng 12 từ hai chữ, mỗi từ có ruby: text layer 72 ký tự nhưng bỏ ruby còn 24 (< 30) — quyết định "scan"
    # phải tính trên text layer gốc, không thì file có chữ thật bị đem OCR (503 khi không có OCR)
    words = [("学校", "がっこう"), ("先生", "せんせい"), ("勉強", "べんきょう"), ("電車", "でんしゃ"),
             ("会社", "かいしゃ"), ("病院", "びょういん"), ("友達", "ともだち"), ("映画", "えいが"),
             ("時間", "じかん"), ("天気", "てんき"), ("旅行", "りょこう"), ("料理", "りょうり")]
    runs = []
    for k, (w, r) in enumerate(words):
        x, y = 20 + (k % 4) * 120, 350 - (k // 4) * 40
        runs += [(w, 12, x, y), (r, 6, x, y + 14)]
    result = read_pdf(_ja_pdf(runs))
    assert result.needs_ocr is False and result.page_images == []
    # các cột cách xa vẫn tách bằng dấu cách như extract_text() của trang không ruby
    assert result.text == "学校 先生 勉強 電車\n会社 病院 友達 映画\n時間 天気 旅行 料理"
    assert sum(1 for c in result.text if not c.isspace()) < 30
    assert result.blocks[0].rubies == [{"base": w, "reading": r} for w, r in words]


def test_reading_printed_under_word_is_not_furigana_of_next_row():
    # Bảng từ vựng: từ 24pt, cách đọc 12pt in NGAY DƯỚI từ (khe ~2.5pt), hàng sau cách 50pt → cách đọc cũng nằm trong tầm
    # "ruby trên" của từ hàng sau (khe ~11.5pt) nhưng gần từ của chính nó hơn → không phải furigana, giữ extract_text()
    vocab = [("学校", "がっこう"), ("先生", "せんせい"), ("図書館", "としょかん"), ("勉強", "べんきょう"),
             ("日本語", "にほんご"), ("友達", "ともだち"), ("映画館", "えいがかん")]
    runs = [("第一課の単語表", 12, 20, 385)]
    for k, (w, r) in enumerate(vocab):
        runs += [(w, 24, 20, 345 - k * 50), (r, 12, 20, 329 - k * 50)]
    data = _ja_pdf(runs)
    result = read_pdf(data)
    assert result.blocks[0].rubies == []
    assert result.text == normalize(PdfReader(io.BytesIO(data)).pages[0].extract_text()).strip()
    assert "がっこう" in result.text and "せんせい" in result.text


def test_furigana_on_second_line_still_detected_below_previous_line():
    # Ruby thật nằm sát gốc (khe ~2.7pt) và xa dòng phía trên (~5pt) → phép thử "phía đối diện gần hơn" không chặn nhầm
    runs = [("毎日日本語を勉強しています。", 12, 20, 150), ("学校", 12, 20, 124), ("がっこう", 6, 20, 138),
            ("へ行って友達と本を読みました。", 12, 44, 124)]
    result = read_pdf(_ja_pdf(runs))
    assert result.text == "毎日日本語を勉強しています。\n学校へ行って友達と本を読みました。"
    assert result.blocks[0].rubies == [{"base": "学校", "reading": "がっこう"}]


def test_furigana_detected_with_word_default_line_grid():
    # Word tiếng Nhật mặc định: 10.5pt, lưới dòng 18pt, ruby 5.25pt nâng 11pt → ruby cách gốc ~1.1pt và cách dòng trên
    # cũng ~1.1pt; phép thử "phía đối diện" chỉ chặn khi kanji bên kia gần HƠN HẲN, nên ruby dòng 2, 3 vẫn nhận
    runs = [("毎日日本語を勉強しています。", 10.5, 20, 300),
            ("学校", 10.5, 20, 282), ("がっこう", 5.25, 20, 293), ("へ行って本を読みます。", 10.5, 41, 282),
            ("先生", 10.5, 20, 264), ("せんせい", 5.25, 20, 275), ("と話しました。", 10.5, 41, 264)]
    result = read_pdf(_ja_pdf(runs))
    assert result.text == "毎日日本語を勉強しています。\n学校へ行って本を読みます。\n先生と話しました。"
    assert result.blocks[0].rubies == [{"base": "学校", "reading": "がっこう"}, {"base": "先生", "reading": "せんせい"}]


@pytest.mark.parametrize("runs", [
    # dấu chú thích ア 6pt nâng 5pt ngay sau 制度
    [("この制度", 12, 20, 300), ("ア", 6, 68, 305), ("は二〇一〇年に始まりました。", 12, 74, 300),
     ("友達と一緒に図書館で本を読みました。", 12, 20, 270)],
    # ノ 5pt cùng dòng sau 第一課
    [("第一課", 12, 20, 300), ("ノ", 5, 56, 300), ("二の練習問題です。", 12, 61, 300),
     ("友達と一緒に図書館で本を読みました。", 12, 20, 270)],
])
def test_small_kana_after_kanji_on_horizontal_page_keeps_extract_text(runs):
    # Trang chữ ngang không có furigana: cụm kana một ký tự chỉ được thử theo hướng chữ của trang — trước đây thử cả
    # ruby DỌC nên ア / ノ bị xoá, ghi ruby giả {度: ア} và dòng bị cắt đôi
    data = _ja_pdf(runs)
    result = read_pdf(data)
    assert result.blocks[0].rubies == []
    assert result.text == normalize(PdfReader(io.BytesIO(data)).pages[0].extract_text()).strip()


def test_single_kana_ruby_on_vertical_page():
    def column(text, size, x, top=380):
        return [(c, size, x, top - size * (k + 1)) for k, c in enumerate(text)]
    # め (6pt) bên phải 目 (cột dọc 12pt): trang dọc → cụm một ký tự thử theo hướng dọc
    runs = (column("目が痛いです。", 12, 300) + [("め", 6, 312, 380 - 12 + 3)]
            + column("毎日日本語を勉強しています。", 12, 280) + column("友達と本を読みました。", 12, 260))
    result = read_pdf(_ja_pdf(runs))
    assert result.text == "目が痛いです。\n毎日日本語を勉強しています。\n友達と本を読みました。"
    assert result.blocks[0].rubies == [{"base": "目", "reading": "め"}]
