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
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-xs active:scale-95";
const secondaryLink =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-xs hover:border-slate-300 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-xs";

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

  const counters: { key: keyof TodayCounts; label: string; icon: string; tone: string; bgTone: string }[] = [
    { key: "dueCount", label: "Ôn đến hạn", icon: "history", tone: "text-emerald-700", bgTone: "bg-emerald-50/70 border-emerald-200" },
    { key: "behindCount", label: "Học bù", icon: "pending_actions", tone: counts.behindCount > 0 ? "text-rose-700" : "text-slate-700", bgTone: counts.behindCount > 0 ? "bg-rose-50/70 border-rose-200" : "bg-slate-50 border-slate-200" },
    { key: "newCount", label: "Mới", icon: "fiber_new", tone: "text-blue-700", bgTone: "bg-blue-50/70 border-blue-200" },
  ];

  const estimatedMinutes = Math.max(1, Math.round(total * 0.75));

  return (
    <section
      aria-labelledby="today-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-heading" className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-blue-600">today</span>
          {heading}
        </h2>
        {total > 0 && (
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">timer</span>
            Ước tính ~{estimatedMinutes} phút
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {counters.map((c) => (
          <div key={c.key} className={`p-3.5 rounded-xl border flex flex-col items-center text-center gap-1 transition-all ${c.bgTone}`}>
            <dt className="text-xs text-slate-600 inline-flex items-center gap-1 font-medium">
              <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${c.tone}`}>{c.icon}</span>
              {c.label}
            </dt>
            <dd className={`text-2xl font-extrabold tabular-nums tracking-tight ${c.tone}`}>{Math.max(counts[c.key], 0)}</dd>
          </div>
        ))}
      </dl>

      {tasksLine && <p className="text-xs text-slate-600 font-medium">{tasksLine}</p>}
      {state === "rest" && counts.dueCount > 0 && (
        <p className="text-xs text-slate-600 font-medium">Vẫn có {counts.dueCount} thẻ đến hạn nếu muốn ôn.</p>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link to={sessionUrl(path.id, "today")} className={primaryLink}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
            Bắt đầu phiên hôm nay ({total} thẻ)
          </Link>
          {counts.dueCount > 0 && (
            <Link to={sessionUrl(path.id, "due")} className={secondaryLink}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-emerald-600">history</span>
              Chỉ ôn ({counts.dueCount})
            </Link>
          )}
          {counts.behindCount > 0 && (
            <Link to={sessionUrl(path.id, "catchup")} className={secondaryLink}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-rose-600">pending_actions</span>
              Học bù ({counts.behindCount})
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 font-medium">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-emerald-600">check_circle</span>
          <span>{emptyNote}</span>
        </div>
      )}
    </section>
  );
};
