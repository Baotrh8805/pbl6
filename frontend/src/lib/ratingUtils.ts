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

/**
 * key của form đánh giá: dựng lại form khi đánh giá CỦA MÌNH trên server đổi (gửi / sửa / xoá xong và đã tải lại), để
 * form mở lại với đúng số sao + bình luận vừa lưu. Không dùng số lần tải lại làm key: form dựng lại ngay lúc bấm gửi,
 * trước khi dữ liệu mới về, nên useState khởi tạo bằng `mine` cũ (rỗng) và giữ rỗng.
 */
export function ratingFormKey(mine: { stars: number; comment: string | null } | null | undefined): string {
    return mine ? `${mine.stars}|${mine.comment ?? ""}` : "none";
}
