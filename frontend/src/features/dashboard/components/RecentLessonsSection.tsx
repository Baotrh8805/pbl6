import React, { useState } from "react";
import type { LessonItem } from "../types/dashboard.types";

interface RecentLessonsSectionProps {
  lessons: LessonItem[];
  onOpenLesson: (lesson: LessonItem) => void;
  onCreateFirstLesson?: () => void;
}

export const RecentLessonsSection: React.FC<RecentLessonsSectionProps> = ({
  lessons,
  onOpenLesson,
  onCreateFirstLesson,
}) => {
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");

  const filtered = lessons.filter((item) => {
    if (filter === "in_progress") return item.status === "in_progress";
    if (filter === "completed") return item.status === "completed";
    return true;
  });

  const countInProgress = lessons.filter((l) => l.status === "in_progress").length;
  const countCompleted = lessons.filter((l) => l.status === "completed").length;

  return (
    <section className="flex flex-col gap-space-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
            Bài học &amp; Bộ thẻ gần đây
          </h2>
          <span className="font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-semibold">
            {countInProgress} bài đang học
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface-container rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-md font-label-md text-label-md transition-all cursor-pointer whitespace-nowrap ${filter === "all"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            Tất cả ({lessons.length})
          </button>
          <button
            onClick={() => setFilter("in_progress")}
            className={`px-3 py-1 rounded-md font-label-md text-label-md transition-all cursor-pointer whitespace-nowrap ${filter === "in_progress"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            Đang học ({countInProgress})
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`px-3 py-1 rounded-md font-label-md text-label-md transition-all cursor-pointer whitespace-nowrap ${filter === "completed"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            Hoàn thành ({countCompleted})
          </button>
        </div>
      </div>

      {/* Empty state khi học viên chưa có bài học nào */}
      {filtered.length === 0 && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg border border-dashed border-surface-container-high flex flex-col items-center text-center gap-2">
          <span className="material-symbols-outlined text-[36px] text-outline">history_edu</span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {lessons.length === 0
              ? "Bạn chưa có bài học nào. Tải tài liệu lên để AI sinh bộ thẻ đầu tiên."
              : "Không có bài học nào ở mục này."}
          </p>
          {lessons.length === 0 && onCreateFirstLesson && (
            <button
              onClick={onCreateFirstLesson}
              className="mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Tải tài liệu đầu tiên</span>
            </button>
          )}
        </div>
      )}

      {/* Grid 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {filtered.map((lesson) => (
          <div
            key={lesson.id}
            className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-space-md group border border-surface-container-high/40"
          >
            <div className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <span
                  className={`font-label-sm text-label-sm uppercase ${lesson.tagBg} ${lesson.tagColor} font-bold px-2 py-0.5 rounded`}
                >
                  {lesson.tag}
                </span>
                <span className="text-xs text-outline font-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>{" "}
                  {lesson.time}
                </span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-primary group-hover:text-tertiary transition-colors leading-snug line-clamp-2 font-bold">
                {lesson.title}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                {lesson.description}
              </p>
            </div>

            <div className="space-y-space-sm pt-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface-variant font-medium">
                    Tiến độ: {lesson.progressText}
                  </span>
                  <span className="text-secondary font-bold">{lesson.progressPct}%</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${lesson.barGradient || lesson.barColor || "bg-secondary"
                      }`}
                    style={{ width: `${lesson.progressPct}%` }}
                  ></div>
                </div>
              </div>

              <button
                onClick={() => onOpenLesson(lesson)}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-label-md text-label-md transition-colors shadow-sm font-semibold cursor-pointer whitespace-nowrap ${lesson.btnVariant === "secondary"
                    ? "bg-surface-container-low text-primary hover:bg-surface-container"
                    : "bg-primary text-on-primary hover:bg-primary-container"
                  }`}
              >
                <span className="material-symbols-outlined text-[18px]">{lesson.actionIcon}</span>
                <span>{lesson.actionLabel}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
