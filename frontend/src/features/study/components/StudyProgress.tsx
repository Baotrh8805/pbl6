import React from "react";
import type { QueueCounts } from "@/features/study/studyUtils";

interface StudyProgressProps {
    /** Số thẻ đã rời hàng đợi (chấm khác "Lại"). */
    done: number;
    size: number;
    counts: QueueCounts;
}

const GROUPS: { key: keyof QueueCounts; label: string; dot: string; pill: string }[] = [
    { key: "new", label: "Mới", dot: "bg-blue-500", pill: "text-blue-700 bg-blue-50/80 border-blue-200/60" },
    { key: "review", label: "Ôn", dot: "bg-emerald-500", pill: "text-emerald-700 bg-emerald-50/80 border-emerald-200/60" },
    { key: "relearn", label: "Học lại", dot: "bg-rose-500", pill: "text-rose-700 bg-rose-50/80 border-rose-200/60" },
];

/** Thanh tiến độ hiện đại + bộ đếm "Đã xong X/Y thẻ" và các nhóm "Mới · Ôn · Học lại". */
export const StudyProgress: React.FC<StudyProgressProps> = ({ done, size, counts }) => {
    const pct = size > 0 ? Math.min(100, Math.round((done / size) * 100)) : 0;
    return (
        <div className="flex flex-col gap-2">
            <div
                role="progressbar"
                aria-label="Tiến độ phiên học"
                aria-valuemin={0}
                aria-valuemax={size}
                aria-valuenow={done}
                aria-valuetext={`Xong ${done}/${size} thẻ (${pct}%)`}
                className="h-2 rounded-full bg-slate-200/80 overflow-hidden shadow-inner"
            >
                <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label-sm">
                <span className="font-medium text-slate-600">
                    Đã học <span className="font-semibold text-slate-900 tabular-nums">{done}</span>/{size} thẻ{" "}
                    <span className="text-slate-500 font-normal">({pct}%)</span>
                </span>
                <p aria-live="polite" className="flex flex-wrap items-center gap-1.5">
                    {GROUPS.map((g) => (
                        <span
                            key={g.key}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${g.pill}`}
                        >
                            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
                            {g.label} <span className="font-semibold tabular-nums">{counts[g.key]}</span>
                        </span>
                    ))}
                </p>
            </div>
        </div>
    );
};
