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
  // Tính % hoàn thành từ vựng
  const wordsPct =
    metrics.totalTargetWords > 0
      ? Math.min(100, Math.round((metrics.wordsLearned / metrics.totalTargetWords) * 100))
      : 0;

  const wordsRemaining = Math.max(0, metrics.totalTargetWords - metrics.wordsLearned);

  // Sparkline 7 ngày: trục x chia đều 2..78, trục y 2..24 theo ngày nhiều thẻ nhất.
  const weekTotal = metrics.reviewsLast7Days.reduce((a, b) => a + b, 0);
  const weekMax = Math.max(1, ...metrics.reviewsLast7Days);
  const sparkPath = metrics.reviewsLast7Days
    .map((v, i) => `${i === 0 ? "M" : "L"}${(2 + i * 12.67).toFixed(1)} ${(24 - (v / weekMax) * 22).toFixed(1)}`)
    .join(" ");

  // Định dạng ngày hiện tại
  const today = new Date();
  const daysOfWeek = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const formattedDate = `Hôm nay: ${daysOfWeek[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`;

  const hour = today.getHours();
  const greeting =
    hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return (
    <section className="flex flex-col gap-space-md">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline font-semibold">
              Bảng Điều Khiển Học Viên
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            <span className="font-label-sm text-label-sm text-secondary font-medium">Trực tuyến</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight mt-0.5 font-bold">
            {greeting}, {displayName}!
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Hôm nay mục tiêu là{" "}
            <strong className="text-on-surface font-semibold">
              {metrics.dailyGoalWords} thẻ mới
            </strong>{" "}
            &amp; ôn tập vững vàng kiến thức JLPT {currentLevel}.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Quick Edit Metrics button */}
          <button
            type="button"
            onClick={onOpenEditMetrics}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-lowest text-primary hover:bg-surface-container font-label-md text-label-md border border-surface-container-high/60 shadow-xs cursor-pointer transition-colors"
            title="Đặt trình độ và mục tiêu học mỗi ngày"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">tune</span>
            <span className="font-semibold">Mục tiêu học tập</span>
          </button>

          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high/40">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[18px]">calendar_today</span>
            <span className="font-label-md text-label-md text-on-surface font-medium whitespace-nowrap">
              {formattedDate}
            </span>
          </div>
        </div>
      </div>

      {/* 4 KPI BENTO CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        {/* Card 1: Tu Vung & Kanji */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Từ Vựng &amp; Kanji Đã Thuộc
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">
                  {loading ? "…" : metrics.wordsLearned.toLocaleString()}
                </span>
                <span className="font-label-md text-label-md text-outline">
                  / {metrics.totalTargetWords.toLocaleString()} từ
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[22px]">translate</span>
            </div>
          </div>
          <div className="mt-space-md space-y-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface-variant">Tiến độ {currentLevel}</span>
              <span className="text-secondary font-bold">{wordsPct}% Đạt chuẩn</span>
            </div>
            <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-secondary rounded-full transition-all duration-500"
                style={{ width: `${wordsPct}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-outline pt-0.5 font-label-sm">
              <span>Đã củng cố: {metrics.consolidatedWords} từ</span>
              <span>Cần học: {wordsRemaining} từ</span>
            </div>
          </div>
        </div>

        {/* Card 2: Số thẻ ôn 7 ngày qua (tính từ /reviews) */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Thẻ Đã Ôn 7 Ngày Qua
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">
                  {loading ? "…" : weekTotal.toLocaleString()}
                </span>
                <span className="font-label-md text-label-md text-outline">thẻ</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[22px]">event_repeat</span>
            </div>
          </div>
          <div className="mt-space-md flex items-end justify-between gap-2">
            <div className="flex items-center gap-1 text-secondary font-label-sm text-label-sm bg-secondary-fixed/30 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">today</span>
              <span>
                Hôm nay {metrics.reviewedToday}/{metrics.dailyGoalWords}
              </span>
            </div>
            {/* Sparkline từ số thẻ mỗi ngày; không có dữ liệu thì vẽ nét đứt */}
            <svg
              className="w-20 h-7 text-secondary shrink-0"
              fill="none"
              viewBox="0 0 80 28"
              role="img"
              aria-label={`Số thẻ ôn 7 ngày: ${metrics.reviewsLast7Days.join(", ")}`}
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

        {/* Card 3: Do Chinh Xac Quiz */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Độ Chính Xác Quiz
              </span>
              <div className="flex items-baseline gap-1.5">
                {metrics.quizAccuracy !== null ? (
                  <>
                    <span className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">
                      {metrics.quizAccuracy.toFixed(1)}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-primary font-bold">%</span>
                  </>
                ) : (
                  <span className="font-headline-sm text-headline-sm text-outline font-semibold">
                    Chưa có lượt thi
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[22px]">verified</span>
            </div>
          </div>
          <div className="mt-space-md flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-secondary shrink-0"></span>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium whitespace-nowrap">
                Số bài: {metrics.quizCount}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-primary-container shrink-0"></span>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium whitespace-nowrap">
                Bài gần nhất: {metrics.lastQuizPct !== null ? `${metrics.lastQuizPct}%` : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Streak Lien Tuc */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Chuỗi Học Tập (Streak)
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headline-lg text-headline-lg font-bold text-tertiary-container tracking-tight flex items-center gap-1">
                  {metrics.currentStreak} <span aria-hidden="true" className="text-xl">🔥</span>
                </span>
                <span className="font-label-md text-label-md text-outline">
                  {metrics.currentStreak > 0 ? "ngày liên tiếp" : "bắt đầu hôm nay"}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
            </div>
          </div>
          <div className="mt-space-md flex items-center justify-between font-label-sm text-label-sm">
            <span className="text-on-surface-variant">
              Kỷ lục cá nhân:{" "}
              <strong className="text-on-surface font-semibold">{metrics.maxStreak} ngày</strong>
            </span>
            <span className="text-tertiary-container font-semibold bg-tertiary-fixed px-2 py-0.5 rounded whitespace-nowrap">
              {metrics.currentStreak >= metrics.maxStreak
                ? "Đang giữ kỷ lục"
                : `Còn ${metrics.maxStreak - metrics.currentStreak} ngày lập kỷ lục`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
