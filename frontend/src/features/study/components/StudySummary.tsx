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

/** Màn tổng kết cuối phiên: thời gian, phân bố 4 mức, tỷ lệ ghi nhớ, thẻ hay quên + "Luyện lại". */
export const StudySummary: React.FC<StudySummaryProps> = ({ summary, cardsById, onRetry }) => {
    const hardest = summary.hardest.filter((h) => cardsById.has(h.cardId));
    const rememberedCount = (summary.grades.good ?? 0) + (summary.grades.easy ?? 0);
    const retentionRate = summary.total > 0 ? Math.round((rememberedCount / summary.total) * 100) : 0;

    return (
        <div className="w-full max-w-md flex flex-col gap-4 text-left">
            {/* 3 Thẻ thống kê cốt lõi */}
            <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs">
                    <dt className="text-label-sm text-slate-500">Thời gian</dt>
                    <dd className="font-title-md text-title-md font-semibold text-slate-800 mt-0.5">{formatDuration(summary.durationMs)}</dd>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs">
                    <dt className="text-label-sm text-slate-500">Lượt chấm</dt>
                    <dd className="font-title-md text-title-md font-semibold text-slate-800 tabular-nums mt-0.5">{summary.total}</dd>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs">
                    <dt className="text-label-sm text-slate-500">Ghi nhớ</dt>
                    <dd className="font-title-md text-title-md font-semibold text-emerald-600 tabular-nums mt-0.5">{retentionRate}%</dd>
                </div>
            </dl>

            {/* Thanh phân bố 4 mức điểm */}
            {summary.total > 0 && (
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-label-sm font-medium text-slate-600">Phân bố kết quả chấm điểm</span>
                    <div aria-hidden="true" className="flex h-2.5 rounded-full overflow-hidden bg-slate-200 shadow-inner">
                        {GRADES.map((g) =>
                            summary.grades[g.grade] > 0 ? (
                                <div
                                    key={g.grade}
                                    className={`${g.barClassName} transition-[flex-grow] duration-300`}
                                    style={{ flexGrow: summary.grades[g.grade] }}
                                    title={`${g.label}: ${summary.grades[g.grade]} thẻ`}
                                />
                            ) : null
                        )}
                    </div>
                    <ul className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-label-sm pt-0.5">
                        {GRADES.map((g) => (
                            <li key={g.grade} className="inline-flex items-center gap-1.5 text-slate-600">
                                <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${g.dotClassName}`} />
                                <span>{g.label}</span>
                                <span className="font-semibold text-slate-900 tabular-nums">{summary.grades[g.grade]}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Danh sách thẻ khó cần chú ý */}
            {hardest.length > 0 && (
                <section className="flex flex-col gap-2.5">
                    <h2 className="font-label-md text-label-md font-semibold text-slate-800 flex items-center justify-between">
                        <span>Thẻ cần chú ý</span>
                        <span className="text-label-sm font-normal text-slate-500">{hardest.length} thẻ</span>
                    </h2>
                    <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                        {hardest.map((h) => {
                            const card = cardsById.get(h.cardId);
                            if (!card) return null;
                            const showReading = Boolean(card.reading && card.reading.trim() && card.reading.trim() !== card.term.trim());
                            return (
                                <li key={h.cardId} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50/80 transition-colors">
                                    <div className="flex items-baseline gap-1.5 shrink-0 max-w-[48%]">
                                        <span lang="ja" className="font-semibold text-slate-900 text-base truncate">
                                            {card.term}
                                        </span>
                                        {showReading && (
                                            <span lang="ja" className="text-xs text-slate-500 font-normal shrink-0">
                                                ({card.reading})
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-slate-600 text-label-md truncate flex-1">
                                        {splitContent(card.meaning).head}
                                    </span>
                                    <span className="text-[12px] font-medium text-rose-700 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-full shrink-0">
                                        Lại ×{h.count}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={() => onRetry(hardest.map((h) => h.cardId))}
                            className="self-center mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-label-md font-semibold shadow-xs hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
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
