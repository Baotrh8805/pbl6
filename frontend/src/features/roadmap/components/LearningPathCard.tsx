import React from "react";
import { Link } from "react-router-dom";
import type { LearningPath } from "@/types/api.types";
import { SOURCE_TYPE_LABELS } from "@/features/extraction/extractionUtils";
import { dayIndexFor, isPathProcessing, pathDayLabel, todayCardCount, todayCountsLabel } from "../roadmapUtils";
import { PathStatusChip, RemedialChip } from "./PathStatusChip";
import { ProgressBar } from "./ProgressBar";

interface LearningPathCardProps {
  path: LearningPath;
  now: Date;
  onDelete: (path: LearningPath) => void;
}

export const LearningPathCard: React.FC<LearningPathCardProps> = ({ path, now, onDelete }) => {
  const active = path.status === "ACTIVE";
  const today = active ? (path.today ?? null) : null;
  // 2.0: server tính ngày (theo mặt nạ ngày học) và ba nhóm thẻ; response 1.0 chỉ có tasks -> giữ cách hiện cũ.
  const hasCounts = !!today && today.dueCount != null;
  const dayLabel = today
    ? pathDayLabel(today.state, Math.min(Math.max(today.dayIndex, 1), path.totalDays), path.totalDays)
    : active
      ? `Ngày ${dayIndexFor(path.startDate, now, path.totalDays, path.studyDays)}/${path.totalDays}`
      : `${path.totalDays} ngày`;
  const completion = active ? (path.completion ?? null) : null;

  return (
    <li className="relative p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between gap-3">
      <Link to={`/roadmap/${encodeURIComponent(path.id)}`} className="flex flex-col gap-2.5 min-w-0 group">
        <div className="flex items-center gap-2 flex-wrap pr-10">
          <PathStatusChip status={path.status} completed={!!path.completedAt} />
          {path.sourceType === "remedial" ? (
            <RemedialChip />
          ) : (
            <span className="text-xs font-medium text-slate-500">{SOURCE_TYPE_LABELS[path.sourceType]}</span>
          )}
        </div>
        <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
          {path.title}
        </h2>
        <p className="text-xs font-medium text-slate-500">{dayLabel}</p>
        {today && hasCounts ? (
          today.state === "during" || today.state === "after" ? (
            <p className="text-xs font-semibold text-blue-600">
              Hôm nay: {todayCountsLabel({
                newCount: today.newCount ?? 0,
                dueCount: today.dueCount ?? 0,
                behindCount: today.behindCount ?? 0,
              })}
            </p>
          ) : today.state === "rest" && (today.dueCount ?? 0) > 0 ? (
            <p className="text-xs font-medium text-slate-500">Nghỉ theo lịch · ôn {today.dueCount} nếu muốn</p>
          ) : null
        ) : (
          today?.state === "during" && (
            <p className="text-xs font-semibold text-blue-600">Hôm nay: {todayCardCount(today.tasks ?? [])} thẻ</p>
          )
        )}
        {completion && completion.total > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
              <span>Đã học {completion.learnedPct}%</span>
              <span>{completion.mastered} đã thuộc</span>
            </div>
            <ProgressBar pct={completion.learnedPct} label={`Đã học ${path.title}`} tone="primary" />
          </div>
        )}
      </Link>
      {!isPathProcessing(path.status) && (
        <button
          type="button"
          onClick={() => onDelete(path)}
          className="absolute top-3 right-3 p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          title="Xoá lộ trình này"
          aria-label={`Xoá ${path.title}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}
    </li>
  );
};

export const LearningPathCardSkeleton: React.FC = () => (
  <li className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between gap-3 animate-pulse" aria-hidden="true">
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded-full bg-slate-200" />
        <div className="h-4 w-16 rounded bg-slate-100" />
      </div>
      <div className="space-y-1.5">
        <div className="h-5 w-4/5 rounded bg-slate-200" />
        <div className="h-3.5 w-1/3 rounded bg-slate-100" />
      </div>
      <div className="h-4 w-3/5 rounded bg-slate-100" />
    </div>
    <div className="pt-3 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-slate-100" />
        <div className="h-3 w-16 rounded bg-slate-100" />
      </div>
      <div className="w-full h-2 rounded-full bg-slate-100" />
    </div>
  </li>
);
