// Bố cục lực cho đồ thị tri thức (spec 2026-10-27 §9) + tiện ích thuần cho trang /graph. Tất định: cùng đồ thị → cùng toạ độ
// (seed từ id node), node tâm ghim giữa, các node khác bắt đầu trên vòng theo khoảng cách BFS rồi Fruchterman–Reingold làm
// giãn. Không phụ thuộc React để selfcheck chạy bằng Node.
import type { HanVietWordNode } from "@/types/api.types";
import type { GraphEdge, GraphNode, GraphNodeType } from "@/types/graph.types";

export interface NodePosition {
    x: number;
    y: number;
}

/** PRNG tất định (mulberry32) để bố cục không nhảy giữa hai lần render cùng dữ liệu. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** Khoảng cách BFS từ node tâm (không nối → hạng cao nhất + 1). */
export function bfsDepth(nodes: { id: string }[], edges: { from: string; to: string }[], centerId: string | null): Record<string, number> {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
        adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
    }
    const depth: Record<string, number> = {};
    if (centerId && nodes.some((n) => n.id === centerId)) {
        depth[centerId] = 0;
        const queue = [centerId];
        while (queue.length) {
            const cur = queue.shift() as string;
            for (const next of adj.get(cur) ?? []) {
                if (depth[next] === undefined) {
                    depth[next] = depth[cur] + 1;
                    queue.push(next);
                }
            }
        }
    }
    const max = Math.max(0, ...Object.values(depth));
    for (const n of nodes) if (depth[n.id] === undefined) depth[n.id] = max + 1;
    return depth;
}

/**
 * Toạ độ trong hộp [margin, size - margin]². Node tâm cố định ở giữa; các node khác xếp vòng theo BFS rồi mô phỏng lực
 * (đẩy giữa mọi cặp, kéo theo cạnh, hút nhẹ về tâm), nhiệt độ giảm dần. 60 node × 200 vòng vẫn dưới 10 ms.
 */
export function forceLayout(
    nodes: { id: string }[],
    edges: { from: string; to: string }[],
    size: number,
    centerId: string | null,
    iterations = 200
): Record<string, NodePosition> {
    const out: Record<string, NodePosition> = {};
    if (nodes.length === 0) return out;
    const c = size / 2;
    const margin = Math.max(24, size * 0.06);
    const depth = bfsDepth(nodes, edges, centerId);
    const random = rng(hash(nodes.map((n) => n.id).join("|")));
    const byDepth = new Map<number, string[]>();
    for (const n of nodes) byDepth.set(depth[n.id], [...(byDepth.get(depth[n.id]) ?? []), n.id]);
    const maxDepth = Math.max(1, ...byDepth.keys());
    for (const [d, ids] of byDepth) {
        if (d === 0) {
            for (const id of ids) out[id] = { x: c, y: c };
            continue;
        }
        const radius = (size / 2 - margin) * (0.35 + (0.65 * d) / maxDepth);
        const offset = random() * Math.PI * 2;
        ids.forEach((id, i) => {
            const angle = offset + (Math.PI * 2 * i) / ids.length;
            out[id] = { x: c + radius * Math.cos(angle), y: c + radius * Math.sin(angle) };
        });
    }
    const ids = nodes.map((n) => n.id);
    const index = new Map(ids.map((id, i) => [id, i]));
    const pinned = centerId !== null && index.has(centerId) ? centerId : null;
    const k = Math.max(28, Math.sqrt((size * size) / Math.max(1, ids.length)) * 0.65);
    let temp = size / 8;
    const cool = temp / (iterations + 1);
    const links = edges
        .map((e) => [index.get(e.from), index.get(e.to)] as const)
        .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);
    for (let it = 0; it < iterations; it++) {
        const disp = ids.map(() => ({ x: 0, y: 0 }));
        for (let i = 0; i < ids.length; i++) {
            const a = out[ids[i]];
            for (let j = i + 1; j < ids.length; j++) {
                const b = out[ids[j]];
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let d = Math.hypot(dx, dy);
                if (d < 0.01) {
                    dx = random() - 0.5;
                    dy = random() - 0.5;
                    d = Math.hypot(dx, dy);
                }
                const f = (k * k) / d;
                disp[i].x += (dx / d) * f;
                disp[i].y += (dy / d) * f;
                disp[j].x -= (dx / d) * f;
                disp[j].y -= (dy / d) * f;
            }
        }
        for (const [i, j] of links) {
            const a = out[ids[i]];
            const b = out[ids[j]];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.max(0.01, Math.hypot(dx, dy));
            const f = (d * d) / k;
            disp[i].x -= (dx / d) * f;
            disp[i].y -= (dy / d) * f;
            disp[j].x += (dx / d) * f;
            disp[j].y += (dy / d) * f;
        }
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (id === pinned) continue;
            const p = out[id];
            // hút nhẹ về tâm để thành phần rời không trôi ra mép
            disp[i].x -= (p.x - c) * 0.03;
            disp[i].y -= (p.y - c) * 0.03;
            const d = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
            const step = Math.min(d, temp);
            p.x = Math.min(size - margin, Math.max(margin, p.x + (disp[i].x / d) * step));
            p.y = Math.min(size - margin, Math.max(margin, p.y + (disp[i].y / d) * step));
        }
        temp = Math.max(1, temp - cool);
    }
    for (const id of ids) out[id] = { x: Math.round(out[id].x * 10) / 10, y: Math.round(out[id].y * 10) / 10 };
    return out;
}

// ---- hiển thị ---------------------------------------------------------------------------------------------------------

export const TYPE_LABEL: Record<GraphNodeType, string> = {
    word: "Từ",
    kanji: "Chữ Hán",
    radical: "Bộ thủ",
    component: "Thành phần",
    hanviet: "Âm Hán-Việt",
    grammar: "Mẫu ngữ pháp",
    sentence: "Câu ví dụ",
    deck: "Bộ thẻ",
    card: "Thẻ của bạn",
    path: "Lộ trình",
    chapter: "Chương",
    user: "Bạn",
};

/** Lớp Tailwind tô node theo loại (SVG dùng fill, chữ lấy text-* tương ứng). */
export const TYPE_FILL: Record<GraphNodeType, string> = {
    word: "fill-primary-fixed",
    kanji: "fill-tertiary-fixed",
    radical: "fill-surface-container-high",
    component: "fill-surface-container",
    hanviet: "fill-secondary-container",
    grammar: "fill-[#FEF3C7]",
    sentence: "fill-surface-container-low",
    deck: "fill-primary-container",
    card: "fill-primary-container",
    path: "fill-surface-container",
    chapter: "fill-surface-container",
    user: "fill-surface-container",
};

export const TYPE_CHIP: Record<GraphNodeType, string> = {
    word: "bg-primary-fixed text-on-primary-fixed",
    kanji: "bg-tertiary-fixed text-on-tertiary-fixed",
    radical: "bg-surface-container-high text-on-surface",
    component: "bg-surface-container text-on-surface-variant",
    hanviet: "bg-secondary-container text-on-secondary-container",
    grammar: "bg-[#FEF3C7] text-[#B45309]",
    sentence: "bg-surface-container-low text-on-surface-variant",
    deck: "bg-primary-container text-on-primary-container",
    card: "bg-primary-container text-on-primary-container",
    path: "bg-surface-container text-on-surface-variant",
    chapter: "bg-surface-container text-on-surface-variant",
    user: "bg-surface-container text-on-surface-variant",
};

export const EDGE_LABEL: Record<string, string> = {
    contains: "chứa chữ",
    has_radical: "bộ thủ",
    has_component: "thành phần",
    read_as: "âm Hán-Việt",
    homophone_of: "đồng âm",
    looks_like: "giống hình",
    example_of: "ví dụ của",
    uses_grammar: "dùng mẫu",
    means: "là mục từ",
    has_card: "có thẻ",
    schedules: "lịch học",
    owns: "sở hữu",
    follows: "theo",
    has_chapter: "chương",
    from_deck: "từ bộ",
};

export function edgeLabel(type: string): string {
    return EDGE_LABEL[type] ?? type.replace(/_/g, " ");
}

/** Bán kính vẽ theo loại: chữ Hán to để đọc được, câu ví dụ nhỏ (nhãn cắt ngắn). */
export function nodeRadius(type: GraphNodeType, isCenter: boolean): number {
    const base = type === "kanji" || type === "radical" || type === "component" ? 20 : type === "sentence" ? 11 : 16;
    return isCenter ? base + 6 : base;
}

/** Chữ ghi trên node (ngắn, phần đủ ở tooltip / bảng chi tiết). */
export function nodeText(node: GraphNode): string {
    const s = node.label || "";
    if (node.type === "sentence") return s.length > 10 ? s.slice(0, 9) + "…" : s;
    if (node.type === "grammar") return s.length > 9 ? s.slice(0, 8) + "…" : s;
    if (node.type === "hanviet") return s.length > 8 ? s.slice(0, 7) + "…" : s;
    return s.length > 7 ? s.slice(0, 6) + "…" : s;
}

/** Vòng viền theo tình trạng học: đến hạn → đỏ, đã ôn → xanh, mới có thẻ → tím; không có thẻ → không viền. */
export function learnerStroke(node: GraphNode): string | null {
    const l = node.learner;
    if (!l || l.cards === 0) return null;
    if (l.due > 0) return "stroke-error";
    if (l.reviewed > 0) return "stroke-secondary";
    return "stroke-primary";
}

export function learnerText(node: GraphNode): string | null {
    const l = node.learner;
    if (!l || l.cards === 0) return null;
    const bits = [`${l.cards} thẻ của bạn`];
    if (l.due > 0) bits.push(`${l.due} đến hạn ôn`);
    else if (l.reviewed > 0) bits.push("đã ôn");
    else bits.push("chưa ôn lần nào");
    if (l.again30d > 0) bits.push(`sai ${l.again30d} lần / 30 ngày`);
    return bits.join(" · ");
}

/** Link mở node trong từ điển / bộ thẻ; null = không có trang riêng. */
export function nodeHref(node: GraphNode): string | null {
    const enc = encodeURIComponent;
    switch (node.type) {
        case "word":
            return node.key ? `/dictionary?e=${enc(node.key)}` : `/dictionary?q=${enc(node.label)}`;
        case "kanji":
            return `/dictionary?tab=kanji&k=${enc(node.char ?? node.label)}`;
        case "radical":
            return node.no ? `/dictionary?tab=kanji&sub=radicals&r=${node.no}` : null;
        case "hanviet":
            return `/dictionary?tab=hanviet&reading=${enc(node.reading ?? node.label)}`;
        case "sentence":
            return node.jpn ? `/dictionary?tab=sentences&s=${enc(node.jpn.slice(0, 24))}` : null;
        case "deck":
            return node.id.startsWith("d:") ? `/decks/${enc(node.id.slice(2))}` : null;
        case "card":
            return node.deckId ? `/decks/${enc(node.deckId)}` : null;
        case "path":
            return node.id.startsWith("p:") ? `/roadmap/${enc(node.id.slice(2))}` : null;
        default:
            return null;
    }
}

/** Node từ → dạng AddWordToDeckModal cần (dùng lại hộp "Thêm vào bộ thẻ" của bản đồ Hán-Việt). */
export function wordNodeForDeck(node: GraphNode): HanVietWordNode | null {
    if (node.type !== "word" || !node.term) return null;
    return {
        id: node.id,
        type: "word",
        label: node.term,
        reading: node.reading ?? node.term,
        meaning: node.vi ?? node.gloss ?? "",
        level: node.jlpt ?? null,
        hanViet: "",
    };
}

/** Nghĩa hiện cho từ: tiếng Việt (từ điển) trước, rồi gloss Anh. */
export function wordMeaning(node: GraphNode): string {
    return node.vi ?? node.gloss ?? "";
}

export interface AnswerSegment {
    text: string;
    /** Số nguồn khi đoạn là "[n]". */
    ref?: number;
}

/** Tách câu trả lời GraphRAG thành đoạn chữ và mốc [n] để bấm nhảy tới nguồn. "[12]" → ref 12; "[a]" giữ nguyên. */
export function splitAnswer(answer: string): AnswerSegment[] {
    const out: AnswerSegment[] = [];
    const re = /\[(\d{1,2})\]/g;
    let last = 0;
    for (const m of answer.matchAll(re)) {
        const i = m.index ?? 0;
        if (i > last) out.push({ text: answer.slice(last, i) });
        out.push({ text: m[0], ref: Number(m[1]) });
        last = i + m[0].length;
    }
    if (last < answer.length) out.push({ text: answer.slice(last) });
    return out;
}

/** Gom node theo loại, giữ thứ tự xuất hiện, loại có nhiều node trước (bảng chú giải + bảng chi tiết). */
export function groupByType(nodes: GraphNode[]): { type: GraphNodeType; nodes: GraphNode[] }[] {
    const map = new Map<GraphNodeType, GraphNode[]>();
    for (const n of nodes) map.set(n.type, [...(map.get(n.type) ?? []), n]);
    return [...map.entries()].map(([type, list]) => ({ type, nodes: list })).sort((a, b) => b.nodes.length - a.nodes.length);
}

/** Cạnh nối tới node (để bảng chi tiết liệt kê quan hệ). */
export function edgesOf(nodeId: string, edges: GraphEdge[]): { other: string; type: string; outward: boolean }[] {
    return edges
        .filter((e) => e.from === nodeId || e.to === nodeId)
        .map((e) => ({ other: e.from === nodeId ? e.to : e.from, type: e.type, outward: e.from === nodeId }));
}
