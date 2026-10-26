import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { Button } from "@/components/ui/Button";
import { fetchReports } from "@/services/adminService";
import { downloadCsv, fetchAllPages, formatShort, REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from "@/features/admin/adminUtils";
import type { ContentReport, ReportStatus } from "@/types/api.types";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { ResolveReportModal } from "@/features/admin/components/ResolveReportModal";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminFlash, type AdminFlashMessage } from "@/features/admin/components/AdminFlash";
import { reportActionLabel } from "@/features/admin/moderationUtils";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { DictReportsPanel } from "@/features/admin/components/DictReportsPanel";
import { useSearchParams } from "react-router-dom";

const PAGE_SIZE = 20;
const STATUSES: ReportStatus[] = ["OPEN", "RESOLVED", "DISMISSED"];

const STATUS_ICONS: Record<ReportStatus, string> = {
  OPEN: "flag",
  RESOLVED: "check_circle",
  DISMISSED: "cancel",
};

const DeckReportsPage: React.FC = () => {
  const q = useAdminQuery({ status: "OPEN" });
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const status = (STATUSES.includes(q.get("status") as ReportStatus) ? q.get("status") : "OPEN") as ReportStatus;
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<ContentReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState<AdminFlashMessage | null>(null);
  // Cột Thao tác chỉ có khi có nút để bấm (tab Đang mở + quyền ADMIN): tab Đã xử lý / Đã bỏ qua không còn gì để làm,
  // để cột trống (lại dính mép phải) chỉ chiếm chỗ của cột Kết quả xử lý.
  const showActions = status === "OPEN" && canAct;

  const { data, loading, error } = useAsync(
    () => fetchReports({ status, deckId: q.get("deckId"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const allRows = await fetchAllPages((page, size) =>
        fetchReports({ status, deckId: q.get("deckId"), page, size })
      );
      downloadCsv(
        `bao-cao-${status.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
        allRows.map((r) => ({
          id: r.id,
          bo_the: r.deckTitle ?? r.deckId,
          nguoi_bao_cao: r.reporterEmail,
          ly_do: r.reason,
          mo_ta: r.detail ?? "",
          trang_thai: r.status,
          hanh_dong: r.action ?? "",
          ghi_chu: r.resolutionNote ?? "",
          xu_ly_boi: r.resolvedByEmail ?? "",
          tao_luc: r.createdAt,
        }))
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Báo cáo nội dung"
        description="Người học báo cáo các bộ thẻ công khai có vi phạm; duyệt và xử lý tại đây."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            isLoading={exporting}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
            Xuất CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit"
          aria-label="Trạng thái báo cáo"
        >
          {STATUSES.map((s) => {
            const isActive = status === s;
            return (
              <Link
                key={s}
                to={`/admin/reports?status=${s}${q.get("deckId") ? `&deckId=${encodeURIComponent(q.get("deckId"))}` : ""}`}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all ${
                  isActive
                    ? "bg-surface-container-lowest text-primary shadow-xs"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  {STATUS_ICONS[s]}
                </span>
                <span>{REPORT_STATUS_LABELS[s]}</span>
                {isActive && data && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-label-sm font-bold ${
                      s === "OPEN" && data.total > 0
                        ? "bg-error text-white"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {data.total}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {q.get("deckId") && (
          <div className="text-body-sm text-on-surface-variant flex items-center gap-1.5 bg-surface-container-lowest border border-surface-container-high px-3 py-1.5 rounded-lg shadow-xs">
            <span>Đang lọc theo bộ thẻ #{q.get("deckId")}</span>
            <button
              type="button"
              className="text-primary font-semibold underline cursor-pointer ml-1"
              onClick={() => q.set({ deckId: undefined })}
            >
              Bỏ lọc
            </button>
          </div>
        )}
      </div>

      <AdminFlash message={flash} onClose={() => setFlash(null)} />

      <AdminTableShell
        caption={`Báo cáo ${REPORT_STATUS_LABELS[status]}`}
        stickyActions={showActions}
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText={status === "OPEN" ? "Tuyệt vời! Không còn báo cáo nào đang mở cần xử lý." : "Không có báo cáo nào."}
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} báo cáo` : undefined}
      >
        <thead>
          <tr>
            <th scope="col" className="w-36">Thời gian</th>
            <th scope="col">Bộ thẻ bị báo cáo</th>
            <th scope="col">Người báo cáo</th>
            <th scope="col">Lý do & Mô tả</th>
            {status === "OPEN" ? <th scope="col" className="w-24">Cùng bộ</th> : <th scope="col">Kết quả xử lý</th>}
            {showActions && (
              <th scope="col" className="w-24">
                <span className="sr-only">Thao tác</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-container-low/40 transition-colors">
              <td className="whitespace-nowrap text-on-surface-variant text-label-sm">
                {formatShort(r.createdAt)}
              </td>
              <td>
                <Link
                  to={`/admin/decks/${encodeURIComponent(r.deckId)}`}
                  className="font-semibold text-primary hover:underline line-clamp-1"
                >
                  {r.deckTitle ?? r.deckId}
                </Link>
                <div className="mt-0.5">
                  <AdminStatusBadge
                    label={r.deckVisibility === "public" ? "Public" : "Private"}
                    tone={r.deckVisibility === "public" ? "info" : "neutral"}
                  />
                </div>
              </td>
              <td className="text-on-surface font-semibold">{r.reporterEmail}</td>
              <td>
                <div className="mb-1">
                  <AdminStatusBadge
                    label={REPORT_REASON_LABELS[r.reason] ?? r.reason}
                    tone={r.reason === "SPAM" || r.reason === "OFFENSIVE" ? "error" : "warn"}
                    icon="report"
                  />
                </div>
                {r.detail && (
                  <div className="text-on-surface-variant max-w-sm break-words bg-surface-container-low/30 p-1.5 rounded text-body-sm italic">
                    “{r.detail}”
                  </div>
                )}
              </td>
              {status === "OPEN" ? (
                <td className="font-mono">
                  {r.sameDeckOpen > 1 ? (
                    <span className="font-bold text-error">+{r.sameDeckOpen - 1} khác</span>
                  ) : (
                    <span className="text-outline">1</span>
                  )}
                </td>
              ) : (
                <td className="text-on-surface-variant text-body-sm">
                  {r.action && (
                    <div className="font-semibold text-on-surface mb-0.5">
                      <AdminStatusBadge
                        label={reportActionLabel(r.action)}
                        tone={r.action === "NONE" ? "neutral" : "warn"}
                      />
                    </div>
                  )}
                  {r.resolutionNote && (
                    <div className="italic text-label-sm line-clamp-2">“{r.resolutionNote}”</div>
                  )}
                  <div className="text-label-sm text-outline mt-0.5">
                    {r.resolvedByEmail} · {formatShort(r.resolvedAt)}
                  </div>
                </td>
              )}
              {showActions && (
                <td>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setSelected(r)}
                  >
                    Xử lý
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
      {/* key: mỗi báo cáo một modal mới — hành động / bình luận / ghi chú của báo cáo trước không sót sang (vd. "Gỡ khỏi
          Thư viện" còn chọn sẵn khi bộ thẻ sau đã riêng tư). */}
      <ResolveReportModal
        key={selected?.id ?? "none"}
        report={selected}
        onClose={() => setSelected(null)}
        onDone={(text) => {
          setFlash({ ok: true, text });
          setRetry((n) => n + 1);
        }}
      />
    </section>
  );
};

/** Báo cáo: bộ thẻ (như trước) | từ điển (spec 2026-10-26 §8.2, ?source=dict). */
export const AdminReportsPage: React.FC = () => {
  const [params] = useSearchParams();
  const dict = params.get("source") === "dict";
  return (
    <div className="flex flex-col gap-space-md">
      <nav aria-label="Nguồn báo cáo" className="flex gap-1.5 p-1 bg-surface-container-low rounded-xl w-fit">
        {[
          { to: "/admin/reports", label: "Bộ thẻ", icon: "style", active: !dict },
          { to: "/admin/reports?source=dict", label: "Từ điển", icon: "dictionary", active: dict },
        ].map((t) => (
          <Link
            key={t.to}
            to={t.to}
            aria-current={t.active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold ${
              t.active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>
      {dict ? (
        <section className="flex flex-col gap-space-lg pb-space-xl">
          <AdminPageHeader title="Báo cáo từ điển" description="Báo lỗi mục từ (kèm đề xuất sửa) và báo cáo bình luận của người học." />
          <DictReportsPanel />
        </section>
      ) : (
        <DeckReportsPage />
      )}
    </div>
  );
};

export default AdminReportsPage;
