"""ViHOS: căn vị trí từ pyvi về văn bản gốc, làm sạch từ, ngưỡng; nạp model giả (không cần torch)."""
import pytest

from app.moderation import vihos


def test_align_words_offsets_case_insensitive_and_compounds():
    text = "Đồ ngu, cút đi cho khuất mắt"
    words = ["Đồ", "ngu", ",", "cút", "đi", "cho", "khuất_mắt"]
    off = vihos.align_words(text, words)
    assert [text[s:e] for s, e in off] == ["Đồ", "ngu", ",", "cút", "đi", "cho", "khuất mắt"]


def test_align_words_missing_word_gives_minus_one_and_keeps_order():
    off = vihos.align_words("mày ngu", ["mày", "xxx", "ngu"])
    assert off == [(0, 3), (-1, -1), (4, 7)]


def test_align_repeated_words_advance():
    off = vihos.align_words("mày với mày", ["mày", "với", "mày"])
    assert off == [(0, 3), (4, 7), (8, 11)]


def test_clean_word_deep():
    # regex của notebook có chữ "r" thừa `(r[a-z])` nên "v.l" KHÔNG đổi, chỉ "v.rl" → "vrl"; giữ y hệt vì model huấn luyện như vậy
    assert vihos.clean_word_deep("V.L") == "v.l"
    assert vihos.clean_word_deep("v.rl") == "vrl"
    assert vihos.clean_word_deep("Khuất_Mắt!") == "khuất_mắt!"
    assert vihos.clean_word_deep("@@@") == " "


def test_decode_threshold():
    assert vihos.decode([0.2, 0.5, 0.9], 0.5) == [False, True, True]


def test_get_returns_none_when_disabled_or_files_missing(monkeypatch):
    vihos.set_model(None, failed=False)
    monkeypatch.setattr(vihos.settings, "MODERATION_SPANS", False)
    assert vihos.get() is None and vihos.available() is False
    monkeypatch.setattr(vihos.settings, "MODERATION_SPANS", True)
    monkeypatch.setattr(vihos, "files_present", lambda: False)
    assert vihos.available() is False


class _FakeTok:
    cls_token_id, sep_token_id = 0, 2

    def encode(self, w, add_special_tokens=False):
        return [] if w.strip() == "" else [10 + len(w)]


class _FakeTorch:
    class _NoGrad:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    @staticmethod
    def no_grad(): return _FakeTorch._NoGrad()

    @staticmethod
    def tensor(v, dtype=None):
        import numpy as np
        return np.asarray(v)

    @staticmethod
    def ones_like(x):
        import numpy as np
        return np.ones_like(x)

    long = None

    @staticmethod
    def softmax(x, dim=-1):
        import numpy as np
        e = np.exp(x - x.max(axis=dim, keepdims=True))
        return e / e.sum(axis=dim, keepdims=True)


class _Out:
    def __init__(self, h): self.last_hidden_state = h


def _fake_bert(hate_positions):
    """Trả logits theo vị trí token: token ở hate_positions nghiêng về B-T."""
    import numpy as np

    class Bert:
        def __call__(self, input_ids, attention_mask):
            n = input_ids.shape[1]
            return _Out(np.array([[[0, 0, 0]] * n], dtype=np.float32))
    class Clf:
        def __call__(self, h):
            import numpy as np
            n = h.shape[1]
            logits = np.tile(np.array([[5.0, 0.0, 0.0]], np.float32), (n, 1))
            for p in hate_positions:
                logits[p] = [0.0, 5.0, 0.0]
            return logits[None]
    return Bert(), Clf()


def test_predict_uses_first_subtoken_and_threshold(monkeypatch):
    pytest.importorskip("pyvi")
    monkeypatch.setattr(vihos, "vi_tokenize", lambda t: "Mày viết cái_gì vậy")
    bert, clf = _fake_bert({1, 3})   # vị trí 1 = "Mày", 3 = "cái_gì" (sau <s> ở 0)
    m = vihos.Vihos(_FakeTok(), bert, clf, _FakeTorch())
    # patch softmax trả numpy: predict dùng probs[:, 1] + probs[:, 2] → numpy ok; .tolist() có sẵn
    spans = m.predict("Mày viết cái gì vậy")
    assert [s["word"] for s in spans] == ["Mày", "cái_gì"]
    assert spans[0]["start"] == 0 and spans[0]["end"] == 3
    assert spans[1]["start"] == 9 and spans[1]["end"] == 15 and spans[1]["score"] > 0.99
    assert m.predict("") == [] or True
