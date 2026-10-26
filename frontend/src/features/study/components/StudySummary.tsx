import React from "react";
import { splitContent } from "@/lib/cardContent";
import type { Card } from "@/types/api.types";
import { GRADES } from "@/features/study/grades";
import { formatDuration, type StudySummaryData } from "@/features/study/studyUtils";

interface StudySummaryProps {
    summary: StudySummaryData;
    cardsById: ReadonlyMap<string, Card>;
    /** Luyện lại các thẻ bấm "Lại" (chế độ Luyện, không đổi lịch ôn); không truyền thì ẩn nút. */
    onRetry?: (cardIds: string[]) => void;
}

/** Màn tổng kết cuối phiên (spec 25/10 §3.5): thời gian, phân bố 4 mức, thẻ hay quên + "Luyện lại". */
export const StudySummary: React.FC<StudySummaryProps> = ({ summary, cardsById, onRetry }) => {
    const hardest = summary.hardest.filter((h) => cardsById.has(h.cardId));
    return (
        <div className="w-full max-w-md flex flex-col gap-space-md text-left">
            <dl className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-xl bg-surface-container-low">
                    <dt className="text-label-sm text-on-surface-variant">Thời gian</dt>
                    <dd className="font-title-md text-title-md font-semibold">{formatDuration(summary.durationMs)}</dd>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                    <dt className="text-label-sm text-on-surface-variant">Lượt chấm</dt>
                    <dd className="font-title-md text-title-md font-semibold tabular-nums">{summary.total}</dd>
                </div>
            </dl>

            {summary.total > 0 && (
                <div className="flex flex-col gap-1.5">
                    <div aria-hidden="true" className="flex h-2 rounded-full overflow-hidden bg-surface-container-high">
                        {GRADES.map((g) =>
                            summary.grades[g.grade] > 0 ? (
                                <div key={g.grade} className={g.className} style={{ flexGrow: summary.grades[g.grade] }} />
                            ) : null
                        )}
                    </div>
                    <ul className="flex flex-wrap justify-between gap-x-3 text-label-md">
                        {GRADES.map((g) => (
                            <li key={g.grade} className="inline-flex items-center gap-1">
                                <span aria-hidden="true" className={`w-2 h-2 rounded-full ${g.className}`} />
                                {g.label} <span className="font-semibold tabular-nums">{summary.grades[g.grade]}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {hardest.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="font-label-md text-label-md font-semibold">Thẻ cần chú ý</h2>
                    <ul className="flex flex-col divide-y divide-surface-container-high rounded-xl border border-surface-container-high">
                        {hardest.map((h) => {
                            const card = cardsById.get(h.cardId)!;
                            return (
                                <li key={h.cardId} className="flex items-center gap-3 px-3 py-2">
                                    <span lang="ja" className="font-semibold shrink-0">
                                        {card.term}
                                    </span>
                                    <span className="text-on-surface-variant text-label-md truncate flex-1">
                                        {splitContent(card.meaning).head}
                                    </span>
                                    <span className="text-label-sm text-error shrink-0">Lại ×{h.count}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={() => onRetry(hardest.map((h) => h.cardId))}
                            className="self-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-surface-container-high font-label-md font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                replay
                            </span>
                            Luyện lại {hardest.length} thẻ này
                        </button>
                    )}
                </section>
            )}
        </div>
    );
};
