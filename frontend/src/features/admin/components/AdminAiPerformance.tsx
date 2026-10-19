import React from "react";
import {
  formatPct,
  formatSeconds,
  type AiEngineRow,
  type EngineHealthItem,
  type EnrichSummary,
} from "../moderationUtils.ts";

interface AdminAiPerformanceProps {
  engines: AiEngineRow[];
  enrich: EnrichSummary | null;
  health: EngineHealthItem[];
}

/** Ngưỡng tô đỏ tỉ lệ thất bại / tin cậy thấp: trên mức này engine đáng xem lại cấu hình (ngưỡng OCR, quota Gemini). */
const FAIL_WARN_PCT = 20;

const EngineHealthGrid: React.FC<{ items: EngineHealthItem[] }> = ({ items }) => {
  const okCount = items.filter((i) => i.ok).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-on-surface">Thành phần ai-service</h3>
        <span className={`text-label-sm font-semibold ${okCount === items.length ? "text-secondary" : "text-error"}`}>
          {okCount}/{items.length} sẵn sàng
        </span>
      </div>
      {/* Màu chấm không phải tín hiệu duy nhất: mục chưa sẵn sàng có chữ đỏ, mục ổn có chữ ẩn cho trình đọc màn hình. */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-body-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 min-w-0" title={i.key}>
            <span
              aria-hidden="true"
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${i.ok ? "bg-secondary" : "bg-error"}`}
            />
            <span className={`truncate ${i.ok ? "text-on-surface" : "text-error font-semibold"}`}>{i.label}</span>
            {i.ok ? (
              <span className="sr-only">: sẵn sàng</span>
            ) : (
              <span className="text-label-sm text-error shrink-0">chưa sẵn sàng</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * "Hiệu suất mô hình AI" (§8): bảng theo engine đọc văn bản, tóm tắt bước dịch nghĩa và cờ thành phần ai-service.
 * Mỗi phần tự ẩn khi backend chưa trả dữ liệu tương ứng.
 */
export const AdminAiPerformance: React.FC<AdminAiPerformanceProps> = ({ engines, enrich, health }) => (
  <section
    aria-labelledby="admin-ai-perf-title"
    className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md sm:p-space-lg flex flex-col gap-4 shadow-xs"
  >
    <div>
      <h2 id="admin-ai-perf-title" className="font-headline-sm text-title-md font-bold text-on-surface">
        Hiệu suất mô hình AI
      </h2>
      <p className="text-body-sm text-on-surface-variant">
        Chất lượng bước đọc văn bản theo từng engine và bước dịch nghĩa tiếng Việt.
      </p>
    </div>

    {engines.length > 0 && (
      <div className="overflow-x-auto rounded-xl border border-surface-container-high">
        <table className="w-full text-body-sm [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:text-label-sm [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-outline [&_th]:font-bold [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high">
          <caption className="sr-only">Hiệu suất từng engine đọc văn bản</caption>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col" className="text-right">Lượt</th>
              <th scope="col" className="text-right">Thất bại</th>
              <th scope="col" className="text-right">Tin cậy thấp</th>
              <th scope="col" className="text-right">Tin cậy TB</th>
              <th scope="col" className="text-right">Thời gian TB</th>
            </tr>
          </thead>
          <tbody>
            {engines.map((e) => (
              <tr key={e.engine}>
                <th scope="row" className="!normal-case !tracking-normal !text-body-sm !text-on-surface !font-semibold whitespace-nowrap">
                  {e.label}
                  {e.label !== e.engine && <span className="ml-1.5 font-mono text-label-sm text-outline font-normal">{e.engine}</span>}
                </th>
                <td className="text-right font-mono">{e.total.toLocaleString("vi-VN")}</td>
                <td
                  className={`text-right font-mono whitespace-nowrap ${
                    (e.failedPct ?? 0) >= FAIL_WARN_PCT ? "text-error font-semibold" : ""
                  }`}
                  title={`${e.failed}/${e.total} lượt thất bại`}
                >
                  {formatPct(e.failedPct)}
                </td>
                <td
                  className={`text-right font-mono whitespace-nowrap ${
                    (e.lowPct ?? 0) >= FAIL_WARN_PCT ? "text-error font-semibold" : ""
                  }`}
                  title={`${e.lowConfidence}/${e.total} lượt tin cậy thấp`}
                >
                  {formatPct(e.lowPct)}
                </td>
                <td className="text-right font-mono">{formatPct(e.avgConfidencePct)}</td>
                <td className="text-right font-mono whitespace-nowrap">{formatSeconds(e.avgSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {enrich && (
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-on-surface">Dịch nghĩa tiếng Việt</h3>
          <span className="text-body-sm text-on-surface-variant">
            <strong className="text-on-surface">{enrich.enriched.toLocaleString("vi-VN")}</strong>/
            {enrich.total.toLocaleString("vi-VN")} lượt thành công · {formatPct(enrich.enrichedPct)}
          </span>
        </div>
        <div
          className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden"
          role="img"
          aria-label={`Dịch nghĩa thành công ${formatPct(enrich.enrichedPct)}`}
        >
          <div style={{ width: `${enrich.enrichedPct ?? 0}%` }} className="h-full bg-secondary rounded-full transition-all duration-500" />
        </div>
        <div className="flex flex-wrap gap-2 text-label-sm">
          <span className={`px-2 py-0.5 rounded-full border ${enrich.quota > 0 ? "border-error/30 bg-error/10 text-error font-semibold" : "border-surface-container-high text-on-surface-variant"}`}>
            Hết quota: {enrich.quota.toLocaleString("vi-VN")}
          </span>
          <span className={`px-2 py-0.5 rounded-full border ${enrich.error > 0 ? "border-error/30 bg-error/10 text-error font-semibold" : "border-surface-container-high text-on-surface-variant"}`}>
            Lỗi: {enrich.error.toLocaleString("vi-VN")}
          </span>
          {enrich.other > 0 && (
            <span className="px-2 py-0.5 rounded-full border border-surface-container-high text-on-surface-variant">
              Khác: {enrich.other.toLocaleString("vi-VN")}
            </span>
          )}
        </div>
      </div>
    )}

    {health.length > 0 && (
      <div className="pt-3 border-t border-surface-container-high">
        <EngineHealthGrid items={health} />
      </div>
    )}
  </section>
);
