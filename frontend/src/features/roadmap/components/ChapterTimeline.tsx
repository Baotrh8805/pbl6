import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { Review } from "@/lib/srs";
import type { Deck, LearningPath, LearningPathChapterState } from "@/types/api.types";
import {
  CHAPTER_STATE_LABELS,
  chapterStateOf,
  completionFallback,
  dateForDay,
  formatDayRange,
  formatShortDate,
  quizBestLabel,
  quizRetryLabel,
  sessionUrl,
} from "@/features/roadmap/roadmapUtils";
import { ProgressBar } from "./ProgressBar";

interface ChapterTimelineProps {
  path: LearningPath;
  dayIndex: number;
  decks: Deck[];
  reviews: Record<string, Review>;
  now: Date;
  decksPending: boolean;
  /** Chương đang mở lượt kiểm tra (khoá nút của chương đó). */
  quizBusy: string | null;
  onStartQuiz: (chapterId: string) => void;
  /** Lỗi mở lượt kiểm tra gần nhất: hiện ngay dưới hàng nút của chương đó (role="alert"). */
  quizError?: { chapterId: string; message: string } | null;
}

const STATE_TONE: Record<LearningPathChapterState, string> = {
  locked: "bg-slate-100 text-slate-600 border border-slate-200",
  current: "bg-blue-600 text-white shadow-xs",
  open: "bg-blue-50 text-blue-700 border border-blue-200",
  review: "bg-amber-50 text-amber-800 border border-amber-200",
  passed: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  empty: "bg-slate-100 text-slate-500 border border-slate-200",
};

export const ChapterTimeline: React.FC<ChapterTimelineProps> = ({
  path,
  dayIndex,
  decks,
  reviews,
  now,
  decksPending,
  quizBusy,
  onStartQuiz,
  quizError = null,
}) => {
  const chapters = path.chapters ?? [];
  if (chapters.length === 0) return <p className="text-slate-500 text-sm">Lộ trình chưa có chương nào.</p>;

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="text-lg font-bold text-slate-900">
        Các chương ({chapters.length})
      </h2>
      <ol className="flex flex-col gap-4 relative before:absolute before:left-3 before:top-6 before:bottom-6 before:w-0.5 before:bg-slate-200">
        {chapters.map((ch, idx) => {
          const state = chapterStateOf(ch, dayIndex);
          const passed = state === "passed";
          const current = state === "current";
          const fb = ch.learned == null && ch.deckId ? completionFallback([ch], decks, reviews, now) : null;
          const fallback = fb && fb.total > 0 ? fb : null;
          const total = ch.cardCount;
          const learned = ch.learned ?? fallback?.learned ?? null;
          const mastered = ch.mastered ?? fallback?.mastered ?? null;
          const learnedPct = learned != null && total > 0 ? Math.floor((100 * learned) / total) : null;
          const missing = !ch.deckId
            ? "Bộ thẻ đã xoá"
            : ch.learned == null && !fallback && decksPending
              ? "Đang tạo bộ thẻ…"
              : null;
          const range =
            ch.dayFrom != null && ch.dayTo != null && total > 0
              ? `${formatDayRange(ch.dayFrom, ch.dayTo)} · ${formatShortDate(dateForDay(path.startDate, ch.dayFrom, path.studyDays))}${
                  ch.dayTo !== ch.dayFrom ? `–${formatShortDate(dateForDay(path.startDate, ch.dayTo, path.studyDays))}` : ""
                }`
              : null;
          const best = quizBestLabel(ch.quizBestPct);
          const canStudy = !!ch.deckId && total > 0;
          const canQuiz = canStudy && state !== "locked";
          const retry = canStudy ? quizRetryLabel(ch, path.quizPassPct) : null;

          return (
            <li key={ch.id} className="relative pl-10" aria-current={current ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={`absolute left-3 top-5 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-xs transition-colors ${
                  passed
                    ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                    : current
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {passed ? <span className="material-symbols-outlined text-[14px]">done</span> : idx + 1}
              </span>

              <div
                className={`p-5 rounded-2xl bg-white border flex flex-col gap-3 transition-all ${
                  current
                    ? "border-2 border-blue-500 shadow-sm ring-4 ring-blue-50/60"
                    : "border-slate-200/90 shadow-xs"
                } ${state === "locked" ? "opacity-90" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATE_TONE[state]}`}>
                    {CHAPTER_STATE_LABELS[state]}
                  </span>
                  {range && (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                      {range}
                    </span>
                  )}
                  {learnedPct != null && (
                    <span className="ml-auto text-xs font-bold text-blue-600">{learnedPct}% đã học</span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 break-words">{ch.title}</h3>

                {learnedPct != null && <ProgressBar pct={learnedPct} label={`Đã học ${ch.title}`} tone="primary" />}

                {retry && !missing && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0 text-amber-600">replay</span>
                    <span className="min-w-0 break-words font-semibold">{retry} —</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStartQuiz(ch.id)}
                      isLoading={quizBusy === ch.id}
                      disabled={quizBusy !== null}
                      aria-label={`Làm lại kiểm tra chương ${ch.title}`}
                      className="cursor-pointer"
                    >
                      Làm lại
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">
                    {total} thẻ
                    {learned != null && ` · ${learned} đã học`}
                    {mastered != null && ` · ${mastered} đã thuộc`}
                    {best && ` · ${best}`}
                  </span>
                  {missing ? (
                    <span className="text-xs text-slate-400 italic">{missing}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {state === "empty" && (
                        <span className="text-xs text-slate-400 italic">Không còn thẻ nào trong lịch</span>
                      )}
                      {ch.deckId && (
                        <Link
                          to={`/decks/${encodeURIComponent(ch.deckId)}`}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                          Xem bộ thẻ
                        </Link>
                      )}
                      {canQuiz && !retry && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onStartQuiz(ch.id)}
                          isLoading={quizBusy === ch.id}
                          disabled={quizBusy !== null}
                          className="cursor-pointer"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">quiz</span>
                          Kiểm tra chương
                        </Button>
                      )}
                      {canStudy && (
                        <Link
                          to={sessionUrl(path.id, "chapter", ch.id)}
                          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
                        >
                          Học chương
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {quizError?.chapterId === ch.id && (
                  <p role="alert" className="flex items-start gap-1.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">error</span>
                    <span className="min-w-0 break-words">{quizError.message}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
