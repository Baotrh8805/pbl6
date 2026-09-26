import { useOutletContext } from "react-router-dom";
import type { Review } from "@/lib/srs";
import type { Deck } from "@/types/api.types";
import type { UserMetrics } from "@/features/dashboard/types/dashboard.types";

export interface ShellContext {
    metrics: UserMetrics;
    /** Dữ liệu gốc đã tải để tính chỉ số; trang con dùng lại, khỏi gọi API lần nữa. */
    decks: Deck[];
    reviews: Record<string, Review>;
    statsLoading: boolean;
    statsError?: string;
    reloadStats: () => void;
    displayName: string;
    currentLevel: string;
    openEditMetrics: () => void;
}

// Router built-in thay cho context tự chế.
export const useShell = () => useOutletContext<ShellContext>();
