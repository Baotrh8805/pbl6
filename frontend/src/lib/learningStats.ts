// Chỉ số học tập tính từ dữ liệu thật (/decks, /reviews, /quiz-results, /reviews/activity), không cho người dùng tự nhập.
// Hàm thuần, không gọi API -> kiểm được bằng scripts/selfCheck.ts và scripts/selfcheck/learner.ts.
import { isDue, type Review } from "./srs.ts";
import { MASTERED_INTERVAL_DAYS } from "./deckUtils.ts";
import type { Deck, QuizResult } from "../types/api.types.ts";
import type { ActivityDay, ReviewActivity } from "../types/learner.types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Thẻ vừa được tạo (intervalDays = 0, chưa chấm): coi như vừa chấm 10 phút trước. Sau mỗi lần chấm intervalDays >= 1. */
const AGAIN_DELAY_MS = 10 * 60 * 1000;

export interface LearningStats {
    /** Số thẻ (thuộc bộ thẻ hiện có) đã được chấm ít nhất một lần. */
    wordsLearned: number;
    /** Thẻ có khoảng ôn >= 21 ngày ("đã thuộc"). */
    consolidatedWords: number;
    /** Thẻ cần học hôm nay = dueToday + newCards (badge / nút "Ôn tập" cũ dùng tổng này). */
    srsDueCount: number;
    /**
     * Thẻ ĐÃ HỌC đến hạn ôn hôm nay. Server (/reviews/activity): hạn trước cuối ngày theo múi giờ của máy; suy luận
     * (server chưa có endpoint): hạn tới lúc này.
     */
    dueToday: number;
    /** Thẻ trong các bộ của mình chưa học lần nào. */
    newCards: number;
    /** Lượt ôn hôm nay (server: mỗi lần chấm một lượt; suy luận: thẻ có lần chấm gần nhất hôm nay). */
    reviewedToday: number;
    /** Lượt ôn theo ngày, 7 phần tử từ 6 ngày trước tới hôm nay. */
    reviewsLast7Days: number[];
    /** Tổng câu đúng / tổng câu (%), null khi chưa thi lần nào. */
    quizAccuracy: number | null;
    quizCount: number;
    /** % đúng của bài gần nhất. */
    lastQuizPct: number | null;
    currentStreak: number;
    maxStreak: number;
    /** "server" = chuỗi ngày / lượt ôn lấy từ nhật ký ôn (/reviews/activity); "inferred" = suy ngược từ lịch ôn (cận dưới). */
    activitySource: "server" | "inferred";
}

/** Khóa ngày theo giờ máy người dùng: học 23h và 1h sáng hôm sau là hai ngày khác nhau. */
export const dayKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Suy ngược thời điểm chấm gần nhất: server đặt dueAt = lúc chấm + intervalDays ngày
 * ("again" cũng vậy: intervalDays còn 30%, tối thiểu 1 ngày).
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

/** Chỉ bài thi (exam) phản ánh trình độ; luyện tập thấy đáp án ngay nên không tính. Bản ghi cũ không có mode = exam. */
export const examResultsOnly = (results: QuizResult[]): QuizResult[] => results.filter((r) => r.mode !== "practice");

/**
 * Độ chính xác gộp = tổng câu đúng / tổng câu, không lấy trung bình % từng bài (bài 5 câu và 20 câu khác trọng số).
 * Chỉ tính bài thi, không tính luyện tập.
 */
export const calcQuizAccuracy = (results: QuizResult[]): number | null => {
    const exams = examResultsOnly(results);
    const total = exams.reduce((s, r) => s + r.total, 0);
    if (total === 0) return null;
    const score = exams.reduce((s, r) => s + r.score, 0);
    return Math.round((score / total) * 1000) / 10; // 1 chữ số thập phân
};

// ---- /reviews/activity (A5) ----------------------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const nonNegInt = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/**
 * GET /reviews/activity. Dữ liệu không đáng tin: ngày sai định dạng / số âm bị bỏ, ngày lặp được cộng dồn. Không phải
 * object hoặc không có trường nào dùng được (vd. proxy trả HTML) -> null để dashboard quay về cách suy luận cũ.
 */
export function parseReviewActivity(raw: unknown): ReviewActivity | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    const byDay = new Map<string, ActivityDay>();
    for (const item of Array.isArray(rec.days) ? rec.days : []) {
        if (!item || typeof item !== "object") continue;
        const d = item as Record<string, unknown>;
        if (typeof d.day !== "string" || !DAY_RE.test(d.day)) continue;
        const prev = byDay.get(d.day) ?? { day: d.day, reviews: 0, quizzes: 0 };
        prev.reviews += nonNegInt(d.reviews) ?? 0;
        prev.quizzes += nonNegInt(d.quizzes) ?? 0;
        byDay.set(d.day, prev);
    }
    const activity: ReviewActivity = {
        days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
        dueToday: nonNegInt(rec.dueToday),
        newCards: nonNegInt(rec.newCards),
        learnedTotal: nonNegInt(rec.learnedTotal),
        masteredTotal: nonNegInt(rec.masteredTotal),
        currentStreak: nonNegInt(rec.currentStreak),
        maxStreak: nonNegInt(rec.maxStreak),
    };
    const hasNumber = [
        activity.dueToday,
        activity.newCards,
        activity.learnedTotal,
        activity.masteredTotal,
        activity.currentStreak,
        activity.maxStreak,
    ].some((n) => n !== null);
    return Array.isArray(rec.days) || hasNumber ? activity : null;
}

/** Ngày có học (ôn thẻ hoặc làm quiz) theo nhật ký server. */
const activityDaySet = (days: readonly ActivityDay[]): Set<string> =>
    new Set(days.filter((d) => d.reviews + d.quizzes > 0).map((d) => d.day));

/**
 * Chuỗi ngày học từ nhật ký server. Server đã tính currentStreak / maxStreak trên toàn bộ lịch sử thì dùng luôn (danh
 * sách days chỉ có `days` ngày gần nhất); thiếu thì đếm từ days cùng quy tắc calcStreaks (hôm nay chưa học vẫn giữ chuỗi
 * tới hôm qua). Kỷ lục không bao giờ nhỏ hơn chuỗi hiện tại.
 */
export const streaksFromActivity = (
    activity: Pick<ReviewActivity, "days" | "currentStreak" | "maxStreak">,
    today: Date
): { current: number; max: number } => {
    const computed = calcStreaks(activityDaySet(activity.days), today);
    const current = activity.currentStreak ?? computed.current;
    return { current, max: Math.max(activity.maxStreak ?? 0, computed.max, current) };
};

// ponytail: khi chưa có /reviews/activity, backend chỉ cho biết lần chấm GẦN NHẤT mỗi thẻ và 10 bài thi gần nhất,
// nên streak/lịch sử suy luận là cận dưới (ôn lại thẻ cũ sẽ "xóa" ngày học trước của thẻ đó). Có `activity` (đếm từ
// review_logs + quiz_results theo múi giờ) thì streak, lượt ôn theo ngày, số đến hạn / thẻ mới / đã học / đã thuộc lấy từ
// server; trường nào server thiếu thì vẫn dùng số suy luận.
export const calcLearningStats = (
    decks: Deck[],
    reviews: Record<string, Review>,
    quizResults: QuizResult[],
    now: Date = new Date(),
    activity: ReviewActivity | null = null
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

    const latest = [...quizResults].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const localNew = cards.filter((c) => !reviews[c.id]).length;
    const localDue = cards.filter((c) => !!reviews[c.id] && isDue(reviews[c.id], now)).length;

    let streaks = calcStreaks(activeDays, now);
    let last7Counts = reviewsLast7Days;
    if (activity) {
        streaks = streaksFromActivity(activity, now);
        const reviewsByDay = new Map(activity.days.map((d) => [d.day, d.reviews]));
        last7Counts = last7.map((k) => reviewsByDay.get(k) ?? 0);
    }
    const dueToday = activity?.dueToday ?? localDue;
    const newCards = activity?.newCards ?? localNew;

    return {
        wordsLearned: activity?.learnedTotal ?? cardReviews.length,
        consolidatedWords:
            activity?.masteredTotal ?? cardReviews.filter((r) => r.intervalDays >= MASTERED_INTERVAL_DAYS).length,
        srsDueCount: dueToday + newCards,
        dueToday,
        newCards,
        reviewedToday: last7Counts[6],
        reviewsLast7Days: last7Counts,
        quizAccuracy: calcQuizAccuracy(quizResults),
        quizCount: quizResults.length,
        lastQuizPct: latest && latest.total > 0 ? Math.round((latest.score / latest.total) * 100) : null,
        currentStreak: streaks.current,
        maxStreak: streaks.max,
        activitySource: activity ? "server" : "inferred",
    };
};

export const EMPTY_STATS: LearningStats = {
    wordsLearned: 0,
    consolidatedWords: 0,
    srsDueCount: 0,
    dueToday: 0,
    newCards: 0,
    reviewedToday: 0,
    reviewsLast7Days: [0, 0, 0, 0, 0, 0, 0],
    quizAccuracy: null,
    quizCount: 0,
    lastQuizPct: null,
    currentStreak: 0,
    maxStreak: 0,
    activitySource: "inferred",
};
