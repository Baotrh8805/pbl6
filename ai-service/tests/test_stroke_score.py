"""stroke_score trên chữ mẫu tự dựng (hình 日 bằng 4 nét thẳng) — không cần kanji_strokes.json; cuối file có một test
sanity trên dữ liệu thật (bỏ qua khi chưa build)."""
import json
import random

import pytest

from app.extract import kanjidata
from app.extract import stroke_score as ss

# 日 đơn giản hoá, toạ độ "pixel": dọc trái, ngang trên + dọc phải, ngang giữa, ngang dưới — đúng thứ tự viết
RAW = [
    [(20.0, 10.0), (20.0, 90.0)],
    [(20.0, 10.0), (80.0, 10.0), (80.0, 90.0)],
    [(20.0, 50.0), (80.0, 50.0)],
    [(20.0, 90.0), (80.0, 90.0)],
]
REF = ss.normalize_glyph([ss.resample(s) for s in RAW])   # như dữ liệu kanjidata: 32 điểm/nét, hộp 0..1 cả chữ


def _max_diff(a, b):
    return max(abs(v1 - v0) for s0, s1 in zip(a, b) for p0, p1 in zip(s0, s1) for v0, v1 in zip(p0, p1))


def _jitter(strokes, seed, amp=0.03):
    rng = random.Random(seed)
    return [[(x + rng.uniform(-amp, amp), y + rng.uniform(-amp, amp)) for x, y in s] for s in strokes]


def _offset_jitter(strokes, seed, amp=0.03, off=0.04):
    """Nhiễu từng điểm ±amp cộng thêm mỗi nét lệch riêng ±off (đặt bút lệch) — mô hình của thí nghiệm hoà thứ tự."""
    rng = random.Random(seed)
    out = []
    for s in strokes:
        ox, oy = rng.uniform(-off, off), rng.uniform(-off, off)
        out.append([(x + ox + rng.uniform(-amp, amp), y + oy + rng.uniform(-amp, amp)) for x, y in s])
    return out


# 三 tự dựng: ba nét ngang, nét trên / giữa ngắn hơn nét dưới — bỏ nét trên hoặc dưới là hộp bao đổi
SAN = [[(0.2, 0.1), (0.8, 0.1)], [(0.25, 0.5), (0.75, 0.5)], [(0.0, 0.9), (1.0, 0.9)]]


# ----------------------------------------------------------------------------- resample

def test_resample_equal_spacing_and_endpoints():
    poly = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.5), (9.0, 0.5), (9.0, 9.0)]   # đoạn dài ngắn xen kẽ
    out = ss.resample(poly, 32)
    assert len(out) == 32 and out[0] == poly[0] and out[-1] == poly[-1]
    steps = [((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 for (x0, y0), (x1, y1) in zip(out, out[1:])]
    # tổng chiều dài 18 chia 31 khoảng; các khoảng đi qua góc ngắn hơn chút vì đo bằng dây cung
    assert max(steps) == pytest.approx(18 / 31, abs=1e-9) and min(steps) > 0.4
    assert ss.resample([(0, 0), (4, 0)], 5) == [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0), (4.0, 0.0)]


def test_resample_accepts_lists_and_duplicate_points():
    out = ss.resample([[0, 0], [0, 0], [2, 0], [2, 0], [2, 2]], 5)    # đoạn dài 0 không gây chia cho 0
    assert out == [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (2.0, 1.0), (2.0, 2.0)]


def test_resample_degenerate():
    assert ss.resample([], 32) == []
    assert ss.resample([(3.0, 4.0)], 4) == [(3.0, 4.0)] * 4
    assert ss.resample([(3.0, 4.0), (3.0, 4.0)], 3) == [(3.0, 4.0)] * 3
    assert ss.resample([(0.0, 0.0), (1.0, 1.0)], 1) == [(0.0, 0.0)]
    assert ss.resample([(0.0, 0.0), (1.0, 1.0)], 0) == []


# ----------------------------------------------------------------------------- normalize_glyph

def test_normalize_glyph_same_rule_as_build_dicts():
    norm = ss.normalize_glyph([[(10.0, 50.0), (90.0, 50.0)], [(50.0, 10.0), (50.0, 90.0)]])
    assert norm[0][0] == pytest.approx((0.0, 0.5)) and norm[0][-1] == pytest.approx((1.0, 0.5))
    assert norm[1][0] == pytest.approx((0.5, 0.0)) and norm[1][-1] == pytest.approx((0.5, 1.0))
    # một nét ngang đơn: cạnh dài = 1, cạnh ngắn căn giữa chứ không kéo thành hình vuông
    assert ss.normalize_glyph([[(10.0, 50.0), (90.0, 52.0)]]) == [[(0.0, pytest.approx(0.4875)), (1.0, pytest.approx(0.5125))]]
    assert ss.normalize_glyph([]) == []
    assert ss.normalize_glyph([[(3.0, 3.0), (3.0, 3.0)]]) == [[(0.5, 0.5), (0.5, 0.5)]]


def test_normalize_glyph_leaves_normalised_reference_unchanged():
    # REF đã chuẩn hoá → chuẩn hoá lại không đổi (idempotent); cả với glyph ghi 3 chữ số như kanji_strokes.json
    assert _max_diff(ss.normalize_glyph(REF), REF) < 1e-12
    stored = json.loads('{"十": [[[0.5, 0.0], [0.5, 0.5], [0.5, 1.0]], [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]]]}')
    assert _max_diff(ss.normalize_glyph(stored["十"]), stored["十"]) < 1e-6
    # bất biến tịnh tiến / tỉ lệ: vẽ to gấp 3 và lệch đi vẫn ra cùng glyph
    moved = [[(3 * x + 100, 3 * y - 7) for x, y in s] for s in REF]
    assert _max_diff(ss.normalize_glyph(moved), REF) < 1e-9


@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_normalize_glyph_real_reference_unchanged():
    for ch in "日一人口":
        ref = kanjidata.strokes(ch)
        assert ref is not None
        assert _max_diff(ss.normalize_glyph(ref), ref) < 1e-6, ch


# ----------------------------------------------------------------------------- stroke_dtw / gán nét

def test_stroke_dtw_basic_properties():
    a = REF[2]
    assert ss.stroke_dtw(a, a) == 0.0
    shifted = [(x, y + 0.1) for x, y in a]
    assert ss.stroke_dtw(a, shifted) == pytest.approx(0.1)
    assert ss.stroke_dtw(a, shifted) == pytest.approx(ss.stroke_dtw(shifted, a))
    assert ss.stroke_dtw(a, a[::-1]) > 0.3                       # nét ngược chiều cách xa
    # số điểm khác nhau vẫn so được: DTW không nội suy nên nét 5 điểm cùng hình cách tối đa nửa bước lấy mẫu (0.094)
    assert 0 < ss.stroke_dtw(a, ss.resample(a, 5)) < 0.1
    assert ss.stroke_dtw(a, ss.resample(a, 16)) < 0.02
    assert ss.stroke_dtw([], a) == float("inf")
    assert ss.dtw_cost([], a) == (float("inf"), 0)


def test_dtw_cost_matches_fastdtw_exact_euclidean():
    """Spec yêu cầu DTW Euclid kiểu fastdtw; bản DP ở đây phải cho đúng tổng chi phí của fastdtw.dtw (chính xác), chỉ
    nhanh hơn (xem docstring module). Nét số điểm khác nhau và nét đảo chiều cũng phải khớp."""
    fastdtw = pytest.importorskip("fastdtw")
    euclidean = pytest.importorskip("scipy.spatial.distance").euclidean
    pairs = [(REF[0], REF[1]), (REF[1], REF[2]), (REF[2], REF[2][::-1]), (REF[0], REF[0]),
             (ss.resample(REF[1], 7), REF[3]), (REF[3], ss.resample([(0.2, 0.9), (0.5, 0.95), (0.8, 0.9)], 12))]
    for a, b in pairs:
        expected, path = fastdtw.dtw(a, b, dist=euclidean)
        cost, length = ss.dtw_cost(a, b)
        assert cost == pytest.approx(expected, abs=1e-9)
        assert max(len(a), len(b)) <= length <= len(a) + len(b) - 1 and len(path) >= max(len(a), len(b))
        assert ss.stroke_dtw(a, b) == pytest.approx(cost / length)


def test_greedy_assignment():
    cost = [[0.0, 0.5, 0.6],
            [0.4, 0.1, 0.5],
            [0.3, 0.2, 0.05]]
    assert ss.greedy_assignment(cost) == {0: 0, 1: 1, 2: 2}
    assert ss.greedy_assignment([[0.5, 0.0], [0.0, 0.5], [0.1, 0.1]]) == {0: 1, 1: 0}     # 3 nét / 2 mẫu → một nét thừa
    assert ss.greedy_assignment([[0.0, 0.9, 0.1]]) == {0: 0}                                # 1 nét / 3 mẫu
    assert ss.greedy_assignment([[float("inf")]]) == {} and ss.greedy_assignment([]) == {}


# ----------------------------------------------------------------------------- score_strokes

def test_reference_vs_itself_is_perfect():
    r = ss.score_strokes(REF, REF)
    assert r["total_score"] == 100.0 and r["is_correct_order"] is True
    assert r["missing"] == [] and r["extra"] == [] and r["stroke_count"] == 4
    assert r["per_stroke"] == [{"index": i, "score": 100.0, "wrong_direction": False, "expected_index": i} for i in range(4)]
    assert r["feedback"] == "Viết đúng thứ tự và hướng, nét rõ ràng!"


def test_pixel_coordinates_and_sparse_points_still_near_perfect():
    # nét thô 2–3 điểm, toạ độ canvas 300 px lệch gốc → resample + chuẩn hoá đưa về đúng mẫu. Nét chữ L không tròn 100
    # vì mẫu 32 điểm (đa giác) bị resample lại cắt góc một chút so với đường gấp khúc gốc của người dùng (~1.3 điểm).
    user = [[(x * 3 + 40, y * 3 + 15) for x, y in s] for s in RAW]
    r = ss.score_strokes(user, REF)
    assert r["total_score"] >= 99 and all(p["score"] >= 98 for p in r["per_stroke"])
    assert [p["score"] for p in r["per_stroke"]][::2] == [100.0, 100.0]      # nét thẳng khớp tuyệt đối
    assert r["is_correct_order"] and not r["missing"] and not r["extra"]


def test_reversed_stroke_flags_wrong_direction():
    user = [REF[0], REF[1], REF[2][::-1], REF[3]]       # nét ngang giữa vẽ từ phải sang trái
    r = ss.score_strokes(user, REF)
    assert [p["wrong_direction"] for p in r["per_stroke"]] == [False, False, True, False]
    assert r["per_stroke"][2]["score"] < 20 and r["per_stroke"][2]["expected_index"] == 2
    assert r["is_correct_order"] is True and r["missing"] == [] and r["extra"] == []
    assert "Nét 3 vẽ ngược hướng" in r["feedback"] and "chưa đúng hình" not in r["feedback"]
    assert 60 < r["total_score"] < 90


def test_swapped_strokes_wrong_order():
    user = [REF[0], REF[2], REF[1], REF[3]]
    r = ss.score_strokes(user, REF)
    assert r["is_correct_order"] is False
    assert [p["expected_index"] for p in r["per_stroke"]] == [0, 2, 1, 3]
    assert all(p["score"] == 100.0 for p in r["per_stroke"])      # hình từng nét vẫn đúng
    assert r["total_score"] == pytest.approx(100 - ss.PENALTY_ORDER)
    assert r["feedback"] == "Thứ tự nét 2 và 3 bị đảo."


def test_rotated_order_lists_correct_sequence():
    user = [REF[1], REF[2], REF[3], REF[0]]              # nét đầu vẽ cuối cùng
    r = ss.score_strokes(user, REF)
    assert r["is_correct_order"] is False
    assert [p["expected_index"] for p in r["per_stroke"]] == [1, 2, 3, 0]
    assert r["feedback"] == "Sai thứ tự nét (thứ tự đúng là nét 4, 1, 2, 3)."


def test_missing_stroke():
    user = [REF[0], REF[1], REF[3]]
    r = ss.score_strokes(user, REF)
    assert r["missing"] == [2] and r["extra"] == [] and r["stroke_count"] == 4
    assert r["is_correct_order"] is True                 # 0, 1, 3 vẫn tăng dần
    assert [p["expected_index"] for p in r["per_stroke"]] == [0, 1, 3]
    assert r["feedback"].startswith("Thiếu 1 nét")
    # nét thiếu tính 0 trong trung bình rồi trừ thêm 10
    assert 60 < r["total_score"] < 80


def test_extra_stroke():
    user = REF + [[(0.3, 0.3), (0.36, 0.32)]]            # thêm một nét lạ ngắn
    r = ss.score_strokes(user, REF)
    assert r["extra"] == [4] and r["missing"] == []
    assert r["per_stroke"][4] == {"index": 4, "score": 0.0, "wrong_direction": False, "expected_index": None}
    assert r["feedback"] == "Thừa 1 nét (nét 5)."
    assert 80 < r["total_score"] < 95


def test_count_penalty_is_capped():
    dots = [[(0.4 + i * 0.01, 0.4), (0.401 + i * 0.01, 0.4)] for i in range(6)]
    r = ss.score_strokes(REF + dots, REF)
    assert r["extra"] == [4, 5, 6, 7, 8, 9]
    w_ref = sum(ss._length(s) for s in REF)
    mean = 100 * w_ref / (w_ref + 6 * ss.MIN_WEIGHT)         # nét chấm dùng trọng số sàn
    assert r["total_score"] == pytest.approx(mean - ss.PENALTY_COUNT_CAP, abs=0.1)
    assert r["feedback"].startswith("Thừa 6 nét")


def test_wrong_shape_stroke_feedback():
    user = [REF[0], REF[1], [(0.2, 0.2), (0.8, 0.8)], REF[3]]      # nét giữa vẽ thành đường chéo
    r = ss.score_strokes(user, REF)
    assert r["per_stroke"][2]["expected_index"] == 2 and r["per_stroke"][2]["score"] < ss.WEAK_STROKE
    assert r["per_stroke"][2]["wrong_direction"] is False
    assert r["feedback"] == "Nét 3 chưa đúng hình."


def test_jittered_reference_scores_at_least_85():
    for seed in range(10):
        r = ss.score_strokes(_jitter(REF, seed), REF)
        assert r["total_score"] >= 85, (seed, r)
        assert all(p["score"] >= 80 and not p["wrong_direction"] for p in r["per_stroke"]), (seed, r)
        assert r["is_correct_order"] and not r["missing"] and not r["extra"]


def test_dot_stroke_is_not_flagged_as_reversed():
    ref = [[(0.5, 0.0), (0.5, 1.0)], [(0.9, 0.5)]]                 # nét dọc + nét chấm (một điểm)
    r = ss.score_strokes([[(0.5, 0.0), (0.5, 1.0)], [(0.9, 0.5), (0.9, 0.5)]], ref)
    assert r["total_score"] == 100.0 and not any(p["wrong_direction"] for p in r["per_stroke"])


def test_short_stroke_direction_is_not_judged(monkeypatch):
    """Nét mẫu ngắn hơn MIN_DIRECTION_LEN (chấm) không có hướng rõ → không bao giờ báo ngược, kể cả khi tắt cổng
    khoảng cách; cùng hình nhưng đủ dài thì vẫn bị bắt."""
    monkeypatch.setattr(ss, "MIN_DIRECTION_D", 0.0)
    ref = [[(0.0, 0.5), (1.0, 0.5)], [(0.5, 0.1), (0.56, 0.16)]]         # ngang dài 1 + chấm dài 0.085
    r = ss.score_strokes([ref[0], ref[1][::-1]], ref)
    assert r["per_stroke"][1]["expected_index"] == 1 and r["per_stroke"][1]["wrong_direction"] is False
    assert "ngược hướng" not in r["feedback"]
    long_ref = [[(0.0, 0.5), (1.0, 0.5)], [(0.5, 0.1), (0.7, 0.3)]]      # nét xiên dài 0.28
    r = ss.score_strokes([long_ref[0], long_ref[1][::-1]], long_ref)
    assert r["per_stroke"][1]["wrong_direction"] is True and "Nét 2 vẽ ngược hướng" in r["feedback"]


def test_missing_boundary_stroke_reports_the_right_index():
    """Thiếu nét trên cùng của 三: hộp bao của 2 nét còn lại nhỏ hơn hộp cả chữ → khung phải thử bỏ nét biên của mẫu,
    không thì hai nét bị kéo giãn, báo thiếu nét giữa và tổng sụp dù mọi nét vẽ hoàn hảo."""
    for k in range(3):
        r = ss.score_strokes([s for i, s in enumerate(SAN) if i != k], SAN)
        assert r["missing"] == [k] and r["extra"] == [] and r["is_correct_order"], (k, r)
        assert all(p["score"] >= 95 and p["expected_index"] != k for p in r["per_stroke"]), (k, r)
        assert r["total_score"] > 40 and r["feedback"] == f"Thiếu 1 nét (nét {k + 1} của mẫu)."


def test_stray_mark_far_from_glyph_is_extra_not_a_new_frame():
    """Chấm lạc (tì tay) ở góc canvas không được kéo hộp bao: 4 nét thật vẫn 100, chấm là nét thừa số 5."""
    user = [[(x * 3 + 40, y * 3 + 15) for x, y in s] for s in RAW] + [[(600.0, 600.0), (604.0, 600.0)]]
    r = ss.score_strokes(user, REF)
    assert r["extra"] == [4] and r["missing"] == [] and r["is_correct_order"]
    assert all(p["score"] >= 98 for p in r["per_stroke"][:4]) and r["feedback"] == "Thừa 1 nét (nét 5)."
    assert r["total_score"] > 85


def test_outlying_stroke_does_not_rescale_the_others():
    """Một nét vẽ lệch hẳn ra ngoài (nét giữa của 日 dịch xuống 0.3) là lỗi của nét đó: ba nét kia vẫn ≈ 100, nét lệch
    < WEAK_STROKE; nét lệch nhẹ 0.1 (vuông góc) chỉ mất điểm vị trí, không bị coi là sai hình."""
    user = [[(x, y + (0.3 if k == 2 else 0)) for x, y in s] for k, s in enumerate(REF)]
    r = ss.score_strokes(user, REF)
    assert all(p["score"] >= 97 for i, p in enumerate(r["per_stroke"]) if i != 2), r
    assert r["per_stroke"][2]["score"] < ss.WEAK_STROKE and r["feedback"] == "Nét 3 chưa đúng hình."
    user = [[(x, y + (0.1 if k == 2 else 0)) for x, y in s] for k, s in enumerate(REF)]
    r = ss.score_strokes(user, REF)
    assert 80 <= r["per_stroke"][2]["score"] < 95 and "chưa đúng hình" not in r["feedback"]


def test_parallel_strokes_with_small_offset_are_not_an_order_error():
    """Hai chấm song song cách nhau 0.1, mỗi chấm lệch tay 0.05 về phía chấm kia: gán tham lam đổi chỗ chúng nhưng gán
    xuôi chỉ đắt hơn một chút → giữ đúng thứ tự. Đổi chỗ thật (vẽ chấm phải trước) vẫn bị bắt."""
    ref = [[(0.0, 0.5), (1.0, 0.5)], [(0.30, 0.0), (0.34, 0.06)], [(0.40, 0.0), (0.44, 0.06)]]
    shifted = [ref[0], [(x + 0.052, y) for x, y in ref[1]], [(x - 0.052, y) for x, y in ref[2]]]
    r = ss.score_strokes(shifted, ref)
    assert r["is_correct_order"] and [p["expected_index"] for p in r["per_stroke"]] == [0, 1, 2], r
    assert "bị đảo" not in r["feedback"]
    r = ss.score_strokes([ref[0], ref[2], ref[1]], ref)
    assert r["is_correct_order"] is False and r["feedback"] == "Thứ tự nét 2 và 3 bị đảo."


def test_total_has_floor_while_half_the_strokes_are_recognisable():
    dots = [[(0.4 + i * 0.02, 0.4), (0.41 + i * 0.02, 0.41)] for i in range(6)]
    # 2 nét đúng (đảo thứ tự) + 6 chấm: 2 chấm bị gán cho nét 3, 4 (≈ 0 điểm), 4 chấm thừa → phạt −40 −15 đẩy tổng âm,
    # nhưng nửa số nét mẫu đã vẽ đúng hình nên có sàn
    r = ss.score_strokes([REF[1], REF[0]] + dots, REF)
    assert r["is_correct_order"] is False and len(r["extra"]) == 4
    assert r["total_score"] == ss.FLOOR_RECOGNISED
    r = ss.score_strokes([REF[0]] + dots, REF)          # chỉ 1 / 4 nét đúng → không có sàn
    assert r["total_score"] == 0.0


def test_non_finite_points_are_ignored():
    nan, inf = float("nan"), float("inf")
    user = [REF[0] + [(nan, 0.5)], REF[1], [(inf, 0.5), (0.3, nan)], REF[2], REF[3]]   # nét 3 toàn điểm rác → bỏ
    r = ss.score_strokes(user, REF)
    assert r["total_score"] == 100.0 and r["extra"] == [] and r["missing"] == [] and len(r["per_stroke"]) == 4


def test_empty_inputs():
    r = ss.score_strokes([], REF)
    assert r == {"total_score": 0.0, "is_correct_order": False, "feedback": "Không phát hiện nét vẽ nào.",
                 "per_stroke": [], "missing": [0, 1, 2, 3], "extra": [], "stroke_count": 4}
    assert ss.score_strokes([[], []], REF)["missing"] == [0, 1, 2, 3]     # nét rỗng bị bỏ qua
    r = ss.score_strokes(REF, [])
    assert r["total_score"] == 0.0 and r["extra"] == [0, 1, 2, 3] and r["stroke_count"] == 0


# ----------------------------------------------------------------------------- dữ liệu thật

@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_real_kanji_sanity():
    ref = kanjidata.strokes("日")
    assert ref is not None and len(ref) == 4
    assert ss.score_strokes(ref, ref)["total_score"] == 100.0
    r = ss.score_strokes([ref[0][::-1]] + ref[1:], ref)
    assert r["per_stroke"][0]["wrong_direction"] is True and "Nét 1 vẽ ngược hướng" in r["feedback"]
    assert ss.score_strokes([ref[0], ref[2], ref[1], ref[3]], ref)["feedback"] == "Thứ tự nét 2 và 3 bị đảo."
    for seed in range(5):
        assert ss.score_strokes(_jitter(ref, seed), ref)["total_score"] >= 85


@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_real_kanji_jitter_calibration_and_direction():
    """Bộ chữ dùng hiệu chuẩn D0 (docstring module): nhiễu ±0.03 vẫn ≥ 85 và không báo nhầm hướng / thứ tự / số nét;
    đảo từng nét một (không nhiễu) đều bị bắt là ngược hướng, đúng nét."""
    for ch in "日一人口月山木語":
        ref = kanjidata.strokes(ch)
        assert ref, ch
        for seed in range(3):
            r = ss.score_strokes(_jitter(ref, seed), ref)
            assert r["total_score"] >= 85 and r["is_correct_order"], (ch, seed, r["total_score"], r["feedback"])
            assert not r["missing"] and not r["extra"] and not any(p["wrong_direction"] for p in r["per_stroke"]), (ch, seed)
        for i in range(len(ref)):
            user = [s[::-1] if k == i else s for k, s in enumerate(ref)]
            r = ss.score_strokes(user, ref)
            flagged = [p["index"] for p in r["per_stroke"] if p["wrong_direction"]]
            assert flagged == [i] and r["per_stroke"][i]["expected_index"] == i, (ch, i, r["feedback"])
            assert f"Nét {i + 1} vẽ ngược hướng" in r["feedback"]


@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_real_missing_stroke_and_stray_mark():
    """三 thiếu nét trên / dưới (đổi hộp bao) phải báo đúng nét thiếu; 日 trên canvas 300 px + chấm lạc (600, 600)
    phải báo thừa nét 5 với 4 nét thật nguyên điểm."""
    san = kanjidata.strokes("三")
    for k in range(3):
        r = ss.score_strokes([s for i, s in enumerate(san) if i != k], san)
        assert r["missing"] == [k] and not r["extra"] and all(p["score"] >= 95 for p in r["per_stroke"]), (k, r)
    for ch, k in [("川", 0), ("乳", 7), ("辛", 6), ("電", 12), ("爪", 3)]:
        ref = kanjidata.strokes(ch)
        r = ss.score_strokes([s for i, s in enumerate(ref) if i != k], ref)
        assert r["missing"] == [k] and not r["extra"] and r["total_score"] >= 50, (ch, k, r)
    ri = kanjidata.strokes("日")
    user = [[(x * 300, y * 300) for x, y in s] for s in ri] + [[(600.0, 600.0), (604.0, 600.0)]]
    r = ss.score_strokes(user, ri)
    assert r["extra"] == [4] and r["missing"] == [] and all(p["score"] >= 85 for p in r["per_stroke"][:4]), r
    assert r["feedback"] == "Thừa 1 nét (nét 5)." and r["total_score"] >= 85


@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_real_parallel_dots_with_hand_offset_are_not_order_errors():
    """鮮 / 聳 / 償 / 鬱: chấm 灬 và nét ngắn song song, mỗi nét lệch tay ±0.04 (≈ 12 px trên canvas 300 px) vẽ đúng thứ tự
    không được báo đảo; đảo thật hai chấm 11 / 12 của 鮮 vẫn bị bắt."""
    for ch in "鮮聳償鬱":
        ref = kanjidata.strokes(ch)
        for seed in range(3):
            r = ss.score_strokes(_offset_jitter(ref, seed), ref)
            assert r["is_correct_order"] and not r["missing"] and not r["extra"], (ch, seed, r["feedback"])
    sen = kanjidata.strokes("鮮")
    user = list(sen)
    user[10], user[11] = sen[11], sen[10]
    assert ss.score_strokes(user, sen)["feedback"].startswith("Thứ tự nét 11 và 12 bị đảo")


@pytest.mark.skipif(not kanjidata.availability().get("kanjivg"), reason="chưa build kanji_strokes.json")
def test_real_square_glyphs_are_proportion_differences_not_wrong_strokes():
    """口 / 日 vẽ vuông vức đủ nét đúng thứ tự (font KanjiVG vẽ hình thang / dẹt): khác tỉ lệ, không phải sai nét."""
    sq3 = [[(0.0, 0.0), (0.0, 1.0)], [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)], [(0.0, 1.0), (1.0, 1.0)]]
    r = ss.score_strokes(sq3, kanjidata.strokes("口"))
    assert r["total_score"] >= 70 and r["is_correct_order"] and "chưa đúng hình" not in r["feedback"], r
    assert not r["missing"] and not r["extra"] and all(p["score"] > ss.WEAK_STROKE for p in r["per_stroke"])
    hi4 = [[(0.0, 0.0), (0.0, 1.0)], [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)], [(0.0, 0.5), (1.0, 0.5)], [(0.0, 1.0), (1.0, 1.0)]]
    r = ss.score_strokes(hi4, kanjidata.strokes("日"))
    assert r["total_score"] >= 70 and "chưa đúng hình" not in r["feedback"], r
    # 口 vẽ 4 nét (tách 乛 thành ngang + dọc, lỗi phổ biến): thừa nét + nét 乛 sai hình, nhưng vẫn nhận ra chữ → không 0
    sq4 = [[(0.0, 0.0), (0.0, 1.0)], [(0.0, 0.0), (1.0, 0.0)], [(1.0, 0.0), (1.0, 1.0)], [(0.0, 1.0), (1.0, 1.0)]]
    r = ss.score_strokes(sq4, kanjidata.strokes("口"))
    assert len(r["extra"]) == 1 and ss.FLOOR_RECOGNISED <= r["total_score"] < 50, r
