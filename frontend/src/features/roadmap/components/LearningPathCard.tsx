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
    <li className="relative p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high hover:border-outline-variant transition-colors">
      <Link to={`/roadmap/${encodeURIComponent(path.id)}`} className="flex flex-col gap-2 min-w-0 group">
        <div className="flex items-center gap-2 flex-wrap pr-10">
          <PathStatusChip status={path.status} completed={!!path.completedAt} />
          {path.sourceType === "remedial" ? (
            <RemedialChip />
          ) : (
            <span className="text-label-sm text-outline">{SOURCE_TYPE_LABELS[path.sourceType]}</span>
          )}
        </div>
        <h2 className="text-title-md font-semibold text-on-surface truncate group-hover:text-primary">{path.title}</h2>
        <p className="text-label-sm text-outline">{dayLabel}</p>
        {today && hasCounts ? (
          today.state === "during" || today.state === "after" ? (
            <p className="text-label-md text-primary font-semibold">Hôm nay: {todayCountsLabel({
              newCount: today.newCount ?? 0,
              dueCount: today.dueCount ?? 0,
              behindCount: today.behindCount ?? 0,
            })}</p>
          ) : today.state === "rest" && (today.dueCount ?? 0) > 0 ? (
            <p className="text-label-md text-on-surface-variant font-semibold">Nghỉ theo lịch · ôn {today.dueCount} nếu muốn</p>
          ) : null
        ) : (
          today?.state === "during" && (
            <p className="text-label-md text-primary font-semibold">Hôm nay: {todayCardCount(today.tasks ?? [])} thẻ</p>
          )
        )}
        {completion && completion.total > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
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
          className="absolute top-2 right-2 p-2 rounded-lg text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
          title="Xoá lộ trình này"
          aria-label={`Xoá ${path.title}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">delete</span>
        </button>
      )}
    </li>
  );
};
