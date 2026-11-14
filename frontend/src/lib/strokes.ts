// Hàm thuần cho luyện viết kanji (E2): lấy mẫu lại nét theo chiều dài cung, chuẩn hoá cả chữ về hộp
// 0..1 và dựng đường SVG. Không đụng DOM -> chạy được trong scripts/selfCheck.ts.
//
// Phải khớp với dữ liệu nét mẫu bên ai-service (KanjiVG): mỗi nét 32 điểm cách đều theo chiều dài,
// toạ độ chuẩn hoá theo hộp bao của CẢ CHỮ: cạnh dài = 1, cạnh ngắn căn giữa. Chuẩn hoá cùng một
// cách ở hai phía thì DTW mới so được nét người dùng với nét mẫu.

export interface Point {
    x: number;
    y: number;
    /** ms kể từ lúc bắt đầu vẽ (tuỳ chọn; giữ lại khi lấy mẫu để sau này tính tốc độ nét). */
    t?: number;
}

export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

/** Số điểm mỗi nét sau khi lấy mẫu lại (cùng ai-service). */
export const STROKE_SAMPLES = 32;

// ---------------------------------------------------------------------------------------------
// Kết quả chấm điểm từ backend (lane sau nối API; frontend chỉ định nghĩa kiểu để bảng hiển thị)
// ---------------------------------------------------------------------------------------------

export interface StrokeScoreItem {
    /** Chỉ số nét người dùng vẽ (0-based). */
    index: number;
    /** 0–100: độ giống nét mẫu được ghép. */
    score: number;
    /** Vẽ ngược hướng (vd. nét ngang từ phải sang trái). */
    wrongDirection?: boolean;
    /** Nét mẫu được ghép (0-based); null = không ghép được nét mẫu nào (nét thừa); bỏ trống = ghép đúng vị trí. */
    expectedIndex?: number | null;
}

export interface StrokeScore {
    /** 0–100. */
    totalScore: number;
    isCorrectOrder: boolean;
    /** Nhận xét tiếng Việt từ máy chủ. */
    feedback: string;
    perStroke: StrokeScoreItem[];
}

export type StrokeStatus = "correct" | "inaccurate" | "wrong-direction" | "wrong-order" | "missing" | "extra";

export interface StrokeChip {
    status: StrokeStatus;
    /** Nhãn tiếng Việt ngắn để hiện chip. */
    label: string;
    /** Số thứ tự nét (1-based) để hiện cho người học; nét người vẽ với nét thừa / sai, nét mẫu với nét thiếu. */
    strokeNo: number;
    /** Điểm nét (0–100), không có với nét thiếu. */
    score?: number;
}

const STATUS_LABEL: Record<StrokeStatus, string> = {
    correct: "đúng",
    inaccurate: "lệch hình",
    "wrong-direction": "sai hướng",
    "wrong-order": "sai thứ tự",
    missing: "thiếu",
    extra: "thừa",
};

/** Điểm nét dưới ngưỡng này (dù đúng hướng, đúng thứ tự) coi là lệch hình. */
export const STROKE_OK_THRESHOLD = 50;

/**
 * Đổi kết quả chấm thành danh sách chip theo thứ tự nét người vẽ, rồi nối thêm các nét mẫu không
 * được ghép (thiếu). `expectedCount` = số nét chuẩn (từ dữ liệu nét mẫu hoặc từ điển); null = không
 * biết -> không suy ra nét thiếu được.
 */
export const summarizeStrokeScore = (score: StrokeScore, expectedCount: number | null): StrokeChip[] => {
    const chips: StrokeChip[] = [];
    const covered = new Set<number>();
    for (const item of score.perStroke) {
        const expected = item.expectedIndex === undefined ? item.index : item.expectedIndex;
        let status: StrokeStatus;
        if (expected === null) status = "extra";
        else {
            covered.add(expected);
            if (item.wrongDirection) status = "wrong-direction";
            else if (expected !== item.index) status = "wrong-order";
            else status = item.score >= STROKE_OK_THRESHOLD ? "correct" : "inaccurate";
        }
        chips.push({ status, label: STATUS_LABEL[status], strokeNo: item.index + 1, score: item.score });
    }
    if (expectedCount !== null) {
        for (let i = 0; i < expectedCount; i++) {
            if (!covered.has(i)) chips.push({ status: "missing", label: STATUS_LABEL.missing, strokeNo: i + 1 });
        }
    }
    return chips;
};

// ---------------------------------------------------------------------------------------------
// Hình học nét
// ---------------------------------------------------------------------------------------------

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Tổng chiều dài đường gấp khúc của một nét (0 với nét 0–1 điểm). */
export const strokeLength = (points: Point[]): number => {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
    return len;
};

/** Hộp bao của mọi điểm; null khi không có điểm nào. */
export const boundingBox = (strokes: Point[][]): BoundingBox | null => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of strokes) {
        for (const p of stroke) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/**
 * Lấy mẫu lại nét thành `n` điểm cách đều theo chiều dài cung (điểm đầu / cuối giữ nguyên).
 * Nét 1 điểm hoặc không có chiều dài (chấm) -> lặp lại điểm đó `n` lần. `t` nội suy tuyến tính
 * khi mọi điểm đều có `t`. Nét rỗng -> [].
 */
export const resampleStroke = (points: Point[], n: number = STROKE_SAMPLES): Point[] => {
    if (points.length === 0 || n <= 0) return [];
    const hasT = points.every((p) => typeof p.t === "number");
    const copy = (p: Point): Point => (hasT ? { x: p.x, y: p.y, t: p.t } : { x: p.x, y: p.y });
    const total = strokeLength(points);
    if (n === 1) return [copy(points[0])];
    if (total === 0) return Array.from({ length: n }, () => copy(points[0]));

    const out: Point[] = [copy(points[0])];
    const step = total / (n - 1);
    let seg = 0; // đoạn hiện tại [points[seg], points[seg + 1]]
    let segStart = 0; // chiều dài cung tại points[seg]
    let segLen = dist(points[0], points[1]);
    for (let k = 1; k < n - 1; k++) {
        const target = step * k;
        while (segStart + segLen < target && seg < points.length - 2) {
            segStart += segLen;
            seg++;
            segLen = dist(points[seg], points[seg + 1]);
        }
        const a = points[seg];
        const b = points[seg + 1];
        const r = segLen === 0 ? 0 : (target - segStart) / segLen;
        const p: Point = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
        if (hasT) p.t = (a.t as number) + ((b.t as number) - (a.t as number)) * r;
        out.push(p);
    }
    out.push(copy(points[points.length - 1]));
    return out;
};

/**
 * Chuẩn hoá cả chữ về hộp 0..1: cạnh dài của hộp bao = 1, cạnh ngắn căn giữa (cùng cách với dữ liệu
 * nét mẫu bên ai-service). Chữ suy biến (một chấm) -> mọi điểm về tâm (0.5, 0.5). Giữ `t`.
 */
export const normalizeGlyph = (strokes: Point[][]): Point[][] => {
    const box = boundingBox(strokes);
    if (!box) return [];
    const long = Math.max(box.width, box.height);
    const scale = long === 0 ? 0 : 1 / long;
    const offX = (1 - box.width * scale) / 2;
    const offY = (1 - box.height * scale) / 2;
    return strokes.map((stroke) =>
        stroke.map((p) => {
            const q: Point = { x: (p.x - box.minX) * scale + offX, y: (p.y - box.minY) * scale + offY };
            if (typeof p.t === "number") q.t = p.t;
            return q;
        })
    );
};

// ---------------------------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------------------------

const fmt = (v: number): string => String(Number(v.toFixed(2)));

/** Một nét -> "M x y L x y ..." (toạ độ 0..1 nhân `size`). Nét 1 điểm lặp L để stroke-linecap tròn vẽ ra chấm. */
const strokeToPath = (points: Point[], size: number): string => {
    if (points.length === 0) return "";
    const pts = points.length === 1 ? [points[0], points[0]] : points;
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x * size)} ${fmt(p.y * size)}`).join(" ");
};

/** Mọi nét gộp thành một thuộc tính `d` (vẽ một <path> cho nét người dùng). */
export const strokesToSvgPath = (strokes: Point[][], size: number): string =>
    strokes
        .map((s) => strokeToPath(s, size))
        .filter(Boolean)
        .join(" ");

/** Dữ liệu nét mẫu [[ [x, y], ... ], ...] (0..1) -> mỗi nét một `d` riêng để đánh số / tô màu từng nét. */
export const referenceToSvgPaths = (reference: number[][][], size: number): string[] =>
    reference.map((stroke) => strokeToPath(stroke.map(([x, y]) => ({ x, y })), size));
