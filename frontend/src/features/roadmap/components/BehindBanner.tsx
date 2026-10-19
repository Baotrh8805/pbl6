import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { sessionUrl, type BehindSeverity } from "@/features/roadmap/roadmapUtils";

interface BehindBannerProps {
  pathId: string;
  behind: number;
  severity: BehindSeverity;
  busy: boolean;
  onRebalance: (extend: boolean) => void;
}

const TONE: Record<Exclude<BehindSeverity, "none">, string> = {
  warn: "bg-[#FEF3C7] border-[#F59E0B]/40 text-[#92400E]",
  severe: "bg-error/10 border-error/30 text-error",
};

// LP-4: nợ không chỉ là nhãn — học bù ngay, hoặc nhờ server chia lại (giữ ngày cuối) / kéo dài lộ trình (giữ nhịp).
export const BehindBanner: React.FC<BehindBannerProps> = ({ pathId, behind, severity, busy, onRebalance }) => {
  if (behind <= 0 || severity === "none") return null;
  return (
    <section
      role="status"
      aria-label="Thẻ đang trễ"
      className={`p-space-md rounded-2xl border flex flex-col gap-space-sm ${TONE[severity]}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-[22px] shrink-0">
          {severity === "severe" ? "warning" : "schedule"}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Bạn đang trễ {behind} thẻ</p>
          <p className="text-body-sm opacity-90">
            {severity === "severe"
              ? "Phần nợ đã lớn hơn sức học một ngày. Hãy học bù dần, hoặc cân lại lịch để các ngày còn lại gánh bớt."
              : "Học bù trong phiên hôm nay, hoặc cân lại lịch nếu muốn chia đều phần còn lại."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={sessionUrl(pathId, "catchup")}
          className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
          Học bù
        </Link>
        <Button variant="outline" size="sm" onClick={() => onRebalance(false)} disabled={busy}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">balance</span>
          Cân lại lịch
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRebalance(true)} disabled={busy}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">more_time</span>
          Kéo dài lộ trình
        </Button>
      </div>
    </section>
  );
};
