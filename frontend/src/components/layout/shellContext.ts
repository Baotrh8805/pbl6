import { useOutletContext } from "react-router-dom";
import type { Review } from "@/lib/srs";
import type { Deck, QuizResult } from "@/types/api.types";
import type { LearningSettings, UserMetrics } from "@/features/dashboard/types/dashboard.types";

export interface ShellContext {
    metrics: UserMetrics;
    /** Dữ liệu gốc đã tải để tính chỉ số; trang con dùng lại, khỏi gọi API lần nữa. */
    decks: Deck[];
    reviews: Record<string, Review>;
    /** 10 bài thi gần nhất (cùng nguồn với metrics.quiz*). */
    quizResults: QuizResult[];
    statsLoading: boolean;
    statsError?: string;
    reloadStats: () => void;
    displayName: string;
    currentLevel: string;
    openEditMetrics: () => void;
    /** Mục tiêu người dùng đặt; lưu qua saveSettings để Header/Sidebar cập nhật cùng lúc. */
    settings: LearningSettings;
    saveSettings: (next: LearningSettings, newLevel: string) => Promise<void>;
}

// Router built-in thay cho context tự chế.
export const useShell = () => useOutletContext<ShellContext>();
