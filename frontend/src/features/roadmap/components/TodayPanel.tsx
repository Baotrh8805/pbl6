import React from "react";
import { Link } from "react-router-dom";
import type { Review } from "@/lib/srs";
import type { Deck, LearningPath, LearningPathTask } from "@/types/api.types";
import { formatShortDate, todayCardCount, unreviewedInTasks } from "@/features/roadmap/roadmapUtils";

export type TodayState = "before" | "during" | "after";

interface TodayPanelProps {
  path: LearningPath;
  state: TodayState;
  dayIndex: number;
  /** "YYYY-MM-DD" của ngày đang hiển thị. */
  date: string;
  tasks: LearningPathTask[];
  behind: number;
  decks: Deck[];
  reviews: Record<string, Review>;
  decksPending: boolean;
}

export const TodayPanel: React.FC<TodayPanelProps> = ({
  path,
  state,
  dayIndex,
  date,
  tasks,
  behind,
  decks,
  reviews,
  decksPending,
}) => {
  const chapters = path.chapters ?? [];
  const titleOf = (t: LearningPathTask) =>
    t.chapterTitle ?? chapters.find((c) => c.id === t.chapterId)?.title ?? "Chương";
  // Chương có lịch hôm nay nhưng bộ thẻ đã bị xoá: server bỏ khỏi tasks, vẫn báo cho người học.
  const deletedToday = chapters.filter((c) => !c.deckId && c.dayFrom <= dayIndex && dayIndex <= c.dayTo);
  const visibleTasks = tasks.filter((t) => t.deckId);

  const heading =
    state === "after"
      ? "Đã kết thúc — ôn lại phần ngày cuối"
      : state === "before"
        ? `Chưa bắt đầu — lộ trình bắt đầu ngày ${formatShortDate(path.startDate)}`
        : `Hôm nay · Ngày ${dayIndex}/${path.totalDays} (${formatShortDate(date)})`;

  return (
    <section
      aria-labelledby="today-heading"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-heading" className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">today</span>
          {heading}
        </h2>
        {behind > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-error/10 text-error border border-error/20 text-label-sm font-semibold">
            Nợ: {behind} thẻ
          </span>
        )}
      </div>

      {visibleTasks.length === 0 && deletedToday.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">
          Hôm nay là ngày ôn tập, hãy ôn thẻ đến hạn ở{" "}
          <Link to="/" className="text-primary hover:underline">
            Tổng quan
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleTasks.map((t) => {
            const k = todayCardCount([t]);
            const loaded = decks.some((d) => d.id === t.deckId);
            const left = unreviewedInTasks([t], decks, reviews);
            return (
              <li
                key={`${t.chapterId}-${t.fromPos}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface break-words">{titleOf(t)}</p>
                  <p className="text-label-sm text-on-surface-variant">
                    {k} thẻ (vị trí {t.fromPos}–{t.toPos})
                    {" · "}
                    {loaded ? (
                      <span className={left > 0 ? "text-error font-semibold" : "text-secondary font-semibold"}>
                        còn {left} thẻ chưa học
                      </span>
                    ) : decksPending ? (
                      "Đang tạo bộ thẻ…"
                    ) : null}
                  </p>
                </div>
                <Link
                  to={`/decks/${t.deckId}/study?range=${t.fromPos}-${t.toPos}&path=${encodeURIComponent(path.id)}`}
                  className="shrink-0 inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
                  Học ngay ({k} thẻ)
                </Link>
              </li>
            );
          })}
          {deletedToday.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low opacity-70">
              <p className="min-w-0 font-semibold text-on-surface break-words">{c.title}</p>
              <span className="text-label-sm text-on-surface-variant">Bộ thẻ đã xoá</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
