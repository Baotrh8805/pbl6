// Insights người học (điểm yếu + bổ khuyết, F3 "Học gì tiếp", F4 thẻ phản xạ chậm): hàm thuần — đọc response, nhãn,
// định dạng, kiểm tra số ngày. Không gọi API / DOM -> kiểm được bằng scripts/selfCheck.ts (import tương đối + đuôi .ts).
import type {
    CardKind,
    FrictionCard,
    FrictionResponse,
    NextStep,
    NextStepKind,
    WeakCard,
    WeaknessGroup,
    WeaknessGroupBy,
    WeaknessReason,
    WeaknessResponse,
} from "../types/api.types.ts";

/** Cùng giới hạn với LearningPathService.REMEDIAL_* của backend (ngoài khoảng -> 400, thiếu thẻ yếu -> 409). */
export const REMEDIAL_MIN_DAYS = 3;
export const REMEDIAL_MAX_DAYS = 30;
export const REMEDIAL_MIN_CARDS = 8;
/** Cửa sổ (ngày) của GET /insights/weaknesses — cũng là cửa sổ server dùng khi tạo lộ trình bổ khuyết. */
export const WEAKNESS_DAYS = 30;
/** Số thẻ yếu hiện trước trên thẻ "Điểm yếu" (danh sách đầy đủ nằm trong lộ trình bổ khuyết). */
export const WEAK_PREVIEW_COUNT = 8;

export const REASON_ORDER: readonly WeaknessReason[] = ["lapses", "low_ease", "slow", "quiz_wrong"];

export const REASON_LABELS: Record<WeaknessReason, string> = {
    lapses: "Hay quên",
    low_ease: "Khó nhớ",
    slow: "Phản xạ chậm",
    quiz_wrong: "Sai khi kiểm tra",
};

/**
 * Câu giải thích cho tooltip / người đọc màn hình — cùng ngưỡng với InsightService.weakCards (spec §3.7). "Phản xạ chậm"
 * ở đây là slowLimit = max(4 s, 2 × trung vị cá nhân), tức phải vượt CẢ HAI; tab Phản xạ chậm (InsightService.friction)
 * thì chỉ cần một trong hai nên câu của FrictionTab dùng "hoặc". Tên nút chấm lấy theo GRADES của StudyPage ("Lại").
 */
export const REASON_HINTS: Record<WeaknessReason, string> = {
    lapses: "Chấm “Lại” từ 3 lần trở lên trong 14 ngày gần đây",
    low_ease: "Hệ số dễ nhớ (ease) tụt dưới 1.8 vì thường bị chấm Khó / Lại",
    slow: "Thời gian phản xạ trung vị (≥ 5 lần đo) vượt cả 4 giây lẫn gấp đôi mức thường của bạn",
    quiz_wrong: "Trả lời sai từ 2 lần trở lên trong các bài kiểm tra",
};

export const GROUP_TABS: readonly { key: WeaknessGroupBy; label: string }[] = [
    { key: "level", label: "Cấp" },
    { key: "kind", label: "Loại" },
    { key: "kanji", label: "Chữ Hán" },
    { key: "deck", label: "Bộ thẻ" },
];

/** Lựa chọn cách gom chương của lộ trình bổ khuyết, kèm giải thích ngắn cho người học. */
export const REMEDIAL_GROUP_OPTIONS: readonly { value: WeaknessGroupBy; label: string; hint: string }[] = [
    { value: "level", label: "Theo cấp JLPT", hint: "Mỗi cấp N5…N1 thành một chương, học từ dễ tới khó." },
    { value: "kind", label: "Theo loại thẻ", hint: "Tách từ vựng và ngữ pháp thành hai chương riêng." },
    { value: "kanji", label: "Theo chữ Hán chung", hint: "Thẻ có cùng chữ Hán đầu tiên học cạnh nhau để nhớ theo chữ." },
    { value: "deck", label: "Theo bộ thẻ gốc", hint: "Giữ nguyên ngữ cảnh: mỗi bộ thẻ gốc thành một chương." },
];

export const isValidRemedialDays = (n: number): boolean =>
    Number.isInteger(n) && n >= REMEDIAL_MIN_DAYS && n <= REMEDIAL_MAX_DAYS;

/** Số ngày mặc định của modal bổ khuyết: gợi ý của server, kẹp 3..30; thiếu / hỏng -> 7 (khoảng 5–7 của spec §3.8). */
export const defaultRemedialDays = (suggested: number | null | undefined): number =>
    typeof suggested === "number" && Number.isFinite(suggested)
        ? Math.min(REMEDIAL_MAX_DAYS, Math.max(REMEDIAL_MIN_DAYS, Math.round(suggested)))
        : 7;

/** Nhãn của một nhóm: loại thẻ dịch sang tiếng Việt, bộ thẻ lấy tên (thiếu tên -> "Bộ thẻ"), còn lại giữ khoá. */
export const groupLabel = (by: WeaknessGroupBy, g: Pick<WeaknessGroup, "key" | "title">): string => {
    if (by === "kind") return g.key === "grammar" ? "Ngữ pháp" : "Từ vựng";
    if (by === "deck") return g.title?.trim() || "Bộ thẻ";
    return g.key;
};

/** Số thẻ mang từng lý do (một thẻ có thể nhiều lý do), theo thứ tự REASON_ORDER, bỏ lý do 0 thẻ. */
export const reasonCounts = (cards: Pick<WeakCard, "reasons">[]): { reason: WeaknessReason; count: number }[] =>
    REASON_ORDER.map((reason) => ({ reason, count: cards.filter((c) => c.reasons.includes(reason)).length })).filter(
        (r) => r.count > 0
    );

// ---- Học gì tiếp (F3) ---------------------------------------------------------------------------------------------

export const NEXT_STEP_META: Record<NextStepKind, { icon: string; label: string }> = {
    path_today: { icon: "today", label: "Lộ trình hôm nay" },
    due: { icon: "event_repeat", label: "Ôn thẻ đến hạn" },
    catchup: { icon: "history", label: "Học bù" },
    remedial: { icon: "healing", label: "Bổ khuyết điểm yếu" },
    next_chapter: { icon: "skip_next", label: "Chương kế tiếp" },
    library: { icon: "auto_stories", label: "Thư viện cùng cấp" },
};

const NEXT_KINDS = Object.keys(NEXT_STEP_META) as NextStepKind[];
const isNextKind = (v: unknown): v is NextStepKind => typeof v === "string" && (NEXT_KINDS as string[]).includes(v);

/** "12 thẻ" / "3 thẻ nợ" / "9 thẻ yếu"; số âm / hỏng coi như 0. */
export const nextStepCountLabel = (item: Pick<NextStep, "kind" | "count">): string => {
    const n = Math.max(0, Math.round(item.count) || 0);
    if (item.kind === "catchup") return `${n} thẻ nợ`;
    if (item.kind === "remedial") return `${n} thẻ yếu`;
    return `${n} thẻ`;
};

/**
 * `to` của server chỉ được là đường dẫn nội bộ ("/..."): URL tuyệt đối hoặc "//host" (Link của react-router sẽ mở ra
 * ngoài) bị thay bằng "/" — response là dữ liệu không đáng tin.
 */
export const safeInternalPath = (to: unknown): string =>
    typeof to === "string" && to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/";

// ---- Đọc response (NON_NULL: trường null bị bỏ; mục hỏng bị bỏ thay vì làm trắng trang) ---------------------------------

const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isReason = (v: unknown): v is WeaknessReason =>
    typeof v === "string" && (REASON_ORDER as readonly string[]).includes(v);
const kindOf = (v: unknown): CardKind | null => (v === "vocab" || v === "grammar" ? v : null);

function parseGroups(v: unknown): WeaknessGroup[] {
    const out: WeaknessGroup[] = [];
    for (const item of Array.isArray(v) ? v : []) {
        const g = asRecord(item);
        if (!g || typeof g.key !== "string") continue;
        out.push({ key: g.key, title: strOrNull(g.title), count: Math.max(0, Math.round(num(g.count))) });
    }
    return out;
}

export function parseWeaknesses(raw: unknown): WeaknessResponse {
    const rec = asRecord(raw) ?? {};
    const cards: WeakCard[] = [];
    for (const item of Array.isArray(rec.cards) ? rec.cards : []) {
        const c = asRecord(item);
        if (!c || typeof c.cardId !== "string" || typeof c.term !== "string") continue;
        cards.push({
            cardId: c.cardId,
            deckId: str(c.deckId),
            deckTitle: strOrNull(c.deckTitle),
            term: c.term,
            reading: strOrNull(c.reading),
            meaning: str(c.meaning),
            level: strOrNull(c.level),
            kind: kindOf(c.kind),
            reasons: (Array.isArray(c.reasons) ? c.reasons : []).filter(isReason),
            againCount: num(c.againCount),
            ease: numOrNull(c.ease),
            intervalDays: numOrNull(c.intervalDays),
            medianReactionMs: numOrNull(c.medianReactionMs),
            quizWrong: num(c.quizWrong),
        });
    }
    const groups = asRecord(rec.groups) ?? {};
    return {
        total: typeof rec.total === "number" && Number.isFinite(rec.total) ? Math.max(0, Math.round(rec.total)) : cards.length,
        cards,
        groups: {
            level: parseGroups(groups.level),
            kind: parseGroups(groups.kind),
            kanji: parseGroups(groups.kanji),
            deck: parseGroups(groups.deck),
        },
        canRemedial: rec.canRemedial === true,
        suggestedDays: defaultRemedialDays(numOrNull(rec.suggestedDays)),
    };
}

export function parseFriction(raw: unknown): FrictionResponse {
    const rec = asRecord(raw) ?? {};
    const cards: FrictionCard[] = [];
    for (const item of Array.isArray(rec.cards) ? rec.cards : []) {
        const c = asRecord(item);
        if (!c || typeof c.cardId !== "string" || typeof c.term !== "string") continue;
        cards.push({
            cardId: c.cardId,
            term: c.term,
            reading: strOrNull(c.reading),
            meaning: str(c.meaning),
            deckId: str(c.deckId),
            medianReactionMs: Math.max(0, num(c.medianReactionMs)),
            samples: Math.max(0, Math.round(num(c.samples))),
            ratio: numOrNull(c.ratio),
        });
    }
    const personal = numOrNull(rec.personalMedianMs);
    return { personalMedianMs: personal !== null && personal > 0 ? personal : null, cards };
}

export function parseNextSteps(raw: unknown): NextStep[] {
    const out: NextStep[] = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const s = asRecord(item);
        if (!s || !isNextKind(s.kind)) continue;
        out.push({
            kind: s.kind,
            title: str(s.title).trim() || NEXT_STEP_META[s.kind].label,
            count: Math.max(0, Math.round(num(s.count))),
            to: safeInternalPath(s.to),
        });
    }
    return out;
}

// ---- Định dạng ---------------------------------------------------------------------------------------------------

/** Một chữ số thập phân, dấu phẩy kiểu Việt (toLocaleString phụ thuộc ICU của môi trường nên tự ghép). */
const oneDecimal = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");

/** 4200 -> "4,2 s"; 12 345 -> "12,3 s"; hỏng / âm -> "—". */
export const formatSeconds = (ms: number | null | undefined): string =>
    typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? `${oneDecimal(ms / 1000)} s` : "—";

/** 2.5 -> "×2,5"; 3 -> "×3,0"; null (chưa có trung vị cá nhân) -> "—". */
export const formatRatio = (ratio: number | null | undefined): string =>
    typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? `×${oneDecimal(ratio)}` : "—";
