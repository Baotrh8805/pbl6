import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import { Button } from "@/components/ui/Button";
import type { QuizResult } from "@/types/api.types";
import { scoreTone, type ScoreTone } from "../lib/profileUtils";

const TONE_CLASS: Record<ScoreTone, string> = {
    good: "bg-secondary-container text-on-secondary-container",
    fair: "bg-[#FEF3C7] text-[#B45309]",
    poor: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    none: "bg-surface-container text-on-surface-variant",
};

const formatTime = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("vi-VN");
};

const ScoreBadge: React.FC<{ r: QuizResult }> = ({ r }) => {
    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : null;
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-label-md font-semibold whitespace-nowrap ${TONE_CLASS[scoreTone(r.score, r.total)]}`}
        >
            {r.score}/{r.total}
            {pct !== null && ` · ${pct}%`}
        </span>
    );
};

const StatCard: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-space-md flex items-center gap-space-md">
        <span
            aria-hidden="true"
            className="material-symbols-outlined text-primary bg-primary/10 rounded-lg p-2 text-[22px] shrink-0"
        >
            {icon}
        </span>
        <div className="min-w-0">
            <p className="text-body-sm text-on-surface-variant">{label}</p>
            <p className="font-headline-md text-headline-md text-on-surface">{value}</p>
        </div>
    </div>
);

export const QuizHistoryTab: React.FC = () => {
    const { quizResults, decks, metrics, statsLoading, statsError, reloadStats } = useShell();

    const deckTitles = useMemo(() => new Map(decks.map((d) => [d.id, d.title])), [decks]);
    // Backend đã trả mới nhất trước; sắp lại cho chắc khi thứ tự đổi.
    const rows = useMemo(
        () => [...quizResults].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        [quizResults]
    );

    if (statsLoading && rows.length === 0) {
        return (
            <div aria-busy="true" aria-live="polite" className="flex flex-col gap-space-md">
                <span className="sr-only">Đang tải lịch sử kiểm tra...</span>
                <div className="grid gap-space-md sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
                    ))}
                </div>
                <div className="h-48 rounded-xl bg-surface-container animate-pulse" />
            </div>
        );
    }

    if (statsError) {
        return (
            <div role="alert" className="rounded-xl border border-error/20 bg-error-container/30 p-space-lg flex flex-col items-start gap-space-sm">
                <p className="text-body-md text-error">{statsError}</p>
                <Button type="button" variant="outline" size="sm" onClick={reloadStats}>
                    Thử lại
                </Button>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-surface-container-high p-space-xl flex flex-col items-center text-center gap-space-sm">
                <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
                    quiz
                </span>
                <p className="font-headline-sm text-headline-sm text-on-surface">Chưa có bài kiểm tra nào</p>
                <p className="text-body-sm text-on-surface-variant">Làm một bài Quiz để theo dõi tiến bộ của bạn tại đây.</p>
                <Link
                    to="/quiz"
                    className="mt-1 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    Làm bài kiểm tra
                </Link>
            </div>
        );
    }

    const deckCell = (deckId: string) => {
        const title = deckTitles.get(deckId);
        return title ?? <span className="italic text-outline">Bộ thẻ không còn tồn tại</span>;
    };

    return (
        <div className="flex flex-col gap-space-lg">
            <div className="grid gap-space-md sm:grid-cols-3">
                <StatCard icon="assignment" label="Số bài đã làm" value={String(metrics.quizCount)} />
                <StatCard
                    icon="percent"
                    label="Độ chính xác (10 bài gần nhất)"
                    value={metrics.quizAccuracy === null ? "—" : `${metrics.quizAccuracy.toLocaleString("vi-VN")}%`}
                />
                <StatCard
                    icon="trending_up"
                    label="Bài gần nhất"
                    value={metrics.lastQuizPct === null ? "—" : `${metrics.lastQuizPct}%`}
                />
            </div>

            <div className="rounded-xl bg-surface-container-lowest border border-surface-container-high overflow-hidden">
                {/* Desktop: bảng */}
                <table className="hidden md:table w-full text-body-sm">
                    <caption className="sr-only">10 bài kiểm tra gần nhất</caption>
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant text-left">
                        <tr>
                            <th scope="col" className="px-space-md py-2.5">Bộ thẻ</th>
                            <th scope="col" className="px-space-md py-2.5">Điểm</th>
                            <th scope="col" className="px-space-md py-2.5">Thời gian</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={`${r.deckId}-${r.createdAt}-${i}`} className="border-t border-surface-container-high">
                                <td className="px-space-md py-3 text-on-surface">{deckCell(r.deckId)}</td>
                                <td className="px-space-md py-3">
                                    <ScoreBadge r={r} />
                                </td>
                                <td className="px-space-md py-3 text-on-surface-variant whitespace-nowrap">
                                    {formatTime(r.createdAt)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Mobile: danh sách thẻ, tránh cuộn ngang */}
                <ul className="md:hidden divide-y divide-surface-container-high" aria-label="10 bài kiểm tra gần nhất">
                    {rows.map((r, i) => (
                        <li key={`${r.deckId}-${r.createdAt}-${i}`} className="p-space-md flex items-start justify-between gap-space-sm">
                            <div className="min-w-0">
                                <p className="text-body-md text-on-surface break-words">{deckCell(r.deckId)}</p>
                                <p className="text-body-sm text-on-surface-variant">{formatTime(r.createdAt)}</p>
                            </div>
                            <ScoreBadge r={r} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
