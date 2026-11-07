import React from "react";
import type { Review } from "@/lib/srs";
import { dayKey } from "@/lib/learningStats";
import type { Deck, LearningPath, LearningPathTodayState } from "@/types/api.types";
import {
  behindCount,
  behindSeverity,
  completionFallback,
  dateForDay,
  dayIndexFor,
  isPathEnded,
  pathDayLabel,
  tasksForDay,
  todayCardCount,
  type TodayCounts,
} from "@/features/roadmap/roadmapUtils";
import { ProgressSummary } from "./ProgressSummary";
import { TodaySessionPanel } from "./TodaySessionPanel";
import { BehindBanner } from "./BehindBanner";
import { WorkloadChart } from "./WorkloadChart";
import { ChapterTimeline } from "./ChapterTimeline";

interface PathActiveViewProps {
  path: LearningPath;
  decks: Deck[];
  reviews: Record<string, Review>;
  now: Date;
  decksPending: boolean;
  /** Đang chạy một thao tác ghi (cân lại / hoàn thành / cài đặt): khoá các nút ghi, link học vẫn mở. */
  busy: boolean;
  quizBusy: string | null;
  onRebalance: (extend: boolean) => void;
  onComplete: () => void;
  onStartQuiz: (chapterId: string) => void;
  /** Lỗi mở "Kiểm tra chương" gần nhất, hiện dưới nút của đúng chương đó. */
  quizError: { chapterId: string; message: string } | null;
  onOpenSettings: () => void;
}

/**
 * Bố cục 2.0: tiến độ (2 thước đo) -> dải nợ -> phiên hôm nay -> biểu đồ khối lượng -> chương.
 * Mọi số liệu lấy từ response server (tính theo ?date= của máy khách); các hàm phía client chỉ là dự phòng khi
 * response thiếu trường (1.0 / bộ thẻ chưa kịp tạo).
 */
export const PathActiveView: React.FC<PathActiveViewProps> = ({
  path,
  decks,
  reviews,
  now,
  decksPending,
  busy,
  quizBusy,
  onRebalance,
  onComplete,
  onStartQuiz,
  quizError,
  onOpenSettings,
}) => {
  const chapters = path.chapters ?? [];
  const total = Math.max(path.totalDays, 1);
  const today = path.today ?? null;
  const state: LearningPathTodayState =
    today?.state ??
    (isPathEnded(path.startDate, path.totalDays, now) ? "after" : dayKey(now) < path.startDate ? "before" : "during");
  // Server trả dayIndex chưa kẹp (≤ 0 trước ngày bắt đầu, > N sau khi kết thúc); ngày nghỉ = ngày học cuối trước đó.
  // Dự phòng đếm theo cùng mặt nạ ngày học để không lệch với server nếu response thiếu `today`.
  const rawIndex = today?.dayIndex ?? dayIndexFor(path.startDate, now, path.totalDays, path.studyDays);
  const dayIndex = Math.min(Math.max(rawIndex, 1), total);
  const tasks = state === "during" ? (today?.tasks ?? tasksForDay(chapters, dayIndex)) : [];
  const date = today?.date ?? dateForDay(path.startDate, dayIndex, path.studyDays);

  const completion = path.completion ?? completionFallback(chapters, decks, reviews, now);
  const cap = path.dailyCap ?? 0;
  const counts: TodayCounts = {
    newCount: today?.newCount ?? (state === "during" ? todayCardCount(tasks) : 0),
    dueCount: today?.dueCount ?? 0,
    // Đã kết thúc: thẻ chưa học của cả ngày cuối cũng là nợ (dự phòng 1.0).
    behindCount: today?.behindCount ?? behindCount(chapters, state === "after" ? path.totalDays + 1 : dayIndex, decks, reviews),
  };
  const severity = behindSeverity(counts.behindCount, cap, completion.total - completion.learned);
  const positionLabel = pathDayLabel(state, dayIndex, path.totalDays);

  return (
    <div className="flex flex-col gap-space-lg">
      <ProgressSummary
        path={path}
        completion={completion}
        positionLabel={positionLabel}
        busy={busy}
        onComplete={onComplete}
        onOpenSettings={onOpenSettings}
      />

      <BehindBanner
        pathId={path.id}
        behind={counts.behindCount}
        severity={severity}
        cap={cap}
        remaining={completion.total - completion.learned}
        busy={busy}
        onRebalance={onRebalance}
      />

      <TodaySessionPanel path={path} state={state} dayIndex={dayIndex} date={date} counts={counts} tasks={tasks} cap={cap} />

      {path.forecast && path.forecast.length > 0 && (
        <WorkloadChart forecast={path.forecast} cap={cap} todayIndex={state === "during" ? dayIndex : null} />
      )}

      <ChapterTimeline
        path={path}
        dayIndex={dayIndex}
        decks={decks}
        reviews={reviews}
        now={now}
        decksPending={decksPending}
        quizBusy={quizBusy}
        onStartQuiz={onStartQuiz}
        quizError={quizError}
      />
    </div>
  );
};
