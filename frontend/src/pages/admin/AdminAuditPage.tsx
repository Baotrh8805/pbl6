import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAuditLogs } from "@/services/adminService";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminJsonViewer } from "@/features/admin/components/AdminJsonViewer";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { AUDIT_TARGET_LABELS, auditFilterError, formatShort } from "@/features/admin/adminUtils";
import { BreakableEmail } from "@/features/admin/components/BreakableEmail";

const PAGE_SIZE = 50;

export const AdminAuditPage: React.FC = () => {
  const q = useAdminQuery();
  const [actor, setActor] = useState(q.get("actorId"));
  const [actorError, setActorError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Bộ lọc trên URL sai (ID không phải số, từ ngày > đến ngày — kể cả link gõ tay): không gửi lên server (400 / 0 dòng
  // không rõ lý do), báo ngay câu sửa thế nào.
  const filterError = auditFilterError({ actorId: q.get("actorId"), from: q.get("from"), to: q.get("to") });
  const { data, loading, error } = useAsync(
    () =>
      filterError
        ? Promise.resolve(null)
        : fetchAuditLogs({
            actorId: q.get("actorId"),
            targetType: q.get("targetType"),
            from: q.get("from"),
            to: q.get("to"),
            page: q.page,
            size: PAGE_SIZE,
          }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];

  const handleLast7Days = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const to = today.toISOString().slice(0, 10);
    const from = sevenDaysAgo.toISOString().slice(0, 10);
    q.set({ from, to });
  };

  const hasFilters = Boolean(q.get("actorId") || q.get("targetType") || q.get("from") || q.get("to"));

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Nhật ký quản trị"
        description="Toàn bộ thao tác ghi của đội ngũ Staff; lưu trữ an toàn, chỉ đọc, không thể chỉnh sửa."
      />

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          const invalid = auditFilterError({ actorId: actor, from: "", to: "" });
          setActorError(invalid);
          if (!invalid) q.set({ actorId: actor.trim() });
        }}
      >
        <label className={adminLabelClass}>
          ID người thao tác
          <input
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              if (actorError) setActorError(auditFilterError({ actorId: e.target.value, from: "", to: "" }));
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Ví dụ: 1"
            aria-invalid={!!actorError}
            aria-describedby={actorError ? "audit-actor-error" : undefined}
            className={`${adminFieldClass} w-32`}
          />
          {actorError && (
            <span id="audit-actor-error" role="alert" className="text-label-sm text-error font-normal normal-case max-w-[12rem]">
              {actorError}
            </span>
          )}
        </label>
        <label className={adminLabelClass}>
          Đối tượng
          <select
            value={q.get("targetType")}
            onChange={(e) => q.set({ targetType: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả</option>
            {Object.entries(AUDIT_TARGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass}>
          Từ ngày
          <input
            type="date"
            value={q.get("from")}
            max={q.get("to") || undefined}
            onChange={(e) => q.set({ from: e.target.value })}
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Đến ngày
          <input
            type="date"
            value={q.get("to")}
            min={q.get("from") || undefined}
            onChange={(e) => q.set({ to: e.target.value })}
            className={adminFieldClass}
          />
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Lọc
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleLast7Days}>
            7 ngày gần nhất
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActor("");
                setActorError(null);
                q.set({ actorId: undefined, targetType: undefined, from: undefined, to: undefined });
              }}
            >
              Đặt lại
            </Button>
          )}
        </div>
      </AdminFilterBar>

      {filterError && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Bộ lọc chưa hợp lệ: {filterError}
        </p>
      )}

      {!filterError && (
        <AdminTableShell
          caption="Nhật ký quản trị"
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText="Chưa ghi nhận thao tác quản trị nào trong khoảng thời gian này."
          onRetry={() => setRetry((n) => n + 1)}
          statusText={data ? `${data.total.toLocaleString("vi-VN")} bản ghi` : undefined}
        >
          <thead>
            <tr>
              <th scope="col" className="w-36">Thời điểm</th>
              <th scope="col">Người thực hiện</th>
              <th scope="col">Hành động</th>
              <th scope="col">Đối tượng</th>
              <th scope="col">Chi tiết thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-surface-container-low/40 transition-colors">
                <td className="whitespace-nowrap text-on-surface-variant text-label-sm">
                  {formatShort(l.createdAt)}
                </td>
                <td className="font-semibold text-on-surface break-words min-w-[8rem]">
                  <BreakableEmail email={l.actorEmail} />
                </td>
                <td>
                  <AdminStatusBadge label={l.action} tone="info" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-on-surface">{AUDIT_TARGET_LABELS[l.targetType] ?? l.targetType}</span>
                    <span className="font-mono text-outline text-label-sm">#{l.targetId}</span>
                  </div>
                </td>
                <td className="max-w-md">
                  {/* Tóm tắt hẹp hơn dưới 2xl: bảng 5 cột vừa khung ~960 px ở 1280 px, nút Sao chép / mở rộng không phải cuộn ngang mới thấy */}
                  <AdminJsonViewer data={l.detail} summaryClassName="max-w-[11rem] 2xl:max-w-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </section>
  );
};

export default AdminAuditPage;
