// Chỉ số học tập tính từ dữ liệu thật (/decks, /reviews, /quiz-results), không cho người dùng tự nhập.
// Hàm thuần, không gọi API -> kiểm được bằng scripts/selfCheck.ts.
import { isDue, type Review } from "./srs.ts";
import { MASTERED_INTERVAL_DAYS } from "./deckUtils.ts";
import type { Deck, QuizResult } from "../types/api.types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** SrsService.schedule: "again" hẹn ôn lại sau 10 phút, các mức khác sau intervalDays ngày. */
const AGAIN_DELAY_MS = 10 * 60 * 1000;

export interface LearningStats {
    /** Số thẻ (thuộc bộ thẻ hiện có) đã được chấm ít nhất một lần. */
    wordsLearned: number;
    /** Thẻ có khoảng ôn >= 21 ngày. */
    consolidatedWords: number;
    /** Thẻ đến hạn ôn, kể cả thẻ chưa học lần nào. */
    srsDueCount: number;
    /** Thẻ có lần ôn gần nhất rơi vào hôm nay. */
    reviewedToday: number;
    /** Số thẻ ôn theo ngày, 7 phần tử từ 6 ngày trước tới hôm nay. */
    reviewsLast7Days: number[];
    /** Tổng câu đúng / tổng câu (%), null khi chưa thi lần nào. */
    quizAccuracy: number | null;
    quizCount: number;
    /** % đúng của bài gần nhất. */
    lastQuizPct: number | null;
    currentStreak: number;
    maxStreak: number;
}

/** Khóa ngày theo giờ máy người dùng: học 23h và 1h sáng hôm sau là hai ngày khác nhau. */
export const dayKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Suy ngược thời điểm chấm gần nhất: server đặt dueAt = lúc chấm + intervalDays ngày
 * (hoặc + 10 phút với "again", khi đó intervalDays = 0).
 */
export const lastReviewedAt = (r: Review): Date =>
    new Date(Date.parse(r.dueAt) - (r.intervalDays > 0 ? r.intervalDays * DAY_MS : AGAIN_DELAY_MS));

/**
 * Chuỗi ngày học liên tiếp.
 * - current: đếm lùi từ hôm nay; hôm nay chưa học thì đếm từ hôm qua (chuỗi chưa đứt tới hết ngày).
 * - max: đoạn ngày liên tiếp dài nhất.
 */
export const calcStreaks = (days: Set<string>, today: Date): { current: number; max: number } => {
    let start = today;
    if (!days.has(dayKey(today))) start = addDays(today, -1);
    let current = 0;
    while (days.has(dayKey(addDays(start, -current)))) current++;

    let max = 0;
    for (const key of days) {
        const [y, m, d] = key.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        if (days.has(dayKey(addDays(date, -1)))) continue; // chỉ đếm từ ngày đầu mỗi đoạn
        let run = 1;
        while (days.has(dayKey(addDays(date, run)))) run++;
        max = Math.max(max, run);
    }
    return { current, max: Math.max(max, current) };
};

/** Độ chính xác gộp = tổng câu đúng / tổng câu, không lấy trung bình % từng bài (bài 5 câu và 20 câu khác trọng số). */
export const calcQuizAccuracy = (results: QuizResult[]): number | null => {
    const total = results.reduce((s, r) => s + r.total, 0);
    if (total === 0) return null;
    const score = results.reduce((s, r) => s + r.score, 0);
    return Math.round((score / total) * 1000) / 10; // 1 chữ số thập phân
};

// ponytail: backend chỉ lưu lần chấm GẦN NHẤT mỗi thẻ và trả 10 bài thi gần nhất,
// nên streak/lịch sử là cận dưới (ôn lại thẻ cũ sẽ "xóa" ngày học trước của thẻ đó).
// Nâng cấp khi backend có bảng review_log (mỗi lần chấm một dòng): đếm ngày từ log.
export const calcLearningStats = (
    decks: Deck[],
    reviews: Record<string, Review>,
    quizResults: QuizResult[],
    now: Date = new Date()
): LearningStats => {
    const cards = decks.flatMap((d) => d.cards);
    const cardReviews = cards.map((c) => reviews[c.id]).filter((r): r is Review => !!r);

    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(addDays(now, i - 6)));
    const reviewsLast7Days = last7.map(() => 0);
    const activeDays = new Set<string>();

    for (const r of cardReviews) {
        const key = dayKey(lastReviewedAt(r));
        activeDays.add(key);
        const idx = last7.indexOf(key);
        if (idx >= 0) reviewsLast7Days[idx]++;
    }
    for (const q of quizResults) {
        const t = Date.parse(q.createdAt);
        if (!Number.isNaN(t)) activeDays.add(dayKey(new Date(t)));
    }

    const { current, max } = calcStreaks(activeDays, now);
    const latest = [...quizResults].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

    return {
        wordsLearned: cardReviews.length,
        consolidatedWords: cardReviews.filter((r) => r.intervalDays >= MASTERED_INTERVAL_DAYS).length,
        srsDueCount: cards.filter((c) => isDue(reviews[c.id], now)).length,
        reviewedToday: reviewsLast7Days[6],
        reviewsLast7Days,
        quizAccuracy: calcQuizAccuracy(quizResults),
        quizCount: quizResults.length,
        lastQuizPct: latest && latest.total > 0 ? Math.round((latest.score / latest.total) * 100) : null,
        currentStreak: current,
        maxStreak: max,
    };
};

export const EMPTY_STATS: LearningStats = {
    wordsLearned: 0,
    consolidatedWords: 0,
    srsDueCount: 0,
    reviewedToday: 0,
    reviewsLast7Days: [0, 0, 0, 0, 0, 0, 0],
    quizAccuracy: null,
    quizCount: 0,
    lastQuizPct: null,
    currentStreak: 0,
    maxStreak: 0,
};
