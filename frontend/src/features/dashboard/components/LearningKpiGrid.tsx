import React from "react";
import type { UserMetrics } from "../types/dashboard.types";

interface LearningKpiGridProps {
  displayName: string;
  currentLevel: string;
  metrics: UserMetrics;
  onOpenEditMetrics: () => void;
  /** Đang tải số liệu thật: hiện "…" thay vì số 0 gây hiểu nhầm. */
  loading?: boolean;
}

export const LearningKpiGrid: React.FC<LearningKpiGridProps> = ({
  displayName,
  currentLevel,
  metrics,
  onOpenEditMetrics,
  loading = false,
}) => {
  const pctOf = (n: number) =>
    metrics.totalTargetWords > 0 ? Math.min(100, Math.round((n / metrics.totalTargetWords) * 100)) : 0;
  const wordsPct = pctOf(metrics.wordsLearned);
  const masteredPct = pctOf(metrics.consolidatedWords);

  const wordsRemaining = Math.max(0, metrics.totalTargetWords - metrics.wordsLearned);
  const inferred = metrics.activitySource !== "server";

  const weekTotal = metrics.reviewsLast7Days.reduce((a, b) => a + b, 0);
  const weekMax = Math.max(1, ...metrics.reviewsLast7Days);
  const sparkPath = metrics.reviewsLast7Days
    .map((v, i) => `${i === 0 ? "M" : "L"}${(2 + i * 12.67).toFixed(1)} ${(24 - (v / weekMax) * 22).toFixed(1)}`)
    .join(" ");

  const today = new Date();
  const daysOfWeek = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const formattedDate = `Hôm nay: ${daysOfWeek[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`;

  const hour = today.getHours();
  const greeting =
    hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return (
    <section className="flex flex-col gap-4">
      {/* Greeting Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-1 border-b border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <span className="font-label-sm text-xs uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
              Bảng Điều Khiển Học Viên
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="whitespace-nowrap">Trực tuyến</span>
            </span>
          </div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {greeting}, {displayName}!
          </h1>
          <p className="text-sm md:text-base text-slate-600 mt-1">
            Hôm nay mục tiêu là{" "}
            <strong className="text-slate-900 font-semibold">
              {metrics.dailyGoalWords} thẻ mới
            </strong>{" "}
            &amp; ôn tập vững vàng kiến thức{" "}
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-xs">
              JLPT {currentLevel}
            </span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenEditMetrics}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-700 border border-slate-200 shadow-xs cursor-pointer transition-all text-xs font-semibold whitespace-nowrap"
            title="Đặt trình độ và mục tiêu học mỗi ngày"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-blue-600">tune</span>
            <span>Mục tiêu học tập</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200/70 text-slate-700 text-xs font-medium whitespace-nowrap">
            <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[16px]">calendar_today</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* 4 KPI BENTO CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Thẻ đã học & đã thuộc */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span
                className="text-xs uppercase tracking-wider font-semibold text-slate-500"
                title="Thẻ đã được chấm ít nhất một lần khi ôn"
              >
                Từ Vựng Đã Học
              </span>
              <div className="flex items-baseline gap-1.5">
                {loading ? (
                  <span className="h-8 w-24 rounded-lg bg-slate-200 animate-pulse inline-block" />
                ) : (
                  <>
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      {metrics.wordsLearned.toLocaleString("vi-VN")}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      / {metrics.totalTargetWords.toLocaleString("vi-VN")} thẻ
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">translate</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Mục tiêu {currentLevel}</span>
              <span className="text-blue-600 font-bold">{wordsPct}% hoàn thành</span>
            </div>
            <div
              className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden"
              role="img"
              aria-label={`Đã học ${wordsPct}%, đã thuộc ${masteredPct}% mục tiêu ${currentLevel}`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-blue-200 rounded-full transition-all duration-500"
                style={{ width: `${wordsPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${masteredPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px] text-slate-500 pt-0.5">
              <span className="inline-flex items-center gap-1" title="Thẻ có khoảng ôn từ 21 ngày trở lên">
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                Đã thuộc: {metrics.consolidatedWords.toLocaleString("vi-VN")} thẻ
              </span>
              <span>Còn: {wordsRemaining.toLocaleString("vi-VN")}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Số thẻ ôn 7 ngày qua */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span
                className="text-xs uppercase tracking-wider font-semibold text-slate-500"
                title={
                  inferred
                    ? "Ước tính từ lịch ôn: mỗi thẻ chỉ tính lần chấm gần nhất"
                    : "Mỗi lần chấm thẻ là một lượt, theo nhật ký ôn trên máy chủ"
                }
              >
                Lượt Ôn 7 Ngày Qua
              </span>
              <div className="flex items-baseline gap-1.5">
                {loading ? (
                  <span className="h-8 w-20 rounded-lg bg-slate-200 animate-pulse inline-block" />
                ) : (
                  <>
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      {weekTotal.toLocaleString("vi-VN")}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">lượt ôn</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">event_repeat</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-end justify-between gap-2">
            <div className="flex items-center gap-1 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">today</span>
              <span>
                Hôm nay {metrics.reviewedToday}/{metrics.dailyGoalWords}
              </span>
            </div>
            <svg
              className="w-20 h-8 text-emerald-500 shrink-0"
              fill="none"
              viewBox="0 0 80 28"
              role="img"
              aria-label={`Số lượt ôn 7 ngày: ${metrics.reviewsLast7Days.join(", ")}`}
            >
              {weekTotal > 0 ? (
                <>
                  <path d={sparkPath} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                  <path d={`${sparkPath} V 28 H 2 Z`} fill="currentColor" fillOpacity="0.12" />
                </>
              ) : (
                <path d="M2 24 L78 24" stroke="currentColor" strokeLinecap="round" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              )}
            </svg>
          </div>
        </div>

        {/* Card 3: Độ Chính Xác Quiz */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Độ Chính Xác Quiz
              </span>
              <div className="flex items-baseline gap-1.5">
                {loading ? (
                  <span className="h-8 w-20 rounded-lg bg-slate-200 animate-pulse inline-block" />
                ) : metrics.quizAccuracy !== null ? (
                  <>
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      {metrics.quizAccuracy.toFixed(1)}
                    </span>
                    <span className="text-sm font-bold text-indigo-600">%</span>
                  </>
                ) : (
                  <span className="text-base text-slate-400 font-semibold">
                    Chưa có lượt thi
                  </span>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">verified</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span>Số bài: <strong className="text-slate-900">{metrics.quizCount}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-slate-100 font-medium">
                Gần nhất: {metrics.lastQuizPct !== null ? `${metrics.lastQuizPct}%` : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Chuỗi Học Tập (Streak) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span
                className="text-xs uppercase tracking-wider font-semibold text-slate-500"
                title={
                  inferred
                    ? "Ước tính từ lịch ôn (máy chủ chưa gửi nhật ký học), có thể thấp hơn thực tế"
                    : "Ngày có ôn thẻ hoặc làm quiz; hôm nay chưa học thì chuỗi tính tới hôm qua"
                }
              >
                Chuỗi Học (Streak)
              </span>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <span className="h-8 w-16 rounded-lg bg-slate-200 animate-pulse inline-block" />
                ) : (
                  <>
                    <span className="text-3xl font-extrabold text-amber-600 tracking-tight flex items-center gap-1">
                      {metrics.currentStreak}
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-amber-500 text-[26px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        local_fire_department
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {metrics.currentStreak > 0
                        ? metrics.reviewedToday > 0
                          ? "ngày (đã an toàn)"
                          : "ngày liên tiếp"
                        : "bắt đầu hôm nay"}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Kỷ lục: <strong className="text-slate-800">{metrics.maxStreak} ngày</strong>
            </span>
            {metrics.reviewedToday > 0 ? (
              <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full whitespace-nowrap text-[11px] flex items-center gap-1">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Đã giữ chuỗi hôm nay
              </span>
            ) : (
              <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full whitespace-nowrap text-[11px]">
                {metrics.currentStreak >= metrics.maxStreak
                  ? "Đang giữ kỷ lục"
                  : `Còn ${metrics.maxStreak - metrics.currentStreak} ngày lập kỷ lục`}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
