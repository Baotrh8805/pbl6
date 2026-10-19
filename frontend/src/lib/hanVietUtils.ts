// Bản đồ Hán–Việt (F1): hàm thuần cho trang /han-viet — chuẩn hoá âm, đọc response, gom từ theo cấp, bố cục toả
// tròn cho SVG. Không gọi API / DOM -> kiểm được bằng scripts/selfCheck.ts (import tương đối + đuôi .ts).
import type {
    CardDto,
    HanVietEdge,
    HanVietGraph,
    HanVietKanjiNode,
    HanVietNode,
    HanVietReadingNode,
    HanVietSuggestion,
    HanVietWordNode,
} from "../types/api.types.ts";
import { JLPT_LEVELS } from "./deckUtils.ts";

/** Khoá nhóm "chưa rõ cấp" — cùng giá trị với UNKNOWN_LEVEL của extractionUtils (không import để lib không phụ thuộc features). */
export const HAN_VIET_UNKNOWN_LEVEL = "unknown";

/** Thứ tự nhóm khi liệt kê từ ghép: dễ -> khó rồi chưa rõ cấp. */
export const LEVEL_BUCKET_ORDER: readonly string[] = [...JLPT_LEVELS, HAN_VIET_UNKNOWN_LEVEL];

const isJlptLevel = (v: unknown): v is (typeof JLPT_LEVELS)[number] =>
    typeof v === "string" && (JLPT_LEVELS as readonly string[]).includes(v);

/**
 * Chuẩn hoá âm người dùng gõ: NFC (dấu tổ hợp -> dựng sẵn để "NHẬT" gõ kiểu nào cũng là một chuỗi), cắt khoảng trắng
 * thừa, viết hoa theo locale vi nhưng GIỮ dấu (server đối chiếu theo chữ hoa có dấu).
 */
export const normalizeHanVietQuery = (s: string): string =>
    s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("vi");

/** Âm đầu trong chuỗi Hán-Việt của một từ ("NHẬT BẢN" -> "NHẬT"); rỗng / null -> "". */
export const firstHanVietReading = (hanViet: string | null | undefined): string =>
    normalizeHanVietQuery(hanViet ?? "").split(" ")[0] ?? "";

/** Link "Xem mạng lưới" từ badge Hán-Việt: mở bản đồ với âm đầu của từ; không có âm -> null (không hiện link). */
export const hanVietMapUrl = (hanViet: string | null | undefined): string | null => {
    const first = firstHanVietReading(hanViet);
    return first ? `/han-viet?reading=${encodeURIComponent(first)}` : null;
};

export const isReadingNode = (n: HanVietNode): n is HanVietReadingNode => n.type === "reading";
export const isKanjiNode = (n: HanVietNode): n is HanVietKanjiNode => n.type === "kanji";
export const isWordNode = (n: HanVietNode): n is HanVietWordNode => n.type === "word";

export const readingNodeOf = (graph: HanVietGraph): HanVietReadingNode | null =>
    graph.nodes.find(isReadingNode) ?? null;

export const wordNodesOf = (graph: HanVietGraph): HanVietWordNode[] => graph.nodes.filter(isWordNode);

// ---- Đọc response (ranh giới không đáng tin: bỏ nút / cạnh hỏng thay vì để trang trắng) ---------------------------

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const levelOrNull = (v: unknown): string | null => (isJlptLevel(v) ? v : null);
const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function parseHanVietGraph(raw: unknown): HanVietGraph {
    const rec = asRecord(raw) ?? {};
    const nodes: HanVietNode[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(rec.nodes) ? rec.nodes : []) {
        const n = asRecord(item);
        if (!n || typeof n.id !== "string" || typeof n.label !== "string" || seen.has(n.id)) continue;
        const base = { id: n.id, label: n.label };
        if (n.type === "reading") nodes.push({ ...base, type: "reading" });
        else if (n.type === "kanji")
            nodes.push({
                ...base,
                type: "kanji",
                hanViet: str(n.hanViet),
                on: strList(n.on),
                kun: strList(n.kun),
                level: levelOrNull(n.level),
                strokes: intOrNull(n.strokes),
                radical: strOrNull(n.radical),
            });
        else if (n.type === "word")
            nodes.push({
                ...base,
                type: "word",
                reading: str(n.reading),
                meaning: str(n.meaning),
                level: levelOrNull(n.level),
                hanViet: str(n.hanViet),
            });
        else continue;
        seen.add(n.id);
    }
    const edges: HanVietEdge[] = [];
    for (const item of Array.isArray(rec.edges) ? rec.edges : []) {
        const e = asRecord(item);
        if (!e || typeof e.from !== "string" || typeof e.to !== "string" || !seen.has(e.from) || !seen.has(e.to)) continue;
        edges.push({ from: e.from, to: e.to, type: e.type === "in_word" ? "in_word" : "has_kanji" });
    }
    return { query: str(rec.query), nodes, edges };
}

export function parseHanVietSuggestions(raw: unknown): HanVietSuggestion[] {
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? rec.items : [];
    const out: HanVietSuggestion[] = [];
    for (const item of items) {
        const s = asRecord(item);
        if (!s || typeof s.reading !== "string" || !s.reading.trim()) continue;
        out.push({ reading: s.reading, count: Math.max(0, intOrNull(s.count) ?? 0), kanji: strList(s.kanji) });
    }
    return out;
}

// ---- Gom nhóm -------------------------------------------------------------------------------------------------

export interface KanjiEntry {
    node: HanVietKanjiNode;
    /** Từ ghép chứa chữ này, theo thứ tự nút trong response (ổn định giữa các lần render). */
    words: HanVietWordNode[];
    wordCount: number;
}

/**
 * Mỗi chữ Hán của âm kèm các từ ghép nối với nó. Cạnh được đọc bất kể chiều server ghi (has_kanji: âm -> chữ /
 * chữ -> từ; in_word: chữ -> từ): chỉ cần một đầu là chữ, đầu kia là từ. Cạnh trùng đếm một lần.
 */
export function kanjiOfGraph(graph: HanVietGraph): KanjiEntry[] {
    const byId = new Map<string, HanVietNode>();
    const order = new Map<string, number>();
    graph.nodes.forEach((n, i) => {
        byId.set(n.id, n);
        order.set(n.id, i);
    });
    const entries = new Map<string, KanjiEntry>();
    for (const n of graph.nodes) if (isKanjiNode(n)) entries.set(n.id, { node: n, words: [], wordCount: 0 });
    const seen = new Set<string>();
    for (const e of graph.edges) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;
        const kanji = isKanjiNode(a) ? a : isKanjiNode(b) ? b : null;
        const word = isWordNode(a) ? a : isWordNode(b) ? b : null;
        if (!kanji || !word) continue;
        const key = `${kanji.id}|${word.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.get(kanji.id)?.words.push(word);
    }
    for (const entry of entries.values()) {
        entry.words.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
        entry.wordCount = entry.words.length;
    }
    return [...entries.values()];
}

export interface LevelBucket {
    /** N5..N1 hoặc "unknown". */
    level: string;
    label: string;
    words: HanVietWordNode[];
}

export const levelBucketLabel = (level: string): string => (level === HAN_VIET_UNKNOWN_LEVEL ? "Chưa rõ cấp" : level);

/** Từ ghép gom theo cấp, thứ tự N5 -> N1 -> chưa rõ; chỉ trả nhóm có từ. Trong nhóm giữ thứ tự response. */
export function groupWordsByLevel(graph: HanVietGraph): LevelBucket[] {
    const words = wordNodesOf(graph);
    return LEVEL_BUCKET_ORDER.map((level) => ({
        level,
        label: levelBucketLabel(level),
        words: words.filter((w) => (level === HAN_VIET_UNKNOWN_LEVEL ? !isJlptLevel(w.level) : w.level === level)),
    })).filter((b) => b.words.length > 0);
}

// ---- Bố cục toả tròn ------------------------------------------------------------------------------------------

export interface NodePosition {
    x: number;
    y: number;
}

/** Tỉ lệ bán kính theo cạnh khung: vòng 1 (chữ Hán), vòng 2 (từ ghép), vòng 2 so le / từ mồ côi. */
export const RING_RATIO = { kanji: 0.22, word: 0.4, wordOuter: 0.47 } as const;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const polar = (c: number, r: number, angle: number): NodePosition => ({
    x: round1(c + r * Math.cos(angle)),
    y: round1(c + r * Math.sin(angle)),
});

/**
 * Vị trí từng nút trong khung vuông `size`×`size`: âm ở tâm; chữ Hán rải đều vòng 1 (chữ đầu ở đỉnh, đi theo chiều kim
 * đồng hồ); từ ghép của mỗi chữ xếp quạt trên vòng 2 quanh góc của chữ đó (chừa mép 10 % mỗi bên quạt; quạt đông từ
 * thì so le hai bán kính để nhãn đỡ chồng). Từ chứa hai chữ cùng âm gắn với chữ đứng trước; từ không nối chữ nào
 * (thiếu cạnh) rải đều vòng ngoài. Hoàn toàn xác định theo thứ tự nút / cạnh trong response.
 */
export function radialLayout(graph: HanVietGraph, size: number): Record<string, NodePosition> {
    const c = size / 2;
    const positions: Record<string, NodePosition> = {};
    const reading = readingNodeOf(graph);
    if (reading) positions[reading.id] = { x: c, y: c };

    const kanji = kanjiOfGraph(graph);
    const k = kanji.length;
    const r1 = size * RING_RATIO.kanji;
    const r2 = size * RING_RATIO.word;
    const r2b = size * RING_RATIO.wordOuter;
    const start = -Math.PI / 2;
    const sector = k > 0 ? (2 * Math.PI) / k : 0;
    const placed = new Set<string>();

    kanji.forEach((entry, i) => {
        const angle = start + sector * i;
        positions[entry.node.id] = polar(c, r1, angle);
        const own = entry.words.filter((w) => !placed.has(w.id));
        const n = own.length;
        own.forEach((w, j) => {
            const t = n === 1 ? 0.5 : 0.1 + (0.8 * j) / (n - 1);
            const a = angle - sector / 2 + sector * t;
            const r = n > 6 && j % 2 === 1 ? r2b : r2;
            positions[w.id] = polar(c, r, a);
            placed.add(w.id);
        });
    });

    const orphans = wordNodesOf(graph).filter((w) => !placed.has(w.id));
    orphans.forEach((w, j) => {
        positions[w.id] = polar(c, r2b, start + (2 * Math.PI * j) / orphans.length);
    });
    return positions;
}

const fmt = (n: number): string => String(round1(n));

/**
 * Đường nối hai nút: cong bậc hai nhẹ (điểm điều khiển lệch 12 % độ dài về phía vuông góc) — đường thẳng tắp từ tâm
 * trông như nan hoa, khó phân biệt nhánh. Hai điểm trùng -> chỉ "M x y".
 */
export function edgePath(from: NodePosition, to: NodePosition): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return `M${fmt(from.x)} ${fmt(from.y)}`;
    const k = 0.12;
    const cx = (from.x + to.x) / 2 - dy * k;
    const cy = (from.y + to.y) / 2 + dx * k;
    return `M${fmt(from.x)} ${fmt(from.y)} Q${fmt(cx)} ${fmt(cy)} ${fmt(to.x)} ${fmt(to.y)}`;
}

/** Bề rộng viên nhãn từ ghép trong SVG: ~15 px mỗi ký tự (chữ Nhật gần vuông) + lề, tối thiểu 28. */
export const pillWidth = (label: string, charPx = 15, padPx = 14): number =>
    Math.max(28, Math.round(Array.from(label).length * charPx + padPx));

/**
 * Thẻ sẽ tạo từ một từ ghép ("Thêm vào bộ thẻ"): nghĩa là trường bắt buộc của backend nên rơi về âm Hán-Việt rồi
 * cách đọc khi từ điển thiếu nghĩa; không còn gì để làm nghĩa -> null (nút thêm bị khoá).
 */
export const wordToCardDto = (word: HanVietWordNode): CardDto | null => {
    const meaning = word.meaning.trim() || word.hanViet.trim() || word.reading.trim();
    if (!word.label.trim() || !meaning) return null;
    return {
        term: word.label.trim(),
        reading: word.reading.trim() || null,
        meaning,
        hanViet: word.hanViet.trim() || null,
        level: word.level ?? null,
        kind: "vocab",
    };
};

/** Một dòng tóm tắt cho aria-label của SVG. */
export const graphSummary = (graph: HanVietGraph): string => {
    const reading = readingNodeOf(graph)?.label ?? graph.query;
    const kanji = graph.nodes.filter(isKanjiNode).length;
    const words = wordNodesOf(graph).length;
    return `Mạng lưới âm ${reading}: ${kanji} chữ Hán, ${words} từ ghép`;
};
