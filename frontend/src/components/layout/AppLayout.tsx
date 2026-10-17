import React, { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { calcLearningStats, EMPTY_STATS } from "@/lib/learningStats";
import { fetchDecks } from "@/services/deckService";
import { fetchAnnouncement } from "@/services/adminService";
import { DATA_CHANGED_EVENT } from "@/services/apiClient";
import { fetchQuizResultCount, fetchQuizResults, fetchReviews } from "@/services/studyService";
import type { LearningSettings, UserMetrics } from "@/features/dashboard/types/dashboard.types";
import {
    getTargetWordsByLevel,
    loadLearningSettings,
    saveLearningSettings,
} from "@/features/dashboard/lib/dashboardUtils";
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader";
import { DashboardSidebar } from "@/features/dashboard/components/DashboardSidebar";
import { LearningSettingsModal } from "@/features/dashboard/components/modals/LearningSettingsModal";
import type { ShellContext } from "./shellContext";

const loadStatsSource = async () => {
    const [decks, reviews, quizResults, quizCount] = await Promise.all([
        fetchDecks(),
        fetchReviews(),
        fetchQuizResults(),
        fetchQuizResultCount(),
    ]);
    return { decks, reviews, quizResults, quizCount };
};

export const AppLayout: React.FC = () => {
    const { userEmail, userProfile, updateJlptLevel, logout } = useAuth();
    const currentLevel = userProfile?.jlptLevel || "N5";
    const displayName =
        userProfile?.fullName || (userEmail ? userEmail.split("@")[0] : "Học viên");

    // Mục tiêu người dùng đặt theo từng tài khoản: đổi email thì đọc lại (so khóa trong render, không cần effect).
    const [settingsState, setSettingsState] = useState(() => ({
        email: userEmail,
        settings: loadLearningSettings(userEmail),
    }));
    if (settingsState.email !== userEmail) {
        setSettingsState({ email: userEmail, settings: loadLearningSettings(userEmail) });
    }
    const settings = settingsState.settings;

    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [editMetricsOpen, setEditMetricsOpen] = useState(false);
    const [statsVersion, setStatsVersion] = useState(0);

    // Thông báo toàn hệ thống (Admin Panel > Cấu hình): tải một lần, nút × chỉ ẩn trong phiên này.
    const announcement = useAsync(fetchAnnouncement, []);
    const [announcementHidden, setAnnouncementHidden] = useState(false);
    const announcementText = announcement.data?.trim() ?? "";

    // Layout sống suốt các trang con; Study/Quiz nằm ngoài layout nên quay lại là remount -> số liệu mới.
    const fresh = useAsync(loadStatsSource, [statsVersion]);

    // Mọi thao tác ghi thành công (tạo/sửa/xoá/lưu bản sao...) -> tải lại số liệu. Gộp các request liên tiếp
    // (vd. thêm nhiều bộ thẻ vào thư mục) thành một lần tải.
    useEffect(() => {
        let timer: number | undefined;
        const onChanged = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setStatsVersion((v) => v + 1), 300);
        };
        window.addEventListener(DATA_CHANGED_EVENT, onChanged);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(DATA_CHANGED_EVENT, onChanged);
        };
    }, []);

    // Đang tải lại: giữ số liệu cũ trên màn hình thay vì nháy về trạng thái "đang tải"
    const [lastData, setLastData] = useState(fresh.data);
    if (fresh.data && fresh.data !== lastData) setLastData(fresh.data);
    const stats = {
        data: fresh.data ?? lastData,
        loading: fresh.loading && !lastData,
        error: fresh.error,
    };

    const metrics: UserMetrics = useMemo(() => {
        const base = stats.data
            ? calcLearningStats(stats.data.decks, stats.data.reviews, stats.data.quizResults)
            : EMPTY_STATS;
        return {
            ...base,
            // /quiz-results chỉ trả 10 bài gần nhất; tổng số lấy từ endpoint đếm riêng.
            quizCount: stats.data?.quizCount ?? base.quizCount,
            totalTargetWords: settings.targetWords ?? getTargetWordsByLevel(currentLevel),
            dailyGoalWords: settings.dailyGoalWords,
        };
    }, [stats.data, settings, currentLevel]);

    const handleSaveSettings = async (next: LearningSettings, newLevel: string) => {
        if (newLevel !== currentLevel) await updateJlptLevel(newLevel);
        setSettingsState({ email: userEmail, settings: next });
        saveLearningSettings(userEmail, next);
    };

    const context: ShellContext = {
        metrics,
        decks: stats.data?.decks ?? [],
        reviews: stats.data?.reviews ?? {},
        quizResults: stats.data?.quizResults ?? [],
        statsLoading: stats.loading,
        statsError: stats.error,
        reloadStats: () => setStatsVersion((v) => v + 1),
        displayName,
        currentLevel,
        openEditMetrics: () => setEditMetricsOpen(true),
        settings,
        saveSettings: handleSaveSettings,
    };

    return (
        <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
            <DashboardHeader
                displayName={displayName}
                userEmail={userEmail}
                currentLevel={currentLevel}
                metrics={metrics}
                onOpenEditMetrics={() => setEditMetricsOpen(true)}
                onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
                onLogout={logout}
            />

            <DashboardSidebar
                mobileOpen={mobileSidebarOpen}
                onCloseMobile={() => setMobileSidebarOpen(false)}
                metrics={metrics}
                currentLevel={currentLevel}
                displayName={displayName}
            />

            <div className="md:pl-64">
                <main className="w-full pt-16 bg-surface min-h-screen px-gutter py-margin">
                    {announcementText && !announcementHidden && (
                        <div
                            role="status"
                            className="mb-space-md flex items-start gap-2 rounded-xl border border-primary-fixed-dim bg-primary-fixed px-3 py-2 text-body-sm text-on-primary-fixed"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">info</span>
                            <span className="flex-1 whitespace-pre-line">{announcementText}</span>
                            <button
                                type="button"
                                onClick={() => setAnnouncementHidden(true)}
                                className="p-0.5 rounded hover:bg-primary-fixed-dim cursor-pointer"
                                aria-label="Ẩn thông báo"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    )}
                    <Outlet context={context} />
                </main>
            </div>

            <LearningSettingsModal
                isOpen={editMetricsOpen}
                onClose={() => setEditMetricsOpen(false)}
                settings={settings}
                currentLevel={currentLevel}
                displayName={displayName}
                onSave={handleSaveSettings}
            />
        </div>
    );
};

export default AppLayout;
