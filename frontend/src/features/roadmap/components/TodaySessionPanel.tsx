import React from "react";
import { Link } from "react-router-dom";
import type { LearningPath, LearningPathTask, LearningPathTodayState } from "@/types/api.types";
import {
  sessionUrl,
  todayHeading,
  todayNewTasksLine,
  todaySessionSize,
  type TodayCounts,
} from "@/features/roadmap/roadmapUtils";

interface TodaySessionPanelProps {
  path: LearningPath;
  state: LearningPathTodayState;
  dayIndex: number;
  /** "YYYY-MM-DD" của ngày đang hiển thị. */
  date: string;
  counts: TodayCounts;
  /** Chương có thẻ mới hôm nay (chỉ khi state = during) — hiện cho biết hôm nay học gì. */
  tasks: LearningPathTask[];
  /** Trần tải/ngày để ước lượng số thẻ phiên hôm nay như server cắt. */
  cap: number;
}

const primaryLink =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm";
const secondaryLink =
  "inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md hover:border-primary hover:bg-surface-container-low transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Phiên học hợp nhất (LP-2): một nút "Bắt đầu" gom đến hạn -> nợ -> mới qua /session?session=today; "Chỉ ôn" / "Học bù"
// là lối tắt khi chỉ muốn một nhóm. Ngày nghỉ / chưa bắt đầu / đã kết thúc vẫn ôn được thẻ đến hạn (spec §7).
export const TodaySessionPanel: React.FC<TodaySessionPanelProps> = ({ path, state, dayIndex, date, counts, tasks, cap }) => {
  const chapters = path.chapters ?? [];
  const titleOf = (t: LearningPathTask) =>
    t.chapterTitle ?? chapters.find((c) => c.id === t.chapterId)?.title ?? "Chương";
  const sizeOf = (t: LearningPathTask) => t.count ?? Math.max(t.toPos - t.fromPos + 1, 0);
  const total = todaySessionSize(counts, cap, state);
  const heading = todayHeading(state, dayIndex, path.totalDays, date, path.startDate);
  // Học hết thẻ mới của hôm nay (Mới 0) thì dòng này nói "đã học xong", không còn như việc đang chờ.
  const tasksLine =
    state === "during" ? todayNewTasksLine(tasks.map((t) => `${titleOf(t)} (${sizeOf(t)} thẻ)`), counts.newCount) : null;
  const emptyNote =
    state === "rest"
      ? "Không có thẻ nào đến hạn. Nghỉ ngơi nhé!"
      : state === "before"
        ? "Chưa có việc gì cho tới ngày bắt đầu."
        : state === "after"
          ? "Không còn thẻ nợ hay đến hạn."
          : "Hôm nay không còn thẻ nào cần học.";

  const counters: { key: keyof TodayCounts; label: string; icon: string; tone: string }[] = [
    { key: "dueCount", label: "Ôn đến hạn", icon: "history", tone: "text-secondary" },
    { key: "behindCount", label: "Học bù", icon: "pending_actions", tone: counts.behindCount > 0 ? "text-error" : "text-on-surface" },
    { key: "newCount", label: "Mới", icon: "fiber_new", tone: "text-primary" },
  ];

  return (
    <section
      aria-labelledby="today-heading"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm"
    >
      <h2 id="today-heading" className="font-title-md text-title-md text-on-surface flex items-center gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">today</span>
        {heading}
      </h2>

      <dl className="grid grid-cols-3 gap-2">
        {counters.map((c) => (
          <div key={c.key} className="p-2.5 rounded-xl bg-surface-container-low flex flex-col items-center text-center gap-0.5">
            <dt className="text-label-sm text-on-surface-variant inline-flex items-center gap-1">
              <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${c.tone}`}>{c.icon}</span>
              {c.label}
            </dt>
            <dd className={`text-headline-sm font-bold tabular-nums ${c.tone}`}>{Math.max(counts[c.key], 0)}</dd>
          </div>
        ))}
      </dl>

      {tasksLine && <p className="text-body-sm text-on-surface-variant">{tasksLine}</p>}
      {state === "rest" && counts.dueCount > 0 && (
        <p className="text-body-sm text-on-surface-variant">Vẫn có {counts.dueCount} thẻ đến hạn nếu muốn ôn.</p>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={sessionUrl(path.id, "today")} className={primaryLink}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
            Bắt đầu phiên hôm nay ({total} thẻ)
          </Link>
          {counts.dueCount > 0 && (
            <Link to={sessionUrl(path.id, "due")} className={secondaryLink}>
              Chỉ ôn ({counts.dueCount})
            </Link>
          )}
          {counts.behindCount > 0 && (
            <Link to={sessionUrl(path.id, "catchup")} className={secondaryLink}>
              Học bù ({counts.behindCount})
            </Link>
          )}
        </div>
      ) : (
        <p className="text-body-sm text-on-surface-variant">{emptyNote}</p>
      )}
    </section>
  );
};
