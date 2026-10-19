"""han_viet: bảng sửa tay thắng Unihan kVietnamese (LC-01: 予 Unihan ghi âm Nôm "nhừ", 猫 mượn "mèo", 郵 không có).

Test đầu chạy trên CSV tí hon; phần dưới chạy trên dữ liệu đã commit (unihan_vietnamese.csv + han_viet_overrides.csv)."""
import csv

import pytest

from app.extract import han_viet
from app.extract.jachars import is_kanji
from app.extract.jlpt import classifier


@pytest.fixture
def tiny(tmp_path, monkeypatch):
    (tmp_path / "viet.csv").write_text("char,reading\n予,nhừ\n定,định\n猫,mèo\n畑,đèn\n便,tiện\n", encoding="utf-8")
    (tmp_path / "over.csv").write_text("char,reading\n予,DỰ\n猫,miêu\n郵,BƯU\n畑,\n", encoding="utf-8")
    monkeypatch.setattr(han_viet, "DATA_FILE", tmp_path / "viet.csv")
    monkeypatch.setattr(han_viet, "OVERRIDE_FILE", tmp_path / "over.csv")
    monkeypatch.setattr(han_viet, "_table", None)
    yield tmp_path
    han_viet._table = None


def test_override_wins_over_unihan_and_fills_missing_chars(tiny):
    assert han_viet.han_viet("予定") == "DỰ ĐỊNH"       # âm Nôm Unihan bị thay
    assert han_viet.han_viet("猫") == "MIÊU"            # viết hoa như mọi âm trong bảng
    assert han_viet.han_viet("郵便") == "BƯU TIỆN"      # chữ Unihan không có


def test_empty_override_reading_removes_unihan_value(tiny):
    # 畑 là chữ quốc tự: Unihan ghi âm Nôm "đèn" → dòng sửa rỗng xoá hẳn, từ chỉ có chữ đó không có âm Hán-Việt
    assert han_viet.han_viet("畑") is None
    assert han_viet.han_viet("畑予") == "DỰ"


def test_missing_override_file_keeps_unihan(tiny, monkeypatch):
    monkeypatch.setattr(han_viet, "OVERRIDE_FILE", tiny / "missing.csv")
    monkeypatch.setattr(han_viet, "_table", None)
    assert han_viet.han_viet("予定") == "NHỪ ĐỊNH"


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(not (han_viet.DATA_FILE.exists() and han_viet.OVERRIDE_FILE.exists()),
                                reason="chưa có unihan_vietnamese.csv / han_viet_overrides.csv")


@pytest.fixture
def real():
    han_viet._table = None
    yield
    han_viet._table = None


@needs_real
@pytest.mark.parametrize("term, expected", [
    ("予定", "DỰ ĐỊNH"),          # LC-01: Unihan "nhừ" (âm Nôm)
    ("猫", "MIÊU"),               # Unihan mượn âm Nôm "mèo" của 貓
    ("郵便局", "BƯU TIỆN CỤC"),    # 郵 không có trong Unihan → trước đây thành "TIỆN CỤC"
    ("角", "GIÁC"), ("冷蔵庫", "LÃNH TÀNG KHỐ"), ("眼鏡", "NHÃN KÍNH"), ("美味", "MỸ VỊ"),
    ("酒", "TỬU"), ("薬", "DƯỢC"), ("愛", "ÁI"), ("晴", "TÌNH"), ("番号", "PHIÊN HIỆU"),
    ("勉強", "MIỄN CƯỜNG"), ("日本", "NHẬT BẢN"),   # mục sửa tay cũ vẫn giữ
])
def test_real_data_common_words(real, term, expected):
    assert han_viet.han_viet(term) == expected


@needs_real
def test_real_data_kokuji_has_no_reading(real):
    assert han_viet.han_viet("畑") is None   # Unihan ghi "đèn"
    assert han_viet.han_viet("込") is None   # không có dòng nào


@needs_real
@pytest.mark.skipif(not (classifier.DATA_DIR / "n4.csv").exists(), reason="chưa có jlpt/n*.csv")
def test_real_data_every_n5_n4_kanji_has_reading(real):
    # Mọi chữ Hán trong từ vựng N5 / N4 có âm Hán-Việt, trừ chữ quốc tự không có âm (働 quốc tự nhưng có âm ĐỘNG quen dùng)
    kokuji = set("込匂畑")
    missing = []
    for level in ("n5", "n4"):
        with open(classifier.DATA_DIR / f"{level}.csv", encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                for ch in row["expression"]:
                    if is_kanji(ch) and ch != "々" and ch not in kokuji and not han_viet.han_viet(ch):
                        missing.append(ch)
    assert missing == []


@needs_real
def test_real_data_override_file_is_well_formed():
    # mỗi chữ một dòng, âm viết hoa không khoảng trắng (đồ thị Hán-Việt dùng âm làm khoá)
    seen = set()
    with open(han_viet.OVERRIDE_FILE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ch, reading = row["char"], row["reading"]
            assert len(ch) == 1 and ch not in seen, ch
            seen.add(ch)
            assert reading == reading.strip().upper() and " " not in reading, ch
