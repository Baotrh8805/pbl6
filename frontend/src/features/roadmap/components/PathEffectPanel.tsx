import React from "react";
import { useAsync } from "@/lib/useAsync";
import { fetchPathEffect } from "@/services/insightService";
import {
  TREND_LABEL,
  againTrend,
  barPct,
  formatRate,
  formatReaction,
  type Trend,
} from "@/lib/pathEffect";
import type { PathEffectStats, PathEffectWindow } from "@/types/api.types";

// Khung "Hiệu quả học" của lộ trình đang học (kế hoạch 2026-10-26 B3): 4 số tổng, bảng theo chương, và hai thanh so tỷ lệ "Lại"
// trước / sau khi tạo lộ trình bổ khuyết. reloadKey đổi (vd. số lượt ôn trong shell) -> tải lại ngầm, giữ số cũ khi đang tải.
export const PathEffectPanel: React.FC<{ pathId: string; reloadKey?: number }> = ({ pathId, reloadKey = 0 }) => {
  const effect = useAsync(() => fetchPathEffect(pathId), [pathId], reloadKey);

  return (
    <section
      aria-labelledby="path-effect-title"
      className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md shadow-xs flex flex-col gap-4"
    >
      <div>
        <h2 id="path-effect-title" className="font-headline-sm text-title-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">insights</span>
          Hiệu quả học
        </h2>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Tính từ các lượt ôn trong lộ trình này. Lượt học nhanh không tính.
        </p>
      </div>

      {effect.error ? (
        <p role="alert" className="text-body-sm text-error">{effect.error}</p>
      ) : !effect.data ? (
        <p className="text-body-sm text-on-surface-variant">Đang tải…</p>
      ) : effect.data.total.reviews === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Chưa có lượt ôn nào trong lộ trình này. Học một buổi rồi quay lại xem.</p>
      ) : (
        <>
          <Totals stats={effect.data.total} />
          <ChapterTable chapters={effect.data.chapters} />
          {effect.data.remedialSplit && (
            <SplitBars
              title={effect.data.remedialSplit.remedialTitle}
              at={effect.data.remedialSplit.at}
              before={effect.data.remedialSplit.before}
              after={effect.data.remedialSplit.after}
            />
          )}
        </>
      )}
    </section>
  );
};

const Tile: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl bg-surface-container-low px-3 py-2.5 min-w-0">
    <p className="text-label-sm text-on-surface-variant">{label}</p>
    <p className="text-title-md font-bold text-on-surface whitespace-nowrap">{value}</p>
    {hint && <p className="text-[11px] text-outline">{hint}</p>}
  </div>
);

const Totals: React.FC<{ stats: PathEffectStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
    <Tile label="Lượt ôn" value={stats.reviews.toLocaleString("vi-VN")} hint={`${stats.studiedCards}/${stats.cards} thẻ đã học`} />
    <Tile label="Tỷ lệ bấm “Lại”" value={formatRate(stats.againRate)} hint={`${stats.again} lượt`} />
    <Tile label="Phản xạ (trung vị)" value={formatReaction(stats.medianReactionMs)} />
    <Tile
      label="Nhớ sau 7 ngày"
      value={formatRate(stats.retention7d)}
      hint={stats.retentionEligible > 0 ? `${stats.retained}/${stats.retentionEligible} thẻ` : "Chưa có thẻ ôn lại sau 7 ngày"}
    />
  </div>
);

const ChapterTable: React.FC<{ chapters: { chapterId: string; position: number; title: string; stats: PathEffectStats }[] }> = ({
  chapters,
}) => (
  <div className="overflow-x-auto -mx-1 px-1">
    <table className="w-full min-w-[520px] text-body-sm">
      <caption className="sr-only">Hiệu quả theo chương</caption>
      <thead>
        <tr className="text-left text-label-sm text-on-surface-variant border-b border-surface-container-high">
          <th scope="col" className="py-2 pr-2 font-semibold">Chương</th>
          <th scope="col" className="py-2 px-2 font-semibold text-right">Đã học</th>
          <th scope="col" className="py-2 px-2 font-semibold text-right">Lượt</th>
          <th scope="col" className="py-2 px-2 font-semibold text-right">“Lại”</th>
          <th scope="col" className="py-2 px-2 font-semibold text-right">Phản xạ</th>
          <th scope="col" className="py-2 pl-2 font-semibold text-right">Nhớ 7 ngày</th>
        </tr>
      </thead>
      <tbody>
        {chapters.map((c) => (
          <tr key={c.chapterId} className="border-b border-surface-container-high/60 last:border-0">
            <th scope="row" className="py-2 pr-2 text-left font-medium text-on-surface">
              <span className="text-outline mr-1">{c.position}.</span>
              {c.title}
            </th>
            <td className="py-2 px-2 text-right whitespace-nowrap">{c.stats.studiedCards}/{c.stats.cards}</td>
            <td className="py-2 px-2 text-right">{c.stats.reviews}</td>
            <td className={`py-2 px-2 text-right ${c.stats.againRate !== null && c.stats.againRate >= 0.3 ? "text-error font-semibold" : ""}`}>
              {formatRate(c.stats.againRate)}
            </td>
            <td className="py-2 px-2 text-right whitespace-nowrap">{formatReaction(c.stats.medianReactionMs)}</td>
            <td className="py-2 pl-2 text-right">{formatRate(c.stats.retention7d)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TREND_TONE: Record<Trend, string> = {
  better: "text-secondary",
  worse: "text-error",
  same: "text-on-surface-variant",
  unknown: "text-outline",
};

// Chữ ở trên, thanh rộng hết hàng ở dưới: hai thanh luôn cùng bề rộng (cùng thước đo) ở mọi cỡ màn hình; đặt chữ cùng hàng thì
// phần chữ dài ngắn khác nhau làm hai thanh lệch nhau.
const Bar: React.FC<{ label: string; w: PathEffectWindow; tone: string }> = ({ label, w, tone }) => (
  <div className="flex flex-col gap-1 text-label-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-semibold text-on-surface">
        {formatRate(w.againRate)}{" "}
        <span className="font-normal text-outline">
          · {w.reviews} lượt · {formatReaction(w.medianReactionMs)}
        </span>
      </span>
    </div>
    <div
      role="img"
      aria-label={`${label}: tỷ lệ “Lại” ${formatRate(w.againRate)}, ${w.reviews} lượt`}
      className="h-3 rounded-full bg-surface-container-low overflow-hidden"
    >
      <div className={`h-full ${tone}`} style={{ width: `${barPct(w.againRate)}%` }} />
    </div>
  </div>
);

const SplitBars: React.FC<{ title: string; at: string; before: PathEffectWindow; after: PathEffectWindow }> = ({
  title,
  at,
  before,
  after,
}) => {
  const trend = againTrend({ before, after });
  const date = at ? new Date(at) : null;
  const when = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("vi-VN") : "";
  return (
    <div className="pt-3 border-t border-surface-container-high flex flex-col gap-2">
      <p className="text-label-sm text-on-surface-variant">
        Trước / sau khi tạo lộ trình bổ khuyết <span className="font-semibold text-on-surface">{title}</span>
        {when && ` (${when})`}
      </p>
      <Bar label="Trước" w={before} tone="bg-primary-fixed-dim" />
      <Bar label="Sau" w={after} tone="bg-primary" />
      <p className={`text-label-sm font-semibold ${TREND_TONE[trend]}`}>{TREND_LABEL[trend]}</p>
    </div>
  );
};
