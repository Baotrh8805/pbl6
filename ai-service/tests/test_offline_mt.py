"""Dịch máy offline Nhật ↔ Việt (tab Dịch, D34): tách câu, tên người → romaji, lọc đầu ra, hạn chót, không bao giờ ném.
Phần lớn không cần mô hình (giả translator); ca cuối dùng mô hình thật nếu models/mt/m2m100_418M-ct2 đã tải."""
from __future__ import annotations

import time

import pytest

from app.extract import offline_mt


def test_split_sentences_keeps_lines_and_punctuation():
    lines = offline_mt.split_sentences("昨日は雨でした。今日は晴れです！\n\nXin chào. Bạn khỏe không?")
    assert lines == [["昨日は雨でした。", "今日は晴れです！"], [], ["Xin chào.", "Bạn khỏe không?"]]
    assert offline_mt.split_sentences("「はい。」と言った。") == [["「はい。」", "と言った。"]]
    assert offline_mt.split_sentences("食べる") == [["食べる"]]


def test_split_sentences_cuts_very_long_sentence_softly():
    long = "、".join(["今日は友達と公園で長い時間ずっと遊びました"] * 20) + "。"
    sents = offline_mt.split_sentences(long)[0]
    assert len(sents) > 1 and all(len(s) <= offline_mt.MAX_SENTENCE_CHARS for s in sents)
    assert "".join(sents).replace(" ", "") == long


def test_romanize_names_only_person_names():
    assert offline_mt.romanize_names("田中さんはアメリカへ行きます。") == "Tanakaさんはアメリカへ行きます。"
    assert offline_mt.romanize_names("学校へ行きます。") == "学校へ行きます。", "không phải tên người: giữ nguyên"
    assert offline_mt.romanize_names("Xin chào") == "Xin chào"


def test_clean_filters_wrong_language_and_loops():
    assert offline_mt._clean(" Tôi  ăn cơm. ", "ja-vi") == "Tôi ăn cơm."
    assert offline_mt._clean("私は", "ja-vi") is None, "bản Việt còn chữ Nhật"
    assert offline_mt._clean("I eat rice", "vi-ja") is None, "bản Nhật phải có chữ Nhật"
    assert offline_mt._clean("ha ha ha ha ha ha", "ja-vi") == "ha ha"
    assert offline_mt._clean("", "ja-vi") is None


def test_beam_adapts_to_deadline():
    assert offline_mt._beam_for(100, None) == 4
    now = time.monotonic()
    assert offline_mt._beam_for(1000, now + 30) == 4
    assert offline_mt._beam_for(1000, now + 11) == 2
    assert offline_mt._beam_for(1000, now + 3) == 1


class _Hyp:
    def __init__(self, toks):
        self.hypotheses = [toks]


class _FakeTranslator:
    def __init__(self, fn):
        self.fn, self.calls = fn, []

    def translate_batch(self, batch, target_prefix=None, beam_size=4, **kw):
        self.calls.append((batch, target_prefix, beam_size))
        return [_Hyp([target_prefix[0][0]] + self.fn(toks)) for toks in batch]


class _FakeSp:
    def encode(self, s, out_type=str):
        return [s]

    def decode(self, toks):
        return " ".join(toks)


@pytest.fixture
def fake_model(monkeypatch):
    """Lớp CTranslate2 giả (không cần mô hình); lớp PyTorch tắt trừ khi test tự bật."""
    monkeypatch.setattr(offline_mt, "_failed", set())

    def install(fn):
        tr = _FakeTranslator(fn)
        monkeypatch.setattr(offline_mt, "backends", lambda: [b for b in ("ct2",) if b not in offline_mt._failed])
        monkeypatch.setattr(offline_mt, "_load_ct2", lambda: (tr, _FakeSp()))
        return tr
    return install


def test_translate_joins_sentences_and_keeps_paragraphs(fake_model):
    vi = {"Tanakaさんは学生です。": "Anh Tanaka là sinh viên.", "毎日勉強します。": "Học mỗi ngày."}
    tr = fake_model(lambda toks: [vi[toks[1]]])
    out = offline_mt.translate("田中さんは学生です。毎日勉強します。\n\n毎日勉強します。", "ja-vi")
    assert out == ("Anh Tanaka là sinh viên. Học mỗi ngày.\n\nHọc mỗi ngày.", offline_mt.MODEL_NAME)
    batch, prefix, _ = tr.calls[0]
    assert batch[0][0] == "__ja__" and batch[0][-1] == "</s>" and prefix[0] == ["__vi__"]


def test_translate_vi_ja_joins_without_spaces(fake_model):
    fake_model(lambda toks: ["私は学生です。" if "sinh viên" in toks[1] else "毎日勉強します。"])
    assert offline_mt.translate("Tôi là sinh viên. Tôi học mỗi ngày.", "vi-ja")[0] == "私は学生です。毎日勉強します。"


def test_translate_rejects_mostly_broken_output(fake_model):
    fake_model(lambda toks: ["まだ日本語"])      # bản Việt còn chữ Nhật → câu hỏng
    assert offline_mt.translate("学校です。駅です。", "ja-vi") is None


def test_translate_never_raises(fake_model, monkeypatch):
    def boom(toks):
        raise RuntimeError("ctranslate2 hỏng")
    fake_model(boom)
    assert offline_mt.translate("学校です。", "ja-vi") is None
    assert offline_mt.translate("学校です。", "en-vi") is None
    assert offline_mt.translate("   ", "ja-vi") is None
    fake_model(lambda toks: ["Trường học."])
    assert offline_mt.translate("学校です。", "ja-vi", deadline=time.monotonic() - 1) is None, "quá hạn chót → None"


def test_ct2_failure_falls_back_to_pytorch_layer(fake_model, monkeypatch):
    """Lớp CTranslate2 lỗi lúc chạy → đánh dấu hỏng, dịch bằng bản PyTorch; lần sau đi thẳng PyTorch."""
    def boom(toks):
        raise RuntimeError("ctranslate2 không chạy được trên CPU này")
    fake_model(boom)
    torch_calls = []

    def fake_torch(sents, direction, deadline):
        torch_calls.append((sents, direction))
        return ["Trường học."] * len(sents)
    monkeypatch.setitem(offline_mt._RUNNERS, "torch", (fake_torch, offline_mt.TORCH_MODEL_NAME))
    monkeypatch.setattr(offline_mt, "backends", lambda: [b for b in ("ct2", "torch") if b not in offline_mt._failed])

    assert offline_mt.translate("学校です。", "ja-vi") == ("Trường học.", "m2m100_418M")
    assert "ct2" in offline_mt._failed and torch_calls == [(["学校です。"], "ja-vi")]
    assert offline_mt.translate("学校です。", "ja-vi") == ("Trường học.", "m2m100_418M")
    assert len(torch_calls) == 2


def test_timeout_does_not_switch_layer(fake_model, monkeypatch):
    """Hết hạn chót không phải lớp hỏng: không đánh dấu, không chạy tiếp bản PyTorch (chậm hơn, càng không kịp)."""
    fake_model(lambda toks: ["x"])

    def slow(sents, direction, deadline):
        raise TimeoutError
    monkeypatch.setitem(offline_mt._RUNNERS, "ct2", (slow, offline_mt.MODEL_NAME))
    monkeypatch.setitem(offline_mt._RUNNERS, "torch", (lambda *a: pytest.fail("không được chạy PyTorch"), "t"))
    monkeypatch.setattr(offline_mt, "backends", lambda: ["ct2", "torch"])
    assert offline_mt.translate("学校です。", "ja-vi") is None and not offline_mt._failed


def test_pytorch_layer_loads_in_background_when_deadline_is_short(monkeypatch):
    """Bản PyTorch chưa nạp và còn ít giờ hơn thời gian nạp: nạp ở luồng nền, lượt này None (không giữ request quá 30 s)."""
    monkeypatch.setattr(offline_mt, "_failed", set())
    monkeypatch.setattr(offline_mt, "_state", {})
    monkeypatch.setattr(offline_mt, "backends", lambda: ["torch"])
    started = []
    monkeypatch.setattr(offline_mt, "_load_in_background", lambda name: started.append(name))
    monkeypatch.setitem(offline_mt._RUNNERS, "torch", (lambda *a: pytest.fail("chưa nạp xong thì không chạy"), "t"))
    assert offline_mt.translate("学校です。", "ja-vi", deadline=time.monotonic() + 10) is None
    assert started == ["torch"]


def test_backends_order_and_missing_models(monkeypatch, tmp_path):
    monkeypatch.setattr(offline_mt, "_failed", set())
    monkeypatch.setattr(offline_mt, "MT_DIR", tmp_path)
    monkeypatch.setattr(offline_mt, "_importable", lambda *mods: True)
    assert offline_mt.backends() == [] and offline_mt.available() is False
    assert offline_mt.translate("学校です。", "ja-vi") is None
    ct2 = tmp_path / offline_mt.MODEL_NAME
    ct2.mkdir()
    (ct2 / "model.bin").write_bytes(b"x")
    (ct2 / offline_mt.SPM_FILE).write_bytes(b"x")
    pt = tmp_path / offline_mt.TORCH_MODEL_NAME
    pt.mkdir()
    for f in ("config.json", "pytorch_model.bin", offline_mt.SPM_FILE):
        (pt / f).write_bytes(b"x")
    assert offline_mt.backends() == ["ct2", "torch"]
    offline_mt._failed.add("ct2")
    assert offline_mt.backends() == ["torch"]


def test_preload_marks_broken_ct2_and_loads_pytorch(monkeypatch):
    monkeypatch.setattr(offline_mt, "_failed", set())
    loaded = []

    def bad():
        raise OSError("model.bin hỏng")
    monkeypatch.setitem(offline_mt._LOADERS, "ct2", bad)
    monkeypatch.setitem(offline_mt._LOADERS, "torch", lambda: loaded.append("torch"))
    monkeypatch.setattr(offline_mt, "backends", lambda: [b for b in ("ct2", "torch") if b not in offline_mt._failed])
    offline_mt.preload()
    assert offline_mt._failed == {"ct2"} and loaded == ["torch"]


@pytest.mark.skipif(not offline_mt._ct2_ok(), reason="chưa tải / chuyển mô hình offline (scripts/fetch_offline_mt.py)")
def test_real_model_both_directions():
    ja = offline_mt.translate("私は毎朝コーヒーを飲みます。", "ja-vi")
    assert ja and "cà phê" in ja[0].lower() and ja[1] == offline_mt.MODEL_NAME
    vi = offline_mt.translate("Tôi muốn đi Nhật Bản.", "vi-ja")
    assert vi and "日本" in vi[0]


@pytest.mark.skipif(not offline_mt._torch_ok(), reason="không có bản PyTorch (models/mt/m2m100_418M)")
def test_real_pytorch_fallback_layer(monkeypatch):
    monkeypatch.setattr(offline_mt, "backends", lambda: ["torch"])
    ja = offline_mt.translate("私は毎朝コーヒーを飲みます。", "ja-vi", deadline=time.monotonic() + 60)
    assert ja and "cà phê" in ja[0].lower() and ja[1] == offline_mt.TORCH_MODEL_NAME
