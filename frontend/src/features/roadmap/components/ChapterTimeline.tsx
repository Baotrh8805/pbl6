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
  locked: "bg-surface-container-high text-on-surface-variant",
  current: "bg-primary text-on-primary",
  open: "bg-primary-fixed text-on-primary-fixed",
  review: "bg-[#FEF3C7] text-[#92400E]",
  passed: "bg-secondary-container/60 text-on-secondary-container",
};

// Chương có trạng thái (spec §4.1): học theo phiên chương (/session?session=chapter) thay vì học cả bộ không có ?path=
// (LP-14); "Kiểm tra chương" mở quiz exam trên bộ của chương — đạt ngưỡng mới tính "Đã qua", nhưng không chặn học (D4).
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
  if (chapters.length === 0) return <p className="text-on-surface-variant">Lộ trình chưa có chương nào.</p>;

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-space-sm">
      <h2 id="timeline-heading" className="font-title-md text-title-md text-on-surface">
        Các chương
      </h2>
      <ol className="flex flex-col gap-space-md relative before:absolute before:left-2.5 before:top-6 before:bottom-6 before:w-0.5 before:bg-surface-container-high">
        {chapters.map((ch, idx) => {
          const state = chapterStateOf(ch, dayIndex);
          const passed = state === "passed";
          const current = state === "current";
          // Số liệu server (ACTIVE 2.0); response 1.0 thiếu -> tính từ bộ thẻ + lịch ôn của máy khách (bộ chưa tải -> null).
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

          return (
            <li key={ch.id} className="relative pl-10" aria-current={current ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={`absolute left-2.5 top-5 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm transition-colors ${
                  passed
                    ? "bg-secondary text-on-primary ring-4 ring-secondary/20"
                    : current
                      ? "bg-primary text-on-primary ring-4 ring-primary/30"
                      : "bg-surface-container-high text-outline"
                }`}
              >
                {passed ? <span className="material-symbols-outlined text-[14px]">done</span> : idx + 1}
              </span>

              <div
                className={`p-space-md rounded-xl bg-surface-container-lowest border flex flex-col gap-space-sm transition-shadow ${
                  current ? "border-primary/40 shadow-md" : "border-surface-container-high"
                } ${state === "locked" ? "opacity-90" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-label-sm font-semibold ${STATE_TONE[state]}`}>
                    {CHAPTER_STATE_LABELS[state]}
                  </span>
                  {range && (
                    <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-semibold">
                      {range}
                    </span>
                  )}
                  {learnedPct != null && (
                    <span className="ml-auto text-label-md font-bold text-primary">{learnedPct}% đã học</span>
                  )}
                </div>
                <h3 className="font-title-md text-title-md text-on-surface break-words">{ch.title}</h3>

                {learnedPct != null && <ProgressBar pct={learnedPct} label={`Đã học ${ch.title}`} tone="primary" />}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container-high/60">
                  <span className="text-label-sm text-outline">
                    {total} thẻ
                    {learned != null && ` · ${learned} đã học`}
                    {mastered != null && ` · ${mastered} đã thuộc`}
                    {best && ` · ${best}`}
                  </span>
                  {missing ? (
                    <span className="text-label-sm text-on-surface-variant italic">{missing}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {ch.deckId && (
                        <Link
                          to={`/decks/${encodeURIComponent(ch.deckId)}`}
                          className="px-3 py-1.5 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                        >
                          Xem bộ thẻ
                        </Link>
                      )}
                      {canQuiz && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onStartQuiz(ch.id)}
                          isLoading={quizBusy === ch.id}
                          disabled={quizBusy !== null}
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">quiz</span>
                          Kiểm tra chương
                        </Button>
                      )}
                      {canStudy && (
                        <Link
                          to={sessionUrl(path.id, "chapter", ch.id)}
                          className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                        >
                          Học chương
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {quizError?.chapterId === ch.id && (
                  <p role="alert" className="flex items-start gap-1.5 p-2.5 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
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
