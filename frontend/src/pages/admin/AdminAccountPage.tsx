import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/useAuth";
import { authService } from "@/features/auth/services/authService";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminDetailCard } from "@/features/admin/components/AdminDetailCard";
import { RoleStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { PASSWORD_MAX, PASSWORD_MIN, passwordChangeError, PASSWORD_HINT } from "@/lib/passwordRules";
import { extractErrorMessage } from "@/services/apiClient";

/**
 * Hồ sơ của staff trong Admin Panel (STAFF-02): staff không vào được /profile của người học (ProtectedRoute đưa về đây),
 * nên đổi mật khẩu lần sau — sau lần bắt buộc ở /setup — làm tại "Hồ sơ > Đổi mật khẩu" như ghi chú của seed SQL.
 * Form không điều khiển (FormData) như Hồ sơ > Bảo mật: mật khẩu không nằm trong state React.
 */
export const AdminAccountPage: React.FC = () => {
  const { userEmail, userProfile, login } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("currentPassword") ?? "");
    const next = String(data.get("newPassword") ?? "");
    const confirm = String(data.get("confirmPassword") ?? "");
    const clientError = passwordChangeError(current, next, confirm);
    if (clientError) {
      setStatus({ ok: false, text: clientError });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const { accessToken, refreshToken } = await authService.changePassword(current, next);
      // Server thu hồi mọi token cũ -> dùng cặp token mới để phiên này không bị đăng xuất.
      login(accessToken, refreshToken);
      form.reset();
      setShowPw(false);
      setStatus({ ok: true, text: "Đổi mật khẩu thành công. Các thiết bị khác sẽ phải đăng nhập lại." });
    } catch (err) {
      setStatus({ ok: false, text: extractErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const type = showPw ? "text" : "password";
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      aria-pressed={showPw}
      aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
        {showPw ? "visibility_off" : "visibility"}
      </span>
    </button>
  );

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl max-w-2xl">
      <AdminPageHeader title="Hồ sơ của tôi" description="Thông tin tài khoản quản trị và đổi mật khẩu đăng nhập." />

      <AdminDetailCard title="Tài khoản" icon="badge">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
          <dt className="text-on-surface-variant">Email</dt>
          <dd className="font-semibold text-on-surface break-all">{userProfile?.email ?? userEmail ?? "—"}</dd>
          <dt className="text-on-surface-variant">Vai trò</dt>
          <dd>{userProfile?.role ? <RoleStatusBadge role={userProfile.role} /> : "—"}</dd>
        </dl>
      </AdminDetailCard>

      <AdminDetailCard
        title="Đổi mật khẩu"
        icon="password"
        description="Sau khi đổi, các thiết bị khác phải đăng nhập lại; phiên này vẫn giữ nguyên."
      >
        <form onSubmit={changePassword} className="flex flex-col gap-space-md" noValidate>
          {/* Trình quản lý mật khẩu cần biết tài khoản nào đang đổi mật khẩu. */}
          <input type="text" name="username" autoComplete="username" value={userEmail ?? ""} readOnly hidden />
          <Input
            name="currentPassword"
            label="Mật khẩu hiện tại"
            type={type}
            required
            autoComplete="current-password"
            rightAction={toggle}
          />
          <Input
            name="newPassword"
            label="Mật khẩu mới"
            type={type}
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            helperText={`${PASSWORD_HINT} Tối đa ${PASSWORD_MAX} ký tự.`}
          />
          <Input name="confirmPassword" label="Xác nhận mật khẩu mới" type={type} required autoComplete="new-password" />
          {status && (
            <p
              role={status.ok ? "status" : "alert"}
              className={`p-3 rounded-lg border text-body-sm ${
                status.ok
                  ? "bg-secondary-container/20 border-secondary/30 text-secondary"
                  : "bg-error/10 border-error/20 text-error"
              }`}
            >
              {status.text}
            </p>
          )}
          <Button type="submit" className="self-start" isLoading={saving}>
            Đổi mật khẩu
          </Button>
        </form>
      </AdminDetailCard>
    </section>
  );
};

export default AdminAccountPage;
