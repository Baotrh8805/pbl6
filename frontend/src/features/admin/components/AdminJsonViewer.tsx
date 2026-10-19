import React, { useState } from "react";
import { summarizeJson } from "../adminUtils.ts";

export interface AdminJsonViewerProps {
  data: unknown;
  maxSummaryLength?: number;
  /** Bề rộng tối đa của dòng tóm tắt (bảng nhiều cột truyền hẹp hơn để vừa khung). */
  summaryClassName?: string;
}

/**
 * ponytail: Dùng thẻ native details/summary thay vì cài thư viện react-json-view (tiết kiệm ~45 kB bundle).
 */
export const AdminJsonViewer: React.FC<AdminJsonViewerProps> = ({
  data,
  maxSummaryLength = 60,
  summaryClassName = "max-w-[240px] sm:max-w-md",
}) => {
  const [copied, setCopied] = useState(false);

  if (data === null || data === undefined || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return <span className="text-outline text-label-sm italic">—</span>;
  }

  const jsonString = JSON.stringify(data, null, 2);
  const summary = summarizeJson(data, maxSummaryLength);

  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(jsonString).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <details className="group rounded-lg border border-surface-container-high bg-surface-container-low/40 p-1.5 text-label-sm transition-all">
      <summary className="flex items-center justify-between gap-2 cursor-pointer select-none font-mono text-outline hover:text-on-surface">
        <span className={`truncate min-w-0 ${summaryClassName} font-mono`} title={jsonString}>
          {summary}
        </span>
        <span className="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={copyToClipboard}
            className="text-label-sm px-1.5 py-0.5 rounded border border-outline-variant hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Sao chép JSON"
            aria-label="Sao chép JSON"
          >
            {copied ? "Đã chép!" : "Sao chép"}
          </button>
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[16px] text-outline group-open:rotate-180 transition-transform"
          >
            expand_more
          </span>
        </span>
      </summary>
      <pre className="mt-2 p-2 bg-surface-container-lowest rounded border border-surface-container-high overflow-x-auto text-on-surface font-mono text-label-sm leading-relaxed max-h-64 scrollbar-none">
        {jsonString}
      </pre>
    </details>
  );
};
