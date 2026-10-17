import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { fetchReports } from "@/services/adminService";
import type { ContentReport, ReportStatus } from "@/types/api.types";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { ResolveReportModal } from "@/features/admin/components/ResolveReportModal";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, formatShort } from "@/features/admin/adminUtils";

const PAGE_SIZE = 20;
const STATUSES: ReportStatus[] = ["OPEN", "RESOLVED", "DISMISSED"];

export const AdminReportsPage: React.FC = () => {
  const q = useAdminQuery({ status: "OPEN" });
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const status = (STATUSES.includes(q.get("status") as ReportStatus) ? q.get("status") : "OPEN") as ReportStatus;
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<ContentReport | null>(null);
  const { data, loading, error } = useAsync(
    () => fetchReports({ status, deckId: q.get("deckId"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Báo cáo</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Người học báo cáo bộ thẻ public; xử lý tại đây.</p>
      </div>
      <nav className="flex gap-1 border-b border-surface-container-high" aria-label="Trạng thái báo cáo">
        {STATUSES.map((s) => (
          <Link
            key={s}
            to={`/admin/reports?status=${s}${q.get("deckId") ? `&deckId=${encodeURIComponent(q.get("deckId"))}` : ""}`}
            aria-current={status === s ? "page" : undefined}
            className={`px-3 py-2 text-body-sm font-semibold border-b-2 -mb-px ${
              status === s ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {REPORT_STATUS_LABELS[s]}
            {s === status && data ? ` (${data.total})` : ""}
          </Link>
        ))}
      </nav>
      {q.get("deckId") && (
        <p className="text-body-sm text-on-surface-variant">
          Chỉ bộ thẻ {q.get("deckId")}{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => q.set({ deckId: undefined })}>
            bỏ lọc
          </button>
        </p>
      )}
      <AdminTableShell
        caption={`Báo cáo ${REPORT_STATUS_LABELS[status]}`}
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText={status === "OPEN" ? "Không còn báo cáo nào đang mở." : "Không có báo cáo nào."}
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} báo cáo` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Bộ thẻ</th>
            <th scope="col">Người báo cáo</th>
            <th scope="col">Lý do</th>
            {status === "OPEN" ? <th scope="col">Cùng bộ</th> : <th scope="col">Kết quả</th>}
            <th scope="col">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-on-surface-variant">{formatShort(r.createdAt)}</td>
              <td>
                <Link to={`/admin/decks/${encodeURIComponent(r.deckId)}`} className="font-semibold text-primary underline">
                  {r.deckTitle ?? r.deckId}
                </Link>
                <div className="text-on-surface-variant">{r.deckVisibility}</div>
              </td>
              <td>{r.reporterEmail}</td>
              <td>
                <div>{REPORT_REASON_LABELS[r.reason] ?? r.reason}</div>
                {r.detail && <div className="text-on-surface-variant max-w-xs break-words">“{r.detail}”</div>}
              </td>
              {status === "OPEN" ? (
                <td>{r.sameDeckOpen}</td>
              ) : (
                <td className="text-on-surface-variant">
                  {r.action && <div>{r.action}</div>}
                  {r.resolutionNote && <div>“{r.resolutionNote}”</div>}
                  <div>
                    {r.resolvedByEmail} · {formatShort(r.resolvedAt)}
                  </div>
                </td>
              )}
              <td>
                {status === "OPEN" && canAct && (
                  <button type="button" className="font-semibold text-primary underline cursor-pointer" onClick={() => setSelected(r)}>
                    Xử lý
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
      <ResolveReportModal report={selected} onClose={() => setSelected(null)} onDone={() => setRetry((n) => n + 1)} />
    </section>
  );
};

export default AdminReportsPage;
