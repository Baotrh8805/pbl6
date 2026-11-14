import React, { useState } from "react";
import { datedFileName } from "@/lib/dateFile";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminUsers } from "@/services/adminService";
import {
  STAFF_ROLES,
  STAFF_ROLE_FILTER,
  adminAccountStatus,
  downloadCsv,
  fetchAllPages,
  formatShort,
  mergeStaffPage,
  stringToHslColor,
  stringToTextColor,
} from "@/features/admin/adminUtils";
import { getInitials } from "@/lib/textUtils";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminStatusBadge, RoleStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { ROLE_LABELS, type Role } from "@/lib/roles";

const PAGE_SIZE = 20;

export const AdminUsersPage: React.FC = () => {
  const q = useAdminQuery();
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // ?role=STAFF (tab "Đội ngũ Staff"): backend chỉ lọc một vai trò mỗi lần -> tải đủ ADMIN và SUPER_ADMIN (đội staff
  // ít người) rồi gộp, phân trang ở máy khách. Vai trò khác: gọi thẳng như trước.
  const isStaffFilter = q.get("role") === STAFF_ROLE_FILTER;
  const baseFilter = () => ({ q: q.get("q"), premium: q.get("premium"), locked: q.get("locked"), verified: q.get("verified") });
  const fetchAllStaff = async () =>
    (
      await Promise.all(
        STAFF_ROLES.map((role) => fetchAllPages((page, size) => fetchAdminUsers({ ...baseFilter(), role, page, size })))
      )
    ).flat();

  const { data, loading, error } = useAsync(
    async () =>
      isStaffFilter
        ? mergeStaffPage(await fetchAllStaff(), q.page, PAGE_SIZE)
        : fetchAdminUsers({ ...baseFilter(), role: q.get("role"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry]
  );
  const users = data?.items ?? [];

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const rows = isStaffFilter
        ? mergeStaffPage(await fetchAllStaff(), 0, Number.MAX_SAFE_INTEGER).items
        : await fetchAllPages((page, size) => fetchAdminUsers({ ...baseFilter(), role: q.get("role"), page, size }));
      downloadCsv(
        datedFileName("nguoi-dung", "csv"),   // B5.6: ngày theo giờ máy, không phải UTC
        rows.map((u) => ({
          id: u.id,
          email: u.email,
          ten: u.fullName ?? "",
          vai_tro: u.role,
          premium: u.isPremium ? 1 : 0,
          khoa_tu: u.lockedAt ?? "",
          da_xoa: u.deleted ? 1 : 0,
          tao_luc: u.createdAt ?? "",
          so_bo_the: u.deckCount,
        }))
      );
    } finally {
      setExporting(false);
    }
  };

  const copyEmail = (id: number, email: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(email).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
      });
    }
  };

  const currentRole = q.get("role");
  const currentPremium = q.get("premium");
  const currentLocked = q.get("locked");
  const currentVerified = q.get("verified");
  const hasFilters = Boolean(q.get("q") || currentRole || currentPremium || currentLocked);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Quản lý Người dùng"
        description="Tra cứu, quản trị tài khoản học viên, cấp gói Pro và kiểm soát quyền hạn Staff."
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

      {/* Dải nút lọc nhanh (Quick Preset Filters) */}
      <div className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit flex-wrap">
        <button
          type="button"
          onClick={() => q.set({ role: undefined, premium: undefined, locked: undefined, verified: undefined })}
          className={`px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            !currentRole && !currentPremium && !currentLocked && !currentVerified
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Tất cả người dùng
        </button>
        <button
          type="button"
          onClick={() => q.set({ premium: "true", role: undefined, locked: undefined, verified: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            currentPremium === "true"
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-amber-500">star</span>
          <span>Học viên Pro</span>
        </button>
        <button
          type="button"
          onClick={() => q.set({ locked: "true", premium: undefined, role: undefined, verified: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            currentLocked === "true"
              ? "bg-surface-container-lowest text-error shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">lock</span>
          <span>Đang bị khoá</span>
        </button>
        <button
          type="button"
          onClick={() => q.set({ role: STAFF_ROLE_FILTER, premium: undefined, locked: undefined, verified: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            currentRole === STAFF_ROLE_FILTER
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">shield</span>
          <span>Đội ngũ Staff</span>
        </button>
        <button
          type="button"
          onClick={() => q.set({ verified: "false", role: undefined, premium: undefined, locked: undefined })}
          title="Tài khoản đã đăng ký nhưng chưa bấm link xác thực email (tự xoá sau 48 giờ)"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            currentVerified === "false"
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">mark_email_unread</span>
          <span>Chưa xác thực</span>
        </button>
      </div>

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Tìm email / họ tên
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-60`}
            placeholder="nhap-email@..."
          />
        </label>
        <label className={adminLabelClass}>
          Vai trò
          <select
            value={q.get("role")}
            onChange={(e) => q.set({ role: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả vai trò</option>
            <option value={STAFF_ROLE_FILTER}>Toàn bộ staff (Admin + Super admin)</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass}>
          Gói cước
          <select
            value={q.get("premium")}
            onChange={(e) => q.set({ premium: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả gói</option>
            <option value="true">Premium (Pro)</option>
            <option value="false">Miễn phí (Free)</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          Trạng thái
          <select
            value={q.get("locked")}
            onChange={(e) => q.set({ locked: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="true">Đang khoá</option>
            <option value="false">Bình thường</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Lọc kết quả
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft("");
                q.set({ q: undefined, role: undefined, premium: undefined, locked: undefined, verified: undefined });
              }}
            >
              Đặt lại
            </Button>
          )}
        </div>
      </AdminFilterBar>

      <AdminTableShell
        caption="Danh sách người dùng"
        stickyActions
        loading={loading}
        error={error}
        empty={users.length === 0}
        emptyText="Không tìm thấy tài khoản nào khớp với điều kiện lọc."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} tài khoản học viên & staff` : undefined}
      >
        <thead>
          <tr>
            <th scope="col" className="w-16">ID</th>
            <th scope="col">Học viên</th>
            <th scope="col">Vai trò</th>
            <th scope="col">Gói dịch vụ</th>
            <th scope="col">Bộ thẻ</th>
            <th scope="col">Ngày gia nhập</th>
            <th scope="col" className="w-24 text-right">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isCopied = copiedId === u.id;
            const initials = getInitials(u.fullName || u.email);
            const avatarBg = stringToHslColor(u.email);
            const avatarColor = stringToTextColor(u.email);

            return (
              <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="text-outline font-mono text-label-sm">{u.id}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-label-sm shrink-0 select-none shadow-2xs"
                      style={{ backgroundColor: avatarBg, color: avatarColor }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-on-surface">
                        <Link to={`/admin/users/${u.id}`} className="hover:underline truncate hover:text-primary">
                          {u.email}
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => copyEmail(u.id, u.email, e)}
                          title={isCopied ? "Đã sao chép email!" : "Sao chép email"}
                          aria-label={`Sao chép email ${u.email}`}
                          className="text-outline hover:text-on-surface p-0.5 rounded hover:bg-surface-container cursor-pointer transition-colors"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                            {isCopied ? "check" : "content_copy"}
                          </span>
                        </button>
                      </div>
                      <div className="text-on-surface-variant text-label-sm truncate">
                        {u.fullName || <span className="italic text-outline">Chưa đặt họ tên</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <RoleStatusBadge role={u.role} />
                    {/* Tài khoản đã tự xoá cũng có lockedAt nhưng không mở khoá được -> nhãn riêng, không lẫn với "Khoá" */}
                    {adminAccountStatus(u) === "deleted" ? (
                      <AdminStatusBadge label="Đã xoá" tone="neutral" icon="person_off" />
                    ) : (
                      u.lockedAt && <AdminStatusBadge label="Khoá" tone="error" icon="lock" />
                    )}
                    {adminAccountStatus(u) !== "deleted" && u.emailVerified === false && (
                      <AdminStatusBadge label="Chưa xác thực" tone="warn" icon="mark_email_unread" />
                    )}
                  </div>
                </td>
                <td>
                  {u.role === "USER" ? (
                    u.isPremium ? (
                      <AdminStatusBadge label="Pro" tone="info" icon="star" />
                    ) : (
                      <span className="text-on-surface-variant text-label-sm">Free</span>
                    )
                  ) : (
                    <span className="text-outline">—</span>
                  )}
                </td>
                <td>
                  {u.role === "USER" ? (
                    <Link
                      to={`/admin/decks?ownerId=${u.id}`}
                      title="Xem các bộ thẻ của người dùng này"
                      className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                    >
                      <span>{u.deckCount}</span>
                      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                        open_in_new
                      </span>
                    </Link>
                  ) : (
                    <span className="text-outline font-mono">—</span>
                  )}
                </td>
                <td className="text-on-surface-variant text-label-sm whitespace-nowrap">
                  {formatShort(u.createdAt)}
                </td>
                <td className="text-right">
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container hover:border-primary text-body-sm font-semibold text-primary transition-all"
                  >
                    <span>Chi tiết</span>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </section>
  );
};

export default AdminUsersPage;
