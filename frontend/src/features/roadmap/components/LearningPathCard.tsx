import React from "react";
import { Link } from "react-router-dom";
import type { Deck, LearningPath } from "@/types/api.types";
import type { Review } from "@/lib/srs";
import { SOURCE_TYPE_LABELS } from "@/features/extraction/extractionUtils";
import { dayIndexFor, isPathProcessing, pathProgress, todayCardCount } from "../roadmapUtils";
import { PathStatusChip } from "./PathStatusChip";
import { ProgressBar } from "./ProgressBar";

interface LearningPathCardProps {
  path: LearningPath;
  decks: Deck[];
  reviews: Record<string, Review>;
  now: Date;
  onDelete: (path: LearningPath) => void;
}

export const LearningPathCard: React.FC<LearningPathCardProps> = ({ path, decks, reviews, now, onDelete }) => {
  const progress = path.chapters && path.chapters.length > 0 ? pathProgress(path.chapters, decks, reviews, now) : null;
  const active = path.status === "ACTIVE";
  return (
    <li className="relative p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high hover:border-outline-variant transition-colors">
      <Link to={`/roadmap/${encodeURIComponent(path.id)}`} className="flex flex-col gap-2 min-w-0 group">
        <div className="flex items-center gap-2 flex-wrap pr-10">
          <PathStatusChip status={path.status} />
          <span className="text-label-sm text-outline">{SOURCE_TYPE_LABELS[path.sourceType]}</span>
        </div>
        <h2 className="text-title-md font-semibold text-on-surface truncate group-hover:text-primary">{path.title}</h2>
        <p className="text-label-sm text-outline">
          {active
            ? `Ngày ${dayIndexFor(path.startDate, now, path.totalDays)}/${path.totalDays}`
            : `${path.totalDays} ngày`}
        </p>
        {progress && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-label-sm">
              <span className="text-on-surface-variant font-medium">
                Đã thuộc {progress.mastered}/{progress.total} thẻ
              </span>
              <span className="text-secondary font-bold">{progress.pct}%</span>
            </div>
            <ProgressBar pct={progress.pct} label={`Tiến độ ${path.title}`} />
          </div>
        )}
        {active && path.today && (
          <p className="text-label-md text-primary font-semibold">
            Hôm nay: {todayCardCount(path.today.tasks ?? [])} thẻ
          </p>
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
