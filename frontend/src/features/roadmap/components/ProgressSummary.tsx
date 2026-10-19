import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { LearningPath, LearningPathCompletion } from "@/types/api.types";
import { formatDateTime } from "@/features/extraction/extractionUtils";
import { completionPhrase, dateForDay, formatShortDate, studyDaysLabel } from "@/features/roadmap/roadmapUtils";
import { ProgressBar } from "./ProgressBar";

interface ProgressSummaryProps {
  path: LearningPath;
  completion: LearningPathCompletion;
  /** "Ngày 3/30" / "Chưa bắt đầu" / "Đã kết thúc" — vị trí hôm nay trên lộ trình. */
  positionLabel: string;
  busy: boolean;
  onComplete: () => void;
  onOpenSettings: () => void;
}

// Hai thước đo (LP-3): "đã học" = có ít nhất một lần chấm (thanh chính), "đã thuộc" = khoảng ôn ≥ 21 ngày (thanh phụ).
// Học hết thẻ -> mời bấm "Hoàn thành" (server không tự chốt khi chỉ đọc); đã chốt -> chip.
export const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  path,
  completion: c,
  positionLabel,
  busy,
  onComplete,
  onOpenSettings,
}) => {
  const total = Math.max(path.totalDays, 1);
  const completed = !!path.completedAt;
  const canComplete = !completed && c.total > 0 && c.learnedPct >= 100;
  const endDay = dateForDay(path.startDate, total, path.studyDays);

  return (
    <section
      aria-labelledby="progress-heading"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-label-md text-on-surface-variant">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">event</span>
          {formatShortDate(path.startDate, true)} → {formatShortDate(endDay, true)}
        </span>
        <span className="inline-flex items-center gap-2">
          {completed ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/50 text-on-secondary-container text-label-sm font-semibold"
              title={path.completedAt ? `Hoàn thành lúc ${formatDateTime(path.completedAt)}` : undefined}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">verified</span>
              Đã hoàn thành
            </span>
          ) : (
            <span className="font-semibold text-on-surface">{positionLabel}</span>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-primary hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">tune</span>
            Cài đặt
          </button>
        </span>
      </div>

      <h2 id="progress-heading" className="sr-only">
        Tiến độ lộ trình
      </h2>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-title-md font-semibold text-on-surface">
            Đã học {c.learned}/{c.total} thẻ
            <span className="text-primary"> ({c.learnedPct}%)</span>
          </span>
          <span className="text-label-sm text-on-surface-variant">
            {c.chaptersTotal > 0 ? `${c.chaptersPassed}/${c.chaptersTotal} chương đã qua kiểm tra` : "Chưa có chương"}
          </span>
        </div>
        {/* Thanh chính đọc cả câu tóm tắt: trình đọc màn hình nhận hai thước đo + chương trong một lần dừng. */}
        <ProgressBar pct={c.learnedPct} label={`Thẻ đã học (có ít nhất một lần chấm) — ${completionPhrase(c)}`} tone="primary" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-label-md text-on-surface-variant">
          Đã thuộc {c.mastered} thẻ ({c.masteredPct}%) · khoảng ôn ≥ 21 ngày
        </span>
        <ProgressBar pct={c.masteredPct} label="Thẻ đã thuộc (khoảng ôn từ 21 ngày)" tone="secondary" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-label-sm text-on-surface-variant">
        <span>
          {studyDaysLabel(path.studyDays ?? "1111111")}
          {path.dailyCap != null && ` · trần ${path.dailyCap} thẻ/ngày`}
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

      {canComplete && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-secondary-container/30 border border-secondary/20">
          <p className="text-body-sm text-on-surface">
            Bạn đã học hết {c.total} thẻ của lộ trình. Chốt hoàn thành để ghi nhận thành quả.
          </p>
          <Button variant="secondary" size="sm" onClick={onComplete} disabled={busy} className="shrink-0">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">flag</span>
            Hoàn thành
          </Button>
        </div>
      )}
    </section>
  );
};
