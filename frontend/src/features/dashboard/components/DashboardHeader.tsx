import React, { useState } from "react";
import type { UserMetrics } from "../types/dashboard.types";
import { getLevelDescription } from "../services/dashboardService";

interface DashboardHeaderProps {
  displayName: string;
  userEmail: string | null;
  currentLevel: string;
  metrics: UserMetrics;
  onOpenEditMetrics: () => void;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  displayName,
  userEmail,
  currentLevel,
  metrics,
  onOpenEditMetrics,
  onToggleMobileSidebar,
  onLogout,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Avatar chữ cái đầu từ tên thật (không dùng ảnh stock)
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(4,21,52,0.05)] border-b border-surface-container-high/40">
      <div className="h-16 w-full px-gutter flex items-center justify-between gap-space-md">
        {/* Left: Brand Logo (điều hướng nằm ở sidebar) */}
        <div className="flex items-center gap-space-md shrink-0">
          {/* Mobile hamburger button */}
          <button
            onClick={onToggleMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            aria-label="Mở menu"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          {/* Logo */}
          <div className="flex items-center gap-space-sm shrink-0 select-none">
            <img alt="NihonGen AI Logo" className="h-8 w-auto object-contain shrink-0" src="/favicon.svg" />
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight font-bold whitespace-nowrap">
              NihonGen AI
            </span>
          </div>
        </div>

        {/* Right: Quick Badges + User Profile */}
        <div className="flex items-center gap-space-sm shrink-0">
          {/* Streak Badge */}
          <div
            onClick={onOpenEditMetrics}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm whitespace-nowrap cursor-pointer hover:bg-surface-container-high transition-colors"
            title="Nhấp để tùy chỉnh chuỗi học tập"
          >
            <span className="material-symbols-outlined text-tertiary-container text-[16px]">
              local_fire_department
            </span>
            <span className="text-on-surface font-semibold">{metrics.currentStreak} Ngày</span>
          </div>

          {/* JLPT Level Dropdown Badge */}
          <div
            onClick={onOpenEditMetrics}
            className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm cursor-pointer hover:bg-surface-container-highest transition-colors whitespace-nowrap"
            title="Nhấp để đổi trình độ JLPT của bạn"
          >
            <span className="font-label-sm text-label-sm font-semibold">
              {currentLevel} - {getLevelDescription(currentLevel)}
            </span>
            <span className="material-symbols-outlined text-[16px] text-outline">arrow_drop_down</span>
          </div>

          {/* User Profile + Logout */}
          <div className="relative pl-space-xs">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-label="Mở menu tài khoản"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-space-xs cursor-pointer select-none p-1 rounded-lg hover:bg-surface-container-low transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="hidden text-right xl:block">
                <div className="font-label-md text-label-md text-on-surface leading-tight font-semibold">
                  {displayName}
                </div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">
                  Target JLPT {currentLevel}
                </div>
              </div>
              <div
                title={displayName}
                className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold shadow-sm ring-1 ring-surface-container-high shrink-0"
              >
                {initials}
              </div>
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest rounded-xl shadow-xl border border-surface-container-high p-2 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-2 border-b border-surface-container text-xs text-on-surface-variant">
                  <div className="font-semibold text-on-surface truncate">{displayName}</div>
                  <div className="text-[11px] text-outline truncate">{userEmail || "Học viên"}</div>
                  <div className="text-[11px] text-secondary font-medium flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    <span>Mục tiêu JLPT {currentLevel}</span>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenEditMetrics();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-label-md text-on-surface hover:bg-surface-container flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
                    <span>Tùy chỉnh chỉ số học tập</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-surface-container">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-label-md text-error hover:bg-error-container/20 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
