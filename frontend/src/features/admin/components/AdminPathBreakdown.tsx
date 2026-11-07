import React from "react";
import type { PathBreakdownKey, PathBreakdownView } from "../adminUtils.ts";
import { formatRate, formatReaction } from "@/lib/pathEffect";
import type { AdminPathEffect, PathEffectWindow } from "@/types/api.types";

// Màu theo nhóm, cùng bảng màu với "Cơ cấu Bóc tách AI": hoàn thành xanh lá, thất bại đỏ, phần thoáng qua xám.
const SEGMENT_COLOR: Record<PathBreakdownKey, string> = {
  active: "bg-primary-container",
  completed: "bg-secondary",
  draft: "bg-primary-fixed-dim",
  failed: "bg-error",
  processing: "bg-surface-container-highest",
};

/**
 * Thẻ "Lộ trình học tập" (stats.learningPathBreakdown) — cùng khung với ba thẻ của AdminBreakdown nhưng chiếm cả hàng từ lg:
 * 5 mục chú giải trong 1/3 khung (≈270 px ở 1280 px) sẽ cắt nhãn như lỗi cũ của thẻ bóc tách. Chú giải: 1 cột ở điện thoại,
 * 2 cột từ sm, 3 cột ở lg (khung ≈720 px khi có sidebar), 5 cột từ xl. Nhãn được xuống dòng, số luôn một dòng ở mép phải.
 */
export const AdminPathBreakdown: React.FC<{ view: PathBreakdownView; effect?: AdminPathEffect; className?: string }> = ({
  view,
  effect,
  className = "",
}) => {
  const { total, segments, remedial, remedialPct } = view;
  const barLabel = segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ${s.pct}%`)
    .join(", ");

  return (
    <div
      className={`rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md flex flex-col justify-between shadow-xs ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-headline-sm text-title-md font-bold text-on-surface">Lộ trình học tập</h3>
          <span className="text-label-sm font-semibold text-outline whitespace-nowrap">
            Tổng {total.toLocaleString("vi-VN")}
          </span>
        </div>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Trạng thái các lộ trình người học đã tạo.</p>

        <div
          role="img"
          className="mt-4 h-3.5 w-full rounded-full bg-surface-container-low overflow-hidden flex"
          aria-label={total > 0 ? `Cơ cấu lộ trình: ${barLabel}` : "Chưa có lộ trình nào"}
        >
          {segments.map(
            (s) =>
              s.value > 0 && (
                <div
                  key={s.key}
                  style={{ width: `${s.pct}%` }}
                  className={`${SEGMENT_COLOR[s.key]} transition-all duration-500`}
                  title={`${s.label}: ${s.value} (${s.pct}%)`}
                />
              )
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-surface-container-high grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-2 text-label-sm">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEGMENT_COLOR[s.key]}`} />
            <span className="min-w-0 text-on-surface-variant">{s.label}:</span>
            <span className={`font-bold ml-auto whitespace-nowrap ${s.key === "failed" && s.value > 0 ? "text-error" : "text-on-surface"}`}>
              {s.value.toLocaleString("vi-VN")} ({s.pct}%)
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-surface-container-high text-label-sm text-outline flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-on-surface-variant font-medium">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">healing</span>
          Bổ khuyết điểm yếu:
          <span className="font-bold text-on-surface whitespace-nowrap">
            {remedial.toLocaleString("vi-VN")} ({remedialPct}%)
          </span>
        </span>
        <span>· đã tính trong Đang học / Hoàn thành.</span>
      </div>

      {/* B3: lượt ôn trong lộ trình so với ôn ngoài lộ trình, cùng cửa sổ ngày của Tổng quan; lượt học nhanh không tính */}
      {effect && (effect.inPath.reviews > 0 || effect.outside.reviews > 0) && (
        <div className="mt-3 pt-3 border-t border-surface-container-high grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-label-sm">
          <EffectLine label="Ôn trong lộ trình" w={effect.inPath} />
          <EffectLine label="Ôn ngoài lộ trình" w={effect.outside} />
        </div>
      )}
    </div>
  );
};

const EffectLine: React.FC<{ label: string; w: PathEffectWindow }> = ({ label, w }) => (
  <p className="text-on-surface-variant">
    <span className="font-medium">{label}:</span>{" "}
    <span className="font-bold text-on-surface whitespace-nowrap">{w.reviews.toLocaleString("vi-VN")} lượt</span>
    <span className="whitespace-nowrap"> · “Lại” {formatRate(w.againRate)}</span>
    <span className="whitespace-nowrap"> · phản xạ {formatReaction(w.medianReactionMs)}</span>
  </p>
);
