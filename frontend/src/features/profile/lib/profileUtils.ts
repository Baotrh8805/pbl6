// Hàm thuần cho trang cá nhân, không import gì -> kiểm được bằng scripts/selfCheck.ts.

/** "Lê Văn Chính" -> "LC"; "chinh" -> "CH"; rỗng -> "?". */
export const getInitials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    // Array.from tách theo code point, không cắt đôi ký tự ngoài BMP.
    const first = (w: string) => Array.from(w)[0] ?? "";
    if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase("vi");
    return (first(words[0]) + first(words[words.length - 1])).toLocaleUpperCase("vi");
};

export type ScoreTone = "good" | "fair" | "poor" | "none";

/** Ngưỡng màu điểm quiz: >= 80% tốt, 50–79% trung bình, < 50% yếu. */
export const scoreTone = (score: number, total: number): ScoreTone => {
    if (total <= 0) return "none";
    // So sánh bằng số nguyên, tránh sai số dấu phẩy động ngay tại ngưỡng.
    if (score * 100 >= 80 * total) return "good";
    if (score * 100 >= 50 * total) return "fair";
    return "poor";
};

export const PROFILE_TABS = ["info", "security", "history"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const parseProfileTab = (raw: string | null): ProfileTab =>
    PROFILE_TABS.find((t) => t === raw) ?? "info";

export const tabId = (t: ProfileTab) => `profile-tab-${t}`;
export const panelId = (t: ProfileTab) => `profile-panel-${t}`;

export const DAILY_GOAL_PRESETS = [10, 20, 30, 50] as const;

/** Cùng rule với LearningSettingsModal. */
export const isValidDailyGoal = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 500;
