import React from "react";
import type { QueueCounts } from "@/features/study/studyUtils";

interface StudyProgressProps {
    /** Số thẻ đã rời hàng đợi (chấm khác "Lại"). */
    done: number;
    size: number;
    counts: QueueCounts;
}

const GROUPS: { key: keyof QueueCounts; label: string; dot: string }[] = [
    { key: "new", label: "Mới", dot: "bg-primary" },
    { key: "review", label: "Ôn", dot: "bg-secondary" },
    { key: "relearn", label: "Học lại", dot: "bg-error" },
];

/** Thanh tiến độ + "Mới · Ôn · Học lại" của các thẻ còn trong hàng đợi (spec 25/10 §3.4). */
export const StudyProgress: React.FC<StudyProgressProps> = ({ done, size, counts }) => {
    const pct = size > 0 ? Math.min(100, Math.round((done / size) * 100)) : 0;
    return (
        <div className="flex flex-col gap-1.5">
            <div
                role="progressbar"
                aria-label="Tiến độ phiên học"
                aria-valuemin={0}
                aria-valuemax={size}
                aria-valuenow={done}
                aria-valuetext={`Xong ${done}/${size} thẻ`}
                className="h-1 rounded-full bg-surface-container-high overflow-hidden"
            >
                <div className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
            </div>
            <p aria-live="polite" className="flex flex-wrap items-center justify-end gap-x-3 text-label-sm">
                {GROUPS.map((g) => (
                    <span key={g.key} className="inline-flex items-center gap-1">
                        <span aria-hidden="true" className={`w-2 h-2 rounded-full ${g.dot}`} />
                        {g.label} <span className="font-semibold text-on-surface tabular-nums">{counts[g.key]}</span>
                    </span>
                ))}
            </p>
        </div>
    );
};
