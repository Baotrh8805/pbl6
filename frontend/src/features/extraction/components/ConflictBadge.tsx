import React, { useId, useState } from "react";
import type { ItemConflict } from "@/types/learner.types";
import { conflictBadgeLabel, conflictComparison, conflictFieldLabel, conflictTooltip } from "../conflictUtils";

interface ConflictBadgeProps {
  conflicts: ItemConflict[];
  /** Thuật ngữ của item, để trình đọc màn hình nói rõ cảnh báo thuộc từ nào. */
  term?: string;
}

// Badge "tài liệu nói khác nguồn chuẩn" (F2). Tooltip (title) cho chuột; bấm để mở khung chi tiết ngay dưới dòng vì
// tooltip không dùng được trên cảm ứng / bàn phím. Khung chi tiết là phần tử `basis-full` nên đặt badge trong hàng
// flex-wrap thì khung tự xuống dòng riêng, không đẩy lệch hàng trên màn 375 px.
export const ConflictBadge: React.FC<ConflictBadgeProps> = ({ conflicts, term }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (conflicts.length === 0) return null;
  const label = conflictBadgeLabel(conflicts);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={conflicts.map(conflictTooltip).join("\n\n")}
        className="inline-flex items-center gap-0.5 max-w-full px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[13px]">warning</span>
        <span className="sr-only">{`Mâu thuẫn với nguồn chuẩn${term ? ` ở ${term}` : ""}: `}</span>
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="note"
          className="basis-full w-full min-w-0 p-2 rounded-lg bg-amber-50 border border-amber-200 text-label-sm text-on-surface flex flex-col gap-1.5"
        >
          {conflicts.map((c, i) => (
            <div key={`${c.field}-${i}`} className="min-w-0">
              <p className="font-semibold text-amber-900">{conflictFieldLabel(c.field)}</p>
              <p className="break-words">{conflictComparison(c)}</p>
              {c.noteVi && <p className="text-on-surface-variant break-words">{c.noteVi}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
