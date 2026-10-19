import React, { useState, useMemo, useRef, useId, useEffect } from "react";
import gsap from "gsap";
import { useGsap } from "../useGsap.ts";
import {
  niceTicks,
  buildLinePath,
  buildAreaPath,
  periodDelta,
  indexAtX,
  chartWidthFor,
  xLabelStep,
} from "../adminUtils.ts";

export type TrendSeriesKey = "newUsers" | "extractions" | "quizzes";

/** Một chuỗi số liệu của biểu đồ (mặc định 3 chuỗi hoạt động; dashboard OCR truyền bộ chuỗi riêng). */
export interface TrendSeriesMeta<K extends string = string> {
  key: K;
  label: string;
  color: string;
  accentClass?: string;
  dotClass: string;
  /**
   * Đơn vị sau số (vd "%"). Chuỗi có đơn vị là tỉ lệ: thẻ chọn chuỗi không hiện % biến động 7 ngày
   * (cộng dồn tỉ lệ vô nghĩa) và số tiêu đề nên truyền qua summary.
   */
  unit?: string;
  /** Số tiêu đề trên thẻ chọn chuỗi; thiếu = tổng cả kỳ; null = "—". */
  summary?: number | null;
}

/** Một ngày: date + giá trị từng chuỗi (thiếu coi là 0). */
export type TrendRow<K extends string> = { date: string } & Partial<Record<K, number>>;

interface AdminTrendChartProps<K extends string> {
  // NoInfer: K suy từ config (hoặc mặc định), không từ series — tránh suy ra cả khoá "date".
  series: readonly TrendRow<NoInfer<K>>[];
  days: number;
  /** Thiếu = ẩn dải chọn mốc ngày (biểu đồ phụ dùng chung khoảng ngày với biểu đồ chính). */
  onDaysChange?: (days: number) => void;
  isLoading?: boolean;
  /** Bộ chuỗi; thiếu = Đăng ký mới / Bóc tách AI / Lượt quiz như trước. */
  config?: readonly TrendSeriesMeta<K>[];
  title?: string;
  description?: string;
  /** Khoá localStorage nhớ chuỗi đang chọn (mỗi biểu đồ một khoá). */
  storageKey?: string;
}

type SeriesMeta = TrendSeriesMeta<TrendSeriesKey> & { accentClass: string };

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

const DEFAULT_SERIES: readonly TrendSeriesMeta<TrendSeriesKey>[] = Object.values(SERIES_CONFIG);

const DAY_OPTIONS = [7, 14, 30, 60, 90];

// Lớp lưới cho hàng thẻ chọn chuỗi theo số chuỗi (chuỗi lớp viết sẵn để Tailwind quét được).
const CARD_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};
const CARD_GRID_MANY = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

const formatValue = (v: number, unit?: string): string =>
  unit ? `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}${unit}` : v.toLocaleString("vi-VN");

// Kích thước chuẩn đồ họa SVG. Bề rộng thật = bề rộng khung đo được (chartWidthFor, tối đa CHART_W) để 1 đơn vị
// viewBox ≈ 1 px: chữ 11 px vẫn là 11 px trên điện thoại thay vì bị thu nhỏ theo tỉ lệ.
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

/** Giá trị số của một chuỗi trong một ngày; thiếu / không phải số -> 0. */
const valueOf = <K extends string>(p: TrendRow<K>, k: K): number => {
  const v: unknown = p[k];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

export function AdminTrendChart<K extends string = TrendSeriesKey>({
  series,
  days,
  onDaysChange,
  isLoading,
  config,
  title = "Xu hướng hoạt động",
  description = "Dữ liệu thống kê từng ngày trong chuỗi thời gian được chọn.",
  storageKey = "admin.trend.series",
}: AdminTrendChartProps<K>) {
  const cfgList = (config ?? DEFAULT_SERIES) as readonly TrendSeriesMeta<K>[];
  const [selectedSeries, setActiveSeries] = useState<K>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && cfgList.some((c) => c.key === saved)) return saved as K;
    } catch {
      // Bỏ qua lỗi trong private mode
    }
    return cfgList[0].key;
  });
  // Bộ chuỗi đổi (props mới) mà chuỗi đang chọn không còn -> về chuỗi đầu, không render chuỗi rỗng.
  const activeSeries = cfgList.some((c) => c.key === selectedSeries) ? selectedSeries : cfgList[0].key;
  // useId của React có ký tự không hợp lệ trong url(#…) -> chỉ giữ chữ/số để id gradient không đụng biểu đồ khác.
  const gradientId = `trend-gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-${activeSeries}`;

  const handleSelectSeries = (key: K) => {
    setActiveSeries(key);
    try {
      localStorage.setItem(storageKey, key);
    } catch {
      // Bỏ qua
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(CHART_W);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setChartW(chartWidthFor(w, CHART_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentValues = useMemo(
    () => series.map((p) => valueOf(p, activeSeries)),
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
    () => buildLinePath(currentValues, chartW, PLOT_H, yMax),
    [currentValues, chartW, yMax],
  );

  const areaPath = useMemo(
    () => buildAreaPath(linePath, chartW, PLOT_H),
    [linePath, chartW],
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
    const step = xLabelStep(series.length, chartW);
    const labels: { index: number; text: string; x: number }[] = [];
    for (let i = 0; i < series.length; i += step) {
      const x = (i / Math.max(1, series.length - 1)) * chartW;
      labels.push({ index: i, text: shortDate(series[i].date), x });
    }
    // Đảm bảo mốc cuối cùng luôn có
    const lastIdx = series.length - 1;
    if (labels[labels.length - 1]?.index !== lastIdx && lastIdx > 0) {
      labels.push({
        index: lastIdx,
        text: shortDate(series[lastIdx].date),
        x: chartW,
      });
    }
    return labels;
  }, [series, chartW]);

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
      ? (hoverIndex / (series.length - 1)) * chartW
      : 0;
  const activeY =
    activePoint && yMax > 0
      ? PADDING_TOP + PLOT_H - (Math.min(valueOf(activePoint, activeSeries), yMax) / yMax) * PLOT_H
      : PADDING_TOP + PLOT_H;

  const currentCfg = cfgList.find((c) => c.key === activeSeries) ?? cfgList[0];

  return (
    <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md sm:p-space-lg flex flex-col gap-4 shadow-xs">
      {/* Thanh điều khiển: Tiêu đề + Mốc ngày */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-title-md font-bold text-on-surface">
            {title}
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            {description}
          </p>
        </div>

        {/* Dải nút mốc thời gian pill aria-pressed (biểu đồ phụ không có) */}
        {onDaysChange && (
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
        )}
      </div>

      {/* Hàng thẻ phân loại (mặc định Đăng ký mới / Bóc tách / Quiz) */}
      <div
        className={`grid ${CARD_GRID[cfgList.length] ?? CARD_GRID_MANY} gap-3`}
        role="group"
        aria-label="Chọn chuỗi dữ liệu"
      >
        {cfgList.map((cfg) => {
          const key = cfg.key;
          const isSelected = activeSeries === key;
          const totalInPeriod = series.reduce((sum, p) => sum + valueOf(p, key), 0);
          const headline = cfg.summary !== undefined ? cfg.summary : totalInPeriod;
          const delta = days >= 14 && !cfg.unit ? periodDelta(series as unknown as Record<string, unknown>[], key) : null;
          const sparkVals = series.map((p) => valueOf(p, key));
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
                    {headline === null ? "—" : formatValue(headline, cfg.unit)}
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
        aria-label={`Biểu đồ ${currentCfg.label}, dùng phím mũi tên trái phải để xem từng ngày`}
      >
        <svg
          viewBox={`0 0 ${chartW} ${CHART_H}`}
          className="w-full h-auto overflow-visible block"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={gradientId}
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
                  <line x1="0" y1={y} x2={chartW} y2={y} strokeWidth="1" />
                  <text
                    x="4"
                    y={y - 4}
                    fill="#75777f"
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="500"
                    stroke="none"
                  >
                    {formatValue(val, currentCfg.unit)}
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
                fill={`url(#${gradientId})`}
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
                  lbl.index === 0 ? "start" : lbl.x >= chartW - 20 ? "end" : "middle"
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
            width={chartW}
            height={PLOT_H}
            fill="transparent"
            className="cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </svg>

        {/* Tooltip nổi bật hiển thị mọi chỉ số của ngày */}
        {activePoint && hoverIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-xl bg-primary text-on-primary shadow-lg text-body-sm transition-all duration-75 min-w-[170px]"
            style={{
              top: "16px",
              left: `${Math.max(2, Math.min(98, (activeX / chartW) * 100))}%`,
              transform:
                activeX > chartW - 190
                  ? "translateX(calc(-100% - 12px))"
                  : "translateX(12px)",
            }}
          >
            <div className="font-semibold text-label-sm text-surface-container-high border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between gap-4">
              <span>{fullDate(activePoint.date)}</span>
              <span className="text-[10px] opacity-75">#{hoverIndex + 1}</span>
            </div>
            <div className="flex flex-col gap-1">
              {cfgList.map((conf) => {
                const k = conf.key;
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
                    <span>{formatValue(valueOf(activePoint, k), conf.unit)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bảng dữ liệu cho trình đọc màn hình. */}
      {/* sr-only đặt trên div bọc, không trên <table>: bảng bỏ qua width 1px của sr-only nên tràn ngang (nới rộng
          trang ở 375 px); div 1px + overflow hidden giữ nó lại mà trình đọc màn hình vẫn đọc được. */}
      <div className="sr-only">
        <table>
          <caption>
            Bảng số liệu {title.toLowerCase()} {days} ngày gần nhất ({cfgList.map((c) => c.label).join(", ")})
          </caption>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              {cfgList.map((c) => (
                <th key={c.key} scope="col">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                {cfgList.map((c) => (
                  <td key={c.key}>{formatValue(valueOf(p, c.key), c.unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
