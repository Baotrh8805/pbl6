import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeckCardSkeleton } from "@/features/decks/components/DeckCard";
import type { Review } from "@/lib/srs";
import { calcDeckProgress, type DeckProgress } from "@/lib/deckUtils";
import { lastReviewedAt } from "@/lib/learningStats";
import type { Deck } from "@/types/api.types";

interface RecentDecksSectionProps {
  decks: Deck[];
  reviews: Record<string, Review>;
  loading: boolean;
}

type Filter = "all" | "in_progress" | "completed";

interface DeckRow {
  deck: Deck;
  progress: DeckProgress;
  lastStudied: number | null;
  completed: boolean;
}

const MAX_RECENT_DECKS = 6;

const relativeDay = (ts: number | null, now: number): string => {
  if (ts === null) return "Chưa học";
  const days = Math.floor((now - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return `${days} ngày trước`;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "in_progress", label: "Đang học" },
  { id: "completed", label: "Đã thuộc hết" },
];

const JLPT_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-800",
  N4: "bg-emerald-100 text-emerald-800",
  N3: "bg-amber-100 text-amber-800",
  N2: "bg-rose-100 text-rose-800",
  N1: "bg-purple-100 text-purple-800",
};

export const RecentDecksSection: React.FC<RecentDecksSectionProps> = ({ decks, reviews, loading }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => Date.now());

  const rows: DeckRow[] = useMemo(
    () =>
      decks
        .map((deck) => {
          const progress = calcDeckProgress(deck.cards, reviews, new Date(now));
          const times = deck.cards
            .map((c) => reviews[c.id])
            .filter((r): r is Review => !!r)
            .map((r) => lastReviewedAt(r).getTime());
          return {
            deck,
            progress,
            lastStudied: times.length ? Math.max(...times) : null,
            completed: progress.total > 0 && progress.mastered === progress.total,
          };
        })
        .sort((a, b) => (b.lastStudied ?? -1) - (a.lastStudied ?? -1)),
    [decks, reviews, now]
  );

  const counts = {
    all: rows.length,
    in_progress: rows.filter((r) => !r.completed).length,
    completed: rows.filter((r) => r.completed).length,
  };
  const visible = rows
    .filter((r) => (filter === "all" ? true : filter === "completed" ? r.completed : !r.completed))
    .slice(0, MAX_RECENT_DECKS);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="recent-decks-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="recent-decks-title"
            className="font-headline text-lg sm:text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap"
          >
            Bộ thẻ gần đây
          </h2>
          <span className="text-xs bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
            {counts.in_progress} bộ đang học
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Filter Control */}
          <div role="group" aria-label="Lọc bộ thẻ" className="inline-flex items-center gap-1 p-1 bg-slate-200/70 border border-slate-200/60 rounded-xl">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  filter === f.id
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>

          <Link
            to="/decks"
            className="hidden sm:inline-flex text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
          >
            Tất cả →
          </Link>
        </div>
      </div>

      {loading && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label="Đang tải bộ thẻ">
          {[0, 1, 2, 3].map((i) => (
            <DeckCardSkeleton key={i} />
          ))}
        </ul>
      )}

      {!loading && visible.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-slate-200 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
              history_edu
            </span>
          </div>
          <p className="text-sm text-slate-600 max-w-sm">
            {rows.length === 0 ? "Bạn chưa có bộ thẻ nào. Tạo bộ thẻ đầu tiên để bắt đầu ôn tập." : "Không có bộ thẻ nào ở mục này."}
          </p>
          {rows.length === 0 && (
            <Link
              to="/decks/new"
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add
              </span>
              <span>Tạo bộ thẻ đầu tiên</span>
            </Link>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map(({ deck, progress, lastStudied, completed }) => {
            const badgeClass = JLPT_BADGES[deck.level] ?? "bg-slate-100 text-slate-800";
            return (
              <li
                key={deck.id}
                className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badgeClass}`}>
                      {deck.level}
                    </span>
                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                        schedule
                      </span>
                      {relativeDay(lastStudied, now)}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2">
                    <Link to={`/decks/${encodeURIComponent(deck.id)}`} className="hover:underline">
                      {deck.title}
                    </Link>
                  </h3>
                  {deck.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{deck.description}</p>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">
                        Đã thuộc {progress.mastered}/{progress.total}
                      </span>
                      <span className="text-emerald-600 font-bold">{progress.pct}%</span>
                    </div>
                    <div
                      className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress.pct}
                      aria-label={`Tiến độ ${deck.title}`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                  </div>

                  {progress.due > 0 ? (
                    <Link
                      to={`/decks/${encodeURIComponent(deck.id)}/study`}
                      title={`Ôn ${progress.due} thẻ đến hạn theo lịch lặp lại ngắt quãng`}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs whitespace-nowrap bg-amber-400 hover:bg-amber-500 text-slate-950"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        play_arrow
                      </span>
                      <span>Ôn ngay ({progress.due} thẻ)</span>
                    </Link>
                  ) : progress.newCards > 0 ? (
                    <Link
                      to={`/decks/${encodeURIComponent(deck.id)}/study`}
                      title={`Bắt đầu học ${progress.newCards} thẻ mới trong bộ`}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs whitespace-nowrap bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        school
                      </span>
                      <span>Học mới ({progress.newCards} thẻ)</span>
                    </Link>
                  ) : (
                    <Link
                      to={`/decks/${encodeURIComponent(deck.id)}`}
                      title={completed ? "Tất cả các thẻ trong bộ đã thành thạo" : "Xem chi tiết danh sách thẻ trong bộ"}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-2xs whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        {completed ? "check_circle" : "visibility"}
                      </span>
                      <span>{completed ? "Đã thuộc hết" : "Xem bộ thẻ"}</span>
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
