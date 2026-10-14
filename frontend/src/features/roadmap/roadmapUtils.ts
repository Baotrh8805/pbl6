import { dayKey } from "../../lib/learningStats.ts";
import { calcDeckProgress, type DeckProgress } from "../../lib/deckUtils.ts";
import { isDue, type Review } from "../../lib/srs.ts";
import type { Deck, LearningPathChapter, LearningPathStatus, LearningPathTask } from "../../types/api.types.ts";

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const DEFAULT_DAYS = 30;

export const PATH_STATUS_LABELS: Record<LearningPathStatus, string> = {
    PROCESSING: "Đang xử lý",
    DRAFT: "Bản nháp",
    ACTIVE: "Đang học",
    FAILED: "Thất bại",
};

export const isPathProcessing = (s: LearningPathStatus) => s === "PROCESSING";

export const isValidDays = (n: number) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;

/** "YYYY-MM-DD" -> 0h giờ địa phương (new Date("YYYY-MM-DD") là UTC nên lệch ngày ở múi giờ âm). */
export function parseDateOnly(s: string): Date {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function addDaysStr(s: string, n: number): string {
    const [y, m, d] = s.split("-").map(Number);
    return dayKey(new Date(y, m - 1, d + n));
}

/** Ngày thứ mấy của lộ trình tại `today`, kẹp trong 1..totalDays. */
export function dayIndexFor(startDate: string | null, today: Date, totalDays: number): number {
    if (!startDate) return 1;
    const [y, m, d] = startDate.split("-").map(Number);
    // So sánh theo UTC của các thành phần ngày để không bị lệch bởi giờ mùa hè.
    const start = Date.UTC(y, m - 1, d);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const idx = Math.round((now - start) / 86_400_000) + 1;
    return Math.min(Math.max(idx, 1), Math.max(totalDays, 1));
}

export const endDate = (startDate: string, totalDays: number): string => addDaysStr(startDate, totalDays - 1);

export const dateForDay = (startDate: string, dayIndex: number): string => addDaysStr(startDate, dayIndex - 1);

export function isPathEnded(startDate: string | null, totalDays: number, today: Date): boolean {
    if (!startDate) return false;
    return dayKey(today) > endDate(startDate, totalDays);
}

/** "YYYY-MM-DD" -> "dd/mm" (hoặc "dd/mm/yyyy" khi `withYear`). */
export function formatShortDate(s: string, withYear = false): string {
    const [y, m, d] = s.split("-");
    return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export const formatDayRange =(from: number, to: number): string =>
    from === to ? `Ngày ${from}` : `Ngày ${from}–${to}`;

type ChapterLite = Pick<LearningPathChapter, "id" | "deckId" | "cardCount" | "dayFrom" | "dayTo" | "perDay">;

export function chapterPerDay(ch: ChapterLite): number {
    if (ch.perDay > 0) return ch.perDay;
    const days = Math.max(ch.dayTo - ch.dayFrom + 1, 1);
    return Math.ceil(ch.cardCount / days);
}

export function tasksForDay(chapters: ChapterLite[], dayIndex: number): LearningPathTask[] {
    const tasks: LearningPathTask[] = [];
    for (const ch of chapters) {
        if (!ch.deckId || dayIndex < ch.dayFrom || dayIndex > ch.dayTo) continue;
        const perDay = chapterPerDay(ch);
        const fromPos = (dayIndex - ch.dayFrom) * perDay + 1;
        if (fromPos > ch.cardCount) continue;
        const toPos = dayIndex === ch.dayTo ? ch.cardCount : Math.min(ch.cardCount, fromPos + perDay - 1);
        tasks.push({ chapterId: ch.id, deckId: ch.deckId, fromPos, toPos });
    }
    return tasks;
}

/** Số thẻ (đầu chương) đã được lên lịch tới hết ngày `dayIndex`. */
export function scheduledUpTo(ch: ChapterLite, dayIndex: number): number {
    if (dayIndex < ch.dayFrom) return 0;
    if (dayIndex >= ch.dayTo) return ch.cardCount;
    return Math.min(ch.cardCount, (dayIndex - ch.dayFrom + 1) * chapterPerDay(ch));
}

export const todayCardCount = (tasks: Pick<LearningPathTask, "fromPos" | "toPos">[]): number =>
    tasks.reduce((sum, t) => sum + (t.toPos - t.fromPos + 1), 0);

/** Đọc dải vị trí thẻ dạng "3-10" (1-based, gồm cả hai đầu). */
export function parseRange(raw: string | null): { from: number; to: number } | null {
    if (!raw) return null;
    const m = /^\s*(\d+)-(\d+)\s*$/.exec(raw);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2]);
    return from >= 1 && to >= from ? { from, to } : null;
}

export const sliceRange = <T>(cards: T[], r: { from: number; to: number }): T[] => cards.slice(r.from - 1, r.to);

/**
 * Học theo dải (lộ trình): thẻ đã ôn mà chưa đến hạn chỉ ghi log (cram), không đổi lịch SRS;
 * thẻ mới hoặc đến hạn xếp lịch bình thường.
 */
export const rangeCram = (review: Review | undefined, now: Date): boolean => !!review && !isDue(review, now);

export function chapterProgress(
    ch: Pick<LearningPathChapter, "deckId">,
    decks: Deck[],
    reviews: Record<string, Review>,
    now: Date
): DeckProgress | null {
    if (!ch.deckId) return null;
    const deck = decks.find((d) => d.id === ch.deckId);
    return deck ? calcDeckProgress(deck.cards, reviews, now) : null;
}

export function pathProgress(
    chapters: Pick<LearningPathChapter, "deckId">[],
    decks: Deck[],
    reviews: Record<string, Review>,
    now: Date
): { total: number; mastered: number; pct: number; missingDecks: number } {
    let total = 0;
    let mastered = 0;
    let missingDecks = 0;
    for (const ch of chapters) {
        if (!ch.deckId) continue;
        const p = chapterProgress(ch, decks, reviews, now);
        if (!p) {
            missingDecks++;
            continue;
        }
        total += p.total;
        mastered += p.mastered;
    }
    return { total, mastered, pct: total ? Math.round((mastered / total) * 100) : 0, missingDecks };
}

/** Số thẻ đã lên lịch tới hết ngày dayIndex-1 mà chưa có review nào. */
export function behindCount(
    chapters: ChapterLite[],
    dayIndex: number,
    decks: Deck[],
    reviews: Record<string, Review>
): number {
    let n = 0;
    for (const ch of chapters) {
        const deck = decks.find((d) => d.id === ch.deckId);
        if (!deck) continue;
        n += deck.cards.slice(0, scheduledUpTo(ch, dayIndex - 1)).filter((c) => !reviews[c.id]).length;
    }
    return n;
}

export function unreviewedInTasks(
    tasks: LearningPathTask[],
    decks: Deck[],
    reviews: Record<string, Review>
): number {
    let n = 0;
    for (const t of tasks) {
        const deck = decks.find((d) => d.id === t.deckId);
        if (!deck) continue;
        n += deck.cards.slice(t.fromPos - 1, t.toPos).filter((c) => !reviews[c.id]).length;
    }
    return n;
}
