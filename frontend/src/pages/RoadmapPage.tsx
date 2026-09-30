import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { sortDecksByLevel, calcDeckProgress, JLPT_LEVELS } from "@/lib/deckUtils";
import type { Deck } from "@/types/api.types";
import { useShell } from "@/components/layout/shellContext";

/** Tỷ lệ thẻ thành thạo để coi một giai đoạn là hoàn thành. */
const STAGE_DONE_PCT = 80;

export const RoadmapPage: React.FC = () => {
    // Dùng lại bộ thẻ + lịch ôn layout đã tải cho dashboard, không gọi API lần hai.
    const { displayName, currentLevel, decks: rawDecks, reviews: reviewMap, statsLoading: loading, statsError: error } = useShell();
    const data = useMemo(
        () => (loading || error ? undefined : { decks: sortDecksByLevel(rawDecks), reviews: reviewMap }),
        [loading, error, rawDecks, reviewMap]
    );

    if (loading) {
        return (
            <section aria-live="polite" className="py-space-xl flex flex-col items-center justify-center gap-space-sm">
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
                    progress_activity
                </span>
                <p className="text-on-surface-variant text-body-md font-medium">Đang tải lộ trình học tập AI...</p>
            </section>
        );
    }

    if (error || !data) {
        return (
            <section aria-live="polite" className="py-space-lg flex flex-col items-start gap-space-sm">
                <p className="text-error">{error || "Không thể tải dữ liệu lộ trình."}</p>
                <Link to="/" className="text-primary hover:underline font-semibold">
                    ← Về trang tổng quan
                </Link>
            </section>
        );
    }

    const { decks, reviews } = data;
    const now = new Date();

    const allCards = decks.flatMap((d) => d.cards);
    const overall = calcDeckProgress(allCards, reviews, now);

    // Mỗi cấp JLPT là một giai đoạn; "Đang học" = cấp đầu tiên (N5 -> N1) có thẻ mà chưa thành thạo đủ.
    const stages = JLPT_LEVELS.map((level) => {
        const levelDecks = decks.filter((d) => d.level === level);
        return {
            level,
            deckCount: levelDecks.length,
            ...calcDeckProgress(levelDecks.flatMap((d) => d.cards), reviews, now),
        };
    });
    const activeStage = stages.findIndex((s) => s.total > 0 && s.pct < STAGE_DONE_PCT);

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl">
            {/* Ambient Background Accents */}
            <div className="relative w-full">
                <div className="absolute -top-16 right-8 w-80 h-80 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none -z-10" />
                <div className="absolute top-24 -left-12 w-72 h-72 rounded-full bg-primary-fixed/30 blur-3xl pointer-events-none -z-10" />

                {/* 1. Header & Target Forecast Capsule */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md mb-space-lg">
                    <div className="max-w-2xl space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                            <span className="material-symbols-outlined text-[16px] text-tertiary-container animate-pulse">
                                neurology
                            </span>
                            <span className="font-bold tracking-wider uppercase">AI Path Architecture v4.2</span>
                            <span className="w-1 h-1 rounded-full bg-outline-variant" />
                            <span className="text-secondary font-semibold">Tự động thích ứng thời gian thực</span>
                        </div>
                        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
                            Lộ Trình Học Tập Cá Nhân Hóa
                        </h1>
                        <p className="font-body-md text-body-md text-on-surface-variant">
                            Lộ trình tích lũy từ vựng chuẩn JLPT được AI cá nhân hóa riêng cho{" "}
                            <span className="font-semibold text-on-surface">{displayName}</span> dựa trên mục tiêu cấp độ{" "}
                            <span className="font-semibold text-primary">{currentLevel}</span>.
                        </p>
                    </div>

                    {/* Capsule Thẻ Chỉ Số Mục Tiêu */}
                    <div className="bg-surface-container-lowest p-space-md rounded-xl border border-surface-container-high shadow-sm flex items-center gap-space-md shrink-0">
                        <div className="w-11 h-11 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[24px]">flag</span>
                        </div>
                        <div className="border-r border-surface-container-high pr-space-md">
                            <span className="font-label-sm text-label-sm text-on-surface-variant block uppercase tracking-wide">
                                Mục tiêu cấp độ
                            </span>
                            <span className="font-headline-sm text-headline-sm font-bold text-primary">
                                JLPT {currentLevel}
                            </span>
                        </div>
                        <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant block">
                                Dự báo thành thạo
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="font-headline-sm text-headline-sm font-bold text-secondary">
                                    {overall.pct}%
                                </span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-label-sm font-bold bg-secondary-container text-on-secondary-container">
                                    {overall.pct >= 70 ? "Vững vàng" : "Đang tích lũy"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Ma Trận 4 Giai Đoạn Học Tập (Stage Progression Matrix) */}
                <div className="bg-surface-container-lowest p-space-md md:p-space-lg rounded-xl border border-surface-container-high shadow-sm mb-space-lg">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-space-sm">
                        <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                                Giai Đoạn Học Tập Tổng Quan
                            </span>
                            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">
                                Tổng tiến độ: {overall.pct}% ({overall.mastered}/{overall.total} thẻ đã thành thạo)
                            </h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping" />
                            <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                                {overall.due > 0 ? `${overall.due} thẻ đến hạn cần ôn` : "Đã ôn tập đầy đủ hôm nay"}
                            </span>
                        </div>
                    </div>

                    {/* Segmented Multi-stage Bar */}
                    <div className="w-full h-3 rounded-full bg-surface-container-high flex gap-1 p-0.5 mb-space-md overflow-hidden">
                        <div
                            className="h-full bg-secondary rounded-l-full transition-all duration-500"
                            style={{ width: `${Math.min(100, overall.pct)}%` }}
                            title={`Thành thạo: ${overall.pct}%`}
                        />
                        <div
                            className="h-full bg-tertiary-container transition-all duration-500"
                            style={{
                                width: `${overall.total ? Math.min(100, Math.round((overall.due / overall.total) * 100)) : 0}%`,
                            }}
                            title={`Đến hạn: ${overall.due} thẻ`}
                        />
                    </div>

                    {/* Giai đoạn theo cấp JLPT: tính từ bộ thẻ + lịch ôn thật, không gán trạng thái cố định */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-space-sm">
                        {stages.map((s, i) => {
                            const active = i === activeStage;
                            const status =
                                s.total === 0
                                    ? "Chưa có bộ thẻ"
                                    : s.pct >= STAGE_DONE_PCT
                                      ? "Hoàn thành"
                                      : active
                                        ? "Đang học"
                                        : "Đang tích lũy";
                            return (
                                <div
                                    key={s.level}
                                    className={`p-space-sm rounded-xl border flex flex-col justify-between ${
                                        active
                                            ? "bg-primary text-on-primary border-primary-container shadow-sm"
                                            : s.total === 0
                                              ? "bg-surface-container-lowest border-surface-container-high opacity-70"
                                              : "bg-surface-container-low border-surface-container-high"
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span
                                                className={`font-label-sm text-[11px] font-bold uppercase ${
                                                    active ? "text-secondary-container" : "text-on-surface-variant"
                                                }`}
                                            >
                                                Giai Đoạn 0{i + 1}
                                            </span>
                                            <span
                                                className={`material-symbols-outlined text-[18px] ${
                                                    active ? "text-secondary-container" : s.pct >= STAGE_DONE_PCT ? "text-secondary" : "text-outline"
                                                }`}
                                            >
                                                {s.total > 0 && s.pct >= STAGE_DONE_PCT ? "check_circle" : active ? "school" : "flag"}
                                            </span>
                                        </div>
                                        <h3
                                            className={`font-label-md text-label-md font-bold mb-1 ${
                                                active ? "text-on-primary" : "text-primary"
                                            }`}
                                        >
                                            JLPT {s.level}
                                        </h3>
                                        <p
                                            className={`text-body-sm text-[12px] ${
                                                active ? "text-on-primary-container" : "text-on-surface-variant"
                                            }`}
                                        >
                                            {s.deckCount} bộ thẻ · {s.mastered}/{s.total} thẻ thành thạo
                                        </p>
                                    </div>
                                    <div
                                        className={`pt-2 mt-2 border-t flex items-center justify-between text-label-sm ${
                                            active ? "border-primary-container/60" : "border-surface-container"
                                        }`}
                                    >
                                        <span className={active ? "text-secondary-container font-semibold" : "text-secondary font-bold"}>
                                            {s.total > 0 ? `${s.pct}%` : "—"}
                                        </span>
                                        <span className={active ? "text-on-primary-container" : "text-outline"}>{status}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Chuỗi Bộ Thẻ Chi Tiết Theo Thứ Tự (Milestone Deck Sequence) */}
                <div className="flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="font-title-md text-title-md font-bold text-on-surface">
                            Các Bộ Thẻ Thuộc Lộ Trình
                        </h2>
                        <span className="text-label-sm text-on-surface-variant">
                            {decks.length} bộ thẻ được xếp theo trình tự học
                        </span>
                    </div>

                    {decks.length === 0 ? (
                        <p className="text-on-surface-variant py-space-md">Chưa có bộ thẻ nào trong lộ trình.</p>
                    ) : (
                        <ol className="flex flex-col gap-space-md relative before:absolute before:left-5 before:top-6 before:bottom-6 before:w-0.5 before:bg-surface-container-high">
                            {decks.map((deck: Deck, idx: number) => {
                                const progress = calcDeckProgress(deck.cards, reviews, now);
                                const isDone = progress.pct === 100 && progress.total > 0;

                                return (
                                    <li key={deck.id} className="relative pl-12">
                                        {/* Điểm nút cột mốc */}
                                        <span
                                            aria-hidden="true"
                                            className={`absolute left-2.5 top-5 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm transition-colors ${
                                                isDone
                                                    ? "bg-secondary text-on-primary ring-4 ring-secondary/20"
                                                    : progress.pct > 0
                                                    ? "bg-primary text-on-primary ring-4 ring-primary/20"
                                                    : "bg-surface-container-high text-outline"
                                            }`}
                                        >
                                            {isDone ? (
                                                <span className="material-symbols-outlined text-[14px]">done</span>
                                            ) : (
                                                idx + 1
                                            )}
                                        </span>

                                        <div className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high hover:shadow-md transition-shadow flex flex-col gap-space-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-space-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary text-label-sm font-semibold">
                                                        {deck.level}
                                                    </span>
                                                    <h3 className="font-title-md text-title-md font-bold text-on-surface">
                                                        {deck.title}
                                                    </h3>
                                                </div>
                                                <span className="text-label-md font-bold text-primary">
                                                    {progress.pct}% Hoàn tất
                                                </span>
                                            </div>

                                            {deck.description && (
                                                <p className="text-body-sm text-on-surface-variant">
                                                    {deck.description}
                                                </p>
                                            )}

                                            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-primary h-full rounded-full transition-all duration-300"
                                                    style={{ width: `${progress.pct}%` }}
                                                />
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-space-sm pt-2 border-t border-surface-container-high/60">
                                                <div className="flex items-center gap-space-sm text-label-sm text-outline">
                                                    <span>{deck.cards.length} thẻ</span>
                                                    <span>·</span>
                                                    <span className="text-secondary font-medium">
                                                        {progress.mastered} đã thuộc
                                                    </span>
                                                    <span>·</span>
                                                    <span
                                                        className={
                                                            progress.due > 0 ? "text-error font-semibold" : ""
                                                        }
                                                    >
                                                        {progress.due} cần ôn hôm nay
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        to={`/decks/${deck.id}`}
                                                        className="px-3 py-1.5 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                                                    >
                                                        Xem bộ thẻ
                                                    </Link>
                                                    <Link
                                                        to={`/decks/${deck.id}/study`}
                                                        className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                                                    >
                                                        Học ngay {progress.due > 0 ? `(${progress.due})` : ""}
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </div>
        </section>
    );
};

export default RoadmapPage;
