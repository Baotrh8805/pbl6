import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { authService } from "@/features/auth/services/authService";
import { extractErrorMessage } from "@/services/apiClient";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Gửi email chứa link đặt lại mật khẩu (POST /auth/forgot-password). Server luôn trả cùng một thông báo.
export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApiError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError("Email không đúng định dạng");
      return;
    }
    setFieldError(undefined);
    setLoading(true);
    try {
      setSentMessage(await authService.forgotPassword(email.trim()));
    } catch (err) {
      setApiError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
      {sentMessage ? (
        <div role="status" className="p-3.5 rounded-lg bg-secondary/10 text-secondary text-xs border border-secondary/30">
          {sentMessage} Hãy kiểm tra cả thư mục Spam.
        </div>
      ) : (
        <>
          {apiError && (
            <div role="alert" className="p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20">
              {apiError}
            </div>
          )}
          <Input
            id="forgot-email"
            name="email"
            type="email"
            label="Email tài khoản"
            placeholder="tenban@example.com"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <div className="pt-2">
            <Button type="submit" variant="primary" size="lg" isLoading={loading} className="w-full font-headline">
              Gửi liên kết khôi phục
            </Button>
          </div>
        </>
      )}

      <div className="pt-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/30">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:text-tertiary transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
          <span>Quay lại trang Đăng nhập</span>
        </Link>
      </div>
    </form>
  );
};
