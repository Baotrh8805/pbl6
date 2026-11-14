"""app/extract/pitch.py: chia mora, mẫu H/L chuẩn, lượng tử hoá đường F0 và chấm điểm.

Các đường F0 tổng hợp và kết quả mong đợi chép từ frontend/scripts/selfCheck.ts (mục quantizeHL / referenceHL /
pitchScore): hai bên phải luôn cho cùng kết quả vì trình duyệt chấm trước, backend chấm lại khi lưu.
"""
from types import SimpleNamespace

import pytest

from app.extract import kanjidata, pitch


def step_contour(pattern: str) -> list[dict]:
    """Bậc thang 20 mẫu / mora, 20 ms / mẫu: L = 100 Hz, H = 130 Hz (≈ 4.5 nửa cung), "_" = mora câm (f0 None)."""
    f0 = {"H": 130.0, "L": 100.0}
    return [{"t": (m * 20 + k) * 0.02, "f0": f0.get(ch)} for m, ch in enumerate(pattern) for k in range(20)]


def hl(pattern: str) -> str:
    return "".join(lv or "_" for lv in pitch.quantize_hl(step_contour(pattern), len(pattern)))


def ramp(f0s: list[float]) -> list[dict]:
    """Mỗi phần tử là một đoạn 20 mẫu ở tần số đó."""
    return [{"t": (m * 20 + k) * 0.02, "f0": f} for m, f in enumerate(f0s) for k in range(20)]


# ----------------------------------------------------------------------------- mora

@pytest.mark.parametrize("reading, moras", [
    ("にほん", ["に", "ほ", "ん"]),
    ("きょう", ["きょ", "う"]),
    ("がっこう", ["が", "っ", "こ", "う"]),
    ("しゃしん", ["しゃ", "し", "ん"]),
    ("コーヒー", ["こ", "ー", "ひ", "ー"]),          # katakana → hiragana, ー là mora riêng
    ("ファイル", ["ふぁ", "い", "る"]),
    ("ニッポン", ["に", "っ", "ぽ", "ん"]),
    ("くゎ", ["くゎ"]),
    ("ゃ", ["ゃ"]),                                   # kana nhỏ đứng đầu không có gì để dính → mora riêng
    ("に ほん", ["に", "ほ", "ん"]),                  # khoảng trắng bị bỏ
    ("", []),
    # kết quả của frontend/src/lib/kana.ts moraSplit chạy thật dưới Node (NFKC + chỉ giữ \p{L}\p{N}): phải trùng
    ("にほん。", ["に", "ほ", "ん"]),                  # dấu câu bị bỏ
    ("ニュー・ヨーク", ["にゅ", "ー", "よ", "ー", "く"]),  # ・ bị bỏ, ー (Lm) giữ
    ("ｶﾞｯｺｳ", ["が", "っ", "こ", "う"]),               # kana nửa rộng + dấu đục rời → NFKC ghép
    ("ﾆﾎﾝ", ["に", "ほ", "ん"]),
    ("ｱ", ["あ"]),
    ("１２", ["1", "2"]),                             # số toàn rộng → số thường, vẫn là mora (\p{N})
])
def test_mora_split(reading, moras):
    assert pitch.mora_split(reading) == moras


def test_normalize_reading_matches_frontend_preprocessing():
    assert pitch.normalize_reading("ニュー・ヨーク ") == "にゅーよーく"
    assert pitch.normalize_reading("ｶﾞｯｺｳ") == "がっこう" and pitch.normalize_reading("日本") == "日本"
    assert pitch.normalize_reading("") == "" and pitch.normalize_reading(None) == ""


# ----------------------------------------------------------------------------- mẫu chuẩn

@pytest.mark.parametrize("count, accent, expected", [
    (4, 0, "LHHH"),   # heiban
    (4, 1, "HLLL"),   # atamadaka
    (4, 2, "LHLL"),   # nakadaka
    (4, 3, "LHHL"),   # nakadaka
    (4, 4, "LHHH"),   # odaka: hạ ở trợ từ, ngoài từ
    (0, 1, ""),
    (3, 7, "LHH"),    # ngoài dải → kẹp về số mora (odaka)
    (3, -2, "LHH"),   # âm → kẹp về 0 (heiban)
    (1, 0, "L"),
    (1, 1, "H"),
    (2, 2, "LH"),
])
def test_reference_hl_table(count, accent, expected):
    assert "".join(pitch.reference_hl(count, accent)) == expected


def test_reference_contour_and_kind():
    assert pitch.reference_contour("にほん", 2) == [
        {"mora": "に", "level": "L"}, {"mora": "ほ", "level": "H"}, {"mora": "ん", "level": "L"}]
    assert pitch.reference_contour("ニホン", 0) == [
        {"mora": "に", "level": "L"}, {"mora": "ほ", "level": "H"}, {"mora": "ん", "level": "H"}]
    assert pitch.reference_contour("", 0) == []
    assert [pitch.accent_kind(3, a) for a in (0, 1, 2, 3, 9)] == ["heiban", "atamadaka", "nakadaka", "odaka", "odaka"]
    assert pitch.accent_kind(1, 1) == "atamadaka"


# ----------------------------------------------------------------------------- quantize_hl (selfCheck.ts)

LOW_HIGH = [{"t": i * 0.02, "f0": 100.0 if i < 20 else 150.0} for i in range(40)]


def test_quantize_low_high_and_reverse():
    assert pitch.quantize_hl(LOW_HIGH, 2) == ["L", "H"]
    reversed_f0 = [{"t": i * 0.02, "f0": p["f0"]} for i, p in enumerate(reversed(LOW_HIGH))]
    assert pitch.quantize_hl(reversed_f0, 2) == ["H", "L"]


def test_quantize_no_voice_or_no_mora():
    assert pitch.quantize_hl([{"t": 0, "f0": None}], 3) == []
    assert pitch.quantize_hl([], 3) == []
    assert pitch.quantize_hl([{"t": 0, "f0": 0.0}, {"t": 0.1, "f0": -5.0}], 2) == []   # f0 <= 0 không phải thanh
    assert pitch.quantize_hl(LOW_HIGH, 0) == []


@pytest.mark.parametrize("pattern", ["LHH", "LHHH", "HLL", "HLLL", "LHL", "LHLL", "LHHL"])
def test_quantize_step_patterns_do_not_collapse(pattern):
    """Hai mặt bằng dài ngắn khác nhau không sụp về một mức (so với trung vị sẽ hỏng ở đây)."""
    assert hl(pattern) == pattern


def test_quantize_silent_mora_and_flat_voice():
    assert hl("L_HH") == "L_HH"            # っ / nguyên âm vô thanh hoá → None, không bịa mức
    assert pitch.quantize_hl(step_contour("L_HH"), 4) == ["L", None, "H", "H"]
    assert hl("LLLL") == "LLLL"            # giọng đều → toàn L
    assert hl("HHHH") == "LLLL"            # không có biến đổi thì không phân biệt được với giọng đều


def test_quantize_tamago_fall_deeper_than_rise():
    """Nakadaka thực tế: hạ sau hạt nhân sâu hơn bước lên đầu từ (≈ 0 / +2.5 / −3 nửa cung) vẫn ra LHL."""
    assert pitch.quantize_hl(ramp([100, 115.5, 84]), 3) == ["L", "H", "L"]


def test_quantize_single_mora_uses_slope_inside_mora():
    flat = [{"t": i * 0.02, "f0": 150.0} for i in range(40)]
    fall = [{"t": i * 0.02, "f0": 176.0 if i < 20 else 100.0} for i in range(40)]
    rise = [{"t": i * 0.02, "f0": 100.0 if i < 20 else 176.0} for i in range(40)]
    assert pitch.quantize_hl(flat, 1) == ["L"]       # kiểu 0
    assert pitch.quantize_hl(fall, 1) == ["H"]       # kiểu 1
    assert pitch.quantize_hl(rise, 1) == ["L"]
    assert pitch.quantize_hl([{"t": 0, "f0": 120.0}], 1) == ["L"]   # một mẫu: không có nửa để so


def test_quantize_zero_span_and_deadband():
    # mọi điểm cùng thời điểm → tất cả vào ô đầu, ô sau None
    same_t = [{"t": 0.5, "f0": f} for f in (100.0, 130.0, 100.0)]
    assert pitch.quantize_hl(same_t, 3) == ["L", None, None]
    # biến đổi dưới ngưỡng (100 → 104 Hz ≈ 0.7 nửa cung) không tính; nới ngưỡng xuống thì tính
    small = ramp([100, 104])
    assert pitch.quantize_hl(small, 2) == ["L", "L"]
    assert pitch.quantize_hl(small, 2, deadband_st=0.5) == ["L", "H"]


def test_quantize_accepts_objects_with_attributes():
    pts = [SimpleNamespace(t=p["t"], f0=p["f0"]) for p in LOW_HIGH]
    assert pitch.quantize_hl(pts, 2) == ["L", "H"]


def test_quantize_ignores_non_finite_points():
    bad = [{"t": 0, "f0": float("nan")}, {"t": float("inf"), "f0": 120.0}, {"t": 0.1, "f0": float("inf")},
           {"t": None, "f0": 120.0}, {"t": 0.2, "f0": "x"}]
    assert pitch.quantize_hl(bad, 2) == []
    assert pitch.quantize_hl(bad + LOW_HIGH, 2) == ["L", "H"]
    assert pitch.score(bad, "にほん", 0)["voicedRatio"] == 0.0


# ----------------------------------------------------------------------------- pitch_score (selfCheck.ts)

def test_pitch_score_matches_frontend():
    assert pitch.pitch_score(["L", "H", "H", "H"], pitch.reference_hl(4, 0)) == (100, [])
    assert pitch.pitch_score(["L", "L", "H", "H"], ["L", "H", "L", "L"]) == (25, [1, 2, 3])
    assert pitch.pitch_score(["L"], ["L", "H"]) == (50, [1])                  # nói thiếu mora → tính sai
    assert pitch.pitch_score(["L", None, "H", "H"], pitch.reference_hl(4, 0)) == (100, [])   # mora câm bỏ khỏi tử và mẫu
    assert pitch.pitch_score(["L", None, "L", "H"], pitch.reference_hl(4, 0)) == (67, [2])
    assert pitch.pitch_score([], ["L", "H"]) == (0, [0, 1])
    assert pitch.pitch_score(["L", "H"], []) == (0, [])
    assert pitch.pitch_score([None, None], ["L", "H"]) == (0, [])


def test_pitch_score_rounds_half_up_like_js():
    # 1/8 đúng = 12.5 → Math.round cho 13; round() của Python cho 12
    assert pitch.pitch_score(["L"] + ["H"] * 7, ["L"] * 8)[0] == 13


# ----------------------------------------------------------------------------- score

def test_score_exact_match_is_100():
    s = pitch.score(step_contour("LHH"), "にほん", 0)
    assert s == {
        "pct": 100, "userHL": ["L", "H", "H"], "refHL": ["L", "H", "H"], "wrongMora": [], "voicedRatio": 1.0,
        "feedback": s["feedback"],
    }
    assert "Đúng mẫu" in s["feedback"] and "heiban" in s["feedback"]


def test_score_reports_wrong_moras_in_vietnamese():
    s = pitch.score(step_contour("HLL"), "にほん", 0)
    assert s["pct"] == 0
    assert s["wrongMora"] == [0, 1, 2]
    assert s["userHL"] == ["H", "L", "L"] and s["refHL"] == ["L", "H", "H"]
    assert "mora 1 「に」 cần thấp hơn" in s["feedback"]
    assert "mora 2 「ほ」 cần cao hơn" in s["feedback"]
    assert "heiban" in s["feedback"]
    # nakadaka: gợi ý nêu đúng mora hạ
    s2 = pitch.score(step_contour("LHHH"), "あたらしい", 4)
    assert s2["refHL"] == ["L", "H", "H", "H", "L"]
    # bản ghi 4 bậc vẫn bị chia 5 ô: ô cuối còn cao (chưa hạ sau い) → 1/5 sai
    assert s2["userHL"] == ["L", "H", "H", "H", "H"]
    assert s2["wrongMora"] == [4] and s2["pct"] == 80
    assert "đến mora 4 rồi hạ" in s2["feedback"]


def test_score_silent_mora_not_penalised():
    s = pitch.score(step_contour("L_HH"), "がっこう", 0)
    assert s["userHL"] == ["L", None, "H", "H"]
    assert s["pct"] == 100 and s["wrongMora"] == []
    assert s["voicedRatio"] == 0.75


def test_score_without_voice():
    s = pitch.score([{"t": i * 0.02, "f0": None} for i in range(10)], "にほん", 0)
    assert s["pct"] == 0 and s["userHL"] == [] and s["voicedRatio"] == 0.0
    assert s["wrongMora"] == [0, 1, 2]
    assert "micro" in s["feedback"]
    assert pitch.score([], "にほん", 0)["voicedRatio"] == 0.0


def test_score_one_mora_feedback():
    fall = [{"t": i * 0.02, "f0": 176.0 if i < 20 else 100.0} for i in range(40)]
    assert pitch.score(fall, "き", 1)["pct"] == 100
    s = pitch.score(fall, "ひ", 0)
    assert s["pct"] == 0 and "Từ một mora" in s["feedback"]


# ----------------------------------------------------------------------------- dữ liệu

def test_available_and_accent_type_follow_pitch_file(tmp_path, monkeypatch):
    monkeypatch.setattr(kanjidata, "PITCH_FILE", tmp_path / "missing.csv")
    kanjidata.reset()
    try:
        assert pitch.available() is False
        assert pitch.accent_type("日本", "にほん") is None
        (tmp_path / "pitch_accent.csv").write_text("word,reading,accent_type\n日本,にほん,2\n", encoding="utf-8")
        monkeypatch.setattr(kanjidata, "PITCH_FILE", tmp_path / "pitch_accent.csv")
        kanjidata.reset()
        assert pitch.available() is True
        assert pitch.accent_type("日本", "にほん") == 2
        assert pitch.accent_type("日本", "ニホン") == 2
    finally:
        kanjidata.reset()


@pytest.mark.skipif(not kanjidata.PITCH_FILE.exists(), reason="pitch_accent.csv chưa build (scripts/build_dicts.py)")
def test_real_pitch_data_sanity():
    kanjidata.reset()
    assert pitch.available() is True
    accent = pitch.accent_type("日本", "にほん")
    assert accent is not None and 0 <= accent <= 3
    assert len(pitch.reference_contour("にほん", accent)) == 3
