// Hàm thuần cho đánh giá bộ thẻ (import tương đối + .ts để scripts/selfCheck.ts chạy được).
export const RATING_COMMENT_MAX = 500;

/** "4.5" hoặc "—" khi chưa có lượt nào (backend trả null). */
export function formatRatingAverage(rating: number | null | undefined): string {
    return rating == null ? "—" : rating.toFixed(1);
}

/** Số ký tự còn lại; âm = vượt giới hạn. */
export function commentCharsLeft(comment: string): number {
    return RATING_COMMENT_MAX - comment.length;
}

/** Gửi lên backend: cắt khoảng trắng, trống = không có bình luận. */
export function normalizeComment(comment: string): string | null {
    const trimmed = comment.trim();
    return trimmed === "" ? null : trimmed;
}
