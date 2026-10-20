import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { fetchAppeals } from "@/services/adminService";
import { formatShort } from "@/features/admin/adminUtils";
import {
  APPEAL_STATUS_LABELS,
  appealLockLabel,
  isPendingError,
  parseAppealStatus,
  type AppealStatusKey,
} from "@/features/admin/moderationUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { BreakableEmail } from "@/features/admin/components/BreakableEmail";
import { AdminStatusTabs } from "@/features/admin/components/AdminStatusTabs";
import { AdminPendingNotice } from "@/features/admin/components/AdminPendingNotice";
import { AdminFlash, type AdminFlashMessage } from "@/features/admin/components/AdminFlash";
import { ResolveAppealModal } from "@/features/admin/components/ResolveAppealModal";
import { AppealReason } from "@/features/admin/components/AppealReason";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { useAdminQueues } from "@/features/admin/useAdminQueues";
import type { AccountAppeal } from "@/types/adminModeration.types";

const PAGE_SIZE = 20;

const TAB_ICONS: Record<AppealStatusKey, string> = {
  OPEN: "mark_email_unread",
  RESOLVED: "check_circle",
  DISMISSED: "cancel",
};

export const AdminAppealsPage: React.FC = () => {
  const q = useAdminQuery({ status: "OPEN" });
  const status = parseAppealStatus(q.get("status"));
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const [retry, setRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<AccountAppeal | null>(null);
  const [flash, setFlash] = useState<AdminFlashMessage | null>(null);

  const { data, loading, error } = useAsync(
    () => fetchAppeals({ status, page: q.page, size: PAGE_SIZE }),
    [q.key, retry],
    reload
  );
  // Số khiếu nại mở cho tab lấy từ AdminLayout (đã tải cho badge), không gọi lại /admin/stats.
  const { queues } = useAdminQueues();
  const rows = data?.items ?? [];
  const pending = isPendingError(error);
  const openCount = status === "OPEN" ? (data?.total ?? null) : (queues?.openAppeals ?? null);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Khiếu nại tài khoản"
        description="Người dùng bị khoá gửi khiếu nại từ trang đăng nhập; xem lý do khoá và quyết định mở khoá hay giữ nguyên."
      />

      <AdminStatusTabs
        label="Trạng thái khiếu nại"
        active={status}
        hrefFor={(s) => `/admin/appeals?status=${s}`}
        tabs={(Object.keys(APPEAL_STATUS_LABELS) as AppealStatusKey[]).map((s) => ({
          key: s,
          label: APPEAL_STATUS_LABELS[s],
          icon: TAB_ICONS[s],
          count: s === "OPEN" ? openCount : s === status ? (data?.total ?? null) : null,
          urgent: s === "OPEN",
        }))}
      />

      <AdminFlash message={flash} onClose={() => setFlash(null)} />

      {pending ? (
        <AdminPendingNotice />
      ) : (
        <AdminTableShell
          caption={`Khiếu nại ${APPEAL_STATUS_LABELS[status].toLowerCase()}`}
          stickyActions={status === "OPEN"}
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText={status === "OPEN" ? "Không có khiếu nại nào đang chờ xử lý." : "Không có khiếu nại nào."}
          onRetry={() => setRetry((n) => n + 1)}
          statusText={data ? `${data.total.toLocaleString("vi-VN")} khiếu nại` : undefined}
        >
          <thead>
            <tr>
              <th scope="col" className="w-36">Gửi lúc</th>
              <th scope="col">Email</th>
              <th scope="col">Tài khoản</th>
              <th
                scope="col"
                title="Lý do khoá lúc người dùng gửi khiếu nại, không đổi khi tài khoản được mở / khoá lại. Khiếu nại cũ không lưu lý do này: hiện lý do hiện tại kèm ghi chú."
              >
                Lý do khoá (lúc gửi)
              </th>
              <th scope="col" className="min-w-[240px]">Nội dung khiếu nại</th>
              {status === "OPEN" ? (
                <th scope="col" className="w-24">
                  <span className="sr-only">Thao tác</span>
                </th>
              ) : (
                <th scope="col">Kết quả</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-surface-container-low/40 transition-colors">
                <td className="whitespace-nowrap text-label-sm text-on-surface-variant">{formatShort(a.createdAt)}</td>
                <td className="font-semibold break-words">
                  {a.userId != null ? (
                    <Link to={`/admin/users/${a.userId}`} className="text-primary hover:underline">
                      <BreakableEmail email={a.email} />
                    </Link>
                  ) : (
                    <BreakableEmail email={a.email} />
                  )}
                </td>
                <td>
                  <AdminStatusBadge
                    label={appealLockLabel(a)}
                    tone={a.userLocked ? "error" : a.userId == null ? "neutral" : "success"}
                    icon={a.userLocked ? "lock" : a.userId == null ? "person_off" : "lock_open"}
                  />
                </td>
                <td className="text-on-surface-variant break-words max-w-[220px]">
                  <AppealReason appeal={a} />
                </td>
                <td>
                  <p className="whitespace-pre-line break-words line-clamp-4 max-w-md" title={a.message}>
                    {a.message}
                  </p>
                </td>
                {status === "OPEN" ? (
                  <td>
                    {canAct && (
                      <Button type="button" variant="primary" size="sm" onClick={() => setSelected(a)}>
                        Xử lý
                      </Button>
                    )}
                  </td>
                ) : (
                  <td className="text-body-sm text-on-surface-variant min-w-[160px]">
                    {a.status === "RESOLVED" && a.action && (
                      <div className="mb-0.5">
                        <AdminStatusBadge
                          label={a.action === "UNLOCK" ? "Đã mở khoá" : "Giữ khoá"}
                          tone={a.action === "UNLOCK" ? "success" : "warn"}
                          icon={a.action === "UNLOCK" ? "lock_open" : "lock"}
                        />
                      </div>
                    )}
                    {a.resolutionNote && <div className="italic text-label-sm line-clamp-2 break-words">“{a.resolutionNote}”</div>}
                    <div className="text-label-sm text-outline mt-0.5">
                      {a.resolvedByEmail ?? "—"} · {formatShort(a.resolvedAt)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}
      {data && !pending && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}

      {/* key: mỗi khiếu nại một modal mới (lựa chọn / ghi chú không sót sang khiếu nại khác) */}
      <ResolveAppealModal
        key={selected?.id ?? "none"}
        appeal={selected}
        viewerRole={userProfile?.role}
        onClose={() => setSelected(null)}
        onDone={(text) => {
          setFlash({ ok: true, text });
          setReload((n) => n + 1);
        }}
      />
    </section>
  );
};

export default AdminAppealsPage;
