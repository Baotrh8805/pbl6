// Bố cục sơ đồ chữ Hán (spec 2026-10-30 §3.5 D6): hàm thuần, không React, để scripts/selfcheck/diagram.ts kiểm được.
// Bố cục theo cung tất định (không mô phỏng lực): tâm ở giữa, thành phần cấu tạo ở cung bên trái theo thứ tự viết, họ chữ
// cùng chỉ âm quạt bên phải, từ ghép xếp vòng quanh tâm và chữ khác trong từ nằm ngoài trên cùng tia. Toạ độ làm tròn
// 1 chữ số để JSON / so sánh ổn định.
import type { KanjiDiagramEdge, KanjiDiagramEdgeType, KanjiDiagramMode, KanjiDiagramNode } from "../../types/kanjiDiagram.types.ts";
import { nodeRadius } from "./diagramStyle.ts";
import { pillWidth } from "../../lib/hanVietUtils.ts";

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
const DEG = Math.PI / 180;
/**
 * Độ dài mũi tên nhìn thấy mong muốn (người dùng 30/10: rút còn ~60% so với bố cục cũ theo tỉ lệ cạnh khung). Vòng nào cũng lấy
 * mũi tên này làm gốc rồi chỉ nới ra khi số node trên vòng cần thêm chỗ (khoảng cách tối thiểu giữa hai node cùng vòng).
 */
const ARROW_COMPONENT = 60;  // thành phần → chữ tâm (Cấu tạo; cũ 115)
const ARROW_WORD = 80;       // chữ tâm → từ ghép (Từ ghép; cũ 154)
const ARROW_CONTAINS = 26;   // từ ghép → chữ khác trong từ (cũ 42)
const ARROW_WORD_CHAR = 32;  // từ → chữ trong từ (Phân tích từ; cũ 52–97)
const SECTOR_GAP = 78;       // hai vòng tròn cùng vòng (đường kính 44 + nhãn Hán-Việt)
const SECTOR_WORD_GAP = 84;  // hai viên từ ghép cùng vòng (viên rộng hơn vòng tròn)

/** Bán kính nhỏ nhất để n node chia đều với bước góc step cách nhau ≥ gap (n ≤ 1 → 0). */
const ringFor = (n: number, step: number, gap: number): number => (n <= 1 ? 0 : gap / (2 * Math.sin(Math.min(Math.PI, step) / 2)));
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
 * Toạ độ từng node quanh tâm (size / 2, size / 2). Tâm = node có id centerId (hoặc type center). Thành phần: cung trái 225° → 135°
 * (trên xuống dưới, y hướng xuống như SVG). Họ chỉ âm: quạt phải −70° → 70°, vòng ngoài vòng thành phần. Từ ghép: vòng đều bắt đầu
 * từ đỉnh; chữ khác trong từ: ngoài vòng từ, trên tia của từ đầu tiên chứa nó (nhiều chữ cùng từ lệch nhau đủ để không đè). Bán
 * kính mỗi vòng = mũi tên mong muốn (ARROW_*) + phần nằm trong hai node, nới khi đông node (ringFor). Node không thuộc nhóm nào:
 * vòng ngoài cùng. Đồ thị rỗng → {}.
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
    const ext = (n: KanjiDiagramNode) => nodeExtent(n, center.id);
    const maxExt = (ns: KanjiDiagramNode[], fallback: number) => (ns.length ? Math.max(...ns.map(ext)) : fallback);
    const cExt = ext(center);

    const components = nodes.filter((n) => n.id !== center.id && n.type === "component");
    const compR = Math.max(
        cExt + maxExt(components, 22) + ARROW_GAP + ARROW_COMPONENT,
        ringFor(components.length, (90 * DEG) / Math.max(1, components.length - 1), SECTOR_GAP)
    );
    spread(components.length, 225 * DEG, 135 * DEG).forEach((theta, i) => {
        positions[components[i].id] = polar(c, compR, theta);
    });

    const phonetic = nodes.filter((n) => n.id !== center.id && n.type === "phonetic");
    const phonR = Math.max(compR + SECTOR_GAP, ringFor(phonetic.length, (140 * DEG) / Math.max(1, phonetic.length - 1), SECTOR_GAP));
    spread(phonetic.length, -70 * DEG, 70 * DEG).forEach((theta, i) => {
        positions[phonetic[i].id] = polar(c, phonR, theta);
    });

    const words = nodes.filter((n) => n.id !== center.id && n.type === "word");
    const wordExt = maxExt(words, 26);
    const wordR = Math.max(cExt + wordExt + ARROW_GAP + ARROW_WORD, ringFor(words.length, (2 * Math.PI) / Math.max(1, words.length), SECTOR_WORD_GAP));
    const wordAngle: Record<string, number> = {};
    words.forEach((w, i) => {
        const theta = -90 * DEG + (2 * Math.PI * i) / words.length;
        wordAngle[w.id] = theta;
        positions[w.id] = polar(c, wordR, theta);
    });
    const outerR = wordR + wordExt + 20 + ARROW_GAP + ARROW_CONTAINS;

    // chữ khác trong từ: gom theo từ đầu tiên chứa nó (cạnh contains), nhiều chữ cùng từ lệch nhau đủ SECTOR_GAP
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
        const half = Math.asin(Math.min(1, SECTOR_GAP / 2 / outerR)) * (ids.length - 1);
        spread(ids.length, base - half, base + half).forEach((theta, i) => {
            positions[ids[i]] = polar(c, outerR, theta);
        });
    }

    const rest = nodes.filter((n) => !(n.id in positions));
    const restR = Math.max(phonetic.length ? phonR : compR, words.length ? outerR : 0) + SECTOR_GAP;
    rest.forEach((n, i) => {
        positions[n.id] = polar(c, restR, -90 * DEG + (2 * Math.PI * i) / rest.length + 0.37);
    });
    return positions;
}

/** Chế độ "Phân tích từ" chỉ có cho từ 2–4 chữ Hán (spec 30/10 từ nhiều chữ W4). */
export const WORD_MIN_CHARS = 2;
export const WORD_MAX_CHARS = 4;
/** Quạt thành phần quanh từng chữ ở chế độ Phân tích từ: bán kính ban đầu, khoảng cách tối thiểu giữa hai node (đường kính node
 *  44 + nhãn Hán-Việt bên dưới), góc quạt tối đa hướng ra ngoài (không vòng lại phía từ ở giữa / chữ bên cạnh). */
const WORD_PART_RADIUS = 80; // fanOut nới tới khi cách node đã đặt ≥ WORD_MIN_GAP
const WORD_MIN_GAP = 84.5; // 84 cần thiết (đường kính 44 + nhãn) + biên cho toạ độ làm tròn 1 chữ số
/** Từ 2 chữ: quạt thành phần chéo lên / xuống thay vì ra ngang, để khung vừa sơ đồ không quá dẹt (企業 trước đây rộng / cao 2,4).
 *  Quạt rộng tối thiểu 170° (2 thành phần ở trên / dưới chữ), tối đa 240°. Không ép trục (sx = sy = 1): ép ngang bắt bán kính
 *  nới ra nên mũi tên dài lại (đo 30/10: 鬱 5 thành phần 73 → 107). Từ 3–4 chữ đã gần vuông: quạt ≤ 150°. */
const FAN_PAIR = { minArc: 170 * DEG, maxArc: 240 * DEG, sx: 1, sy: 1 };
const FAN_MANY = { minArc: 0, maxArc: 150 * DEG, sx: 1, sy: 1 };

/**
 * Đặt ids trên cung quanh ``anchor`` hướng ``away`` (ép / giãn theo sx, sy). Bán kính nới dần tới khi mọi node mới cách nhau và cách
 * mọi node đã đặt (chữ, từ, thành phần của chữ khác) ≥ WORD_MIN_GAP; tất định.
 */
function fanOut(
    anchor: DiagramPoint,
    away: number,
    ids: string[],
    placed: DiagramPositions,
    fan: typeof FAN_PAIR
): DiagramPositions {
    if (ids.length === 0) return {};
    const others = Object.values(placed);
    const stepAt = (radius: number) => 2 * Math.asin(Math.min(1, WORD_MIN_GAP / 2 / radius));
    const layoutAt = (r: number): DiagramPositions => {
        const arc = ids.length === 1 ? 0 : Math.min(fan.maxArc, Math.max(fan.minArc, (ids.length - 1) * stepAt(r)));
        const out: DiagramPositions = {};
        spread(ids.length, away - arc / 2, away + arc / 2).forEach((theta, i) => {
            out[ids[i]] = { x: round1(anchor.x + r * fan.sx * Math.cos(theta)), y: round1(anchor.y + r * fan.sy * Math.sin(theta)) };
        });
        return out;
    };
    const ok = (pos: DiagramPositions): boolean => {
        const pts = Object.values(pos);
        return pts.every((p, i) =>
            others.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= WORD_MIN_GAP) &&
            pts.slice(i + 1).every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= WORD_MIN_GAP)
        );
    };
    let r = WORD_PART_RADIUS;
    let pos = layoutAt(r);
    for (let i = 0; i < 40 && !ok(pos); i++) {
        r *= 1.08;
        pos = layoutAt(r);
    }
    return pos;
}

/**
 * Bố cục "Phân tích từ" (spec 30/10 từ nhiều chữ §4): từ ở giữa; các chữ (node có cạnh contains từ tâm, theo thứ tự cạnh)
 * chia đều trên vòng bắt đầu từ bên trái (2 chữ trái – phải trên vòng 0,15 cạnh; 3 tam giác, 4 chữ thập trên vòng 0,24); thành
 * phần của mỗi chữ quạt ra phía xa tâm bằng fanOut (từ 2 chữ: quạt chéo để khung không dẹt). Node còn lại → vòng ngoài. Tất định,
 * làm tròn 1 chữ số.
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
    const pair = chars.length <= 2;
    const centerNode = nodes.find((n) => n.id === centerId);
    const charR = Math.max(
        (centerNode ? nodeExtent(centerNode, centerId) : 20) + 20 + ARROW_GAP + ARROW_WORD_CHAR,
        WORD_MIN_GAP,
        ringFor(chars.length, (2 * Math.PI) / Math.max(1, chars.length), WORD_MIN_GAP)
    );
    chars.forEach((id, i) => {
        positions[id] = polar(c, charR, Math.PI + (2 * Math.PI * i) / chars.length);
    });
    for (const ch of chars) {
        const parts = edges.filter((e) => e.to === ch && e.type !== "contains" && has.has(e.from) && !(e.from in positions)).map((e) => e.from);
        const at = positions[ch];
        Object.assign(positions, fanOut(at, Math.atan2(at.y - c, at.x - c), [...new Set(parts)], positions, pair ? FAN_PAIR : FAN_MANY));
    }
    const rest = nodes.filter((n) => !(n.id in positions));
    const farthest = Math.max(charR, ...Object.values(positions).map((p) => Math.hypot(p.x - c, p.y - c)));
    rest.forEach((n, i) => {
        positions[n.id] = polar(c, farthest + WORD_MIN_GAP, -90 * DEG + (2 * Math.PI * i) / rest.length + 0.37);
    });
    return positions;
}

/** Tab "Phân tích từ" hiện khi câu tìm là từ (ai-service trả word): kể cả 人々 / 時時 chỉ còn một chữ sau khử trùng. */
export const showWordTab = (word: string | null, chars: string[]): boolean =>
    word !== null && chars.length >= 1 && chars.length <= WORD_MAX_CHARS;

/**
 * Cạnh chỉ âm do heuristic đoán (vẽ nét đứt + "chỉ âm?"): node nguồn mang guess và cạnh trỏ vào chữ được đoán — ở Cấu tạo là
 * tâm, ở Phân tích từ là một chữ trong từ (tâm là w:…). Cạnh từ part chỉ âm sang họ chữ không phải suy đoán.
 */
export function isGuessedPhonEdge(
    e: KanjiDiagramEdge,
    from: KanjiDiagramNode | undefined,
    centerId: string | null,
    layout: "sector" | "word"
): boolean {
    return e.type === "phon" && Boolean(from?.guess) && (e.to === centerId || layout === "word");
}

/** Khoá trạng thái mở thêm / kéo / chọn node của một sơ đồ: đổi câu tìm, chế độ hay chữ chọn trong từ là sơ đồ khác. */
export const diagramKey = (q: string, mode: KanjiDiagramMode | null, k: string | null): string => `${q}|${mode ?? ""}|${k ?? ""}`;

/** Cỡ chữ của viên từ ghép (từ làm tâm ở Phân tích từ to hơn). */
export const wordFontPx = (n: KanjiDiagramNode, centerId: string | null): number => (n.id === centerId ? 20 : 16);

/** Nửa bề rộng phần node mà cạnh phải lùi vào (viên từ: nửa bề ngang; vòng tròn: bán kính). */
export const nodeExtent = (n: KanjiDiagramNode, centerId: string | null): number =>
    n.type === "word" ? pillWidth(n.label, wordFontPx(n, centerId), 20) / 2 : nodeRadius(n);

/** Khoảng hở thêm trước đầu mũi tên (để mũi tên không chạm viền node đích). */
export const ARROW_GAP = 6;

/** Độ dài phần mũi tên nhìn thấy giữa hai node = khoảng cách tâm − phần nằm trong hai node − khoảng hở; ≤ 0 → không vẽ. */
export const visibleArrowLength = (a: DiagramPoint, b: DiagramPoint, na: KanjiDiagramNode, nb: KanjiDiagramNode, centerId: string | null): number =>
    Math.hypot(b.x - a.x, b.y - a.y) - nodeExtent(na, centerId) - nodeExtent(nb, centerId) - ARROW_GAP;

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
