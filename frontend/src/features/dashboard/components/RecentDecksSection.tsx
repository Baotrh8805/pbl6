import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

const MAX_ITEMS = 8;

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

// Thay cho danh sách "bài học" giả: dùng bộ thẻ thật + lịch sử ôn để biết bộ nào học gần đây.
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
        // Bộ học gần nhất lên đầu, bộ chưa học xếp sau.
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
    .slice(0, MAX_ITEMS);

  return (
    <section className="flex flex-col gap-space-md" aria-labelledby="recent-decks-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <h2 id="recent-decks-title" className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
            Bộ thẻ đang học
          </h2>
          <span className="font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-semibold">
            {counts.in_progress} bộ đang học
          </span>
        </div>

        {/* flex-wrap chỉ dưới 640 px: ba nút liền nhau rộng ~327 px, ở 320 px (nội dung còn 272 px) không xuống dòng thì đẩy cả
            trang tràn ngang. Từ sm hàng tiêu đề thành flex-row: nhóm nút mà wrap được thì min-content tụt về một nút, bị co cùng
            tiêu đề và gãy thành 2 dòng ở 640–900 px -> sm:flex-nowrap giữ nguyên một khối như trước. */}
        <div role="group" aria-label="Lọc bộ thẻ" className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 bg-surface-container rounded-lg self-start sm:self-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-md font-label-md text-label-md transition-all cursor-pointer whitespace-nowrap ${
                filter === f.id
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p aria-live="polite" className="text-body-sm text-on-surface-variant">
          Đang tải bộ thẻ…
        </p>
      )}

      {!loading && visible.length === 0 && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg border border-dashed border-surface-container-high flex flex-col items-center text-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">
            history_edu
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {rows.length === 0 ? "Bạn chưa có bộ thẻ nào. Tạo bộ thẻ đầu tiên để bắt đầu ôn tập." : "Không có bộ thẻ nào ở mục này."}
          </p>
          {rows.length === 0 && (
            <Link
              to="/decks/new"
              className="mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors font-semibold"
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
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {visible.map(({ deck, progress, lastStudied, completed }) => (
            <li
              key={deck.id}
              className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-space-md group border border-surface-container-high/40"
            >
              <div className="space-y-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm uppercase bg-surface-container text-primary font-bold px-2 py-0.5 rounded">
                    {deck.level}
                  </span>
                  <span className="text-xs text-outline font-label-sm flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                      schedule
                    </span>
                    {relativeDay(lastStudied, now)}
                  </span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-primary group-hover:text-tertiary transition-colors leading-snug line-clamp-2 font-bold">
                  <Link to={`/decks/${encodeURIComponent(deck.id)}`} className="hover:underline">
                    {deck.title}
                  </Link>
                </h3>
                {deck.description && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{deck.description}</p>
                )}
              </div>

              <div className="space-y-space-sm pt-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between font-label-sm text-label-sm">
                    <span className="text-on-surface-variant font-medium">
                      Đã thuộc {progress.mastered}/{progress.total} thẻ
                    </span>
                    <span className="text-secondary font-bold">{progress.pct}%</span>
                  </div>
                  <div
                    className="w-full h-2 bg-surface-container rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.pct}
                    aria-label={`Tiến độ ${deck.title}`}
                  >
                    <div className="h-full rounded-full bg-secondary transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                  </div>
                </div>

                <Link
                  to={
                    progress.due > 0
                      ? `/decks/${encodeURIComponent(deck.id)}/study`
                      : `/decks/${encodeURIComponent(deck.id)}`
                  }
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-label-md text-label-md transition-colors shadow-sm font-semibold whitespace-nowrap ${
                    progress.due > 0
                      ? "bg-primary text-on-primary hover:bg-primary-container"
                      : "bg-surface-container-low text-primary hover:bg-surface-container"
                  }`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    {progress.due > 0 ? "play_arrow" : completed ? "check_circle" : "visibility"}
                  </span>
                  <span>{progress.due > 0 ? `Ôn ngay (${progress.due} thẻ)` : "Xem bộ thẻ"}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
