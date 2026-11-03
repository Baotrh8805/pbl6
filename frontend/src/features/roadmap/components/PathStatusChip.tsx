import React from "react";
import type { LearningPathStatus } from "@/types/api.types";
import { pathStatusLabel } from "../roadmapUtils";

const TONE: Record<LearningPathStatus, string> = {
  PROCESSING: "bg-blue-50 text-blue-700 border border-blue-200",
  DRAFT: "bg-slate-100 text-slate-700 border border-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 border border-rose-200",
};

/**
 * completed: lộ trình ACTIVE đã bấm "Hoàn thành" (completedAt) -> chip "Đã hoàn thành" THAY cho "Đang học" (server giữ
 * status ACTIVE vì bộ thẻ và lịch ôn vẫn chạy); trước đây hai chip "Đang học" + "Đã hoàn thành" hiện cạnh nhau.
 */
export const PathStatusChip: React.FC<{ status: LearningPathStatus; completed?: boolean }> = ({ status, completed = false }) => {
  const done = status === "ACTIVE" && completed;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        done ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : TONE[status]
      }`}
    >
      {status === "PROCESSING" && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {done && (
        <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
          verified
        </span>
      )}
      {pathStatusLabel(status, completed)}
    </span>
  );
};

/** Lộ trình bổ khuyết (sourceType "remedial"): dựng từ thẻ bạn hay quên / sai, không có tài liệu nguồn. */
export const RemedialChip: React.FC = () => (
  <span
    title="Lộ trình bổ khuyết dựng từ các thẻ bạn hay quên, nhớ chậm hoặc làm sai"
    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">healing</span>
    Bổ khuyết
  </span>
);
