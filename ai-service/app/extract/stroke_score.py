"""Chấm nét viết chữ Hán bằng DTW (luyện viết LP-17, assignment E2) — hàm thuần, không I/O.

Đầu vào: nét người dùng (toạ độ canvas bất kỳ, số điểm bất kỳ) và nét mẫu KanjiVG (kanjidata.strokes: 32 điểm/nét,
hộp 0..1 cả chữ). Quy trình:
  1. resample mỗi nét người dùng về 32 điểm cách đều theo chiều dài cung (cùng thuật toán scripts/build_dicts._resample)
     để DTW không lệch vì tốc độ bút không đều.
  2. chọn KHUNG đưa nét người dùng về hệ toạ độ mẫu (_best_frame). Khung mặc định là hộp bao cả chữ như
     build_dicts.normalise_glyph (hộp người dùng ↔ hộp mẫu, cho phép lệch tỉ lệ ngang/dọc tới ASPECT_TOL vì người
     học vẽ 口 vuông còn font KanjiVG vẽ dẹt; mẫu vs chính nó → đúng phép chuẩn hoá cũ). Nhưng hộp bao của bản vẽ
     chỉ đại diện cho cả chữ khi người dùng vẽ đủ nét và không vẽ thừa ra ngoài: thiếu nét trên cùng của 三 là hai nét
     còn lại bị kéo giãn lấp cả hộp, một chấm lạc ở góc canvas (tì tay) làm cả chữ co lại — mọi nét khác đều "sai" và
     chỉ số nét thiếu / thừa bị báo nhầm. Vì vậy thử thêm các giả thuyết: thiếu nét → hộp mẫu bỏ bớt 1–2 nét nằm trên
     biên hộp (nét không chạm biên thì bỏ cũng không đổi hộp); thừa nét → hộp người dùng bỏ bớt 1–2 nét trên biên; đủ
     nét vẫn thử bỏ một nét biên mỗi bên (một nét vẽ lệch hẳn ra ngoài cũng làm hộp sai). Mỗi giả thuyết được chấm
     nhanh bằng khoảng cách điểm-điểm (numpy, không DTW) + gán tham lam, lấy khung cho tổng BÌNH PHƯƠNG điểm nét khớp
     cao nhất (ba nét trùng khít + một nét lệch hẳn thắng bốn nét "tàm tạm"); rồi tinh chỉnh theo hộp của riêng các cặp
     đã gán (nét thừa / thiếu bị loại khỏi khung) và bình phương tối thiểu trên các cặp điểm đã gán, chỉ nhận khi tốt
     hơn. Chỉ khung thắng mới đi qua DTW đầy đủ.
  3. ma trận chi phí người dùng × mẫu bằng stroke_dtw → gán tham lam (cặp rẻ nhất trước) → nét nào ứng với nét mẫu
     nào. Hai nét bị gán ngược thứ tự nhưng gán xuôi cũng chỉ đắt hơn ≤ ORDER_EPS thì coi là đúng thứ tự (hai chấm 灬
     song song lệch tay vài px không phải lỗi thứ tự; nét đảo thật chênh ≥ 0.15). Thứ tự nét mẫu được gán không tăng
     dần theo thứ tự vẽ → sai thứ tự; nét mẫu không được gán → thiếu; nét người dùng không được gán → thừa.
  4. từng cặp đã gán: bù phần dịch chuyển của cả nét (hiệu trọng tâm, tối đa OFFSET_TOL) trước khi DTW để điểm hình
     không trộn với điểm vị trí; điểm = clamp(100 × (1 − d / D0) − 100 × OFFSET_RATE × |dịch| / D0): nét đúng hình
     nhưng đặt lệch (vuông góc với nét) 1/10 chữ còn 88, 0.15 → 68, 0.2 → 48 ("chưa đúng hình"), 0.3 → 8; méo hình thì
     vẫn mất điểm theo d như cũ (chéo thay vì ngang → 49). Lệch DỌC THEO nét thì DTW vốn trượt được nên chỉ mất điểm
     dịch chuyển + phần nhô ra (0.3 → ~65), như trước. So thêm với nét mẫu đảo chiều, nếu đảo rõ ràng khớp hơn
     (d_rev < 0.8 × d) và nét đủ dài để có hướng → vẽ ngược hướng. Điểm vẫn tính theo d xuôi nên nét ngược tự nhiên bị
     điểm thấp.
  5. tổng = trung bình có trọng số (độ dài nét mẫu; nét thiếu / thừa tính 0 điểm) trừ phạt: −10 mỗi nét thiếu / thừa
     (tối đa −40), −15 khi sai thứ tự; nhưng không xuống dưới FLOOR_RECOGNISED khi ≥ nửa số nét mẫu đã được vẽ đúng
     hình (chữ nhận ra được không thể 0 điểm như không vẽ gì); kèm nhận xét tiếng Việt chỉ đích danh nét lỗi.

DTW: quy hoạch động chính xác (ma trận Euclid bằng numpy + DP 32×32 thuần Python) thay vì gọi gói fastdtw như router
cũ. Đo trên máy dev (fastdtw 0.3.4 bản thuần Python, không có extension C): fastdtw(radius=1, dist=euclidean) ≈ 17 ms
một cặp nét, dist=2 ≈ 9.5 ms, fastdtw.dtw (chính xác) ≈ 27 ms; bản ở đây ≈ 0.7 ms. Một request chấm chữ 29 nét (鬱) cần
841 cặp + 2 × 29 cặp (bù dịch chuyển, đảo chiều) → ~0.3 s thay vì ~15 s; trường hợp giới hạn 40 nét × 500 điểm ≈ 0.5 s.
Kết quả KHÔNG đổi về mặt toán học: tổng chi phí DTW bằng đúng fastdtw.dtw(dist=euclidean) (có test so khớp), chỉ bỏ
phần xấp xỉ (radius) của fastdtw. Khoảng cách chia cho độ dài đường khớp = khoảng cách trung bình của một cặp điểm được
khớp, cùng đơn vị hộp 0..1 nên so được với D0 bất kể số điểm.

Hiệu chuẩn D0 (thí nghiệm trên 日 一 人 口 月 山 木 語, nhiễu đều i.i.d. ±0.03 mỗi điểm mỗi trục, 50 seed/chữ = 400 chữ,
~2 400 nét; lặp lại được bằng tests/test_stroke_score.py::_jitter):
  d sau DTW của nét nhiễu: trung bình ≈ 0.019, p95 ≈ 0.026, lớn nhất ≈ 0.05. Tệ nhất luôn là nét ngắn của 語 (dài 0.14,
  bước giữa 32 điểm chỉ 0.0044 ≪ 0.03): đường gấp khúc nhiễu dài gấp nhiều lần nét thật nên resample theo cung lệch
  điểm — mô hình nhiễu i.i.d. khắt khe hơn tay run thật (nhiễu tay có tương quan, mượt theo thời gian).
  Mốc so sánh: dịch nguyên nét 0.1 → d = 0.1; nét đảo chiều → d trung vị 0.32, lớn nhất 0.66, nhỏ nhất 0.07 (chấm của 語);
  nét khác hẳn trong cùng chữ (dọc vs ngang, nét khác vị trí) → d nhỏ nhất 0.155, trung vị 0.51.
  D0 = 0.25: nhiễu ±0.03 → nét tệ nhất ≈ 85 (sau bù dịch chuyển; 80 khi chưa bù), điểm tổng thấp nhất ≈ 89, không có
  cảnh báo sai nào về hướng / thứ tự / số nét trong 400 chữ; nét méo (chéo thay vì ngang) → d ≈ 0.13 → 49; nét ngược /
  nét sai hẳn → 0–38. D0 = 0.2 làm nét run tay tệ nhất rơi xuống ~75; D0 = 0.3 thì nét méo còn ~57.
  Đảo chiều từng nét của 8 chữ trên kèm nhiễu (350 trường hợp) đều bị bắt là ngược hướng.
Kiểm chứng khung + bù dịch chuyển + hoà thứ tự (thí nghiệm khi sửa, lặp lại được bằng các test real-data):
  bỏ một nét bất kỳ của 150 chữ ngẫu nhiên (1 587 trường hợp, nét còn lại vẽ hoàn hảo): chỉ số nét thiếu đúng 100 %
  (trước: 27 sai), tổng ≥ 28 (thấp nhất là 力 chỉ còn 1 / 2 nét; trước: 17 chữ < 30 dù mọi nét vẽ hoàn hảo); 日 trên
  canvas 300 px + một chấm lạc ở (600, 600) → thừa đúng nét 5, 4 nét thật 100 (trước: tổng 4.2, báo thừa nét 3);
  250 chữ × 2 seed nhiễu ±0.03 + mỗi nét lệch riêng ±0.04 → 0 / 500 báo nhầm thứ tự (trước: 5, 鮮 聳 償 鬱);
  口 vẽ vuông vức 3 nét → 81 (trước 48.5 và "nét 3 chưa đúng hình"), 日 vuông → 86 (trước 57); 口 vẽ 4 nét (tách 乛)
  → 36 / sàn 20 (trước 7 / 0). Thời gian: 日 ≈ 10 ms, 語 ≈ 90 ms, 鬱 ≈ 0.4 s, giới hạn 40 nét × 500 điểm ≈ 0.5 s.
"""
from __future__ import annotations

import math
from itertools import combinations
from typing import Iterable, Sequence

import numpy as np

Point = tuple[float, float]
Stroke = list[Point]

N_POINTS = 32            # số điểm mỗi nét sau resample — bằng kanji_strokes.json
D0 = 0.25                # khoảng cách DTW (đơn vị hộp 0..1) ứng với 0 điểm; xem hiệu chuẩn ở docstring module
REVERSE_RATIO = 0.8      # d_rev < 0.8 × d_fwd → vẽ ngược hướng
MIN_DIRECTION_D = 0.05   # d_fwd dưới mức này (≥ 80 điểm) là khớp tốt, không xét hướng (nét đối xứng, chấm)
MIN_DIRECTION_LEN = 0.1  # nét mẫu ngắn hơn 1/10 cỡ chữ là nét chấm, không có hướng rõ để chấm: nét ngắn nhất trong
                         # KanjiVG dài 0.054 (鬱), chỉ 0.5 % nét dưới 0.1; chấm dài L vẽ ngược chỉ cho d ≈ L/2 ≤ 0.05
OFFSET_TOL = 0.1         # phần dịch chuyển cả nét (hiệu trọng tâm) được bù trước DTW; phần vượt quá vẫn tính vào d
OFFSET_RATE = 0.3        # điểm trừ cho phần dịch chuyển đã bù = 100 × OFFSET_RATE × |dịch| / D0 (0.1 → −12)
ASPECT_TOL = 1.3         # khung được co giãn ngang / dọc khác nhau tới 30 % (口 vuông vs font dẹt 1 : 0.82)
MAX_FRAME_DROP = 2       # mỗi giả thuyết khung bỏ tối đa 2 nét trên biên hộp (thiếu / thừa nhiều hơn thì tinh chỉnh lo)
BOUNDARY_EPS = 0.02      # nét "chạm biên" khi hộp riêng của nó cách biên hộp cả chữ dưới 2 % cạnh dài của hộp
MAX_BOUNDARY = 6         # chỉ xét tối đa 6 nét sát biên nhất (40 nét ngang chồng nhau đều "chạm biên" → bùng nổ tổ hợp)
ORDER_EPS = 0.02         # đổi chỗ hai nét kề nhau mà tổng chi phí chỉ tăng ≤ mức này → không phải sai thứ tự
PENALTY_PER_COUNT = 10   # mỗi nét thiếu / thừa
PENALTY_COUNT_CAP = 40
PENALTY_ORDER = 15
WEAK_STROKE = 50         # điểm nét dưới mức này (không phải lỗi hướng) → nhận xét "chưa đúng hình"
FLOOR_RECOGNISED = 20    # tổng không xuống dưới mức này khi ≥ nửa số nét mẫu được vẽ đúng hình (> WEAK_STROKE)
MIN_WEIGHT = 0.05        # trọng số sàn để nét chấm (độ dài ~0) vẫn được tính vào tổng
GOOD_TOTAL = 85          # từ mức này trở lên khen; dưới thì nhắc viết đều tay


# ----------------------------------------------------------------------------- tiền xử lý hình học

def resample(points: Iterable[Sequence[float]], n: int = N_POINTS) -> Stroke:
    """n điểm cách đều theo chiều dài cung, giữ điểm đầu / cuối (cùng thuật toán build_dicts._resample để nét người
    dùng và nét mẫu được lấy mẫu như nhau). Rỗng → []; một điểm hoặc nét dài 0 → lặp điểm đó n lần."""
    poly: Stroke = [(float(p[0]), float(p[1])) for p in points]
    if not poly or n <= 0:
        return []
    cum = [0.0]
    for (x0, y0), (x1, y1) in zip(poly, poly[1:]):
        cum.append(cum[-1] + math.hypot(x1 - x0, y1 - y0))
    total = cum[-1]
    if total == 0.0:
        return [poly[0]] * n
    out: Stroke = []
    j = 0
    for k in range(n):
        target = total * k / max(n - 1, 1)
        while j < len(cum) - 2 and cum[j + 1] < target:
            j += 1
        seg = cum[j + 1] - cum[j]
        t = (target - cum[j]) / seg if seg else 0.0
        (x0, y0), (x1, y1) = poly[j], poly[j + 1]
        out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def normalize_glyph(strokes: Sequence[Sequence[Sequence[float]]]) -> list[Stroke]:
    """Đưa cả chữ về hộp 0..1 theo đúng quy tắc scripts/build_dicts.normalise_glyph: trừ góc trên-trái của bbox
    mọi nét, chia cho cạnh dài (giữ tỉ lệ), cạnh ngắn căn giữa. Chữ suy biến (một điểm) → 0.5.
    Áp lên nét mẫu đã chuẩn hoá phải trả về chính nó (có test), nên người dùng và mẫu chắc chắn cùng hệ toạ độ."""
    xs = [float(p[0]) for s in strokes for p in s]
    ys = [float(p[1]) for s in strokes for p in s]
    if not xs:
        return []
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    size = max(maxx - minx, maxy - miny)
    if size == 0:
        return [[(0.5, 0.5) for _ in s] for s in strokes]
    offx = (size - (maxx - minx)) / 2
    offy = (size - (maxy - miny)) / 2
    return [[((float(p[0]) - minx + offx) / size, (float(p[1]) - miny + offy) / size) for p in s] for s in strokes]


def dtw_cost(a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]) -> tuple[float, int]:
    """(tổng chi phí DTW, số cặp điểm trên đường khớp) giữa hai nét, metric Euclid giữa điểm — cùng giá trị tổng với
    fastdtw.dtw(a, b, dist=euclidean) (DP chính xác, không xấp xỉ radius; xem docstring module về tốc độ).

    Quy hoạch động chuẩn D[i][j] = c[i][j] + min(D[i−1][j−1], D[i−1][j], D[i][j−1]); theo dõi thêm số cặp trên đường
    để stroke_dtw chia; hoà thì ưu tiên đi chéo (đường ngắn nhất). Nét rỗng → (inf, 0)."""
    if not len(a) or not len(b):
        return math.inf, 0
    pa = np.asarray(a, dtype=float).reshape(-1, 2)
    pb = np.asarray(b, dtype=float).reshape(-1, 2)
    cost = np.hypot(pa[:, None, 0] - pb[None, :, 0], pa[:, None, 1] - pb[None, :, 1]).tolist()
    m = len(pb)
    inf = math.inf
    prev_cost, prev_len = [inf] * (m + 1), [0] * (m + 1)
    prev_cost[0] = 0.0
    for row in cost:
        cur_cost, cur_len = [inf] * (m + 1), [0] * (m + 1)
        for j in range(m):
            best_cost, best_len = prev_cost[j], prev_len[j]            # chéo
            if prev_cost[j + 1] < best_cost:                            # từ trên xuống
                best_cost, best_len = prev_cost[j + 1], prev_len[j + 1]
            if cur_cost[j] < best_cost:                                 # từ trái sang
                best_cost, best_len = cur_cost[j], cur_len[j]
            cur_cost[j + 1] = row[j] + best_cost
            cur_len[j + 1] = best_len + 1
        prev_cost, prev_len = cur_cost, cur_len
    return prev_cost[m], prev_len[m]


def stroke_dtw(a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]) -> float:
    """Khoảng cách DTW giữa hai nét chia cho độ dài đường khớp = khoảng cách trung bình của một cặp điểm được khớp
    (đơn vị hộp 0..1, so được với D0 bất kể số điểm). Nét rỗng → inf (không bao giờ được gán)."""
    cost, length = dtw_cost(a, b)
    return cost / length if length else math.inf


def _length(stroke: Sequence[Sequence[float]]) -> float:
    return sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(stroke, stroke[1:]))


def _finite(stroke: Sequence[Sequence[float]]) -> list[Sequence[float]]:
    """Bỏ điểm có NaN / Infinity (json.loads của Python cho qua dù JSON chuẩn không có): một NaN lọt vào min()/max()
    của hộp bao làm mọi toạ độ thành NaN và mọi nét được 100 điểm. Router đã trả 422, đây là lớp phòng thủ của hàm thuần."""
    return [p for p in stroke if math.isfinite(p[0]) and math.isfinite(p[1])]


# ----------------------------------------------------------------------------- khung (hệ toạ độ chung)

Frame = tuple[float, float, float, float]   # (sx, sy, tx, ty): p' = (sx·x + tx, sy·y + ty)


def _bbox(pts: np.ndarray) -> tuple[float, float, float, float]:
    """(minx, maxx, miny, maxy) của mảng điểm bất kỳ chiều (…, 2)."""
    flat = pts.reshape(-1, 2)
    return float(flat[:, 0].min()), float(flat[:, 0].max()), float(flat[:, 1].min()), float(flat[:, 1].max())


def _frame(user_box: tuple[float, float, float, float], ref_box: tuple[float, float, float, float]) -> Frame:
    """Phép co giãn + tịnh tiến đưa hộp người dùng trùng hộp mẫu. Tỉ lệ ngang / dọc được phép khác nhau tới
    ASPECT_TOL (vượt thì kẹp, giữ diện tích); hộp suy biến (nét đơn thẳng) → một tỉ lệ chung như normalize_glyph.
    Với hai hộp cùng tỉ lệ (mẫu vs chính nó, bản vẽ hoàn hảo) kết quả trùng khớp normalize_glyph → d = 0 → 100 điểm."""
    ux0, ux1, uy0, uy1 = user_box
    rx0, rx1, ry0, ry1 = ref_box
    uw, uh, rw, rh = ux1 - ux0, uy1 - uy0, rx1 - rx0, ry1 - ry0
    if uw > 0 and uh > 0 and rw > 0 and rh > 0:
        sx, sy = rw / uw, rh / uh
        ratio = sy / sx
        if ratio > ASPECT_TOL or ratio < 1 / ASPECT_TOL:
            s = math.sqrt(sx * sy)
            ratio = min(ASPECT_TOL, max(1 / ASPECT_TOL, ratio))
            sx, sy = s / math.sqrt(ratio), s * math.sqrt(ratio)
    else:
        u_size, r_size = max(uw, uh), max(rw, rh)
        sx = sy = (r_size / u_size) if u_size > 0 else 0.0
    tx = (rx0 + rx1) / 2 - sx * (ux0 + ux1) / 2
    ty = (ry0 + ry1) / 2 - sy * (uy0 + uy1) / 2
    return sx, sy, tx, ty


def _apply(pts: np.ndarray, frame: Frame) -> np.ndarray:
    sx, sy, tx, ty = frame
    return pts * np.array([sx, sy]) + np.array([tx, ty])


def _boundary(strokes: np.ndarray, box: tuple[float, float, float, float]) -> list[int]:
    """Chỉ số nét có hộp riêng chạm biên hộp cả chữ (trong BOUNDARY_EPS × cạnh dài, toạ độ gốc có thể là pixel): chỉ bỏ
    những nét này mới đổi được hộp. Sát biên nhất trước, tối đa MAX_BOUNDARY nét."""
    x0, x1, y0, y1 = box
    eps = BOUNDARY_EPS * max(x1 - x0, y1 - y0)
    dists = []
    for i, s in enumerate(strokes):
        sx0, sx1, sy0, sy1 = _bbox(s)
        d = min(sx0 - x0, x1 - sx1, sy0 - y0, y1 - sy1)
        if d <= eps:
            dists.append((d, i))
    return [i for _, i in sorted(dists)[:MAX_BOUNDARY]]


def _cheap_cost(user: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Ma trận chi phí nhanh (n_user × n_ref): khoảng cách điểm-điểm trung bình giữa hai nét đã resample cùng số
    điểm, lấy min của chiều xuôi và chiều ngược (nét vẽ ngược vẫn nằm đúng chỗ nên không được làm lệch việc chọn khung).
    Chặn trên của DTW, đủ để so các khung với nhau; không dùng để chấm điểm."""
    diff = user[:, None, :, :] - ref[None, :, :, :]
    fwd = np.hypot(diff[..., 0], diff[..., 1]).mean(axis=2)
    diff_r = user[:, None, :, :] - ref[None, :, ::-1, :]
    rev = np.hypot(diff_r[..., 0], diff_r[..., 1]).mean(axis=2)
    return np.minimum(fwd, rev)


def _frame_objective(user: np.ndarray, ref: np.ndarray, frame: Frame, weights: Sequence[float], d0: float
                     ) -> tuple[float, dict[int, int]]:
    """(tổng điểm có trọng số của các cặp gán được, phép gán) khi đưa nét người dùng về khung ``frame``.
    Điểm lấy BÌNH PHƯƠNG để khung làm ba nét trùng khít + một nét lệch hẳn thắng khung làm cả bốn nét "tàm tạm"
    (tổng tuyến tính gần bằng nhau): một nét vẽ lệch ra ngoài là lỗi của nét đó, không phải chữ vẽ rộng hơn."""
    cost = _cheap_cost(_apply(user, frame), ref)
    assign = greedy_assignment(cost.tolist())
    total = sum(weights[j] * (_clamp_score(cost[i, j], d0) / 100.0) ** 2 for i, j in assign.items())
    return total, assign


def _ls_frame(user: np.ndarray, ref: np.ndarray, assign: dict[int, int], frame: Frame, d0: float) -> Frame | None:
    """Khung bình phương tối thiểu (co giãn + tịnh tiến từng trục) trên các cặp điểm đã gán — tinh chỉnh khung hộp bao
    khi nét người dùng không lấp đúng hộp mẫu (口 vuông vs font hình thang). Cặp nét khớp kém đóng góp ít (trọng số
    theo điểm nhanh) để nét sai không kéo khung. Tỉ lệ ngang / dọc kẹp như _frame; suy biến → None."""
    cost = _cheap_cost(_apply(user, frame), ref)
    rows = sorted(assign)
    w = np.array([_clamp_score(cost[i, assign[i]], d0) / 100.0 for i in rows])
    if w.sum() <= 0:
        return None
    u2 = user[rows].reshape(-1, 2)                                   # toạ độ gốc
    r2 = ref[[assign[i] for i in rows]].reshape(-1, 2)
    wp = np.repeat(w, user.shape[1])
    scales = []
    for axis in range(2):
        mu_u = np.average(u2[:, axis], weights=wp)
        mu_r = np.average(r2[:, axis], weights=wp)
        var = np.average((u2[:, axis] - mu_u) ** 2, weights=wp)
        if var <= 0:
            return None
        scales.append(float(np.average((u2[:, axis] - mu_u) * (r2[:, axis] - mu_r), weights=wp) / var))
    sx, sy = scales
    if sx <= 0 or sy <= 0:
        return None
    ratio = sy / sx
    if ratio > ASPECT_TOL or ratio < 1 / ASPECT_TOL:
        s = math.sqrt(sx * sy)
        ratio = min(ASPECT_TOL, max(1 / ASPECT_TOL, ratio))
        sx, sy = s / math.sqrt(ratio), s * math.sqrt(ratio)
    tx = float(np.average(r2[:, 0], weights=wp) - sx * np.average(u2[:, 0], weights=wp))
    ty = float(np.average(r2[:, 1], weights=wp) - sy * np.average(u2[:, 1], weights=wp))
    return sx, sy, tx, ty


def _best_frame(user: np.ndarray, ref: np.ndarray, weights: Sequence[float], d0: float) -> Frame:
    """Chọn khung đưa bản vẽ về hệ toạ độ mẫu (xem bước 2 ở docstring module). ``user`` (n_user, n, 2) toạ độ gốc,
    ``ref`` (n_ref, n, 2) đã chuẩn hoá; ``weights`` trọng số nét mẫu."""
    n_user, n_ref = len(user), len(ref)
    ref_box, user_box = _bbox(ref), _bbox(user)
    candidates: list[Frame] = [_frame(user_box, ref_box)]
    # thiếu nét → hộp mẫu bỏ 1–2 nét biên; thừa nét → hộp người dùng bỏ 1–2 nét biên; đủ nét vẫn thử bỏ một nét biên
    # mỗi bên: một nét vẽ lệch hẳn ra ngoài (hoặc thụt vào) làm hộp bao sai dù số nét đúng
    drop_ref = min(n_ref - n_user, MAX_FRAME_DROP) if n_user < n_ref else (1 if n_user == n_ref else 0)
    drop_user = min(n_user - n_ref, MAX_FRAME_DROP) if n_user > n_ref else (1 if n_user == n_ref else 0)
    for k in range(1, drop_ref + 1):
        for drop in combinations(_boundary(ref, ref_box), k):
            keep = [j for j in range(n_ref) if j not in drop]
            if keep:
                candidates.append(_frame(user_box, _bbox(ref[keep])))
    for k in range(1, drop_user + 1):
        for drop in combinations(_boundary(user, user_box), k):
            keep = [i for i in range(n_user) if i not in drop]
            if keep:
                candidates.append(_frame(_bbox(user[keep]), ref_box))

    best: tuple[float, Frame, dict[int, int]] | None = None
    seen: set[tuple[float, ...]] = set()

    def consider(frame: Frame) -> bool:
        nonlocal best
        key = tuple(round(v, 4) for v in frame)
        if key in seen:
            return False
        seen.add(key)
        total, assign = _frame_objective(user, ref, frame, weights, d0)
        if best is None or total > best[0] + 1e-9:
            best = (total, frame, assign)
            return True
        return False

    for frame in candidates:
        consider(frame)
    assert best is not None
    # tinh chỉnh 1: khung theo hộp của riêng các cặp đã gán (nét thừa / thiếu không tham gia định khung); lặp tối đa
    # 2 lần, chỉ nhận khi tổng điểm tăng. Không đổi gì khi mọi nét đều được gán (hộp = hộp cả chữ).
    for _ in range(2):
        assign = best[2]
        if len(assign) == n_user and len(assign) == n_ref:
            break
        rows = sorted(assign)
        if not consider(_frame(_bbox(user[rows]), _bbox(ref[[assign[i] for i in rows]]))):
            break
    # tinh chỉnh 2: bình phương tối thiểu trên các cặp điểm đã gán, cũng chỉ nhận khi tốt hơn
    for _ in range(2):
        frame = _ls_frame(user, ref, best[2], best[1], d0)
        if frame is None or not consider(frame):
            break
    return best[1]


# ----------------------------------------------------------------------------- gán nét

def greedy_assignment(cost: Sequence[Sequence[float]]) -> dict[int, int]:
    """Ma trận chi phí hàng = nét người dùng, cột = nét mẫu → {hàng: cột}: lặp lấy ô rẻ nhất trong các hàng / cột
    còn trống cho tới khi hết hàng hoặc hết cột. Hungarian tối ưu hơn nhưng không cần: nét vẽ đúng có chi phí ≈ 0
    nên luôn được chọn trước, phần còn lại là nét sai kiểu gì cũng bị điểm thấp. Hoà → cặp có chỉ số nhỏ hơn.
    Sắp mọi ô một lần rồi duyệt (O(n² log n)) thay vì tìm min lặp lại (O(n³)): _best_frame gọi hàm này cho mỗi khung."""
    rows = len(cost)
    cols = len(cost[0]) if rows else 0
    free_rows, free_cols = set(range(rows)), set(range(cols))
    assign: dict[int, int] = {}
    for c, i, j in sorted((cost[i][j], i, j) for i in range(rows) for j in range(cols)):
        if c == math.inf or not free_rows or not free_cols:
            break
        if i in free_rows and j in free_cols:
            assign[i] = j
            free_rows.discard(i)
            free_cols.discard(j)
    return assign


def _settle_order(assign: dict[int, int], cost: Sequence[Sequence[float]]) -> dict[int, int]:
    """Hai nét được gán ngược thứ tự mẫu nhưng gán xuôi lại chỉ đắt hơn ≤ ORDER_EPS → đổi lại cho xuôi: hình gần như
    nhau (hai chấm 灬, hai nét ngang song song) lệch tay vài px không đủ bằng chứng cho lỗi thứ tự. Nét đảo thật (hình
    khác nhau hoặc vị trí khác nhau) chênh ≥ 0.15 nên không bị đổi. Xét mọi cặp nghịch thế (không chỉ kề nhau: ba chấm
    lệch có thể đảo chấm 1 với chấm 3), lặp tới khi ổn định."""
    order = sorted(assign.items())
    changed = True
    while changed:
        changed = False
        for a in range(len(order) - 1):
            for b in range(a + 1, len(order)):
                (i1, j1), (i2, j2) = order[a], order[b]
                if j1 > j2 and cost[i1][j2] + cost[i2][j1] <= cost[i1][j1] + cost[i2][j2] + ORDER_EPS:
                    order[a], order[b] = (i1, j2), (i2, j1)
                    changed = True
    return dict(order)


# ----------------------------------------------------------------------------- chấm điểm

def _clamp_score(d: float, d0: float) -> float:
    return max(0.0, min(100.0, 100.0 * (1.0 - d / d0)))


def _centroid(stroke: Sequence[Sequence[float]]) -> Point:
    return (sum(p[0] for p in stroke) / len(stroke), sum(p[1] for p in stroke) / len(stroke))


def _shifted(user: Stroke, ref: Stroke) -> tuple[Stroke, float]:
    """(nét người dùng đã bù dịch chuyển, độ dài phần bù): dời nét theo hiệu trọng tâm với mẫu, tối đa OFFSET_TOL."""
    (ux, uy), (rx, ry) = _centroid(user), _centroid(ref)
    dx, dy = ux - rx, uy - ry
    norm = math.hypot(dx, dy)
    if norm > OFFSET_TOL:
        dx, dy = dx * OFFSET_TOL / norm, dy * OFFSET_TOL / norm
        norm = OFFSET_TOL
    return [(x - dx, y - dy) for x, y in user], norm


def _fmt_list(nums: Sequence[int]) -> str:
    """[1] → '1'; [1, 2] → '1 và 2'; [1, 2, 3] → '1, 2 và 3' (số nét hiển thị cho người, đếm từ 1)."""
    if len(nums) <= 1:
        return "".join(str(n) for n in nums)
    return ", ".join(str(n) for n in nums[:-1]) + f" và {nums[-1]}"


def _order_feedback(matched: list[tuple[int, int]]) -> str:
    """matched = [(nét người dùng, nét mẫu được gán)] theo thứ tự vẽ, đã biết không tăng dần.
    Đúng hai nét hoán vị cho nhau → "Thứ tự nét 2 và 3 bị đảo"; phức tạp hơn → nêu thứ tự đúng của các nét đã vẽ
    (số nét của người dùng, sắp theo nét mẫu) để người học biết phải viết lại theo trình tự nào."""
    wanted = sorted(j for _, j in matched)
    wrong = [(i, j, w) for (i, j), w in zip(matched, wanted) if j != w]
    if len(wrong) == 2 and wrong[0][1] == wrong[1][2] and wrong[1][1] == wrong[0][2]:
        return f"Thứ tự nét {wrong[0][0] + 1} và {wrong[1][0] + 1} bị đảo"
    correct = ", ".join(str(i + 1) for i, _ in sorted(matched, key=lambda ij: ij[1]))
    return f"Sai thứ tự nét (thứ tự đúng là nét {correct})"


def _join_feedback(parts: Sequence[str]) -> str:
    text = ". ".join(parts)
    return text if text.endswith(("!", ".")) else text + "."


def score_strokes(user_strokes: Sequence[Sequence[Sequence[float]]],
                  ref_strokes: Sequence[Sequence[Sequence[float]]],
                  n: int = N_POINTS, d0: float = D0) -> dict:
    """Chấm nét người dùng so với nét mẫu (xem docstring module). Trả dict khoá snake_case:
    total_score, is_correct_order, feedback, per_stroke [{index, score, wrong_direction, expected_index}],
    missing (chỉ số nét mẫu không được vẽ), extra (chỉ số nét người dùng không ứng với nét mẫu nào), stroke_count.
    Chỉ số trong dict đếm từ 0 (khớp mảng gửi lên); câu nhận xét đếm từ 1 cho người đọc.
    Nét mẫu đi qua đúng pipeline resample + chuẩn hoá như nét người dùng: cùng đầu vào → cùng đầu ra → d = 0 → 100 điểm
    chính xác (mẫu vs chính nó), và nhận cả mẫu tự dựng 2–3 điểm trong test. Resample lại 32 điểm KanjiVG theo đa giác
    nối chúng cắt góc một chút ở chỗ cong: đo trên toàn bộ kanji_strokes.json (1 967 chữ, 20 637 nét), DTW(mẫu gốc,
    mẫu resample lại) trung vị 0.0003 (0.1 điểm), p99 0.0017 (0.7 điểm), tệ nhất 0.0073 (2.9 điểm, nét móc của 及) —
    chấp nhận để giữ bất biến trên. Điểm có NaN / Infinity bị bỏ qua (nét chỉ còn điểm như vậy coi như không vẽ)."""
    ref = normalize_glyph([resample(s, n) for s in ref_strokes if len(s)])
    user_raw = [resample(pts, n) for pts in (_finite(s) for s in user_strokes if len(s)) if pts]
    n_ref, n_user = len(ref), len(user_raw)
    if n_user == 0:
        return {"total_score": 0.0, "is_correct_order": False, "feedback": "Không phát hiện nét vẽ nào.",
                "per_stroke": [], "missing": list(range(n_ref)), "extra": [], "stroke_count": n_ref}
    if n_ref == 0:
        return {"total_score": 0.0, "is_correct_order": False, "feedback": "Không có nét mẫu để so sánh.",
                "per_stroke": [], "missing": [], "extra": list(range(n_user)), "stroke_count": 0}

    ref_weights = [max(_length(r), MIN_WEIGHT) for r in ref]
    frame = _best_frame(np.asarray(user_raw, dtype=float), np.asarray(ref, dtype=float), ref_weights, d0)
    user: list[Stroke] = [[tuple(p) for p in s] for s in _apply(np.asarray(user_raw, dtype=float), frame).tolist()]

    cost = [[stroke_dtw(u, r) for r in ref] for u in user]
    assign = _settle_order(greedy_assignment(cost), cost)
    matched = sorted(assign.items())                                   # theo thứ tự vẽ
    assigned_refs = set(assign.values())
    missing = [j for j in range(n_ref) if j not in assigned_refs]
    extra = [i for i in range(n_user) if i not in assign]
    ref_order = [j for _, j in matched]
    is_correct_order = all(a < b for a, b in zip(ref_order, ref_order[1:]))

    per_stroke: list[dict] = []
    weighted = weight_sum = 0.0
    good = 0
    for i in range(n_user):
        j = assign.get(i)
        if j is None:
            per_stroke.append({"index": i, "score": 0.0, "wrong_direction": False, "expected_index": None})
            weight_sum += max(_length(user[i]), MIN_WEIGHT)
            continue
        shifted, offset = _shifted(user[i], ref[j])
        d_fwd = stroke_dtw(shifted, ref[j])
        ref_len = _length(ref[j])
        # chỉ xét hướng khi nét mẫu đủ dài để có hướng và nét xuôi chưa khớp tốt; nét ngắn / chấm bỏ qua
        wrong_direction = (ref_len >= MIN_DIRECTION_LEN and d_fwd > MIN_DIRECTION_D
                           and stroke_dtw(shifted, ref[j][::-1]) < REVERSE_RATIO * d_fwd)
        score = max(0.0, _clamp_score(d_fwd, d0) - 100.0 * OFFSET_RATE * offset / d0)
        per_stroke.append({"index": i, "score": round(score, 1), "wrong_direction": wrong_direction,
                           "expected_index": j})
        w = ref_weights[j]
        weighted += w * score
        weight_sum += w
        if score > WEAK_STROKE and not wrong_direction:
            good += 1
    for j in missing:
        weight_sum += ref_weights[j]

    total = weighted / weight_sum if weight_sum else 0.0
    total -= min(PENALTY_COUNT_CAP, PENALTY_PER_COUNT * (len(missing) + len(extra)))
    if not is_correct_order:
        total -= PENALTY_ORDER
    if 2 * good >= n_ref:
        total = max(total, FLOOR_RECOGNISED)
    total = max(0.0, min(100.0, total))

    parts: list[str] = []
    if missing:
        parts.append(f"Thiếu {len(missing)} nét (nét {_fmt_list([j + 1 for j in missing])} của mẫu)")
    if extra:
        parts.append(f"Thừa {len(extra)} nét (nét {_fmt_list([i + 1 for i in extra])})")
    if not is_correct_order:
        parts.append(_order_feedback(matched))
    reversed_ = [p["index"] + 1 for p in per_stroke if p["wrong_direction"]]
    if reversed_:
        parts.append(f"Nét {_fmt_list(reversed_)} vẽ ngược hướng")
    weak = [p["index"] + 1 for p in per_stroke
            if p["expected_index"] is not None and not p["wrong_direction"] and p["score"] < WEAK_STROKE]
    # thiếu quá nửa số nét thì khung (dù đã thử bỏ nét biên) không còn chắc chắn đại diện cho cả chữ → nhận xét về hình
    # nét dễ sai lệch; chỉ báo thiếu nét
    if weak and len(missing) <= n_ref // 2:
        parts.append(f"Nét {_fmt_list(weak)} chưa đúng hình")
    if not parts:
        parts.append("Viết đúng thứ tự và hướng, nét rõ ràng!" if total >= GOOD_TOTAL
                     else "Đúng thứ tự và hướng nét, cần viết đều tay hơn")
    return {"total_score": round(total, 1), "is_correct_order": is_correct_order,
            "feedback": _join_feedback(parts), "per_stroke": per_stroke,
            "missing": missing, "extra": extra, "stroke_count": n_ref}
