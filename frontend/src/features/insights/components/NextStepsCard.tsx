import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/lib/useAsync";
import { dayKey } from "@/lib/learningStats";
import { NEXT_STEP_META, nextStepCountLabel } from "@/lib/insightUtils";
import { fetchNextSteps } from "@/services/insightService";
import type { NextStepKind } from "@/types/api.types";

interface NextStepsCardProps {
  /** Bản gọn cho Tổng quan: tối đa 3 mục, ẩn hẳn khi đang tải / lỗi / không có gợi ý (không chiếm chỗ như TodayPathWidget). */
  compact?: boolean;
  /** Loại đã có widget riêng trên cùng trang (vd. TodayPathWidget hiện phiên hôm nay / học bù) -> không lặp lại. */
  exclude?: readonly NextStepKind[];
}

const COMPACT_LIMIT = 3;

const KIND_TONE: Record<NextStepKind, string> = {
  path_today: "bg-primary/10 text-primary",
  due: "bg-secondary-container/50 text-on-secondary-container",
  catchup: "bg-[#FEF3C7] text-[#B45309]",
  remedial: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  next_chapter: "bg-primary-fixed text-on-primary-fixed",
  library: "bg-surface-container text-on-surface-variant",
};

// F3 "Học gì tiếp": danh sách gợi ý server đã sắp theo ưu tiên (phiên hôm nay -> đến hạn -> nợ -> bổ khuyết -> chương kế ->
// Thư viện). Mỗi mục là một link tới đúng chỗ làm việc đó; thứ tự là thông tin nên dùng <ol>.
export const NextStepsCard: React.FC<NextStepsCardProps> = ({ compact = false, exclude }) => {
  const headingId = useId();
  const [reload, setReload] = useState(0);
  // Ngày máy khách nằm trong deps: để tab mở qua nửa đêm, lần render kế tiếp tải lại theo ngày mới.
  const today = dayKey(new Date());
  const { data, error, loading } = useAsync(() => fetchNextSteps(today), [today, reload]);
  const items = (data ?? []).filter((i) => !exclude?.includes(i.kind));
  const shown = compact ? items.slice(0, COMPACT_LIMIT) : items;

  if (compact && (loading || error || items.length === 0)) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">explore</span>
          Học gì tiếp
        </h2>
        {compact && items.length > COMPACT_LIMIT && (
          <Link to="/roadmap" className="text-label-md text-primary hover:underline">
            Xem tất cả ({items.length})
          </Link>
        )}
      </div>

      {loading ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Đang tải gợi ý...</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Không tải được gợi ý: {error}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="underline font-semibold">
            Thử lại
          </button>
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-secondary">task_alt</span>
          <span>Không còn việc gì đang chờ. Hãy tạo lộ trình mới hoặc khám phá Thư viện cộng đồng.</span>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {shown.map((item, i) => {
            const meta = NEXT_STEP_META[item.kind];
            return (
              <li key={`${item.kind}-${item.to}-${i}`}>
                <Link
                  to={item.to}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[20px] w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${KIND_TONE[item.kind]}`}
                  >
                    {meta.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-label-sm text-on-surface-variant">{meta.label}</span>
                    <span className="block text-body-md font-semibold text-on-surface break-words group-hover:text-primary">{item.title}</span>
                  </span>
                  {item.count > 0 && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface-container-lowest border border-surface-container-high text-label-sm font-semibold text-on-surface-variant tabular-nums whitespace-nowrap">
                      {nextStepCountLabel(item)}
                    </span>
                  )}
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-outline shrink-0">
                    chevron_right
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
