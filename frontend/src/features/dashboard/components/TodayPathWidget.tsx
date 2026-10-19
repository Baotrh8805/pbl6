import React from "react";
import { Link } from "react-router-dom";
import { useTodaySummary } from "@/features/roadmap/useTodaySummary";
import { pathDayLabel, sessionUrl, todayCountsLabel, todaySessionSize } from "@/features/roadmap/roadmapUtils";

// LP-9: "hôm nay của lộ trình" ngay trên Tổng quan — một dòng mỗi lộ trình đang học, nút Bắt đầu mở phiên hợp nhất.
// Không có lộ trình ACTIVE (hoặc chưa tải / lỗi) -> không chiếm chỗ.
export const TodayPathWidget: React.FC = () => {
  const { data } = useTodaySummary();
  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="today-path-heading"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-path-heading" className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">alt_route</span>
          Lộ trình hôm nay
        </h2>
        <Link to="/roadmap" className="text-label-md text-primary hover:underline">
          Tất cả lộ trình
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const size = todaySessionSize(item, item.dailyCap ?? 0, item.state);
          // Ngày nghỉ: phiên hôm nay chỉ gồm thẻ đến hạn nên nợ không nằm trong "Bắt đầu" — badge sidebar vẫn đếm nợ,
          // vì vậy đưa lối "Học bù" ra đây để dòng và badge nói cùng một con số (ngày học thì nợ đã gộp vào phiên).
          const catchup = item.state === "rest" ? Math.max(item.behindCount, 0) : 0;
          const href = `/roadmap/${encodeURIComponent(item.pathId)}`;
          return (
            <li
              key={item.pathId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low"
            >
              <div className="min-w-0">
                <Link to={href} className="font-semibold text-on-surface hover:text-primary break-words">
                  {item.title}
                </Link>
                <p className="text-label-sm text-on-surface-variant">
                  {pathDayLabel(item.state, item.dayIndex, item.totalDays)} · {todayCountsLabel(item)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {size > 0 && (
                  <Link
                    to={sessionUrl(item.pathId, "today")}
                    className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
                    Bắt đầu ({size} thẻ)
                  </Link>
                )}
                {catchup > 0 && (
                  <Link
                    to={sessionUrl(item.pathId, "catchup")}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md hover:border-primary hover:bg-surface-container-low transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Học bù ({catchup})
                  </Link>
                )}
                {size === 0 && catchup === 0 && (
                  <span className="text-label-sm text-on-surface-variant italic">
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
