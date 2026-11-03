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

const LEVEL_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-900 border-blue-300",
  N4: "bg-emerald-100 text-emerald-900 border-emerald-300",
  N3: "bg-amber-100 text-amber-900 border-amber-300",
  N2: "bg-rose-100 text-rose-900 border-rose-300",
  N1: "bg-purple-100 text-purple-900 border-purple-300",
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
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${className}`}>
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

    const levelClass = LEVEL_BADGES[currentLevel] ?? "bg-blue-100 text-blue-900 border-blue-300";

    return (
        <header className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-6">
                <div
                    aria-hidden="true"
                    className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-full bg-blue-600 text-white ring-4 ring-blue-100 shadow-md flex items-center justify-center font-extrabold text-2xl select-none"
                >
                    {getInitials(displayName)}
                </div>

                <div className="min-w-0 flex flex-col gap-1.5">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 break-words tracking-tight">{displayName}</h1>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium min-w-0">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                            mail
                        </span>
                        <span className="truncate">{email}</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                        <Badge icon="school" className={levelClass}>
                            JLPT {currentLevel} · {getLevelDescription(currentLevel)}
                        </Badge>
                        {statsLoading ? (
                            <span className="h-7 w-28 rounded-full bg-slate-100 animate-pulse" aria-hidden="true" />
                        ) : (
                            <>
                                <Badge icon="local_fire_department" className="bg-amber-100 text-amber-900 border-amber-300">
                                    {metrics.currentStreak} ngày liên tiếp
                                </Badge>
                                <Badge icon="menu_book" className="bg-emerald-100 text-emerald-900 border-emerald-300">
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
                className="flex gap-1.5 px-6 pb-4 overflow-x-auto border-t border-slate-100 pt-3 scrollbar-none"
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
                            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                selected
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/60"
                            }`}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                                {TAB_LABELS[t].icon}
                            </span>
                            <span>{TAB_LABELS[t].label}</span>
                        </button>
                    );
                })}
            </div>
        </header>
    );
};

export default ProfileHero;
