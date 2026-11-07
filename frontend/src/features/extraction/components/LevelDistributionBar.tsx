import React from "react";
import type { ExtractionStats } from "@/types/api.types";
import {
  LEVEL_SOURCE_LABELS,
  LEVEL_TONE,
  OVERALL_RULE_HINT,
  UNKNOWN_LEVEL,
  levelDistribution,
  levelDistributionSummary,
  overallLevelLabel,
  type LevelSegment,
} from "../extractionUtils";

/**
 * Màu đoạn trên thanh: cùng họ màu với LEVEL_TONE (badge) nhưng lấy sắc đậm hơn, vì nền badge N2 / N1 đều hồng nhạt
 * (chỉ khác màu chữ) – đặt cạnh nhau trên một thanh sẽ không phân biệt được. Chưa rõ cấp: xám.
 */
const BAR_TONE: Record<string, string> = {
  N5: "bg-secondary-container",
  N4: "bg-primary-fixed-dim",
  N3: "bg-[#FCD34D]",
  N2: "bg-tertiary-fixed-dim",
  N1: "bg-on-tertiary-container",
  [UNKNOWN_LEVEL]: "bg-outline-variant",
};

const segmentName = (s: LevelSegment): string => (s.level === UNKNOWN_LEVEL ? "Chưa rõ" : s.level);
const segmentTitle = (s: LevelSegment): string =>
  s.level === UNKNOWN_LEVEL ? `Chưa rõ cấp: ${s.count} mục` : `${s.level}: ${s.count} mục (${s.pct}%)`;

interface LevelDistributionBarProps {
  stats: ExtractionStats | null | undefined;
  /** Dòng danh sách: thanh mảnh 6 đoạn + badge cấp tổng thể, không chú giải. */
  compact?: boolean;
  className?: string;
}

// Thanh phân bố cấp JLPT (B6). Không có số liệu -> không vẽ gì (levelDistribution trả null).
export const LevelDistributionBar: React.FC<LevelDistributionBarProps> = ({ stats, compact = false, className = "" }) => {
  const dist = levelDistribution(stats);
  if (!dist) return null;
  const summary = levelDistributionSummary(dist);
  const unknown = dist.segments.find((s) => s.level === UNKNOWN_LEVEL);
  const known = dist.segments.filter((s) => s.level !== UNKNOWN_LEVEL && s.count > 0);

  if (compact) {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${className}`}>
        {/*
          Thanh rút gọn nằm trong <Link> của dòng lịch sử nên chỉ minh hoạ (aria-hidden): nếu gắn aria-label thì cả chuỗi
          tóm tắt bị gộp vào tên link của mọi dòng; tooltip giữ cho chuột. Cùng cơ sở với bản đầy đủ (chỉ cấp rõ, rộng
          theo pct) để tỉ lệ vẽ khớp số % trong tooltip; chưa rõ chỉ nêu bằng chữ.
        */}
        <span aria-hidden="true" title={summary} className="flex h-1.5 w-24 sm:w-32 rounded-full overflow-hidden bg-surface-container shrink-0">
          {known.map((s) => (
            <span key={s.level} className={`block h-full ${BAR_TONE[s.level]}`} style={{ flexGrow: s.pct, flexBasis: 0 }} />
          ))}
        </span>
        {dist.overallLevel && (
          <span
            title={`${overallLevelLabel(dist.overallLevel)} — ${OVERALL_RULE_HINT}`}
            className={`inline-flex items-center px-1.5 py-0.5 rounded font-label-sm text-[11px] font-bold cursor-help ${LEVEL_TONE[dist.overallLevel]}`}
          >
            {/* Trình đọc màn hình nghe "Cấp tổng thể: N4" thay vì một chữ "N4" lơ lửng cuối tên link. */}
            <span className="sr-only">Cấp tổng thể: </span>
            {dist.overallLevel}
          </span>
        )}
      </div>
    );
  }

  return (
    <figure className={`flex flex-col gap-1.5 ${className}`}>
      <figcaption className="text-label-sm text-outline">
        Phân bố cấp JLPT · {LEVEL_SOURCE_LABELS[dist.source]} · {dist.known} mục rõ cấp
      </figcaption>

      {/* Thanh + chú giải chỉ là hình minh hoạ; bản chữ cho trình đọc màn hình là bảng sr-only bên dưới. */}
      <div aria-hidden="true" className="flex h-2.5 w-full rounded-full overflow-hidden bg-surface-container gap-px">
        {known.map((s) => (
          <span
            key={s.level}
            title={segmentTitle(s)}
            className={`block h-full min-w-[2px] ${BAR_TONE[s.level]}`}
            style={{ flexGrow: s.pct, flexBasis: 0 }}
          />
        ))}
      </div>
      <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant tabular-nums">
        {known.map((s) => (
          <li key={s.level} className="inline-flex items-center gap-1.5" title={segmentTitle(s)}>
            <span className={`w-2.5 h-2.5 rounded-sm ${BAR_TONE[s.level]}`} />
            <span className="font-semibold text-on-surface">{s.level}</span>
            <span>
              · {s.count} · {s.pct}%
            </span>
          </li>
        ))}
        {unknown && unknown.count > 0 && (
          <li
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-outline font-medium"
            title={segmentTitle(unknown)}
          >
            <span className={`w-2 h-2 rounded-full ${BAR_TONE[UNKNOWN_LEVEL]}`} />
            Chưa rõ: {unknown.count}
          </li>
        )}
      </ul>

      {/* sr-only đặt trên div bọc, không trên <table>: bảng bỏ qua width 1px của sr-only nên tràn ngang (nới rộng
          trang ở 375 px); div 1px + overflow hidden giữ nó lại mà trình đọc màn hình vẫn đọc được. */}
      <div className="sr-only">
        <table>
          <caption>
            Phân bố cấp JLPT ({LEVEL_SOURCE_LABELS[dist.source]}): {dist.known} mục rõ cấp trên tổng {dist.total}
          </caption>
          <thead>
            <tr>
              <th scope="col">Cấp</th>
              <th scope="col">Số mục</th>
              <th scope="col">Tỷ lệ trên mục rõ cấp</th>
            </tr>
          </thead>
          <tbody>
            {dist.segments.map((s) => (
              <tr key={s.level}>
                <th scope="row">{segmentName(s)}</th>
                <td>{s.count}</td>
                <td>{s.level === UNKNOWN_LEVEL ? "—" : `${s.pct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};
