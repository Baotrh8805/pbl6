import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminUsers } from "@/services/adminService";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { RoleBadge } from "@/features/admin/components/RoleBadge";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { formatShort } from "@/features/admin/adminUtils";
import { ROLE_LABELS, type Role } from "@/lib/roles";

const PAGE_SIZE = 20;
const SELECT = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm";

export const AdminUsersPage: React.FC = () => {
  const q = useAdminQuery();
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(
    () =>
      fetchAdminUsers({
        q: q.get("q"),
        role: q.get("role"),
        premium: q.get("premium"),
        locked: q.get("locked"),
        page: q.page,
        size: PAGE_SIZE,
      }),
    [q.key, retry]
  );
  const users = data?.items ?? [];

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Người dùng</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Tìm, lọc và mở chi tiết để khoá, cấp Premium, đặt hạn mức AI.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Email / tên
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${SELECT} w-56`}
            placeholder="a@x.vn"
          />
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Vai trò
          <select value={q.get("role")} onChange={(e) => q.set({ role: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Premium
          <select value={q.get("premium")} onChange={(e) => q.set({ premium: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            <option value="true">Có</option>
            <option value="false">Không</option>
          </select>
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Khoá
          <select value={q.get("locked")} onChange={(e) => q.set({ locked: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            <option value="true">Đang khoá</option>
            <option value="false">Bình thường</option>
          </select>
        </label>
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </form>

      <AdminTableShell
        caption="Danh sách người dùng"
        loading={loading}
        error={error}
        empty={users.length === 0}
        emptyText="Không có tài khoản nào khớp bộ lọc."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} tài khoản` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Email · Tên</th>
            <th scope="col">Vai trò</th>
            <th scope="col">Premium</th>
            <th scope="col">Bộ thẻ</th>
            <th scope="col">Tạo</th>
            <th scope="col">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="text-outline">{u.id}</td>
              <td>
                <div className="font-semibold text-on-surface">{u.email}</div>
                <div className="text-on-surface-variant">{u.fullName || "(chưa đặt)"}</div>
              </td>
              <td>
                <RoleBadge role={u.role} />
                {u.lockedAt && <span className="ml-1 text-label-sm font-bold text-error">🔒 Khoá</span>}
              </td>
              <td>{u.role === "USER" ? (u.isPremium ? "Có" : "Không") : "—"}</td>
              <td>{u.role === "USER" ? u.deckCount : "—"}</td>
              <td className="text-on-surface-variant whitespace-nowrap">{formatShort(u.createdAt)}</td>
              <td>
                <Link to={`/admin/users/${u.id}`} className="font-semibold text-primary underline">
                  Xem
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </section>
  );
};

export default AdminUsersPage;
