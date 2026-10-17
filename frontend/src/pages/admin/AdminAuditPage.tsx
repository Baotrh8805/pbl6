import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAuditLogs } from "@/services/adminService";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { AUDIT_TARGET_LABELS, formatShort } from "@/features/admin/adminUtils";

const PAGE_SIZE = 50;
const INPUT = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm";

export const AdminAuditPage: React.FC = () => {
  const q = useAdminQuery();
  const [actor, setActor] = useState(q.get("actorId"));
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(
    () =>
      fetchAuditLogs({
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

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Nhật ký quản trị</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Mọi thao tác ghi của staff; chỉ đọc, không sửa được.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ actorId: actor.trim() });
        }}
      >
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          ID người thao tác
          <input value={actor} onChange={(e) => setActor(e.target.value)} inputMode="numeric" className={`${INPUT} w-32`} />
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Đối tượng
          <select value={q.get("targetType")} onChange={(e) => q.set({ targetType: e.target.value })} className={INPUT}>
            <option value="">Tất cả</option>
            {Object.entries(AUDIT_TARGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Từ ngày
          <input type="date" value={q.get("from")} onChange={(e) => q.set({ from: e.target.value })} className={INPUT} />
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Đến ngày
          <input type="date" value={q.get("to")} onChange={(e) => q.set({ to: e.target.value })} className={INPUT} />
        </label>
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </form>
      <AdminTableShell
        caption="Nhật ký quản trị"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Chưa có thao tác nào."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} dòng` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Lúc</th>
            <th scope="col">Ai</th>
            <th scope="col">Hành động</th>
            <th scope="col">Đối tượng</th>
            <th scope="col">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap text-on-surface-variant">{formatShort(l.createdAt)}</td>
              <td>{l.actorEmail}</td>
              <td>
                <code className="text-label-sm">{l.action}</code>
              </td>
              <td>
                {AUDIT_TARGET_LABELS[l.targetType] ?? l.targetType} <span className="text-outline break-all">{l.targetId}</span>
              </td>
              <td className="max-w-md">
                <code className="text-label-sm break-all whitespace-pre-wrap">{l.detail ? JSON.stringify(l.detail) : ""}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </section>
  );
};

export default AdminAuditPage;
