import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { authService } from "@/features/auth/services/authService";
import { extractErrorMessage } from "@/services/apiClient";
import { PASSWORD_HINT, PASSWORD_MAX, passwordPolicyError } from "@/lib/passwordRules";


// Mở từ link trong email: /reset-password?token=...
export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Cùng chính sách với ResetPasswordRequest / PasswordPolicy của backend (27/10)
    const clientError = passwordPolicyError(password) ?? (password !== confirm ? "Mật khẩu xác nhận không khớp." : null);
    setError(clientError);
    if (clientError) return;

    setLoading(true);
    try {
      setDone(await authService.resetPassword(token, password));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản của bạn.">
      {!token ? (
        <p role="alert" className="text-sm text-error">
          Liên kết không hợp lệ. Hãy{" "}
          <Link to="/forgot-password" className="underline font-semibold">
            yêu cầu liên kết mới
          </Link>
          .
        </p>
      ) : done ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="p-3.5 rounded-lg bg-secondary/10 text-secondary text-sm border border-secondary/30">
            {done}
          </p>
          <Link to="/login" className="text-primary font-semibold hover:underline text-sm">
            Đến trang Đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
          {error && (
            <div role="alert" className="p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20">
              {error}
            </div>
          )}
          <Input
            id="reset-password"
            type="password"
            label="Mật khẩu mới"
            helperText={PASSWORD_HINT}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <Input
            id="reset-confirm"
            type="password"
            label="Nhập lại mật khẩu mới"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <Button type="submit" variant="primary" size="lg" isLoading={loading} className="w-full font-headline">
            Đặt lại mật khẩu
          </Button>
          <Link to="/forgot-password" className="text-center text-xs text-primary hover:underline">
            Liên kết hết hạn? Gửi liên kết mới
          </Link>
        </form>
      )}
    </AuthLayout>
  );
};
