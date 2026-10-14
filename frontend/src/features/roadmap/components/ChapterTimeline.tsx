import React from "react";
import { Link } from "react-router-dom";
import type { Review } from "@/lib/srs";
import type { Deck, LearningPath } from "@/types/api.types";
import { chapterProgress, dateForDay, formatDayRange, formatShortDate } from "@/features/roadmap/roadmapUtils";
import { ProgressBar } from "./ProgressBar";

interface ChapterTimelineProps {
  path: LearningPath;
  dayIndex: number;
  decks: Deck[];
  reviews: Record<string, Review>;
  now: Date;
  decksPending: boolean;
}

export const ChapterTimeline: React.FC<ChapterTimelineProps> = ({ path, dayIndex, decks, reviews, now, decksPending }) => {
  const chapters = path.chapters ?? [];
  if (chapters.length === 0) return <p className="text-on-surface-variant">Lộ trình chưa có chương nào.</p>;

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-space-sm">
      <h2 id="timeline-heading" className="font-title-md text-title-md text-on-surface">
        Các chương
      </h2>
      <ol className="flex flex-col gap-space-md relative before:absolute before:left-2.5 before:top-6 before:bottom-6 before:w-0.5 before:bg-surface-container-high">
        {chapters.map((ch, idx) => {
          const progress = chapterProgress(ch, decks, reviews, now);
          const done = !!progress && progress.total > 0 && progress.pct === 100;
          const current = !done && ch.dayFrom <= dayIndex && dayIndex <= ch.dayTo;
          const missing = !ch.deckId
            ? "Bộ thẻ đã xoá"
            : !progress && decksPending
              ? "Đang tạo bộ thẻ…"
              : null;
          const range =
            ch.dayFrom != null && ch.dayTo != null
              ? `${formatDayRange(ch.dayFrom, ch.dayTo)} · ${formatShortDate(dateForDay(path.startDate, ch.dayFrom))}${
                  ch.dayTo !== ch.dayFrom ? `–${formatShortDate(dateForDay(path.startDate, ch.dayTo))}` : ""
                }`
              : null;

          return (
            <li key={ch.id} className="relative pl-10" aria-current={current ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={`absolute left-2.5 top-5 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm transition-colors ${
                  done
                    ? "bg-secondary text-on-primary ring-4 ring-secondary/20"
                    : current
                      ? "bg-primary text-on-primary ring-4 ring-primary/30"
                      : "bg-surface-container-high text-outline"
                }`}
              >
                {done ? <span className="material-symbols-outlined text-[14px]">done</span> : idx + 1}
              </span>

              <div
                className={`p-space-md rounded-xl bg-surface-container-lowest border flex flex-col gap-space-sm transition-shadow ${
                  current ? "border-primary/40 shadow-md" : "border-surface-container-high"
                } ${!done && !current ? "opacity-90" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {range && (
                    <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-label-sm font-semibold">
                      {range}
                    </span>
                  )}
                  {progress && <span className="text-label-md font-bold text-primary">{progress.pct}% đã thuộc</span>}
                </div>
                <h3 className="font-title-md text-title-md text-on-surface break-words">{ch.title}</h3>

                {progress && <ProgressBar pct={progress.pct} label={`Tiến độ ${ch.title}`} tone="primary" />}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container-high/60">
                  <span className="text-label-sm text-outline">
                    {ch.cardCount} thẻ
                    {progress && ` · ${progress.mastered} đã thuộc · ${progress.due} cần ôn`}
                  </span>
                  {missing ? (
                    <span className="text-label-sm text-on-surface-variant italic">{missing}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/decks/${ch.deckId}`}
                        className="px-3 py-1.5 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                      >
                        Xem bộ thẻ
                      </Link>
                      <Link
                        to={`/decks/${ch.deckId}/study`}
                        className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                      >
                        Học bộ này
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
