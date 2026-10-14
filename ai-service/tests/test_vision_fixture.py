"""Chạy thật Gemini Vision trên ảnh bảng từ vựng mẫu (tests/fixtures/vocab_table.png) rồi phân tích.

Bỏ qua mặc định; bật bằng RUN_GEMINI_TESTS=1 và GEMINI_API_KEY (tốn 1 lượt gọi, có thể 503 — gemini tự thử lại).
"""
import os
from pathlib import Path

import pytest

from app.extract import gemini
from app.extract.pipeline import analyze
from app.extract.readers.text_reader import normalize

pytestmark = pytest.mark.skipif(not (os.getenv("RUN_GEMINI_TESTS") and gemini.available()),
                                reason="cần RUN_GEMINI_TESTS=1 và GEMINI_API_KEY")


def test_vocab_table_image_end_to_end():
    data = (Path(__file__).parent / "fixtures" / "vocab_table.png").read_bytes()
    text = normalize(gemini.vision_transcribe(data, "image/png", "horizontal"))
    print("\n--- Gemini ---\n" + text)
    r = analyze(text, None, {"levelFilter": "all"})
    terms = {it["term"] for it in r["items"]}
    assert r["stats"]["layout"] == "list"
    assert {"銀行口座", "手数料がかかる", "高くつく", "バランスが取れた食事", "外食する"} <= terms
    assert "銀行" not in terms and "電気" not in terms
    assert next(it for it in r["items"] if it["term"] == "銀行口座")["meaningEn"].lower().startswith("bank account")
