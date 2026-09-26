import React, { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { calcLearningStats, EMPTY_STATS } from "@/lib/learningStats";
import { fetchDecks } from "@/services/deckService";
import { fetchQuizResults, fetchReviews } from "@/services/studyService";
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
    const [decks, reviews, quizResults] = await Promise.all([fetchDecks(), fetchReviews(), fetchQuizResults()]);
    return { decks, reviews, quizResults };
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

    // Layout sống suốt các trang con; Study/Quiz nằm ngoài layout nên quay lại là remount -> số liệu mới.
    const stats = useAsync(loadStatsSource, [statsVersion]);

    const metrics: UserMetrics = useMemo(() => {
        const base = stats.data
            ? calcLearningStats(stats.data.decks, stats.data.reviews, stats.data.quizResults)
            : EMPTY_STATS;
        return {
            ...base,
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
        statsLoading: stats.loading,
        statsError: stats.error,
        reloadStats: () => setStatsVersion((v) => v + 1),
        displayName,
        currentLevel,
        openEditMetrics: () => setEditMetricsOpen(true),
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
