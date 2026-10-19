import React, { useState, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGsap } from "../useGsap.ts";
import {
  niceTicks,
  buildLinePath,
  buildAreaPath,
  periodDelta,
  indexAtX,
} from "../adminUtils.ts";

export type TrendSeriesKey = "newUsers" | "extractions" | "quizzes";

export interface TrendPoint {
  date: string;
  newUsers: number;
  extractions: number;
  quizzes: number;
}

interface AdminTrendChartProps {
  series: TrendPoint[];
  days: number;
  onDaysChange: (days: number) => void;
  isLoading?: boolean;
}

interface SeriesMeta {
  key: TrendSeriesKey;
  label: string;
  color: string;
  accentClass: string;
  dotClass: string;
}

const SERIES_CONFIG: Record<TrendSeriesKey, SeriesMeta> = {
  newUsers: {
    key: "newUsers",
    label: "Đăng ký mới",
    color: "#1b2a4a",
    accentClass: "text-primary-container border-primary-container/40",
    dotClass: "bg-primary-container",
  },
  extractions: {
    key: "extractions",
    label: "Bóc tách AI",
    color: "#006c4a",
    accentClass: "text-secondary border-secondary/40",
    dotClass: "bg-secondary",
  },
  quizzes: {
    key: "quizzes",
    label: "Lượt quiz",
    color: "#ff546a",
    accentClass: "text-on-tertiary-container border-on-tertiary-container/40",
    dotClass: "bg-on-tertiary-container",
  },
};

const DAY_OPTIONS = [7, 14, 30, 60, 90];

// Kích thước chuẩn đồ họa SVG
const CHART_W = 800;
const CHART_H = 220;
const PADDING_TOP = 15;
const PADDING_BOTTOM = 25;
const PLOT_H = CHART_H - PADDING_TOP - PADDING_BOTTOM;

const parseDateParts = (iso: string) => {
  const [y, m, d] = (iso || "").split("-");
  return { d: d || "", m: m || "", y: y || "" };
};

const shortDate = (iso: string) => {
  const { d, m } = parseDateParts(iso);
  return `${d}/${m}`;
};

const fullDate = (iso: string) => {
  const { d, m, y } = parseDateParts(iso);
  return `${d}/${m}/${y}`;
};

export const AdminTrendChart: React.FC<AdminTrendChartProps> = ({
  series,
  days,
  onDaysChange,
  isLoading,
}) => {
  const [activeSeries, setActiveSeries] = useState<TrendSeriesKey>(() => {
    try {
      const saved = localStorage.getItem("admin.trend.series");
      if (saved && saved in SERIES_CONFIG) return saved as TrendSeriesKey;
    } catch {
      // Bỏ qua lỗi trong private mode
    }
    return "newUsers";
  });

  const handleSelectSeries = (key: TrendSeriesKey) => {
    setActiveSeries(key);
    try {
      localStorage.setItem("admin.trend.series", key);
    } catch {
      // Bỏ qua
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const currentValues = useMemo(
    () => series.map((p) => p[activeSeries] || 0),
    [series, activeSeries],
  );

  const rawMax = useMemo(
    () => currentValues.reduce((m, v) => (v > m ? v : m), 0),
    [currentValues],
  );

  const yTicks = useMemo(() => niceTicks(rawMax, 3), [rawMax]);
  const yMax = yTicks[yTicks.length - 1] || 1;

  // Tính đường line & area
  const linePath = useMemo(
    () => buildLinePath(currentValues, CHART_W, PLOT_H, yMax),
    [currentValues, yMax],
  );

  const areaPath = useMemo(
    () => buildAreaPath(linePath, CHART_W, PLOT_H),
    [linePath],
  );

  // Hiệu ứng GSAP: vẽ nét mượt mà khi đường line thay đổi + area fade-in nhẹ
  useGsap(
    chartContainerRef,
    () => {
      const pathEl = chartContainerRef.current?.querySelector(".admin-trend-line") as SVGPathElement | null;
      const areaEl = chartContainerRef.current?.querySelector(".admin-trend-area") as SVGPathElement | null;

      if (pathEl && typeof pathEl.getTotalLength === "function") {
        try {
          const len = pathEl.getTotalLength();
          if (len > 0) {
            gsap.fromTo(
              pathEl,
              { strokeDasharray: len, strokeDashoffset: len },
              { strokeDashoffset: 0, duration: 0.65, ease: "power2.out" },
            );
          }
        } catch {
          // Bỏ qua nếu svg không đo được
        }
      }

      if (areaEl) {
        gsap.fromTo(
          areaEl,
          { opacity: 0 },
          { opacity: 1, duration: 0.5, delay: 0.15, ease: "power1.out" },
        );
      }
    },
    [activeSeries, days, linePath],
  );

  // Tính các mốc nhãn X (cách nhau N ngày)
  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const step = Math.max(1, Math.ceil(series.length / 6));
    const labels: { index: number; text: string; x: number }[] = [];
    for (let i = 0; i < series.length; i += step) {
      const x = (i / Math.max(1, series.length - 1)) * CHART_W;
      labels.push({ index: i, text: shortDate(series[i].date), x });
    }
    // Đảm bảo mốc cuối cùng luôn có
    const lastIdx = series.length - 1;
    if (labels[labels.length - 1]?.index !== lastIdx && lastIdx > 0) {
      labels.push({
        index: lastIdx,
        text: shortDate(series[lastIdx].date),
        x: CHART_W,
      });
    }
    return labels;
  }, [series]);

  // Xử lý hover
  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (series.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = indexAtX(x, rect.width, series.length);
    setHoverIndex(idx);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (series.length === 0) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIndex((prev) => (prev === null || prev === 0 ? series.length - 1 : prev - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHoverIndex((prev) => (prev === null || prev === series.length - 1 ? 0 : prev + 1));
    } else if (e.key === "Escape") {
      setHoverIndex(null);
    }
  };

  // Tọa độ điểm active
  const activePoint = hoverIndex !== null && series[hoverIndex] ? series[hoverIndex] : null;
  const activeX =
    hoverIndex !== null && series.length > 1
      ? (hoverIndex / (series.length - 1)) * CHART_W
      : 0;
  const activeY =
    activePoint && yMax > 0
      ? PADDING_TOP + PLOT_H - (Math.min(activePoint[activeSeries], yMax) / yMax) * PLOT_H
      : PADDING_TOP + PLOT_H;

  const currentCfg = SERIES_CONFIG[activeSeries];

  return (
    <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md sm:p-space-lg flex flex-col gap-4 shadow-xs">
      {/* Thanh điều khiển: Tiêu đề + Mốc ngày */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-title-md font-bold text-on-surface">
            Xu hướng hoạt động
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Dữ liệu thống kê từng ngày trong chuỗi thời gian được chọn.
          </p>
        </div>

        {/* Dải nút mốc thời gian pill aria-pressed */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-surface-container-high self-start sm:self-auto"
          role="group"
          aria-label="Khoảng thời gian"
        >
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => onDaysChange(d)}
              disabled={isLoading}
              className={`px-2.5 py-1 rounded-lg text-label-sm font-semibold transition-all cursor-pointer ${
                days === d
                  ? "bg-primary text-on-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {/* Hàng 3 thẻ phân loại (Đăng ký mới / Bóc tách / Quiz) */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        role="group"
        aria-label="Chọn chuỗi dữ liệu"
      >
        {(Object.keys(SERIES_CONFIG) as TrendSeriesKey[]).map((key) => {
          const cfg = SERIES_CONFIG[key];
          const isSelected = activeSeries === key;
          const totalInPeriod = series.reduce((sum, p) => sum + (p[key] || 0), 0);
          const delta = days >= 14 ? periodDelta(series, key) : null;
          const sparkVals = series.map((p) => p[key] || 0);
          const sparkMax = sparkVals.reduce((m, v) => (v > m ? v : m), 0);
          const sparkPath = buildLinePath(sparkVals, 60, 20, sparkMax);

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelectSeries(key)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex items-center justify-between gap-3 ${
                isSelected
                  ? `border-primary bg-surface-container-low shadow-xs ring-2 ring-primary/20`
                  : `border-surface-container-high bg-surface-container-lowest hover:border-outline-variant hover:bg-surface-container-low/40`
              }`}
            >
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`w-2.5 h-2.5 rounded-full ${cfg.dotClass}`}
                  />
                  <span className="text-body-sm font-semibold text-on-surface truncate">
                    {cfg.label}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                    {totalInPeriod.toLocaleString("vi-VN")}
                  </span>
                  {delta && delta.pct !== null && (
                    <span
                      className={`text-label-sm font-semibold ${
                        delta.pct > 0
                          ? "text-secondary"
                          : delta.pct < 0
                            ? "text-error"
                            : "text-outline"
                      }`}
                      title={`7 ngày qua: ${delta.last7} so với ${delta.prev7} tuần trước`}
                    >
                      {delta.pct > 0 ? `+${delta.pct}%` : `${delta.pct}%`}
                    </span>
                  )}
                </div>
              </div>

              {/* Sparkline mini 60x20 */}
              <div className="shrink-0" aria-hidden="true">
                <svg width="60" height="20" className="overflow-visible">
                  <path
                    d={sparkPath}
                    fill="none"
                    stroke={cfg.color}
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isSelected ? "1" : "0.6"}
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Biểu đồ chi tiết SVG */}
      <div
        ref={chartContainerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative w-full rounded-xl bg-surface-container-low/40 border border-surface-container-high/60 p-2 sm:p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none overflow-hidden"
        aria-label={`Biểu đồ xu hướng ${currentCfg.label}, dùng phím mũi tên trái phải để xem từng ngày`}
      >
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-auto overflow-visible block"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`trend-gradient-${activeSeries}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={currentCfg.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={currentCfg.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Vạch lưới Y và nhãn Y */}
          <g className="grid-lines" stroke="#dce9ff" strokeDasharray="3 3">
            {yTicks.map((val) => {
              const y =
                yMax > 0
                  ? PADDING_TOP + PLOT_H - (val / yMax) * PLOT_H
                  : PADDING_TOP + PLOT_H;
              return (
                <g key={val}>
                  <line x1="0" y1={y} x2={CHART_W} y2={y} strokeWidth="1" />
                  <text
                    x="4"
                    y={y - 4}
                    fill="#75777f"
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="500"
                    stroke="none"
                  >
                    {val.toLocaleString("vi-VN")}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Vùng diện tích (Area) và đường nét (Line) */}
          <g transform={`translate(0, ${PADDING_TOP})`}>
            {areaPath && (
              <path
                d={areaPath}
                fill={`url(#trend-gradient-${activeSeries})`}
                className="admin-trend-area"
              />
            )}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={currentCfg.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="admin-trend-line"
              />
            )}
          </g>

          {/* Nhãn trục X */}
          <g className="x-labels">
            {xLabels.map((lbl) => (
              <text
                key={lbl.index}
                x={lbl.x}
                y={CHART_H - 4}
                textAnchor={
                  lbl.index === 0 ? "start" : lbl.x >= CHART_W - 20 ? "end" : "middle"
                }
                fill="#75777f"
                fontSize="11"
                fontFamily="Inter, sans-serif"
                fontWeight="500"
              >
                {lbl.text}
              </text>
            ))}
          </g>

          {/* Crosshair khi hover */}
          {activePoint && hoverIndex !== null && (
            <g className="crosshair-group">
              <line
                x1={activeX}
                y1={PADDING_TOP}
                x2={activeX}
                y2={PADDING_TOP + PLOT_H}
                stroke="#041534"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.4"
              />
              <circle
                cx={activeX}
                cy={activeY}
                r="5"
                fill={currentCfg.color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Vùng cảm ứng chuột trong suốt */}
          <rect
            x="0"
            y={PADDING_TOP}
            width={CHART_W}
            height={PLOT_H}
            fill="transparent"
            className="cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </svg>

        {/* Tooltip nổi bật hiển thị cả 3 chỉ số */}
        {activePoint && hoverIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-xl bg-primary text-on-primary shadow-lg text-body-sm transition-all duration-75 min-w-[170px]"
            style={{
              top: "16px",
              left: `${Math.max(2, Math.min(98, (activeX / CHART_W) * 100))}%`,
              transform:
                activeX > CHART_W - 190
                  ? "translateX(calc(-100% - 12px))"
                  : "translateX(12px)",
            }}
          >
            <div className="font-semibold text-label-sm text-surface-container-high border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between gap-4">
              <span>{fullDate(activePoint.date)}</span>
              <span className="text-[10px] opacity-75">#{hoverIndex + 1}</span>
            </div>
            <div className="flex flex-col gap-1">
              {(Object.keys(SERIES_CONFIG) as TrendSeriesKey[]).map((k) => {
                const conf = SERIES_CONFIG[k];
                const isCur = activeSeries === k;
                return (
                  <div
                    key={k}
                    className={`flex items-center justify-between gap-3 text-label-sm ${
                      isCur ? "font-bold text-white scale-[1.02]" : "text-white/80"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${conf.dotClass}`}
                      />
                      <span>{conf.label}:</span>
                    </div>
                    <span>{(activePoint[k] || 0).toLocaleString("vi-VN")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bảng dữ liệu ngữ nghĩa ẩn cho Screen Reader */}
      <table className="sr-only">
        <caption>
          Bảng số liệu xu hướng hệ thống {days} ngày gần nhất (Đăng ký mới, Bóc tách, Lượt quiz)
        </caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Đăng ký mới</th>
            <th scope="col">Bóc tách AI</th>
            <th scope="col">Lượt quiz</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.newUsers}</td>
              <td>{p.extractions}</td>
              <td>{p.quizzes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
