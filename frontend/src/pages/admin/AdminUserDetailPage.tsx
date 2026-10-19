import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { RANK, ROLE_LABELS, atLeast, isStaff, type Role } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import {
  fetchAdminDecks,
  fetchAdminUser,
  fetchAuditLogs,
  patchAdminUser,
  revokeUserSessions,
  setUserRole,
  verifyUserEmail,
} from "@/services/adminService";
import { AdminStatusBadge, RoleStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminDetailCard } from "@/features/admin/components/AdminDetailCard";
import { AdminJsonViewer } from "@/features/admin/components/AdminJsonViewer";
import { adminFieldClass } from "@/features/admin/components/AdminFilterBar";
import {
  ASSIGNABLE_ROLES,
  adminAccountStatus,
  formatShort,
  stringToHslColor,
  stringToTextColor,
} from "@/features/admin/adminUtils";
import { getInitials } from "@/lib/textUtils";
import type { AdminUserDetail } from "@/types/api.types";

export const AdminUserDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const dialog = useDialog();
  const { userProfile } = useAuth();
  const myRole = userProfile?.role as Role | undefined;
  const [reload, setReload] = useState(0);
  const { data: user, loading, error } = useAsync(() => fetchAdminUser(id), [id], reload);
  const userDecks = useAsync(() => fetchAdminDecks({ ownerId: id, size: 8 }), [id], reload);
  const logs = useAsync(() => fetchAuditLogs({ targetType: "USER", size: 100 }), [id], reload);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [limitMode, setLimitMode] = useState<"global" | "own" | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [roleDraft, setRoleDraft] = useState<Role | "">("");
  const [lockReason, setLockReason] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);

  if (loading) return <p className="text-on-surface-variant p-space-md">Đang tải thông tin người dùng...</p>;
  if (error || !user) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error ?? "Không tìm thấy người dùng."}
      </p>
    );
  }

  const canAct = !!myRole && atLeast(myRole, "ADMIN") && user.id !== userProfile?.id && RANK[user.role] < RANK[myRole];
  // Tài khoản đã tự xoá: backend trả 409 cho mở khoá / Premium / hạn mức / vai trò -> ẩn các nút đó, chỉ còn thu hồi phiên.
  const accountStatus = adminAccountStatus(user);
  const isDeleted = accountStatus === "deleted";
  const canRole = myRole === "SUPER_ADMIN" && user.id !== userProfile?.id && !isDeleted;
  // §3 (A1): backend chỉ yêu cầu ADMIN; staff không bị chặn bởi xác thực nên không cần quy tắc bậc ở đây.
  // Tài khoản đã xoá không đăng nhập lại được nên xác thực email cũng vô nghĩa.
  const canVerifyEmail =
    atLeast(myRole, "ADMIN") && user.id !== userProfile?.id && user.emailVerified === false && !isDeleted;
  const targetIsStaff = isStaff(user.role);
  const premiumValue = premium ?? !!user.isPremium;
  const currentUntil = user.premiumUntil ? user.premiumUntil.slice(0, 10) : "";
  const untilValue = premiumUntil ?? currentUntil;
  const premiumDirty = premiumValue !== !!user.isPremium || (premiumValue && untilValue !== currentUntil);
  const mode = limitMode ?? (user.extractionDailyLimit === null ? "global" : "own");
  const limitInput = limitMode === null ? (user.extractionDailyLimit?.toString() ?? "") : limitValue;
  const related = (logs.data?.items ?? []).filter((l) => l.targetId === String(user.id)).slice(0, 6);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setStatus({ ok: true, text: `${label} thành công.` });
      setReload((n) => n + 1);
    } catch (e) {
      setStatus({ ok: false, text: extractErrorMessage(e) });
    }
  };

  const copyEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(user.email).then(() => {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      });
    }
  };

  const toggleLock = async (u: AdminUserDetail) => {
    const locking = !u.lockedAt;
    const ok = await dialog.confirm({
      title: locking ? `Khoá tài khoản ${u.email}?` : `Mở khoá ${u.email}?`,
      message: locking
        ? `Người này bị đăng xuất khỏi mọi thiết bị ngay và không đăng nhập lại được cho tới khi mở khoá.${
            lockReason.trim() ? ` Lý do hiện cho họ: "${lockReason.trim()}".` : ""
          }`
        : "Người này có thể đăng nhập trở lại.",
      confirmLabel: locking ? "Khoá tài khoản" : "Mở khoá",
      tone: locking ? "danger" : "info",
      action: () =>
        patchAdminUser(u.id, {
          locked: locking,
          ...(locking && lockReason.trim() ? { lockedReason: lockReason.trim() } : {}),
        }),
    });
    if (ok) {
      setLockReason("");
      setStatus({ ok: true, text: locking ? `Đã khoá tài khoản ${u.email}.` : `Đã mở khoá tài khoản ${u.email}.` });
      setReload((n) => n + 1);
    }
  };

  const verifyEmail = async () => {
    const ok = await dialog.confirm({
      title: `Xác thực email ${user.email}?`,
      message:
        "Dùng khi người dùng không nhận được thư xác thực. Tài khoản đăng nhập được ngay; thao tác được ghi vào nhật ký quản trị.",
      confirmLabel: "Xác thực",
      tone: "info",
      action: () => verifyUserEmail(user.id),
    });
    if (ok) {
      setStatus({ ok: true, text: "Đã xác thực email thủ công." });
      setReload((n) => n + 1);
    }
  };

  const changeRole = async () => {
    if (!roleDraft || roleDraft === user.role) return;
    const toStaff = isStaff(roleDraft);
    const ok = await dialog.confirm({
      title: `Đổi vai trò của ${user.email} thành ${ROLE_LABELS[roleDraft]}?`,
      message: toStaff
        ? `${user.email} sẽ không còn vào được phần học; bộ thẻ và tiến độ được giữ nguyên trong DB, hiện lại khi đổi về Người học. Mọi phiên đăng nhập bị thu hồi.`
        : "Người này vào lại phần học như bình thường. Mọi phiên đăng nhập bị thu hồi.",
      confirmLabel: "Xác nhận đổi",
      tone: "warning",
      action: () => setUserRole(user.id, roleDraft),
    });
    if (ok) {
      setRoleDraft("");
      setStatus({ ok: true, text: `Đã đổi vai trò của ${user.email} thành ${ROLE_LABELS[roleDraft]}; mọi phiên đăng nhập đã bị thu hồi.` });
      setReload((n) => n + 1);
    }
  };

  const initials = getInitials(user.fullName || user.email);
  const avatarBg = stringToHslColor(user.email);
  const avatarColor = stringToTextColor(user.email);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      {/* Top breadcrumb & Actions feedback */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:underline"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          <span>Quay lại danh sách Người dùng</span>
        </Link>

        {isDeleted ? (
          <span className="inline-flex items-center gap-1 text-label-sm font-semibold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant border border-surface-container-high">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
              person_off
            </span>
            <span>Tài khoản đã bị xoá theo yêu cầu</span>
          </span>
        ) : (
          user.lockedAt && (
            <span className="inline-flex items-center gap-1 text-label-sm font-semibold px-2.5 py-1 rounded-full bg-error/15 text-error border border-error/30 animate-pulse">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                lock
              </span>
              <span>Tài khoản đang bị khoá</span>
            </span>
          )
        )}
      </div>

      {status && (
        <div
          role={status.ok ? "status" : "alert"}
          className={`p-space-sm rounded-xl border text-body-sm flex items-center justify-between gap-2 shadow-xs transition-all ${
            status.ok
              ? "bg-secondary-container/20 border-secondary/30 text-secondary"
              : "bg-error/10 border-error/20 text-error"
          }`}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {status.ok ? "check_circle" : "error"}
            </span>
            <span>{status.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className="text-outline hover:text-on-surface p-1 rounded transition-colors cursor-pointer"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* 
        ========================================================================
        THÔNG TIN CƠ BẢN LÀ CHÍNH: Hero Card thông tin định danh & trạng thái cốt lõi
        ========================================================================
      */}
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md shadow-xs flex flex-col gap-4">
        {/* Hàng 1: Avatar, Tên, Email + Sao chép, Badges chính */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-surface-container-high/60">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center font-bold text-headline-sm shrink-0 select-none shadow-xs ring-2 ring-surface-container-high"
              style={{ backgroundColor: avatarBg, color: avatarColor }}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-headline-sm text-on-surface truncate">
                  {user.fullName || "(Chưa đặt tên)"}
                </h1>
                <span className="text-label-sm font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  #{user.id}
                </span>
              </div>

              {/* Email có nút bấm sao chép tức thì */}
              <div className="flex items-center gap-2 text-body-sm text-on-surface-variant font-mono mt-0.5 min-w-0">
                <span className="truncate">{user.email}</span>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded bg-surface-container-low hover:bg-surface-container-high border border-surface-container-high transition-colors cursor-pointer"
                  title="Sao chép email người dùng"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                    {copiedEmail ? "check" : "content_copy"}
                  </span>
                  <span>{copiedEmail ? "Đã chép" : "Sao chép"}</span>
                </button>
              </div>

              {/* Trạng thái xác thực email (§3): backend cũ không trả emailVerified -> ẩn hẳn dòng này */}
              {user.emailVerified !== undefined && (
                <div className="flex items-center gap-2 flex-wrap mt-1.5 text-body-sm">
                  <span
                    className={`inline-flex items-center gap-1 ${
                      user.emailVerified ? "text-secondary" : "text-error font-semibold"
                    }`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      {user.emailVerified ? "mark_email_read" : "unsubscribe"}
                    </span>
                    <span>Email: {user.emailVerified ? "đã xác thực" : "chưa xác thực"}</span>
                  </span>
                  {canVerifyEmail && (
                    <Button variant="outline" size="sm" onClick={verifyEmail}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        verified
                      </span>
                      <span>Xác thực thủ công</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Dải huy hiệu trạng thái chính */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <RoleStatusBadge role={user.role} />
            {accountStatus === "deleted" ? (
              <AdminStatusBadge label="Đã xoá" tone="neutral" icon="person_off" />
            ) : accountStatus === "locked" ? (
              <AdminStatusBadge label="Đang khoá" tone="error" icon="lock" />
            ) : (
              <AdminStatusBadge label="Hoạt động" tone="success" icon="check_circle" />
            )}
            {!targetIsStaff && (
              <AdminStatusBadge
                label={
                  user.isPremium
                    ? user.premiumUntil
                      ? `Pro đến ${formatShort(user.premiumUntil)}`
                      : "Pro vĩnh viễn"
                    : "Free"
                }
                tone={user.isPremium ? "info" : "neutral"}
                icon={user.isPremium ? "star" : undefined}
              />
            )}
            {user.jlptLevel && (
              <span className="inline-flex items-center gap-1 text-label-sm font-semibold px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant border border-primary/20">
                JLPT {user.jlptLevel}
              </span>
            )}
            {targetIsStaff && user.mustChangePassword && (
              <AdminStatusBadge label="Chưa đổi MK seed" tone="warn" icon="warning" />
            )}
          </div>
        </div>

        {/* Hàng 2: Bảng thông số định danh cơ bản */}
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-body-sm">
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">calendar_today</span>
              <span>Gia nhập</span>
            </dt>
            <dd className="font-semibold text-on-surface mt-0.5">{formatShort(user.createdAt)}</dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">history_edu</span>
              <span>Lần ôn gần nhất</span>
            </dt>
            <dd className="font-semibold text-on-surface mt-0.5">{formatShort(user.lastReviewAt)}</dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">devices</span>
              <span>Phiên đăng nhập</span>
            </dt>
            <dd className="font-semibold text-on-surface mt-0.5">{user.activeSessions} thiết bị</dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">verified_user</span>
              <span>Phân loại</span>
            </dt>
            <dd className="font-semibold text-on-surface mt-0.5">
              {targetIsStaff ? "Quản trị viên" : "Học viên flashcard"}
            </dd>
          </div>
        </dl>

        {/* 
          Hàng 3: THÔNG TIN BỔ SUNG DẠNG THU GỌN - Dải chỉ số học tập (Inline Metrics Strip)
          Thay vì 4 khối thẻ to đùng chiếm màn hình, thu nhỏ thành dải thông số ngang tinh gọn!
        */}
        {!targetIsStaff && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container-high/60">
            <div className="flex items-center gap-1.5 text-label-sm font-semibold text-outline uppercase tracking-wider">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">analytics</span>
              <span>Chỉ số học tập:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-surface-container-high text-body-sm text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">style</span>
                <span className="font-bold text-primary">{user.deckCount}</span>
                <span className="text-outline text-label-sm">bộ thẻ</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-surface-container-high text-body-sm text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">view_carousel</span>
                <span className="font-bold text-primary">{user.cardCount}</span>
                <span className="text-outline text-label-sm">thẻ từ</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-surface-container-high text-body-sm text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">psychology</span>
                <span className="font-bold text-primary">{user.extractionCount}</span>
                <span className="text-outline text-label-sm">lượt AI</span>
                <span className="text-[11px] text-outline font-medium">({user.extractionsToday} hôm nay)</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-surface-container-high text-body-sm text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">quiz</span>
                <span className="font-bold text-primary">{user.quizCount}</span>
                <span className="text-outline text-label-sm">bài quiz</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 
        ========================================================================
        BỐ CỤC 2 CỘT CÂN BẰNG: 
        - Cột trái (7/12): Thao tác quản trị chính (Bảo mật, Gói cước, Phân quyền)
        - Cột phải (5/12): Thông tin bổ sung thu gọn (Bộ thẻ, Nhật ký liên quan)
        ========================================================================
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* CỘT TRÁI: CÁC THAO TÁC QUẢN TRỊ TRỌNG TÂM */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          {/* Card: Kỷ luật & Trạng thái tài khoản */}
          {canAct && (
            <AdminDetailCard
              title="Kỷ luật & Trạng thái tài khoản"
              icon="gavel"
              danger={accountStatus === "locked"}
              description={
                isDeleted
                  ? `Chủ tài khoản đã tự xoá lúc ${formatShort(user.lockedAt)}: dữ liệu cá nhân đã ẩn danh, tài khoản bị khoá vĩnh viễn và không thể mở khoá.`
                  : user.lockedAt
                    ? `Đang khoá từ ${formatShort(user.lockedAt)}: "${user.lockedReason || "Không ghi lý do"}"`
                    : "Khoá tài khoản sẽ ngăn cản đăng nhập và thu hồi phiên ngay lập tức."
              }
            >
              {/* Đã xoá: không có nút — mở khoá bị backend chặn (409), khoá lại thì đã khoá vĩnh viễn rồi */}
              {!isDeleted && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  {!user.lockedAt && (
                    <input
                      value={lockReason}
                      onChange={(e) => setLockReason(e.target.value)}
                      maxLength={200}
                      placeholder="Lý do khoá (hiển thị cho người dùng khi đăng nhập)"
                      aria-label="Lý do khoá"
                      className={`${adminFieldClass} flex-1`}
                    />
                  )}
                  <Button
                    variant={user.lockedAt ? "secondary" : "danger"}
                    size="sm"
                    onClick={() => toggleLock(user)}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      {user.lockedAt ? "lock_open" : "lock"}
                    </span>
                    <span>{user.lockedAt ? "Mở khoá tài khoản" : "Khoá tài khoản"}</span>
                  </Button>
                </div>
              )}
            </AdminDetailCard>
          )}

          {/* Card: Gói cước Pro & Hạn mức AI */}
          {canAct && !targetIsStaff && !isDeleted && (
            <AdminDetailCard title="Gói cước & Hạn mức AI" icon="bolt">
              {/* Form Gói cước */}
              <form
                className="flex flex-col gap-3 pb-3 border-b border-surface-container-high/60"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("Cập nhật gói Premium", () =>
                    patchAdminUser(user.id, {
                      premium: premiumValue,
                      premiumUntil: premiumValue && untilValue ? new Date(`${untilValue}T23:59:59`).toISOString() : null,
                    })
                  );
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={premiumValue}
                      onChange={(e) => setPremium(e.target.checked)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <span>Kích hoạt Premium (Pro)</span>
                  </label>
                  <Button type="submit" variant="primary" size="sm" disabled={!premiumDirty}>
                    Lưu gói cước
                  </Button>
                </div>
                {premiumValue && (
                  <label className="flex flex-col sm:flex-row sm:items-center gap-2 text-body-sm">
                    <span className="text-on-surface-variant shrink-0">Hạn dùng đến hết ngày:</span>
                    <input
                      type="date"
                      value={untilValue}
                      onChange={(e) => setPremiumUntil(e.target.value)}
                      className={adminFieldClass}
                    />
                    <span className="text-label-sm text-outline">(để trống = vĩnh viễn)</span>
                  </label>
                )}
              </form>

              {/* Form Hạn mức AI */}
              <form
                className="flex flex-col gap-3 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("Cập nhật hạn mức", () =>
                    patchAdminUser(
                      user.id,
                      mode === "global" ? { clearLimit: true } : { extractionDailyLimit: Number(limitInput) }
                    )
                  );
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Hạn mức bóc tách AI mỗi ngày</span>
                  <Button type="submit" variant="outline" size="sm">
                    Lưu hạn mức
                  </Button>
                </div>
                <fieldset className="flex flex-col sm:flex-row sm:items-center gap-4 text-body-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="limit"
                      checked={mode === "global"}
                      onChange={() => setLimitMode("global")}
                      className="text-primary"
                    />
                    <span>Theo cấu hình chung</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="limit"
                      checked={mode === "own"}
                      onChange={() => setLimitMode("own")}
                      className="text-primary"
                    />
                    <span>Riêng:</span>
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
                      className={`${adminFieldClass} w-24 font-mono`}
                      aria-label="Hạn mức riêng (0–1000)"
                    />
                    <span className="text-outline text-label-sm">lượt/ngày</span>
                  </label>
                </fieldset>
              </form>
            </AdminDetailCard>
          )}

          {/* Card: Phiên đăng nhập & Phân quyền */}
          {(canAct || canRole) && (
            <AdminDetailCard title="Phiên đăng nhập & Phân quyền" icon="manage_accounts">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-container-high/60">
                <div>
                  <div className="font-semibold">Thu hồi mọi phiên đăng nhập</div>
                  <p className="text-body-sm text-on-surface-variant">
                    Đăng xuất học viên khỏi toàn bộ thiết bị ngay lập tức.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Thu hồi mọi phiên đăng nhập?",
                      message: `${user.email} sẽ bị đăng xuất khỏi mọi thiết bị; mật khẩu được giữ nguyên.`,
                      confirmLabel: "Thu hồi",
                      tone: "warning",
                      action: () => revokeUserSessions(user.id),
                    });
                    if (ok) {
                      setStatus({ ok: true, text: `Đã thu hồi mọi phiên đăng nhập của ${user.email}.` });
                      setReload((n) => n + 1);
                    }
                  }}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    logout
                  </span>
                  <span>Thu hồi ({user.activeSessions})</span>
                </Button>
              </div>

              {canRole && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    <div className="font-semibold">Vai trò hệ thống</div>
                    <p className="text-body-sm text-on-surface-variant">
                      Chỉ Super Admin mới có quyền chuyển đổi phân quyền này.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={roleDraft || user.role}
                      onChange={(e) => setRoleDraft(e.target.value as Role)}
                      className={adminFieldClass}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={changeRole}
                      disabled={!roleDraft || roleDraft === user.role}
                    >
                      Đổi vai trò
                    </Button>
                  </div>
                </div>
              )}
            </AdminDetailCard>
          )}

          {myRole && !canAct && !canRole && (
            <p className="text-body-sm text-on-surface-variant p-space-md rounded-2xl bg-surface-container-low border border-surface-container-high">
              {user.id === userProfile?.id
                ? "Đây là tài khoản quản trị của bạn."
                : "Bạn không có quyền thao tác trên tài khoản này."}
            </p>
          )}
        </div>

        {/* 
          CỘT PHẢI: THÔNG TIN BỔ SUNG DẠNG THU GỌN (Compact Supplementary Views)
          Thiết kế nhỏ gọn, danh sách gọn gàng với max-height và link dẫn trực tiếp, tránh chiếm màn hình!
        */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* Card: Bộ thẻ đã tạo (Thu gọn, nhỏ hơn, không chiếm màn hình) */}
          {!targetIsStaff && (
            <AdminDetailCard
              title="Bộ thẻ đã tạo"
              icon="style"
              actions={
                <Link
                  to={`/admin/decks?ownerId=${user.id}`}
                  className="text-label-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>Xem tất cả ({user.deckCount})</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                    open_in_new
                  </span>
                </Link>
              }
            >
              {userDecks.loading ? (
                <p className="text-body-sm text-on-surface-variant py-2">Đang tải bộ thẻ...</p>
              ) : !userDecks.data?.items || userDecks.data.items.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant py-2 italic text-center">
                  Học viên này chưa tạo bộ thẻ nào.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-surface-container-high/60 pr-1">
                  {userDecks.data.items.map((d) => (
                    <div
                      key={d.id}
                      className="py-2 flex items-center justify-between gap-2 hover:bg-surface-container-low/40 px-1 rounded transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/admin/decks/${encodeURIComponent(d.id)}`}
                          className="font-semibold text-on-surface hover:text-primary hover:underline text-body-sm line-clamp-1"
                        >
                          {d.title}
                        </Link>
                        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5">
                          <span className="font-semibold px-1 py-0.2 rounded bg-surface-container-high text-[10px]">
                            {d.level}
                          </span>
                          <span>·</span>
                          <span>{d.cardCount} thẻ</span>
                          <span>·</span>
                          <span className="text-amber-500 font-semibold">★ {d.avgStars === null ? "—" : d.avgStars.toFixed(1)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                            d.visibility === "public"
                              ? "bg-secondary-container/50 text-secondary"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          {d.visibility === "public" ? "Công khai" : "Riêng tư"}
                        </span>
                        {d.openReports > 0 && (
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-error/15 text-error">
                            {d.openReports} ⚠
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminDetailCard>
          )}

          {/* Card: Nhật ký kiểm toán liên quan (Thu gọn, nhỏ hơn) */}
          <AdminDetailCard
            title="Nhật ký liên quan"
            icon="history"
            actions={
              <Link to="/admin/audit" className="text-label-sm text-primary hover:underline">
                Xem toàn bộ ↗
              </Link>
            }
          >
            {related.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant py-2 italic text-center">
                Chưa có thao tác quản trị nào trên tài khoản này.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-surface-container-high/60 pr-1">
                {related.map((l) => (
                  <div key={l.id} className="py-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-on-surface font-mono truncate max-w-[180px]">
                        {l.actorEmail}
                      </span>
                      <span className="text-outline">{formatShort(l.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminStatusBadge label={l.action} tone="info" />
                      {l.detail && (
                        <div className="flex-1 text-[11px]">
                          <AdminJsonViewer data={l.detail} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminDetailCard>
        </div>
      </div>
    </section>
  );
};

export default AdminUserDetailPage;
