"""Tiền xử lý ViHSD đúng như notebook + Keras Tokenizer (bộ lọc mặc định có `_`)."""
import pytest

from app.moderation import preprocess as pp

pytest.importorskip("pyvi")
pytest.importorskip("emoji_vietnamese")


def test_keras_words_splits_underscore_and_filters():
    assert pp.keras_words("tuyệt_vời khuôn_mặt_cười, thật!") == ["tuyệt", "vời", "khuôn", "mặt", "cười", "thật"]


def test_to_sequence_pads_and_maps_oov():
    seq = pp.to_sequence("không xyzkhongco")
    assert len(seq) == pp.MAX_LEN
    assert seq[0] == pp.word_index()["không"]
    assert seq[1] == pp.OOV_INDEX
    assert seq[2:] == [0] * (pp.MAX_LEN - 2)


def test_to_sequence_truncates_post():
    seq = pp.to_sequence(" ".join(["không"] * 200))
    assert len(seq) == pp.MAX_LEN and all(s == pp.word_index()["không"] for s in seq)


def test_clean_keeps_negation_drops_stopwords_digits_urls():
    cleaned = pp.clean("Tôi không_thể thích 123 http://x.y/z BÀI_GIẢNG này!!!")
    assert "không_thể" in cleaned          # 5 từ phủ định giữ lại
    assert "này" not in cleaned            # stopword
    assert "123" not in cleaned and "http" not in cleaned
    assert cleaned == cleaned.lower() and "!" not in cleaned
    assert "bài_giảng" in cleaned          # dấu `_` giữ ở bước này (chỉ Keras Tokenizer mới tách)


def test_preprocess_demojizes_and_tokenizes():
    out = pp.preprocess("Cảm ơn thầy ❤️")
    assert "trái" in out or "tim" in out   # demojize ra chữ
    assert pp.preprocess("") == "" and pp.preprocess("   ") == ""


def test_stopwords_file_matches_github_list_size():
    assert len(pp.stopwords()) == 1941 - 5 - 1 or len(pp.stopwords()) >= 1900   # 1 941 dòng, bỏ 5 từ (và dòng trùng nếu có)
    assert "không" not in pp.stopwords() and "được" not in pp.stopwords()


def test_available_true_when_installed():
    assert pp.available() is True
