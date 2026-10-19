import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { SERVER_PENDING_MESSAGE } from "@/lib/apiErrorInfo";
import { useAsync } from "@/lib/useAsync";
import {
    DEFAULT_PRACTICE_STATS_DAYS,
    PRACTICE_KINDS,
    PRACTICE_KIND_ICONS,
    PRACTICE_KIND_LABELS,
    PRACTICE_STATS_DAYS,
    formatPracticeAvg,
    practiceTone,
    totalPracticeCount,
    type PracticeTone,
} from "@/features/practice/practiceUtils";
import { fetchPracticeStats } from "@/services/practiceService";
import type { PracticeKind } from "@/types/practice.types";

// Tab "Luyện tập" của trang cá nhân (E2–E4): số lượt + điểm trung bình viết kanji / phát âm / trọng âm và các lượt
// gần đây, từ GET /practice/stats. Chỉ đọc. Máy chủ chỉ có điểm và bản nhận dạng, không bao giờ có âm thanh.

const TONE_BADGE: Record<PracticeTone, string> = {
    good: "bg-secondary-fixed/60 text-on-secondary-fixed-variant",
    ok: "bg-primary-fixed text-on-primary-fixed",
    poor: "bg-error-container text-on-error-container",
};

const CARD_HINT: Record<PracticeKind, string> = {
    write: "Viết kanji",
    speak: "Phát âm",
    pitch: "Trọng âm cao thấp",
};

const formatTime = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = "text-[20px]" }) => (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
        {name}
    </span>
);

export const PracticeStatsTab: React.FC = () => {
    const [days, setDays] = useState<number>(DEFAULT_PRACTICE_STATS_DAYS);
    const [reload, setReload] = useState(0);
    // reload nằm trong deps (không phải tham số reload của useAsync) để bấm "Thử lại" hiện lại trạng thái đang tải.
    const { data, error, loading } = useAsync(() => fetchPracticeStats(days), [days, reload]);

    return (
        <div className="flex flex-col gap-space-md">
            <div className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-space-md flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                            <Icon name="exercise" className="text-[20px] text-primary" />
                            Kết quả luyện tập
                        </h2>
                        <p className="text-body-sm text-on-surface-variant mt-0.5">
                            Điểm luyện viết kanji, phát âm và trọng âm trong {days} ngày qua. Âm thanh không bao giờ được gửi lên máy chủ,
                            hệ thống chỉ lưu điểm số.
                        </p>
                    </div>
                    <div role="group" aria-label="Khoảng thời gian thống kê" className="inline-flex shrink-0 self-start rounded-lg bg-surface-container-low p-1">
                        {PRACTICE_STATS_DAYS.map((d) => (
                            <button
                                key={d}
                                type="button"
                                aria-pressed={d === days}
                                onClick={() => setDays(d)}
                                className={`px-3 py-1.5 rounded-md text-label-md font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                                    d === days ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                                }`}
                            >
                                {d} ngày
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div aria-busy="true" aria-live="polite" className="flex flex-col gap-space-md">
                    <span className="sr-only">Đang tải kết quả luyện tập...</span>
                    <div className="grid gap-space-md sm:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
                        ))}
                    </div>
                    <div className="h-40 rounded-xl bg-surface-container animate-pulse" />
                </div>
            ) : error === SERVER_PENDING_MESSAGE ? (
                // Backend đợt 2 chưa có endpoint: báo bình tĩnh, không phải lỗi của người dùng.
                <div role="status" className="rounded-xl border border-dashed border-surface-container-high p-space-lg flex items-start gap-3 text-body-sm text-on-surface-variant">
                    <Icon name="update" className="text-[24px] text-primary shrink-0" />
                    <span>{SERVER_PENDING_MESSAGE}</span>
                </div>
            ) : error || !data ? (
                <div role="alert" className="rounded-xl border border-error/20 bg-error-container/30 p-space-lg flex flex-col items-start gap-space-sm">
                    <p className="text-body-md text-error">Không tải được kết quả luyện tập: {error ?? "dữ liệu trống"}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>
                        Thử lại
                    </Button>
                </div>
            ) : (
                <>
                    <ul className="grid gap-space-md sm:grid-cols-3" aria-label="Tổng hợp theo loại luyện tập">
                        {PRACTICE_KINDS.map((kind) => {
                            const s = data[kind];
                            const tone = s.avg === null ? null : practiceTone(s.avg);
                            return (
                                <li
                                    key={kind}
                                    className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-space-md flex items-center gap-space-md"
                                >
                                    <Icon name={PRACTICE_KIND_ICONS[kind]} className="text-primary bg-primary/10 rounded-lg p-2 text-[22px] shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-body-sm text-on-surface-variant">{CARD_HINT[kind]}</p>
                                        <p className="font-headline-md text-headline-md text-on-surface tabular-nums">
                                            {s.count.toLocaleString("vi-VN")}
                                            <span className="ml-1 text-body-sm font-normal text-on-surface-variant">lượt</span>
                                        </p>
                                    </div>
                                    <p
                                        className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full ${
                                            tone ? TONE_BADGE[tone] : "bg-surface-container text-on-surface-variant"
                                        }`}
                                        title="Điểm trung bình (0–100)"
                                    >
                                        <span className="sr-only">Điểm trung bình: </span>
                                        <span className="font-headline text-title-md font-bold tabular-nums leading-none">{formatPracticeAvg(s.avg)}</span>
                                        <span aria-hidden="true" className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                            TB
                                        </span>
                                    </p>
                                </li>
                            );
                        })}
                    </ul>

                    {totalPracticeCount(data) === 0 && data.recent.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-surface-container-high p-space-xl flex flex-col items-center text-center gap-space-sm">
                            <Icon name="exercise" className="text-[40px] text-outline" />
                            <p className="font-headline-sm text-headline-sm text-on-surface">Chưa có lượt luyện tập nào trong {days} ngày qua</p>
                            <p className="text-body-sm text-on-surface-variant max-w-md">
                                Khi học thẻ, bấm nút micro để luyện phát âm và trọng âm, hoặc nút bút để luyện viết từng chữ kanji. Trang Kanji cũng có
                                ô luyện viết cho mọi chữ.
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-1">
                                <Link
                                    to="/decks"
                                    className="px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                >
                                    Chọn bộ thẻ để học
                                </Link>
                                <Link
                                    to="/kanji"
                                    className="px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface text-sm font-semibold hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                >
                                    Mở trang Kanji
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <section
                            aria-labelledby="practice-recent-title"
                            className="rounded-xl bg-surface-container-lowest border border-surface-container-high overflow-hidden"
                        >
                            <h3 id="practice-recent-title" className="px-space-md py-2.5 bg-surface-container-low text-label-md font-semibold text-on-surface-variant">
                                Lượt gần đây
                            </h3>
                            {data.recent.length === 0 ? (
                                <p className="p-space-md text-body-sm text-on-surface-variant">Chưa có lượt nào để hiện.</p>
                            ) : (
                                <ul className="divide-y divide-surface-container-high">
                                    {data.recent.map((r, i) => (
                                        <li key={`${r.createdAt}-${r.kind}-${i}`} className="px-space-md py-3 flex items-center gap-3">
                                            <Icon name={PRACTICE_KIND_ICONS[r.kind]} className="text-[20px] text-on-surface-variant shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-body-md text-on-surface break-words">
                                                    <span lang="ja" className="font-japanese font-semibold">
                                                        {r.target || "—"}
                                                    </span>
                                                </p>
                                                <p className="text-body-sm text-on-surface-variant">
                                                    {PRACTICE_KIND_LABELS[r.kind]} · {formatTime(r.createdAt)}
                                                </p>
                                            </div>
                                            <span
                                                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-label-md font-semibold tabular-nums ${
                                                    TONE_BADGE[practiceTone(r.score)]
                                                }`}
                                            >
                                                <span className="sr-only">Điểm: </span>
                                                {r.score}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
                </>
            )}
        </div>
    );
};

export default PracticeStatsTab;
