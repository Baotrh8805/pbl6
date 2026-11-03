import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTodaySummary } from "@/features/roadmap/useTodaySummary";
import { sessionUrl, todaySessionSize } from "@/features/roadmap/roadmapUtils";
import type { UserMetrics } from "../types/dashboard.types";

interface DailyMissionHeroProps {
  metrics: UserMetrics;
  currentLevel: string;
  onDismiss?: () => void;
  loading?: boolean;
}

export const DailyMissionHero: React.FC<DailyMissionHeroProps> = ({
  metrics,
  currentLevel,
  onDismiss,
  loading = false,
}) => {
  const navigate = useNavigate();
  const { data: roadmapData } = useTodaySummary();

  const due = metrics.dueToday ?? metrics.srsDueCount ?? 0;
  const fresh = metrics.newCards ?? 0;
  const dueDecks = metrics.dueDecks ?? 0;

  // Tìm chặng lộ trình chưa hoàn thành của hôm nay (nếu có)
  const activeRoadmapItem = (roadmapData ?? []).find((item) => !item.done);
  const roadmapTodaySize = activeRoadmapItem
    ? todaySessionSize(activeRoadmapItem, activeRoadmapItem.dailyCap ?? 0, activeRoadmapItem.state)
    : 0;
  const roadmapCatchup =
    activeRoadmapItem && activeRoadmapItem.state === "rest" ? Math.max(activeRoadmapItem.behindCount, 0) : 0;

  const totalCardsToday = due + roadmapTodaySize;
  const hasWork = totalCardsToday > 0 || fresh > 0;
  // Ước tính ~30s mỗi thẻ (tối thiểu 3 phút, tối đa 45 phút)
  const estimatedMinutes = Math.min(45, Math.max(3, Math.ceil(totalCardsToday * 0.5)));

  if (loading) {
    return (
      <div className="w-full h-44 rounded-2xl bg-slate-200/80 animate-pulse border border-slate-200" />
    );
  }

  // TRẠNG THÁI HOÀN THÀNH TẤT CẢ (Zero Due / All Caught Up)
  if (!hasWork) {
    return (
      <section
        aria-label="Nhiệm vụ học hôm nay đã hoàn thành"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 md:p-6 shadow-md text-white transition-all"
      >
        <div className="absolute -right-8 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 text-emerald-100 shadow-inner">
              <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
                verified
              </span>
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Mục tiêu hôm nay: Hoàn thành 100%
              </div>
              <h2 className="font-headline text-lg sm:text-xl font-extrabold text-white leading-snug">
                Tuyệt vời! Bạn không còn thẻ nào cần ôn hôm nay.
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100 max-w-xl">
                Chuỗi học tập <strong className="text-white underline">{metrics.currentStreak} ngày</strong> của bạn đã an toàn. Hãy làm thử 1 bài Quiz hoặc nạp thêm thẻ từ Thư viện để mở rộng vốn từ JLPT {currentLevel}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              to="/quiz"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-emerald-900 font-bold text-xs hover:bg-emerald-50 transition-all shadow-xs cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                quiz
              </span>
              <span>Luyện thi Quiz</span>
            </Link>
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-800/60 hover:bg-emerald-800 text-white font-semibold text-xs transition-all border border-emerald-400/30"
            >
              <span>Thư viện cộng đồng</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // TRẠNG THÁI CÒN BÀI CẦN HỌC (Active Mission Hub)
  const isSrsPrimary = due > 0;
  const isRoadmapPrimary = !isSrsPrimary && roadmapTodaySize > 0;

  const handlePrimaryAction = () => {
    if (isSrsPrimary) {
      navigate(dueDecks > 0 ? "/decks?filter=due" : "/decks");
    } else if (isRoadmapPrimary && activeRoadmapItem) {
      navigate(sessionUrl(activeRoadmapItem.pathId, "today"));
    } else {
      navigate("/decks");
    }
  };

  const primaryLabel = isSrsPrimary
    ? `Ôn tập ngay (${due} thẻ)`
    : isRoadmapPrimary
    ? `Học lộ trình (${roadmapTodaySize} thẻ)`
    : `Học thẻ mới (${fresh} thẻ)`;

  return (
    <section
      aria-label="Nhiệm vụ học tập hôm nay"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-5 md:p-6 shadow-md text-white transition-all"
    >
      {/* Decorative gradient orbs */}
      <div className="absolute -right-8 -bottom-10 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
      <div className="absolute left-1/4 -top-8 w-40 h-40 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 text-amber-300 shadow-inner">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px] animate-pulse">
              notifications_active
            </span>
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1 font-label-sm text-[11px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/30 font-bold backdrop-blur-sm">
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  bolt
                </span>
                <span>Nhiệm vụ hôm nay</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-blue-200 font-mono">
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  timer
                </span>
                Ước tính: ~{estimatedMinutes} phút
              </span>
            </div>

            <h2 className="font-headline text-lg sm:text-xl font-extrabold text-white leading-snug tracking-tight">
              {due > 0 ? (
                <>
                  Hôm nay:{" "}
                  <span className="text-amber-300 underline decoration-amber-300/40 underline-offset-4">
                    {due} thẻ đến hạn ôn tập
                  </span>
                  {dueDecks > 0 ? ` (trong ${dueDecks} bộ thẻ)` : ""}
                  {roadmapTodaySize > 0 && ` + ${roadmapTodaySize} thẻ lộ trình`}
                </>
              ) : roadmapTodaySize > 0 ? (
                <>
                  Lộ trình hôm nay:{" "}
                  <span className="text-amber-300">
                    {activeRoadmapItem?.title} ({roadmapTodaySize} thẻ)
                  </span>
                </>
              ) : (
                <>
                  Sẵn sàng tiếp thu:{" "}
                  <span className="text-amber-300">{fresh} thẻ từ vựng mới</span>
                </>
              )}
            </h2>

            <p className="text-xs sm:text-sm text-blue-100 max-w-xl leading-relaxed">
              {metrics.reviewedToday > 0 ? (
                <span className="text-emerald-300 font-medium">
                  ✓ Hôm nay bạn đã ôn {metrics.reviewedToday} thẻ. Hoàn thành nốt phiên này để hoàn tất mục tiêu JLPT {currentLevel}!
                </span>
              ) : (
                <span>
                  Ôn đúng lịch lặp lại ngắt quãng (SRS) giúp kiến thức ngấm sâu vào trí nhớ dài hạn và bảo vệ chuỗi{" "}
                  <strong className="text-amber-200 font-bold">{metrics.currentStreak} ngày</strong> liên tiếp.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {/* Nút hành động chính - Amber Gold cao cấp tương phản chuẩn WCAG AAA */}
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              history_edu
            </span>
            <span>{primaryLabel}</span>
          </button>

          {/* Nút cứu nguy cho người bận rộn: Micro-session 5 phút (nếu nợ nhiều) hoặc Học bù */}
          {due >= 15 && (
            <button
              type="button"
              onClick={() => navigate("/decks?filter=due&quick=10")}
              className="flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-sm border border-white/20 transition-all cursor-pointer whitespace-nowrap"
              title="Chỉ ôn 10 thẻ gấp nhất để giữ chuỗi khi không có nhiều thời gian"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-amber-300">
                bolt
              </span>
              <span>Ôn nhanh 5 phút</span>
            </button>
          )}

          {roadmapCatchup > 0 && activeRoadmapItem && (
            <Link
              to={sessionUrl(activeRoadmapItem.pathId, "catchup")}
              className="flex items-center justify-center gap-1 px-3.5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm border border-white/15 transition-all"
            >
              <span>Học bù ({roadmapCatchup})</span>
            </Link>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="hidden lg:flex p-2 rounded-xl text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Thu gọn thông báo"
              title="Thu gọn"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

