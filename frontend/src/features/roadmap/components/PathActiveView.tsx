import React from "react";
import { Link } from "react-router-dom";
import type { Review } from "@/lib/srs";
import { dayKey } from "@/lib/learningStats";
import type { Deck, LearningPath } from "@/types/api.types";
import {
  behindCount,
  dateForDay,
  dayIndexFor,
  endDate,
  formatShortDate,
  isPathEnded,
  pathProgress,
  tasksForDay,
} from "@/features/roadmap/roadmapUtils";
import { ProgressBar } from "./ProgressBar";
import { TodayPanel, type TodayState } from "./TodayPanel";
import { ChapterTimeline } from "./ChapterTimeline";

interface PathActiveViewProps {
  path: LearningPath;
  decks: Deck[];
  reviews: Record<string, Review>;
  now: Date;
  decksPending: boolean;
}

export const PathActiveView: React.FC<PathActiveViewProps> = ({ path, decks, reviews, now, decksPending }) => {
  const chapters = path.chapters ?? [];
  const total = Math.max(path.totalDays, 1);
  // Ưu tiên số liệu server (tính theo ?date= của máy khách); hàm phía client chỉ là dự phòng.
  const state: TodayState =
    path.today?.state ??
    (isPathEnded(path.startDate, path.totalDays, now) ? "after" : dayKey(now) < path.startDate ? "before" : "during");
  const ended = state === "after";
  // Server trả dayIndex chưa kẹp (≤ 0 trước ngày bắt đầu, > N sau khi kết thúc).
  const rawIndex = path.today?.dayIndex ?? dayIndexFor(path.startDate, now, path.totalDays);
  const dayIndex = Math.min(Math.max(rawIndex, 1), total);
  // Ngoài khoảng học, server để today.tasks rỗng -> lấy lịch của ngày cuối (đã kết thúc) / ngày đầu (chưa bắt đầu).
  const tasks =
    state === "during"
      ? (path.today?.tasks ?? tasksForDay(chapters, dayIndex))
      : (path.days?.find((d) => d.dayIndex === dayIndex)?.tasks ?? tasksForDay(chapters, dayIndex));
  const date = state === "during" && path.today ? path.today.date : dateForDay(path.startDate, dayIndex);
  const progress = pathProgress(chapters, decks, reviews, now);
  // Đã kết thúc: thẻ chưa học của cả ngày cuối cũng tính là nợ.
  const behind = behindCount(chapters, ended ? path.totalDays + 1 : dayIndex, decks, reviews);

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-label-md text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">event</span>
            {formatShortDate(path.startDate, true)} → {formatShortDate(endDate(path.startDate, total), true)}
          </span>
          <span className="font-semibold text-on-surface">
            {state === "before" ? "Chưa bắt đầu" : ended ? "Đã kết thúc" : `Ngày ${dayIndex}/${path.totalDays}`}
          </span>
        </div>
        <ProgressBar pct={progress.pct} label="Tiến độ cả lộ trình" tone="primary" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-label-sm text-on-surface-variant">
          <span>
            {progress.mastered}/{progress.total} thẻ đã thuộc ({progress.pct}%)
          </span>
          {path.folderId && (
            <Link
              to={`/folders?folderId=${encodeURIComponent(path.folderId)}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">folder</span>
              Mở thư mục
            </Link>
          )}
        </div>
      </div>

      <TodayPanel
        path={path}
        state={state}
        dayIndex={dayIndex}
        date={date}
        tasks={tasks}
        behind={behind}
        decks={decks}
        reviews={reviews}
        decksPending={decksPending}
      />

      <ChapterTimeline
        path={path}
        dayIndex={dayIndex}
        decks={decks}
        reviews={reviews}
        now={now}
        decksPending={decksPending}
      />
    </div>
  );
};
