// Bố cục sơ đồ chữ Hán (spec 2026-10-30 §3.5 D6): hàm thuần, không React, để scripts/selfcheck/diagram.ts kiểm được.
// Bố cục theo cung tất định (không mô phỏng lực): tâm ở giữa, thành phần cấu tạo ở cung bên trái theo thứ tự viết, họ chữ
// cùng chỉ âm quạt bên phải, từ ghép xếp vòng quanh tâm và chữ khác trong từ nằm ngoài trên cùng tia. Toạ độ làm tròn
// 1 chữ số để JSON / so sánh ổn định.
import type { KanjiDiagramEdge, KanjiDiagramEdgeType, KanjiDiagramMode, KanjiDiagramNode } from "../../types/kanjiDiagram.types.ts";

export interface DiagramPoint {
    x: number;
    y: number;
}
export type DiagramPositions = Record<string, DiagramPoint>;
export interface DiagramGraph {
    nodes: KanjiDiagramNode[];
    edges: KanjiDiagramEdge[];
}
export interface DiagramViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const DIAGRAM_SIZE = 720;
/** Bán kính các vòng theo tỉ lệ cạnh canvas: thành phần, họ chỉ âm, từ ghép, chữ khác trong từ / node lạ. */
const R_COMPONENT = 0.24;
const R_PHONETIC = 0.4;
const R_WORD = 0.3;
const R_OUTER = 0.43;
const DEG = Math.PI / 180;
/** Khoảng cách tối thiểu giữa hai node mới đặt quanh node mẹ (đường kính node + lề). */
const MIN_GAP = 60;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const polar = (c: number, r: number, theta: number): DiagramPoint => ({
    x: round1(c + r * Math.cos(theta)),
    y: round1(c + r * Math.sin(theta)),
});

/** Chia đều n góc trên cung [from, to] (n = 1 → điểm giữa cung). */
const spread = (n: number, from: number, to: number): number[] => {
    if (n <= 0) return [];
    if (n === 1) return [(from + to) / 2];
    return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
};

/**
 * Toạ độ từng node trong hộp size×size. Tâm = node có id centerId (hoặc type center). Thành phần: cung trái 225° → 135°
 * (trên xuống dưới, y hướng xuống như SVG). Họ chỉ âm: quạt phải −70° → 70°. Từ ghép: vòng đều bắt đầu từ đỉnh; chữ khác
 * trong từ: ngoài vòng từ, trên tia của từ đầu tiên chứa nó (nhiều chữ cùng từ lệch nhau ±9°). Node không thuộc nhóm nào:
 * vòng ngoài. Đồ thị rỗng → {}.
 */
export function sectorLayout(
    nodes: KanjiDiagramNode[],
    edges: KanjiDiagramEdge[],
    centerId: string | null,
    size: number
): DiagramPositions {
    const positions: DiagramPositions = {};
    if (nodes.length === 0) return positions;
    const c = size / 2;
    const center = nodes.find((n) => n.id === centerId) ?? nodes.find((n) => n.type === "center") ?? nodes[0];
    positions[center.id] = { x: c, y: c };

    const components = nodes.filter((n) => n.id !== center.id && n.type === "component");
    spread(components.length, 225 * DEG, 135 * DEG).forEach((theta, i) => {
        positions[components[i].id] = polar(c, size * R_COMPONENT, theta);
    });

    const phonetic = nodes.filter((n) => n.id !== center.id && n.type === "phonetic");
    spread(phonetic.length, -70 * DEG, 70 * DEG).forEach((theta, i) => {
        positions[phonetic[i].id] = polar(c, size * R_PHONETIC, theta);
    });

    const words = nodes.filter((n) => n.id !== center.id && n.type === "word");
    const wordAngle: Record<string, number> = {};
    words.forEach((w, i) => {
        const theta = -90 * DEG + (2 * Math.PI * i) / words.length;
        wordAngle[w.id] = theta;
        positions[w.id] = polar(c, size * R_WORD, theta);
    });

    // chữ khác trong từ: gom theo từ đầu tiên chứa nó (cạnh contains), lệch ±9° khi một từ có nhiều chữ
    const kanjiByWord: Record<string, string[]> = {};
    const placedKanji = new Set<string>();
    for (const e of edges) {
        if (e.type !== "contains" || !(e.from in wordAngle) || placedKanji.has(e.to)) continue;
        if (!nodes.some((n) => n.id === e.to && n.id !== center.id)) continue;
        placedKanji.add(e.to);
        (kanjiByWord[e.from] ??= []).push(e.to);
    }
    for (const [wid, ids] of Object.entries(kanjiByWord)) {
        const base = wordAngle[wid];
        spread(ids.length, base - 9 * DEG * (ids.length - 1), base + 9 * DEG * (ids.length - 1)).forEach((theta, i) => {
            positions[ids[i]] = polar(c, size * R_OUTER, theta);
        });
    }

    const rest = nodes.filter((n) => !(n.id in positions));
    rest.forEach((n, i) => {
        positions[n.id] = polar(c, size * R_OUTER, -90 * DEG + (2 * Math.PI * i) / rest.length + 0.37);
    });
    return positions;
}

/** Chế độ "Phân tích từ" chỉ có cho từ 2–4 chữ Hán (spec 30/10 từ nhiều chữ W4). */
export const WORD_MIN_CHARS = 2;
export const WORD_MAX_CHARS = 4;
/** Bán kính quạt thành phần quanh từng chữ ở chế độ Phân tích từ. */
const WORD_PART_RADIUS = 90;

/**
 * Bố cục "Phân tích từ" (spec 30/10 từ nhiều chữ §4): từ ở giữa; các chữ (node có cạnh contains từ tâm, theo thứ tự cạnh)
 * chia đều trên vòng R = 0,24 cạnh bắt đầu từ bên trái (2 chữ trái – phải, 3 tam giác, 4 chữ thập); thành phần của mỗi chữ quạt
 * ra phía xa tâm bằng placeAround. Node còn lại → vòng ngoài. Tất định, làm tròn 1 chữ số.
 */
export function wordLayout(
    nodes: KanjiDiagramNode[],
    edges: KanjiDiagramEdge[],
    centerId: string,
    size: number
): DiagramPositions {
    const positions: DiagramPositions = {};
    if (nodes.length === 0) return positions;
    const c = size / 2;
    const has = new Set(nodes.map((n) => n.id));
    positions[centerId] = { x: c, y: c };
    const chars = edges.filter((e) => e.type === "contains" && e.from === centerId && has.has(e.to)).map((e) => e.to);
    chars.forEach((id, i) => {
        positions[id] = polar(c, size * R_COMPONENT, Math.PI + (2 * Math.PI * i) / chars.length);
    });
    for (const ch of chars) {
        const parts = edges.filter((e) => e.to === ch && e.type !== "contains" && has.has(e.from) && !(e.from in positions)).map((e) => e.from);
        Object.assign(positions, placeAround(positions[ch], [...new Set(parts)], positions, WORD_PART_RADIUS));
    }
    const rest = nodes.filter((n) => !(n.id in positions));
    rest.forEach((n, i) => {
        positions[n.id] = polar(c, size * R_OUTER, -90 * DEG + (2 * Math.PI * i) / rest.length + 0.37);
    });
    return positions;
}

/** Khoá trạng thái mở thêm / kéo / chọn node của một sơ đồ: đổi câu tìm, chế độ hay chữ chọn trong từ là sơ đồ khác. */
export const diagramKey = (q: string, mode: KanjiDiagramMode | null, k: string | null): string => `${q}|${mode ?? ""}|${k ?? ""}`;

/** Gộp đồ thị mở thêm vào đồ thị đang vẽ: node trùng id và cạnh trùng (from, to, type) giữ bản cũ; không sửa mảng gốc. */
export function mergeDiagram(base: DiagramGraph, extra: DiagramGraph): DiagramGraph {
    const nodes = [...base.nodes];
    const seen = new Set(nodes.map((n) => n.id));
    for (const n of extra.nodes) {
        if (!seen.has(n.id)) {
            seen.add(n.id);
            nodes.push(n);
        }
    }
    const edgeKey = (e: KanjiDiagramEdge) => `${e.from}|${e.to}|${e.type}`;
    const edges = [...base.edges];
    const seenEdges = new Set(edges.map(edgeKey));
    for (const e of extra.edges) {
        const k = edgeKey(e);
        if (!seenEdges.has(k)) {
            seenEdges.add(k);
            edges.push(e);
        }
    }
    return { nodes, edges };
}

/**
 * Toạ độ cho node mới quanh node mẹ, quạt về phía xa trọng tâm các node đang có (để không đè lên sơ đồ). Bước góc đủ
 * để hai node cách nhau ≥ MIN_GAP ở bán kính đã cho; quá nhiều node thì nới bán kính. Chỉ trả node mới.
 */
export function placeAround(
    anchor: DiagramPoint,
    ids: string[],
    existing: DiagramPositions,
    radius: number
): DiagramPositions {
    const out: DiagramPositions = {};
    if (ids.length === 0) return out;
    const pts = Object.values(existing);
    const cx = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : anchor.x;
    const cy = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : anchor.y;
    const away = cx === anchor.x && cy === anchor.y ? 0 : Math.atan2(anchor.y - cy, anchor.x - cx);
    let r = radius;
    let step = 2 * Math.asin(Math.min(1, MIN_GAP / 2 / r));
    while ((ids.length - 1) * step > 300 * DEG) {
        r *= 1.5;
        step = 2 * Math.asin(Math.min(1, MIN_GAP / 2 / r));
    }
    const fan = (ids.length - 1) * step;
    spread(ids.length, away - fan / 2, away + fan / 2).forEach((theta, i) => {
        out[ids[i]] = { x: round1(anchor.x + r * Math.cos(theta)), y: round1(anchor.y + r * Math.sin(theta)) };
    });
    return out;
}

/** Khung nhìn bao mọi node với lề pad (đơn vị toạ độ sơ đồ); rỗng → hộp mặc định DIAGRAM_SIZE². */
export function fitViewBox(positions: DiagramPositions, pad: number): DiagramViewBox {
    const pts = Object.values(positions);
    if (pts.length === 0) return { x: 0, y: 0, w: DIAGRAM_SIZE, h: DIAGRAM_SIZE };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(1, Math.max(...xs) + pad - x), h: Math.max(1, Math.max(...ys) + pad - y) };
}

/** Giới hạn zoom so với khung "vừa sơ đồ": phóng tối đa 3×, thu nhỏ tối thiểu 0,4×. */
export const ZOOM_MAX = 3;
export const ZOOM_MIN = 0.4;

/**
 * Phóng / thu khung nhìn quanh một điểm (toạ độ sơ đồ): factor > 1 phóng to (khung nhỏ lại), điểm dưới con trỏ đứng yên.
 * Kẹp theo ZOOM_MIN..ZOOM_MAX so với ``base`` (khung vừa sơ đồ).
 */
export function zoomViewBox(vb: DiagramViewBox, factor: number, focus: DiagramPoint, base: DiagramViewBox): DiagramViewBox {
    const minW = base.w / ZOOM_MAX;
    const maxW = base.w / ZOOM_MIN;
    const w = Math.min(maxW, Math.max(minW, vb.w / factor));
    const k = w / vb.w;
    if (k === 1) return vb;
    return {
        x: focus.x - (focus.x - vb.x) * k,
        y: focus.y - (focus.y - vb.y) * k,
        w,
        h: vb.h * k,
    };
}

/** Kéo nền sang phải dx (đơn vị sơ đồ) = khung dịch sang trái dx. */
export const panViewBox = (vb: DiagramViewBox, dx: number, dy: number): DiagramViewBox => ({
    x: vb.x - dx,
    y: vb.y - dy,
    w: vb.w,
    h: vb.h,
});

export interface ClientRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Toạ độ chuột (client) → toạ độ sơ đồ với SVG preserveAspectRatio mặc định (xMidYMid meet): tỉ lệ = min(rộng / w, cao / h),
 * phần dư chia đều hai bên. Dùng cho zoom quanh con trỏ và kéo node.
 */
export function clientToDiagram(rect: ClientRect, vb: DiagramViewBox, clientX: number, clientY: number): DiagramPoint {
    const scale = Math.min(rect.width / vb.w, rect.height / vb.h) || 1;
    const offX = (rect.width - vb.w * scale) / 2;
    const offY = (rect.height - vb.h * scale) / 2;
    return {
        x: vb.x + (clientX - rect.left - offX) / scale,
        y: vb.y + (clientY - rect.top - offY) / scale,
    };
}

const EDGE_LABELS: Record<KanjiDiagramEdgeType, string> = {
    phon: "chỉ âm",
    family: "cùng phần chỉ âm",
    radical: "bộ",
    part: "thành phần",
    compound: "ghép thành từ",
    contains: "có chữ",
};

export const edgeLabel = (type: KanjiDiagramEdgeType | string): string => EDGE_LABELS[type as KanjiDiagramEdgeType] ?? type;

/** Dòng thống kê đáy canvas: "X chữ · Y từ ghép" (bỏ phần từ ghép khi không có). */
export function diagramStats(nodes: KanjiDiagramNode[]): string {
    const words = nodes.filter((n) => n.type === "word").length;
    const kanji = nodes.length - words;
    return words > 0 ? `${kanji} chữ · ${words} từ ghép` : `${kanji} chữ`;
}
