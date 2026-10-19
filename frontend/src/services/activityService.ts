// Nhật ký học theo ngày cho dashboard cá nhân (A5, hợp đồng đợt 2 §7). Tách khỏi studyService (làn khác giữ tệp đó).
import { apiClient } from "./apiClient.ts";
import { parseReviewActivity } from "../lib/learningStats.ts";
import type { ReviewActivity } from "../types/learner.types.ts";

/** Đủ dài để kỷ lục chuỗi ngày học hơn một năm vẫn đếm được từ danh sách ngày (server cũng tự tính maxStreak). */
const ACTIVITY_DAYS = 400;

/** Múi giờ IANA của máy (vd. "Asia/Ho_Chi_Minh"): server cắt ngày theo múi này để "hôm nay" khớp với người dùng. */
const browserTimeZone = (): string | null => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null;
    }
};

/**
 * GET /reviews/activity?days=&tz= -> ngày có ôn / làm quiz, số thẻ đến hạn hôm nay, thẻ mới, đã học / đã thuộc, chuỗi
 * ngày. null khi response không dùng được. Lỗi HTTP (404/405 khi backend chưa có endpoint, 403 với staff) được ném ra:
 * nơi gọi (AppLayout) bắt và quay về cách suy luận từ lịch ôn.
 */
export const fetchReviewActivity = async (days: number = ACTIVITY_DAYS): Promise<ReviewActivity | null> => {
    const tz = browserTimeZone();
    return parseReviewActivity((await apiClient.get("/reviews/activity", { params: tz ? { days, tz } : { days } })).data);
};
