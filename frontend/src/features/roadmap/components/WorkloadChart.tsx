import React, { useEffect, useRef } from "react";
import type { LearningPathForecastDay } from "@/types/api.types";
import {
  barPct,
  forecastDayLabel,
  forecastScaleMax,
  forecastTick,
  formatShortDate,
  loadLabel,
} from "@/features/roadmap/roadmapUtils";

interface WorkloadChartProps {
  forecast: LearningPathForecastDay[];
  /** Trần tải/ngày; ≤ 0 = không vẽ vạch trần. */
  cap: number;
  /** Ngày học hôm nay (chỉ khi đang trong khoảng học) để tô đậm cột. */
  todayIndex: number | null;
}

// Kích thước cố định (px) để % chiều cao cột và vị trí vạch trần tính trên cùng một thang.
const BAR_AREA_PX = 112;
const TICK_PX = 16;

/**
 * Biểu đồ cột thuần CSS của forecast[]: mỗi ngày = thẻ mới (đậm) chồng ôn dự báo (nhạt), vạch trần nét đứt, cột vượt trần
 * tô màu lỗi, hôm nay có viền. Cuộn ngang trên màn hẹp (lộ trình dài tới 365 cột); bảng ẩn cho screen reader.
 */
export const WorkloadChart: React.FC<WorkloadChartProps> = ({ forecast, cap, todayIndex }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLLIElement>(null);

  // Đưa cột hôm nay vào giữa khung: chỉ cuộn ngang khung biểu đồ (không scrollIntoView để trang không nhảy dọc).
  useEffect(() => {
    const box = scrollRef.current;
    const bar = todayRef.current;
    if (!box || !bar) return;
    box.scrollLeft = Math.max(0, bar.offsetLeft - box.clientWidth / 2 + bar.offsetWidth / 2);
  }, [todayIndex, forecast.length]);

  if (forecast.length === 0) return null;
  const max = forecastScaleMax(forecast, cap);
  const capBottom = cap > 0 ? TICK_PX + (barPct(cap, max) / 100) * BAR_AREA_PX : null;
  const overDays = forecast.filter((f) => f.overCap).length;

  return (
    <section
      aria-labelledby="workload-heading"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="workload-heading" className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">bar_chart</span>
          Khối lượng mỗi ngày
        </h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant" aria-label="Chú giải">
          <li className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-primary" /> Mới
          </li>
          <li className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-primary-fixed-dim" /> Ôn dự báo
          </li>
          {cap > 0 && (
            <li className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="w-3 border-t border-dashed border-error" /> Trần {cap} thẻ
            </li>
          )}
          {overDays > 0 && (
            <li className="inline-flex items-center gap-1 text-error font-semibold">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-error" /> {overDays} ngày vượt trần
            </li>
          )}
        </ul>
      </div>

      {/* Phần vẽ ẩn với screen reader; dữ liệu đọc được ở bảng bên dưới. */}
      <div ref={scrollRef} aria-hidden="true" className="overflow-x-auto pb-1 -mx-1 px-1">
        <ol className="relative flex items-end gap-1 min-w-max" style={{ height: BAR_AREA_PX + TICK_PX + 8 }}>
          {capBottom !== null && (
            <li className="absolute left-0 right-0 border-t border-dashed border-error/70 pointer-events-none" style={{ bottom: capBottom }} />
          )}
          {forecast.map((f) => {
            const isToday = f.dayIndex === todayIndex;
            const tick = forecastTick(f.dayIndex, todayIndex);
            return (
              <li
                key={f.dayIndex}
                ref={isToday ? todayRef : undefined}
                title={forecastDayLabel(f, cap)}
                className={`w-4 shrink-0 flex flex-col justify-end rounded-sm ${isToday ? "ring-2 ring-primary bg-primary/5" : ""}`}
              >
                <div className="flex flex-col justify-end" style={{ height: BAR_AREA_PX }}>
                  <div
                    className={`w-full rounded-t-sm ${f.overCap ? "bg-error/50" : "bg-primary-fixed-dim"}`}
                    style={{ height: `${barPct(f.predictedReviews, max)}%` }}
                  />
                  <div className={`w-full ${f.overCap ? "bg-error" : "bg-primary"}`} style={{ height: `${barPct(f.newCount, max)}%` }} />
                </div>
                <span
                  className={`block text-center text-[9px] leading-4 tabular-nums ${isToday ? "font-bold text-primary" : "text-outline"}`}
                  style={{ height: TICK_PX }}
                >
                  {tick}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* sr-only đặt trên div bọc, không trên <table>: bảng bỏ qua width 1px của sr-only nên tràn ngang (nới rộng
          trang ở 375 px); div 1px + overflow hidden giữ nó lại mà trình đọc màn hình vẫn đọc được. */}
      <div className="sr-only">
        <table>
          <caption>Dự báo khối lượng từng ngày</caption>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col">Ngày lịch</th>
              <th scope="col">Thẻ mới</th>
              <th scope="col">Ôn dự báo</th>
              <th scope="col">Tải</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((f) => (
              <tr key={f.dayIndex}>
                <th scope="row">
                  Ngày {f.dayIndex}
                  {f.dayIndex === todayIndex ? " (hôm nay)" : ""}
                </th>
                <td>{formatShortDate(f.date)}</td>
                <td>{f.newCount}</td>
                <td>{Math.round(f.predictedReviews)}</td>
                <td>{loadLabel(f.load, cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
