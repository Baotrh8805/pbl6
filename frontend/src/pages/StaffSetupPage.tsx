import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/useAuth";
import { authService } from "@/features/auth/services/authService";
import { extractErrorMessage } from "@/services/apiClient";
import { PASSWORD_MAX, PASSWORD_MIN, passwordChangeError } from "@/lib/passwordRules";

/**
 * Staff mới (mật khẩu seed) chỉ có ROLE_SETUP ở backend: ProtectedRoute đưa mọi trang về đây cho tới khi đổi mật khẩu.
 * Đổi xong, login() nạp lại hồ sơ (mustChangePassword = false) -> ProtectedRoute tự chuyển sang /admin.
 */
export const StaffSetupPage: React.FC = () => {
  const { userProfile, login, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const type = showPw ? "text" : "password";
  // Một nút cho cả 3 ô (giống Hồ sơ > Bảo mật): bật lên là thấy mình gõ gì
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      aria-pressed={showPw}
      aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      className="text-on-surface-variant hover:text-on-surface p-1 focus:outline-none"
      tabIndex={-1}
    >
      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clientError = passwordChangeError(current, next, again, "Mật khẩu mới phải khác mật khẩu mặc định.");
    if (clientError) return setError(clientError);
    setBusy(true);
    try {
      const r = await authService.changePassword(current, next);
      // Token cũ bị thu hồi: lưu token mới (giữ nguyên nơi lưu); login() tự nạp lại hồ sơ
      login(r.accessToken, r.refreshToken, userProfile?.email);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-container-high bg-surface-container-lowest p-6 flex flex-col gap-5">
        <header>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Đổi mật khẩu mặc định</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            {userProfile?.email} · Tài khoản quản trị dùng mật khẩu mặc định; Admin Panel chỉ mở sau khi bạn đặt mật khẩu riêng.
          </p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <Input id="cur" type={type} label="Mật khẩu hiện tại" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required rightAction={toggle} />
          <Input id="new" type={type} label={`Mật khẩu mới (${PASSWORD_MIN}–${PASSWORD_MAX} ký tự)`} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required rightAction={toggle} />
          <Input id="again" type={type} label="Nhập lại mật khẩu mới" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required rightAction={toggle} />
          <Button type="submit" variant="primary" isLoading={busy} disabled={!current || !next || !again}>
            Đổi mật khẩu và vào Admin Panel
          </Button>
        </form>

        <footer className="flex justify-end text-body-sm border-t border-outline-variant/30 pt-3">
          <button type="button" onClick={logout} className="text-primary underline">
            Đăng xuất
          </button>
        </footer>
      </div>
    </main>
  );
};
