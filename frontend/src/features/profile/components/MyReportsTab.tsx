import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { fetchMyReports, withdrawReport } from "@/services/adminService";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from "@/features/admin/adminUtils";
import type { MyReport, ReportStatus } from "@/types/api.types";
import { myReportOutcome } from "../lib/profileUtils";

const PAGE_SIZE = 10;

const STATUS_CLASS: Record<ReportStatus, string> = {
    OPEN: "bg-[#FEF3C7] text-[#B45309]",
    RESOLVED: "bg-secondary-container text-on-secondary-container",
    DISMISSED: "bg-surface-container text-on-surface-variant",
};

const formatTime = (iso: string | null) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("vi-VN");
};

const ReportRow: React.FC<{ r: MyReport; onWithdraw: (r: MyReport) => void }> = ({ r, onWithdraw }) => {
    const title = r.deckTitle ?? r.deckId;
    const outcome = myReportOutcome(r.status, r.action);
    return (
        <li className="p-space-md flex flex-col gap-1.5">
            <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div className="min-w-0">
                    <p className="text-body-md text-on-surface font-semibold break-words">
                        {r.deckPublic ? (
                            <Link to={`/decks/${encodeURIComponent(r.deckId)}`} className="hover:underline text-primary">
                                {title}
                            </Link>
                        ) : (
                            title
                        )}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                        {REPORT_REASON_LABELS[r.reason] ?? r.reason} · gửi lúc {formatTime(r.createdAt)}
                    </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-label-md font-semibold whitespace-nowrap ${STATUS_CLASS[r.status]}`}>
                    {REPORT_STATUS_LABELS[r.status] ?? r.status}
                </span>
            </div>
            {r.detail && <p className="text-body-sm text-on-surface-variant break-words">“{r.detail}”</p>}
            {outcome && (
                <p className="text-body-sm text-on-surface">
                    {outcome}
                    {r.resolutionNote && <> Ghi chú: {r.resolutionNote}</>}
                    <span className="text-on-surface-variant"> ({formatTime(r.resolvedAt)})</span>
                </p>
            )}
            {r.status === "OPEN" && (
                <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => onWithdraw(r)}>
                        Rút lại báo cáo
                    </Button>
                </div>
            )}
        </li>
    );
};

export const MyReportsTab: React.FC = () => {
    const dialog = useDialog();
    const [page, setPage] = useState(0);
    const [reload, setReload] = useState(0);
    const { data, error, loading } = useAsync(() => fetchMyReports({ page, size: PAGE_SIZE }), [page], reload);

    const handleWithdraw = async (r: MyReport) => {
        const ok = await dialog.confirm({
            title: "Rút lại báo cáo?",
            message: `Báo cáo về "${r.deckTitle ?? r.deckId}" sẽ bị huỷ và quản trị viên không còn thấy nó.`,
            confirmLabel: "Rút lại",
            tone: "warning",
            action: () => withdrawReport(r.id),
        });
        if (!ok) return;
        // Rút dòng cuối của trang cuối -> lùi một trang cho khỏi trang trống.
        if (data && data.items.length === 1 && page > 0) setPage(page - 1);
        else setReload((n) => n + 1);
    };

    if (loading && !data) {
        return (
            <div aria-busy="true" aria-live="polite" className="h-48 rounded-xl bg-surface-container animate-pulse">
                <span className="sr-only">Đang tải báo cáo...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div role="alert" className="rounded-xl border border-error/20 bg-error-container/30 p-space-lg flex flex-col items-start gap-space-sm">
                <p className="text-body-md text-error">{error}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>
                    Thử lại
                </Button>
            </div>
        );
    }

    if (!data || data.total === 0) {
        return (
            <div className="rounded-xl border border-dashed border-surface-container-high p-space-xl flex flex-col items-center text-center gap-space-sm">
                <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
                    flag
                </span>
                <p className="font-headline-sm text-headline-sm text-on-surface">Bạn chưa gửi báo cáo nào</p>
                <p className="text-body-sm text-on-surface-variant max-w-md">
                    Gặp bộ thẻ sai nội dung hoặc vi phạm trong Thư viện, bấm "Báo cáo" ở trang bộ thẻ. Kết quả xử lý sẽ hiện tại đây.
                </p>
            </div>
        );
    }

    const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
    return (
        <div className="flex flex-col gap-space-md">
            <ul
                aria-label="Báo cáo đã gửi"
                className="rounded-xl bg-surface-container-lowest border border-surface-container-high divide-y divide-surface-container-high"
            >
                {data.items.map((r) => (
                    <ReportRow key={r.id} r={r} onWithdraw={handleWithdraw} />
                ))}
            </ul>
            {pages > 1 && (
                <nav aria-label="Phân trang báo cáo" className="flex items-center justify-end gap-space-sm text-body-sm">
                    <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                        Trước
                    </Button>
                    <span className="text-on-surface-variant">
                        Trang {page + 1}/{pages}
                    </span>
                    <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                        Sau
                    </Button>
                </nav>
            )}
        </div>
    );
};
