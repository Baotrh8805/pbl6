// Màu và kích thước node / cạnh của sơ đồ chữ Hán (spec 2026-10-30 §3.5), tách khỏi file component để Fast Refresh không
// phàn nàn về export không phải component. Màu theo ảnh tham khảo; token Tailwind của app không có cam / vàng / tím nên dùng
// hex như LEVEL_FILL ở HanVietGraphSvg.
import type { KanjiDiagramEdge, KanjiDiagramNode } from "../../types/kanjiDiagram.types.ts";

export const NODE_FILL: Record<KanjiDiagramNode["type"], string> = {
    center: "#2563eb",
    component: "#f97316",
    phonetic: "#facc15",
    word: "#7c3aed",
    kanji: "#ffffff",
};

export const NODE_TEXT: Record<KanjiDiagramNode["type"], string> = {
    center: "#ffffff",
    component: "#ffffff",
    phonetic: "#1f2937",
    word: "#ffffff",
    kanji: "#1f2937",
};

export const EDGE_COLOR: Record<KanjiDiagramEdge["type"], string> = {
    phon: "#16a34a",
    family: "#16a34a",
    radical: "#dc2626",
    part: "#94a3b8",
    compound: "#7c3aed",
    contains: "#94a3b8",
};

export const RADICAL_RING = "#dc2626";

/** Bán kính node (từ ghép là viên: nửa chiều cao). Thu nhỏ 30/10 để vòng tròn không lấn nhãn khi khung vừa sơ đồ. */
export const nodeRadius = (n: KanjiDiagramNode): number =>
    n.type === "center" ? 30 : n.type === "component" || n.type === "phonetic" ? 22 : n.type === "word" ? 15 : 20;
