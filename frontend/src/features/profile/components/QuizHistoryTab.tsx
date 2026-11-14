import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import { Button } from "@/components/ui/Button";
import type { QuizResult } from "@/types/api.types";
import { scoreTone, type ScoreTone } from "../lib/profileUtils";

const TONE_CLASS: Record<ScoreTone, string> = {
    good: "bg-emerald-100 text-emerald-900 border border-emerald-300",
    fair: "bg-amber-100 text-amber-900 border border-amber-300",
    poor: "bg-rose-100 text-rose-900 border border-rose-300",
    none: "bg-slate-100 text-slate-700 border border-slate-200",
};

const formatTime = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("vi-VN");
};

const ScoreBadge: React.FC<{ r: QuizResult }> = ({ r }) => {
    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : null;
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${TONE_CLASS[scoreTone(r.score, r.total)]}`}
        >
            {r.score}/{r.total}
            {pct !== null && ` · ${pct}%`}
            {r.mode === "practice" && <span className="ml-1.5 font-normal">· Luyện tập</span>}
        </span>
    );
};

const StatCard: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
        <span
            aria-hidden="true"
            className="material-symbols-outlined text-blue-600 bg-blue-50 rounded-xl p-2.5 text-[22px] shrink-0"
        >
            {icon}
        </span>
        <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
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
            <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
                <span className="sr-only">Đang tải lịch sử kiểm tra...</span>
                <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                    ))}
                </div>
                <div className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
            </div>
        );
    }

    if (statsError) {
        return (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 flex flex-col items-start gap-3">
                <p className="text-sm text-rose-800 font-medium">{statsError}</p>
                <Button type="button" variant="outline" size="sm" onClick={reloadStats}>
                    Thử lại
                </Button>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
                        quiz
                    </span>
                </div>
                <p className="font-bold text-slate-900 text-base">Chưa có bài kiểm tra nào</p>
                <p className="text-xs text-slate-500">Làm một bài Quiz để theo dõi tiến độ và độ chính xác của bạn tại đây.</p>
                <Link
                    to="/quiz"
                    className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                >
                    Làm bài kiểm tra ngay
                </Link>
            </div>
        );
    }

    const deckCell = (r: QuizResult) => {
        const title = r.deckTitle ?? deckTitles.get(r.deckId);
        return title ?? <span className="italic text-slate-400">Bộ thẻ không còn tồn tại</span>;
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard icon="assignment" label="Số bài đã làm" value={String(metrics.quizCount)} />
                <StatCard
                    icon="percent"
                    label="Độ chính xác (10 bài gần nhất)"
                    value={metrics.quizAccuracy === null ? "—" : `${metrics.quizAccuracy.toLocaleString("vi-VN")}%`}
                >
                </StatCard>
                <StatCard
                    icon="trending_up"
                    label="Bài gần nhất"
                    value={metrics.lastQuizPct === null ? "—" : `${metrics.lastQuizPct}%`}
                />
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
                {/* Desktop: bảng */}
                <table className="hidden md:table w-full text-xs">
                    <caption className="sr-only">10 bài kiểm tra gần nhất</caption>
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-left">
                        <tr>
                            <th scope="col" className="px-5 py-3">Bộ thẻ</th>
                            <th scope="col" className="px-5 py-3">Điểm</th>
                            <th scope="col" className="px-5 py-3">Thời gian</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r, i) => (
                            <tr key={`${r.deckId}-${r.createdAt}-${i}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5 font-bold text-slate-900">{deckCell(r)}</td>
                                <td className="px-5 py-3.5">
                                    <ScoreBadge r={r} />
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                                    {formatTime(r.createdAt)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Mobile: danh sách thẻ */}
                <ul className="md:hidden divide-y divide-slate-100" aria-label="10 bài kiểm tra gần nhất">
                    {rows.map((r, i) => (
                        <li key={`${r.deckId}-${r.createdAt}-${i}`} className="p-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-slate-900 text-sm break-words">{deckCell(r)}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{formatTime(r.createdAt)}</p>
                            </div>
                            <ScoreBadge r={r} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default QuizHistoryTab;
