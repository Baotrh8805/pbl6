import React from "react";
import { Link } from "react-router-dom";
import { useTodaySummary } from "@/features/roadmap/useTodaySummary";
import { pathDayLabel, sessionUrl, todayCountsLabel, todaySessionSize } from "@/features/roadmap/roadmapUtils";
import { formatDateTime } from "@/features/extraction/extractionUtils";

// LP-9: "hôm nay của lộ trình" ngay trên Tổng quan — nâng cấp giao diện Card hiện đại.
export const TodayPathWidget: React.FC = () => {
  const { data } = useTodaySummary();
  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="today-path-heading"
      className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-path-heading" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">alt_route</span>
          </div>
          <span>Lộ trình hôm nay</span>
        </h2>
        <Link to="/roadmap" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline">
          Tất cả lộ trình →
        </Link>
      </div>

      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const href = `/roadmap/${encodeURIComponent(item.pathId)}`;
          if (item.done) {
            return (
              <li
                key={item.pathId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70"
              >
                <div className="min-w-0">
                  <Link to={href} className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors break-words">
                    {item.title}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.completedAt
                      ? `Đã học hết thẻ · hoàn thành lúc ${formatDateTime(item.completedAt)}`
                      : "Đã học hết thẻ · mở lộ trình để bấm “Hoàn thành”"}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 self-start sm:self-auto shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">verified</span>
                  Đã hoàn thành
                </span>
              </li>
            );
          }
          const size = todaySessionSize(item, item.dailyCap ?? 0, item.state);
          const catchup = item.state === "rest" ? Math.max(item.behindCount, 0) : 0;
          return (
            <li
              key={item.pathId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 hover:border-slate-300 transition-all"
            >
              <div className="min-w-0">
                <Link to={href} className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors break-words">
                  {item.title}
                </Link>
                <p className="text-xs text-slate-500 mt-0.5">
                  <strong className="text-slate-800">{pathDayLabel(item.state, item.dayIndex, item.totalDays)}</strong> · {todayCountsLabel(item)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {size > 0 && (
                  <Link
                    to={sessionUrl(item.pathId, "today")}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">play_arrow</span>
                    <span>Bắt đầu ({size} thẻ)</span>
                  </Link>
                )}
                {catchup > 0 && (
                  <Link
                    to={sessionUrl(item.pathId, "catchup")}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Học bù ({catchup})
                  </Link>
                )}
                {size === 0 && catchup === 0 && (
                  <span className="text-xs text-slate-500 italic">
                    {item.state === "rest" ? "Nghỉ theo lịch" : "Không có việc hôm nay"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
