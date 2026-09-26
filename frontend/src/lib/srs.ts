// Lịch ôn do server quyết định (SrsService.java). Client chỉ đọc kết quả.
export type Grade = "again" | "hard" | "good" | "easy";

export interface Review {
    cardId: string;
    reps: number;
    intervalDays: number;
    ease: number;
    dueAt: string; // ISO
}

export const isDue = (review: Review | undefined, now: Date = new Date()) =>
    !review || Date.parse(review.dueAt) <= now.getTime();

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
