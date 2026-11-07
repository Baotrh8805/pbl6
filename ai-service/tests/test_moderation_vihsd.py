"""Mạng CNN + BiLSTM numpy: hình dạng / softmax trên mạng tí hon tổng hợp; khớp Keras trên câu test thật khi có file npz."""
import json
from pathlib import Path

import numpy as np
import pytest

from app.moderation import vihsd

FIX = Path(__file__).parent / "fixtures"


def tiny_weights(seed: int = 0) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(seed)
    r = lambda *shape: rng.normal(0, 0.3, size=shape).astype(np.float32)  # noqa: E731
    bn = lambda n: (np.ones(n, np.float32), np.zeros(n, np.float32), np.zeros(n, np.float32), np.ones(n, np.float32))  # noqa: E731
    w = {"embedding__0": r(50, 8)}
    specs = [("conv1d", "batch_normalization", 8, 8, 16), ("conv1d_1", "batch_normalization_1", 8, 16, 16),
             ("conv1d_2", "batch_normalization_2", 4, 16, 8), ("conv1d_3", "batch_normalization_3", 4, 8, 4)]
    for conv, bnn, k, cin, cout in specs:
        w[f"{conv}__0"], w[f"{conv}__1"] = r(k, cin, cout), r(cout)
        for i, arr in enumerate(bn(cout)):
            w[f"{bnn}__{i}"] = arr
    for name, cin, u in [("bidirectional", 4, 2), ("bidirectional_1", 4, 1)]:
        for d in range(2):
            w[f"{name}__{3 * d}"], w[f"{name}__{3 * d + 1}"], w[f"{name}__{3 * d + 2}"] = r(cin, 4 * u), r(u, 4 * u), r(4 * u)
    w["dense__0"], w["dense__1"] = r(2, 3), r(3)
    w["dense_1__0"], w["dense_1__1"] = r(3, 2), r(2)
    w["mfcc_unit__0"], w["mfcc_unit__1"] = r(2, 3), r(3)
    return w


def test_tiny_network_outputs_distribution_and_is_deterministic():
    m = vihsd.Vihsd(tiny_weights())
    seq = [3, 7, 1, 0, 0, 0, 0, 0, 9, 2, 2, 2, 0, 0, 0, 0]
    p = m.predict_proba(seq)
    assert p.shape == (3,) and p.sum() == pytest.approx(1.0, abs=1e-6) and (p > 0).all()
    assert np.allclose(p, m.predict_proba(seq))
    assert not np.allclose(p, m.predict_proba([5, 5, 5, 5] + [0] * 12))


def test_out_of_vocab_ids_map_to_oov():
    m = vihsd.Vihsd(tiny_weights())
    assert np.allclose(m.predict_proba([99] + [0] * 15), m.predict_proba([1] + [0] * 15))


def test_conv_same_padding_matches_tf_convention():
    x = np.arange(6, dtype=np.float32).reshape(6, 1)
    k = np.zeros((4, 1, 1), np.float32)
    k[1, 0, 0] = 1.0   # với k=4: pad trái 1 → tap[1] trỏ đúng vào x[t]
    y = vihsd._conv1d_same(x, k, np.zeros(1, np.float32))
    assert np.allclose(y[:, 0], x[:, 0])


def test_maxpool_and_batchnorm():
    x = np.array([[1, 5], [3, 2], [4, 4], [0, 9], [7, 7]], np.float32)
    assert np.array_equal(vihsd._maxpool2(x), [[3, 5], [4, 9]])
    y = vihsd._batchnorm(x, np.full(2, 2.0), np.ones(2), np.zeros(2), np.ones(2) - vihsd._BN_EPS)
    assert np.allclose(y, 2 * x + 1)


@pytest.mark.skipif(not vihsd.WEIGHTS_FILE.exists() or not (FIX / "vihsd_reference.json").exists(),
                    reason="cần models/vihsd_cnn_lstm.npz + fixtures/vihsd_reference.json (chạy tay trên máy dev)")
def test_matches_keras_on_real_test_sentences():
    m = vihsd.get()
    ref = json.loads((FIX / "vihsd_reference.json").read_text(encoding="utf-8"))
    assert m is not None and len(ref) >= 20
    for row in ref:
        p = m.predict_proba(row["seq"])
        assert np.allclose(p, row["probs"], atol=2e-3), row
        assert int(p.argmax()) == row["label"]
