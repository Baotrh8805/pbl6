// Hiệu quả lộ trình (kế hoạch 2026-10-26 B3): đọc response, định dạng, so sánh trước / sau bổ khuyết. Hàm thuần, không gọi API
// hay DOM -> kiểm bằng scripts/selfcheck/learningPath.ts (import tương đối + đuôi .ts).
import type {
    AdminPathEffect,
    PathEffect,
    PathEffectChapter,
    PathEffectSplit,
    PathEffectStats,
    PathEffectWindow,
} from "../types/api.types.ts";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
/** Tỷ lệ hợp lệ 0..1, ngoài khoảng / sai kiểu -> null (không vẽ thanh sai). */
const rate = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const ms = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export function parseWindow(raw: unknown): PathEffectWindow {
    const r = rec(raw) ?? {};
    return { reviews: count(r.reviews), again: count(r.again), againRate: rate(r.againRate), medianReactionMs: ms(r.medianReactionMs) };
}

export function parseStats(raw: unknown): PathEffectStats {
    const r = rec(raw) ?? {};
    return {
        cards: count(r.cards),
        studiedCards: count(r.studiedCards),
        reviews: count(r.reviews),
        again: count(r.again),
        againRate: rate(r.againRate),
        medianReactionMs: ms(r.medianReactionMs),
        retentionEligible: count(r.retentionEligible),
        retained: count(r.retained),
        retention7d: rate(r.retention7d),
    };
}

function parseSplit(raw: unknown): PathEffectSplit | null {
    const r = rec(raw);
    if (!r || typeof r.remedialPathId !== "string") return null;
    return {
        remedialPathId: r.remedialPathId,
        remedialTitle: typeof r.remedialTitle === "string" ? r.remedialTitle : "Bổ khuyết",
        at: typeof r.at === "string" ? r.at : "",
        before: parseWindow(r.before),
        after: parseWindow(r.after),
    };
}

export function parsePathEffect(raw: unknown): PathEffect {
    const r = rec(raw) ?? {};
    const chapters: PathEffectChapter[] = [];
    for (const item of Array.isArray(r.chapters) ? r.chapters : []) {
        const c = rec(item);
        if (!c || typeof c.chapterId !== "string") continue;
        chapters.push({
            chapterId: c.chapterId,
            position: count(c.position),
            title: typeof c.title === "string" && c.title.trim() ? c.title : `Chương ${count(c.position)}`,
            stats: parseStats(c.stats),
        });
    }
    chapters.sort((a, b) => a.position - b.position);
    return {
        pathId: typeof r.pathId === "string" ? r.pathId : "",
        title: typeof r.title === "string" ? r.title : "",
        remedial: r.remedial === true,
        total: parseStats(r.total),
        chapters,
        remedialSplit: parseSplit(r.remedialSplit),
    };
}

/** Thiếu / hỏng -> undefined để dashboard ẩn dòng so sánh. */
export function parseAdminPathEffect(raw: unknown): AdminPathEffect | undefined {
    const r = rec(raw);
    if (!r || !rec(r.inPath) || !rec(r.outside)) return undefined;
    return { inPath: parseWindow(r.inPath), outside: parseWindow(r.outside) };
}

/** 0.333 -> "33%"; null -> "—". */
export function formatRate(r: number | null): string {
    return r === null ? "—" : `${Math.round(r * 100)}%`;
}

/** 850 -> "0,9 giây"; 12 400 -> "12 giây"; null -> "—". */
export function formatReaction(m: number | null): string {
    if (m === null) return "—";
    // Làm tròn trên số nguyên phần mười giây: 0.85.toFixed(1) cho "0.8" vì sai số dấu phẩy động.
    const tenths = Math.round(m / 100);
    return `${tenths < 100 ? `${Math.floor(tenths / 10)},${tenths % 10}` : Math.round(m / 1000)} giây`;
}

export type Trend = "better" | "worse" | "same" | "unknown";

/** Chênh dưới ngưỡng này (điểm %) coi như "không đổi" — vài lượt ôn lệch không phải là xu hướng. */
export const AGAIN_TREND_EPSILON = 0.02;
/** Mỗi phía cần ít nhất ngần này lượt mới so (ít hơn: "chưa đủ dữ liệu"). */
export const MIN_SPLIT_REVIEWS = 5;

/** Tỷ lệ "Lại" sau bổ khuyết so với trước: giảm = tốt hơn. */
export function againTrend(split: Pick<PathEffectSplit, "before" | "after">): Trend {
    const { before, after } = split;
    if (before.reviews < MIN_SPLIT_REVIEWS || after.reviews < MIN_SPLIT_REVIEWS) return "unknown";
    if (before.againRate === null || after.againRate === null) return "unknown";
    const d = after.againRate - before.againRate;
    if (Math.abs(d) < AGAIN_TREND_EPSILON) return "same";
    return d < 0 ? "better" : "worse";
}

export const TREND_LABEL: Record<Trend, string> = {
    better: "Tỷ lệ “Lại” giảm sau bổ khuyết",
    worse: "Tỷ lệ “Lại” tăng sau bổ khuyết",
    same: "Tỷ lệ “Lại” gần như không đổi",
    unknown: "Chưa đủ lượt ôn để so (cần ít nhất 5 lượt mỗi bên)",
};

/** Bề rộng thanh (0..100) cho tỷ lệ; null -> 0. */
export function barPct(r: number | null): number {
    return r === null ? 0 : Math.min(100, Math.max(0, Math.round(r * 100)));
}
