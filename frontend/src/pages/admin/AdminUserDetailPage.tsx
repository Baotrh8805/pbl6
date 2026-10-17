import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { RANK, ROLE_LABELS, atLeast, isStaff, type Role } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchAdminUser, fetchAuditLogs, patchAdminUser, revokeUserSessions, setUserRole } from "@/services/adminService";
import { RoleBadge } from "@/features/admin/components/RoleBadge";
import { ASSIGNABLE_ROLES, formatShort } from "@/features/admin/adminUtils";
import type { AdminUserDetail } from "@/types/api.types";

const INPUT = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm";

export const AdminUserDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const dialog = useDialog();
  const { userProfile } = useAuth();
  const myRole = userProfile?.role as Role | undefined;
  const [reload, setReload] = useState(0);
  const { data: user, loading, error } = useAsync(() => fetchAdminUser(id), [id], reload);
  const logs = useAsync(() => fetchAuditLogs({ targetType: "USER", size: 100 }), [id], reload);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [limitMode, setLimitMode] = useState<"global" | "own" | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [roleDraft, setRoleDraft] = useState<Role | "">("");

  if (loading) return <p className="text-on-surface-variant">Đang tải...</p>;
  if (error || !user) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error ?? "Không tìm thấy người dùng."}
      </p>
    );
  }

  const canAct = !!myRole && atLeast(myRole, "ADMIN") && user.id !== userProfile?.id && RANK[user.role] < RANK[myRole];
  const canRole = myRole === "SUPER_ADMIN" && user.id !== userProfile?.id;
  const targetIsStaff = isStaff(user.role);
  const premiumValue = premium ?? !!user.isPremium;
  const mode = limitMode ?? (user.extractionDailyLimit === null ? "global" : "own");
  const limitInput = limitMode === null ? (user.extractionDailyLimit?.toString() ?? "") : limitValue;
  const related = (logs.data?.items ?? []).filter((l) => l.targetId === String(user.id)).slice(0, 5);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setStatus({ ok: true, text: `${label} thành công.` });
      setReload((n) => n + 1);
    } catch (e) {
      setStatus({ ok: false, text: extractErrorMessage(e) });
    }
  };

  const toggleLock = async (u: AdminUserDetail) => {
    const locking = !u.lockedAt;
    const ok = await dialog.confirm({
      title: locking ? `Khoá ${u.email}?` : `Mở khoá ${u.email}?`,
      message: locking
        ? "Người này bị đăng xuất khỏi mọi thiết bị ngay và không đăng nhập lại được cho tới khi mở khoá."
        : "Người này có thể đăng nhập trở lại.",
      confirmLabel: locking ? "Khoá" : "Mở khoá",
      tone: locking ? "danger" : "info",
      action: () => patchAdminUser(u.id, { locked: locking }),
    });
    if (ok) setReload((n) => n + 1);
  };

  const changeRole = async () => {
    if (!roleDraft || roleDraft === user.role) return;
    const toStaff = isStaff(roleDraft);
    const ok = await dialog.confirm({
      title: `Đổi vai trò của ${user.email} thành ${ROLE_LABELS[roleDraft]}?`,
      message: toStaff
        ? `${user.email} sẽ không còn vào được phần học; bộ thẻ và tiến độ được giữ nguyên trong DB, hiện lại khi đổi về Người học. Mọi phiên đăng nhập bị thu hồi.`
        : "Người này vào lại phần học như bình thường. Mọi phiên đăng nhập bị thu hồi.",
      confirmLabel: "Đổi",
      tone: "warning",
      action: () => setUserRole(user.id, roleDraft),
    });
    if (ok) {
      setRoleDraft("");
      setReload((n) => n + 1);
    }
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <Link to="/admin/users" className="text-body-sm text-primary underline">
          ← Người dùng
        </Link>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1 break-all">{user.email}</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5 flex flex-wrap items-center gap-2">
          <span>{user.fullName || "(chưa đặt tên)"}</span>
          <RoleBadge role={user.role} />
          {user.lockedAt && <span className="font-bold text-error">🔒 Đang khoá từ {formatShort(user.lockedAt)}</span>}
          {!targetIsStaff && <span>{user.isPremium ? "Premium" : "Free"}</span>}
          {user.jlptLevel && <span>· {user.jlptLevel}</span>}
          <span>· tạo {formatShort(user.createdAt)}</span>
          <span>· ôn gần nhất {formatShort(user.lastReviewAt)}</span>
        </p>
        {!targetIsStaff && (
          <p className="text-body-sm text-on-surface-variant mt-1">
            Bộ thẻ {user.deckCount} · Thẻ {user.cardCount} · Bóc tách {user.extractionCount} (hôm nay {user.extractionsToday}) · Quiz{" "}
            {user.quizCount} · Phiên {user.activeSessions}
          </p>
        )}
      </div>

      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-body-sm ${status.ok ? "text-secondary" : "text-error"}`}>
          {status.text}
        </p>
      )}

      {(canAct || canRole) && (
        <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest divide-y divide-surface-container-high">
          {canAct && (
            <>
              <div className="p-space-md flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Trạng thái</span>
                <Button variant={user.lockedAt ? "secondary" : "danger"} size="sm" onClick={() => toggleLock(user)}>
                  {user.lockedAt ? "Mở khoá" : "Khoá tài khoản"}
                </Button>
              </div>
              {!targetIsStaff && (
                <>
                  <form
                    className="p-space-md flex flex-wrap items-center justify-between gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("Cập nhật Premium", () => patchAdminUser(user.id, { premium: premiumValue }));
                    }}
                  >
                    <label className="flex items-center gap-2 font-semibold">
                      <input type="checkbox" checked={premiumValue} onChange={(e) => setPremium(e.target.checked)} />
                      Premium
                    </label>
                    <Button type="submit" variant="outline" size="sm" disabled={premiumValue === !!user.isPremium}>
                      Lưu
                    </Button>
                  </form>
                  <form
                    className="p-space-md flex flex-wrap items-center justify-between gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("Cập nhật hạn mức", () =>
                        patchAdminUser(user.id, mode === "global" ? { clearLimit: true } : { extractionDailyLimit: Number(limitInput) })
                      );
                    }}
                  >
                    <fieldset className="flex flex-wrap items-center gap-3">
                      <legend className="font-semibold mb-1">Hạn mức bóc tách / ngày</legend>
                      <label className="flex items-center gap-1.5 text-body-sm">
                        <input type="radio" name="limit" checked={mode === "global"} onChange={() => setLimitMode("global")} />
                        Theo cấu hình chung
                      </label>
                      <label className="flex items-center gap-1.5 text-body-sm">
                        <input type="radio" name="limit" checked={mode === "own"} onChange={() => setLimitMode("own")} />
                        Riêng:
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          required={mode === "own"}
                          disabled={mode !== "own"}
                          value={limitInput}
                          onChange={(e) => {
                            setLimitMode("own");
                            setLimitValue(e.target.value);
                          }}
                          className={`${INPUT} w-24`}
                          aria-label="Hạn mức riêng (0–1000)"
                        />
                      </label>
                    </fieldset>
                    <Button type="submit" variant="outline" size="sm">
                      Lưu
                    </Button>
                  </form>
                </>
              )}
              <div className="p-space-md flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Phiên đăng nhập ({user.activeSessions})</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Thu hồi mọi phiên?",
                      message: `${user.email} bị đăng xuất khỏi mọi thiết bị; mật khẩu không đổi.`,
                      confirmLabel: "Thu hồi",
                      tone: "warning",
                      action: () => revokeUserSessions(user.id),
                    });
                    if (ok) setReload((n) => n + 1);
                  }}
                >
                  Thu hồi mọi phiên
                </Button>
              </div>
            </>
          )}
          {canRole && (
            <div className="p-space-md flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-semibold">
                Vai trò
                <select value={roleDraft || user.role} onChange={(e) => setRoleDraft(e.target.value as Role)} className={INPUT}>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={changeRole} disabled={!roleDraft || roleDraft === user.role}>
                Đổi
              </Button>
            </div>
          )}
        </div>
      )}
      {myRole && !canAct && !canRole && (
        <p className="text-body-sm text-on-surface-variant">
          {user.id === userProfile?.id ? "Đây là tài khoản của bạn." : "Bạn không có quyền thao tác trên tài khoản này."}
        </p>
      )}

      <div>
        <h2 className="font-semibold text-on-surface mb-2">
          Nhật ký liên quan{" "}
          <Link to="/admin/audit" className="text-body-sm text-primary underline font-normal">
            xem tất cả
          </Link>
        </h2>
        {related.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Chưa có thao tác quản trị nào trên tài khoản này.</p>
        ) : (
          <ul className="text-body-sm divide-y divide-surface-container-high rounded-2xl border border-surface-container-high bg-surface-container-lowest">
            {related.map((l) => (
              <li key={l.id} className="p-2 flex flex-wrap gap-2">
                <span className="text-on-surface-variant whitespace-nowrap">{formatShort(l.createdAt)}</span>
                <span>{l.actorEmail}</span>
                <code className="text-label-sm">{l.action}</code>
                <span className="text-on-surface-variant break-all">{l.detail ? JSON.stringify(l.detail) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default AdminUserDetailPage;
