// Thao tác trang học (spec docs/Plan/specs/2026-10-25-thao-tac-hoc-the-design.md): hàm thuần để scripts/selfCheck.ts kiểm được.
import type { Grade } from "../../lib/srs.ts";
import type { SessionCardMode } from "../../types/api.types.ts";

/** Thẻ bấm "Lại" gặp lại sau ngần này thẻ khác (§3.3). */
export const AGAIN_GAP = 3;
/** Phiên dở trong sessionStorage quá ngần này thì bỏ (§3.7). */
export const SAVED_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Số bước hoàn tác giữ trong một phiên (§3.8); server còn giới hạn 30 phút. */
export const UNDO_LIMIT = 20;
/** Số thẻ "hay quên" hiện ở màn tổng kết (§3.5). */
export const HARDEST_LIMIT = 10;

export const GRADE_ORDER: Grade[] = ["again", "hard", "good", "easy"];

/**
 * Hàng đợi sau khi chấm "Lại" thẻ đầu: chèn nó vào sau `gap` thẻ còn lại; còn ít hơn thì về cuối (như trước).
 * Hàng 1 thẻ giữ nguyên.
 */
export const requeueAgain = (ids: readonly string[], gap: number = AGAIN_GAP): string[] => {
    if (ids.length === 0) return [];
    const [head, ...rest] = ids;
    return rest.length <= gap ? [...rest, head] : [...rest.slice(0, gap), head, ...rest.slice(gap)];
};

/** Ngưỡng vuốt: max(80px, 25% bề rộng thẻ) (§3.6). */
export const swipeThreshold = (width: number): number => Math.max(80, 0.25 * width);

/** Thả tay sau khi kéo dx px: trái = Lại, phải = Tốt, chưa tới ngưỡng = bật về. */
export const swipeDecision = (dx: number, width: number): "again" | "good" | null => {
    const t = swipeThreshold(width);
    return dx <= -t ? "again" : dx >= t ? "good" : null;
};

export interface KeyInput {
    key: string;
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
}

export interface KeyState {
    revealed: boolean;
    /** Chế độ Nghe đang chờ cú bấm "Bắt đầu nghe". */
    audioGate: boolean;
}

/** "none" = nuốt phím (chặn cuộn trang / bấm nút đang focus) nhưng không làm gì. */
export type StudyKeyAction =
    | { kind: "reveal" }
    | { kind: "hide" }
    | { kind: "grade"; grade: Grade }
    | { kind: "undo" }
    | { kind: "help" }
    | { kind: "replay" }
    | { kind: "openAudio" }
    | { kind: "none" };

const DIGIT_GRADES: Record<string, Grade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };

/**
 * Phím tắt trang học (bảng §3.2). Space / Enter chỉ lật qua lại hai mặt; chấm điểm chỉ bằng phím số 1–4.
 * null = để trình duyệt xử lý như thường.
 */
export const studyKeyAction = (e: KeyInput, s: KeyState): StudyKeyAction | null => {
    const z = e.key === "z" || e.key === "Z";
    if (z && !e.altKey && !e.shiftKey) return { kind: "undo" }; // Z, Ctrl+Z, Cmd+Z
    if (e.ctrlKey || e.metaKey || e.altKey) return null; // Ctrl+R, Ctrl+C... của trình duyệt
    if (e.key === "?") return { kind: "help" };
    if (e.key === "r" || e.key === "R") return { kind: "replay" };
    if (e.code === "Space" || e.key === "Enter") {
        if (e.repeat) return { kind: "none" };
        if (s.audioGate) return { kind: "openAudio" };
        return { kind: s.revealed ? "hide" : "reveal" };
    }
    const grade = DIGIT_GRADES[e.key];
    if (grade && !e.repeat) return { kind: "grade", grade };
    return null;
};

/** Kết quả trong phiên: đủ cho bộ đếm "Học lại", màn tổng kết và hoàn tác (lưu bản trước mỗi lượt). */
export interface StudyStats {
    /** Date.now() lúc hiện thẻ được chấm đầu tiên; 0 = chưa chấm gì. */
    startedAt: number;
    /** Date.now() lúc chấm gần nhất. */
    lastAt: number;
    grades: Record<Grade, number>;
    /** Số lần bấm "Lại" từng thẻ, theo thứ tự lần đầu bấm. */
    again: Record<string, number>;
}

export const emptyStats = (): StudyStats => ({
    startedAt: 0,
    lastAt: 0,
    grades: { again: 0, hard: 0, good: 0, easy: 0 },
    again: {},
});

/** shownAt / now: Date.now() lúc thẻ hiện ra và lúc chấm (gọi trong handler, không trong render). */
export const recordGrade = (stats: StudyStats, cardId: string, grade: Grade, shownAt: number, now: number): StudyStats => ({
    ...stats,
    startedAt: stats.startedAt || shownAt,
    lastAt: now,
    grades: { ...stats.grades, [grade]: stats.grades[grade] + 1 },
    again: grade === "again" ? { ...stats.again, [cardId]: (stats.again[cardId] ?? 0) + 1 } : stats.again,
});

export interface QueueCounts {
    new: number;
    review: number;
    relearn: number;
}

/** Mới · Ôn · Học lại của các thẻ còn trong hàng đợi (§3.4): thẻ đã bấm "Lại" trong phiên tính là Học lại, Luyện tính vào Ôn. */
export const queueCounts = (
    ids: readonly string[],
    modeOf: (id: string) => SessionCardMode,
    stats: StudyStats
): QueueCounts => {
    const c: QueueCounts = { new: 0, review: 0, relearn: 0 };
    for (const id of ids) {
        if ((stats.again[id] ?? 0) > 0) c.relearn++;
        else if (modeOf(id) === "new") c.new++;
        else c.review++;
    }
    return c;
};

export interface StudySummaryData {
    durationMs: number;
    total: number;
    grades: Record<Grade, number>;
    /** Thẻ bấm "Lại" nhiều nhất trước, hoà thì thẻ quên trước đứng trước; tối đa HARDEST_LIMIT. */
    hardest: { cardId: string; count: number }[];
}

/** Thời gian = từ lúc hiện thẻ đầu tiên tới lượt chấm cuối (không tính lúc ngồi ở màn tổng kết). */
export const summarize = (stats: StudyStats): StudySummaryData => ({
    durationMs: stats.startedAt ? Math.max(0, stats.lastAt - stats.startedAt) : 0,
    total: GRADE_ORDER.reduce((n, g) => n + stats.grades[g], 0),
    grades: stats.grades,
    // Object giữ thứ tự chèn với khoá chuỗi không phải số; sort ổn định nên hoà giữ thứ tự quên
    hardest: Object.entries(stats.again)
        .map(([cardId, count]) => ({ cardId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, HARDEST_LIMIT),
});

/** "45 giây", "4 phút 12 giây", "1 giờ 5 phút". */
export const formatDuration = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    if (m < 60) return s % 60 ? `${m} phút ${s % 60} giây` : `${m} phút`;
    return m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${Math.floor(m / 60)} giờ`;
};

/** Thêm một bước hoàn tác, bỏ bước cũ nhất khi quá `limit`. */
export const pushUndo = <T>(stack: readonly T[], entry: T, limit: number = UNDO_LIMIT): T[] =>
    [...stack, entry].slice(-limit);

// ---------- Học tiếp sau F5 (§3.7) ----------

export const savedSessionKey = (queueKey: string): string => `study:v1:${queueKey}`;

export interface SavedSession {
    ids: string[];
    size: number;
    stats: StudyStats;
    savedAt: number;
}

export const serializeSession = (s: SavedSession): string => JSON.stringify(s);

const isCountMap = (v: unknown): v is Record<string, number> =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0);

/**
 * Đọc lại phiên dở: hỏng / quá hạn / không còn thẻ nào hợp lệ -> null. Thẻ đã bị xoá khỏi bộ thì bỏ khỏi hàng đợi;
 * size không nhỏ hơn số thẻ còn lại (thanh tiến độ không vượt 100%).
 */
export const parseSavedSession = (
    raw: string | null,
    validIds: ReadonlySet<string>,
    now: number
): SavedSession | null => {
    if (!raw) return null;
    let v: unknown;
    try {
        v = JSON.parse(raw);
    } catch {
        return null;
    }
    const s = v as Partial<SavedSession> | null;
    if (!s || typeof s !== "object") return null;
    if (typeof s.savedAt !== "number" || now - s.savedAt > SAVED_SESSION_MAX_AGE_MS || s.savedAt > now) return null;
    if (!Array.isArray(s.ids) || !s.ids.every((id) => typeof id === "string")) return null;
    if (typeof s.size !== "number" || !Number.isInteger(s.size) || s.size < 1) return null;
    const st = s.stats as Partial<StudyStats> | undefined;
    if (!st || typeof st.startedAt !== "number" || typeof st.lastAt !== "number") return null;
    if (!isCountMap(st.grades) || !isCountMap(st.again)) return null;
    if (!GRADE_ORDER.every((g) => typeof st.grades?.[g] === "number")) return null;
    const ids = [...new Set(s.ids)].filter((id) => validIds.has(id));
    if (ids.length === 0) return null;
    return {
        ids,
        size: Math.max(s.size, ids.length),
        stats: { startedAt: st.startedAt, lastAt: st.lastAt, grades: st.grades as Record<Grade, number>, again: st.again },
        savedAt: s.savedAt,
    };
};
