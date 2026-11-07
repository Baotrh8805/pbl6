import React, { useMemo } from "react";
import { AdminTrendChart, type TrendSeriesMeta } from "./AdminTrendChart.tsx";
import { ocrOverallErrorPct, type OcrChartRow } from "../moderationUtils.ts";

type OcrKey = Exclude<keyof OcrChartRow, "date">;

interface AdminOcrChartProps {
  rows: OcrChartRow[];
  days: number;
  isLoading?: boolean;
}

/**
 * Biểu đồ tỉ lệ lỗi OCR theo ngày (§8 ocrSeries), dùng lại AdminTrendChart với bộ chuỗi riêng.
 * Không có dải chọn ngày: dùng chung khoảng ngày với biểu đồ hoạt động phía trên (cùng một lần gọi /admin/stats).
 */
export const AdminOcrChart: React.FC<AdminOcrChartProps> = ({ rows, days, isLoading }) => {
  const config = useMemo<TrendSeriesMeta<OcrKey>[]>(
    () => [
      {
        key: "errorPct",
        label: "Tỉ lệ lỗi OCR",
        color: "#ba1a1a",
        dotClass: "bg-error",
        unit: "%",
        // Tỉ lệ cả kỳ theo trọng số số lượt: ngày không có lượt OCR không kéo tỉ lệ về 0.
        summary: ocrOverallErrorPct(rows),
      },
      { key: "ocrJobs", label: "Lượt OCR", color: "#1b2a4a", dotClass: "bg-primary-container" },
      { key: "failed", label: "Thất bại", color: "#ff546a", dotClass: "bg-on-tertiary-container" },
      { key: "geminiFallback", label: "Chuyển sang Gemini", color: "#006c4a", dotClass: "bg-secondary" },
      { key: "lowConfidence", label: "Tin cậy thấp", color: "#75777f", dotClass: "bg-outline" },
    ],
    [rows]
  );

  return (
    <AdminTrendChart<OcrKey>
      series={rows}
      days={days}
      isLoading={isLoading}
      config={config}
      title="Chất lượng OCR"
      description={`Tỉ lệ lỗi và lượt chuyển sang Gemini mỗi ngày, cùng khoảng ${days} ngày với biểu đồ trên.`}
      storageKey="admin.ocr.series"
    />
  );
};
