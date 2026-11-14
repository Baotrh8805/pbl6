// Lịch ôn do server quyết định (SrsService.java). Client chỉ đọc kết quả.
export type Grade = "again" | "hard" | "good" | "easy";

/**
 * Trần thời gian phản xạ (ms) server nhận ở POST /reviews — CHECK `review_logs.reaction_ms BETWEEN 0 AND 600000`.
 * Một nguồn duy nhất: StudyPage kẹp (roadmapUtils.clampReactionMs) và studyService lọc cùng con số này.
 */
export const MAX_REACTION_MS = 600_000;

export interface Review {
    cardId: string;
    reps: number;
    intervalDays: number;
    ease: number;
    dueAt: string; // ISO
    /** HLR (V38): p nhớ dự đoán trước lượt chấm gần nhất; hlrBrake = lượt đó giữ khoảng ôn. Thiếu với server cũ. */
    recallBefore?: number | null;
    hlrBrake?: boolean;
}

/**
 * Trả về mốc cuối ngày (23:59:59.999) của ngày được truyền vào theo giờ địa phương.
 * Khớp hoàn toàn với quy ước của Backend (due_at < 00:00 ngày mai theo múi giờ):
 * Mọi thẻ có lịch ôn trong ngày hôm nay đều được tính là đến hạn ôn tập trong ngày.
 */
export const endOfDay = (d: Date = new Date()): number => {
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
};

export const isDue = (review: Review | undefined, now: Date = new Date()): boolean =>
    !review || Date.parse(review.dueAt) <= endOfDay(now);

// Biên tin cậy: response API có thể sai shape (backend đổi, proxy trả HTML...) -> lọc trước khi dùng.
const isReview = (v: unknown): v is Review => {
    const r = v as Review;
    return (
        !!r &&
        typeof r === "object" &&
        typeof r.cardId === "string" &&
        Number.isFinite(r.reps) &&
        Number.isFinite(r.intervalDays) &&
        Number.isFinite(r.ease) &&
        typeof r.dueAt === "string" &&
        !Number.isNaN(Date.parse(r.dueAt))
    );
};

export const parseReviews = (raw: unknown): Record<string, Review> =>
    Array.isArray(raw)
        ? Object.fromEntries(raw.filter(isReview).map((r) => [r.cardId, r]))
        : {};

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;

export const clampEase = (ease: number): number =>
    Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, ease)) * 100) / 100;

/** Định dạng số ngày sang chuỗi hiển thị thân thiện (ngày / tháng / năm). */
export const formatIntervalDays = (days: number): string => {
    if (days <= 0) return "< 1 ngày";
    if (days === 1) return "1 ngày";
    if (days < 60) return `${days} ngày`;
    if (days < 365) {
        const months = Number((days / 30).toFixed(1));
        return `${months} tháng`;
    }
    const years = Number((days / 365).toFixed(1));
    return `${years} năm`;
};

/**
 * Dự đoán khoảng thời gian lặp lại tiếp theo (theo thuật toán SM-2 của SrsService.java).
 * Dùng để hiển thị gợi ý trực quan số ngày trên các nút đánh giá 1-4 trên màn hình học thẻ.
 */
export const estimateNextInterval = (
    review: Review | undefined,
    grade: Grade
): { days: number; text: string } => {
    if (grade === "again") {
        // Nút "Lại": thẻ luôn được xếp lặp lại ngay trong phiên học hiện tại (gặp lại sau 3 thẻ).
        return {
            days: 0,
            text: "Sau 3 thẻ",
        };
    }

    const delta = grade === "hard" ? -0.15 : grade === "easy" ? 0.15 : 0.0;
    const currentEase = review?.ease ?? DEFAULT_EASE;
    const ease = clampEase(currentEase + 0.1 * (DEFAULT_EASE - currentEase) + delta);
    const prev = review?.intervalDays ?? 0;

    let days: number;
    if (prev === 0) {
        days = grade === "easy" ? 4 : 1;
    } else {
        const factor = grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease;
        days = Math.max(prev + 1, Math.round(prev * factor));
    }

    return {
        days,
        text: formatIntervalDays(days),
    };
};
