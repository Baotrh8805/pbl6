import React, { useRef } from "react";
import { getLevelDescription } from "@/features/dashboard/lib/dashboardUtils";
import type { UserMetrics } from "@/features/dashboard/types/dashboard.types";
import { getInitials, panelId, PROFILE_TABS, tabId, type ProfileTab } from "../lib/profileUtils";

const TAB_LABELS: Record<ProfileTab, { label: string; icon: string }> = {
    info: { label: "Thông tin & Mục tiêu", icon: "badge" },
    security: { label: "Bảo mật", icon: "lock" },
    history: { label: "Lịch sử kiểm tra", icon: "history" },
    friction: { label: "Phản xạ chậm", icon: "timer" },
    practice: { label: "Luyện tập", icon: "exercise" },
    reports: { label: "Báo cáo của tôi", icon: "flag" },
};

interface ProfileHeroProps {
    displayName: string;
    email: string;
    currentLevel: string;
    metrics: UserMetrics;
    statsLoading: boolean;
    activeTab: ProfileTab;
    onTabChange: (tab: ProfileTab) => void;
}

const Badge: React.FC<{ icon: string; className: string; children: React.ReactNode }> = ({
    icon,
    className,
    children,
}) => (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-md font-semibold ${className}`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            {icon}
        </span>
        {children}
    </span>
);

export const ProfileHero: React.FC<ProfileHeroProps> = ({
    displayName,
    email,
    currentLevel,
    metrics,
    statsLoading,
    activeTab,
    onTabChange,
}) => {
    const tabRefs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});

    // Mẫu tablist WAI-ARIA: ←/→ chuyển tab và dời focus theo.
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const idx = PROFILE_TABS.indexOf(activeTab);
        let next: ProfileTab | undefined;
        if (e.key === "ArrowRight") next = PROFILE_TABS[(idx + 1) % PROFILE_TABS.length];
        else if (e.key === "ArrowLeft") next = PROFILE_TABS[(idx - 1 + PROFILE_TABS.length) % PROFILE_TABS.length];
        else if (e.key === "Home") next = PROFILE_TABS[0];
        else if (e.key === "End") next = PROFILE_TABS[PROFILE_TABS.length - 1];
        if (!next) return;
        e.preventDefault();
        onTabChange(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <header className="rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-space-md p-space-lg">
                <div
                    aria-hidden="true"
                    className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-full bg-primary-container text-on-primary ring-4 ring-surface-container flex items-center justify-center font-headline-sm text-headline-sm font-bold select-none"
                >
                    {getInitials(displayName)}
                </div>

                <div className="min-w-0 flex flex-col gap-1.5">
                    <h1 className="font-headline-md text-headline-md font-bold text-primary break-words">{displayName}</h1>
                    <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant min-w-0">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                            mail
                        </span>
                        <span className="truncate">{email}</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                        <Badge icon="school" className="bg-primary/10 text-primary">
                            JLPT {currentLevel} · {getLevelDescription(currentLevel)}
                        </Badge>
                        {statsLoading ? (
                            <span className="h-7 w-28 rounded-full bg-surface-container animate-pulse" aria-hidden="true" />
                        ) : (
                            <>
                                <Badge icon="local_fire_department" className="bg-tertiary-fixed text-on-tertiary-fixed-variant">
                                    {metrics.currentStreak} ngày liên tiếp
                                </Badge>
                                <Badge icon="menu_book" className="bg-secondary-container text-on-secondary-container">
                                    {metrics.wordsLearned.toLocaleString("vi-VN")} từ đã học
                                </Badge>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div
                role="tablist"
                aria-label="Mục trang cá nhân"
                onKeyDown={handleKeyDown}
                className="flex gap-1 px-space-sm pb-space-sm overflow-x-auto"
            >
                {PROFILE_TABS.map((t) => {
                    const selected = t === activeTab;
                    return (
                        <button
                            key={t}
                            ref={(el) => {
                                tabRefs.current[t] = el;
                            }}
                            id={tabId(t)}
                            role="tab"
                            type="button"
                            aria-selected={selected}
                            aria-controls={selected ? panelId(t) : undefined}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onTabChange(t)}
                            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-label-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                selected
                                    ? "bg-surface-container text-primary font-semibold shadow-sm"
                                    : "text-on-surface-variant hover:bg-surface-container-low"
                            }`}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                {TAB_LABELS[t].icon}
                            </span>
                            {TAB_LABELS[t].label}
                        </button>
                    );
                })}
            </div>
        </header>
    );
};
