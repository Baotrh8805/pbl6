// Hàm thuần cho trang cá nhân, không import gì -> kiểm được bằng scripts/selfCheck.ts.

export { getInitials } from "../../../lib/textUtils.ts";

export type ScoreTone = "good" | "fair" | "poor" | "none";

/** Ngưỡng màu điểm quiz: >= 80% tốt, 50–79% trung bình, < 50% yếu. */
export const scoreTone = (score: number, total: number): ScoreTone => {
    if (total <= 0) return "none";
    // So sánh bằng số nguyên, tránh sai số dấu phẩy động ngay tại ngưỡng.
    if (score * 100 >= 80 * total) return "good";
    if (score * 100 >= 50 * total) return "fair";
    return "poor";
};

// friction (F4): thẻ phản xạ chậm; practice (E2–E4): thống kê luyện viết / phát âm — thêm cuối để thứ tự tab cũ không đổi.
// reports: báo cáo bộ thẻ mình đã gửi (UC-41).
export const PROFILE_TABS = ["info", "security", "history", "friction", "practice", "reports"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const parseProfileTab = (raw: string | null): ProfileTab =>
    PROFILE_TABS.find((t) => t === raw) ?? "info";

export const tabId = (t: ProfileTab) => `profile-tab-${t}`;
export const panelId = (t: ProfileTab) => `profile-panel-${t}`;

/** Kết quả báo cáo nói với người gửi (không dùng từ ngữ quản trị như "Gỡ bộ thẻ" / "Không làm gì"). */
export const myReportOutcome = (status: string, action: string | null): string | null => {
    if (status === "DISMISSED") return "Đã xem xét, không phát hiện vi phạm.";
    if (status !== "RESOLVED") return null;
    if (action === "UNPUBLISH_DECK") return "Bộ thẻ đã bị gỡ khỏi Thư viện.";
    if (action === "CLEAR_COMMENT") return "Bình luận vi phạm đã bị xoá.";
    return "Đã xem xét và xử lý.";
};

export const DAILY_GOAL_PRESETS = [10, 20, 30, 50] as const;

/** Cùng rule với LearningSettingsModal. */
export const isValidDailyGoal = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 500;
