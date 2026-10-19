import React, { useState } from "react";
import { Link } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRegisterForm } from "../hooks/useRegisterForm";
import { ResendVerificationAction } from "./ResendVerificationAction";

export const RegisterForm: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    errors,
    apiError,
    successMessage,
    pendingVerification,
    resetVerification,
    isLoading,
    handleSubmit,
  } = useRegisterForm();

  // Máy chủ bật xác thực email: thay form bằng hướng dẫn kiểm tra hộp thư (chưa đăng nhập được cho tới khi bấm link).
  if (pendingVerification) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <div role="status" className="flex items-start gap-3 p-4 rounded-lg bg-secondary/10 border border-secondary/30 animate-fadeIn">
          <MailCheck aria-hidden="true" className="w-6 h-6 shrink-0 text-secondary mt-0.5" />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="font-headline font-semibold text-sm text-on-surface">Kiểm tra email để kích hoạt tài khoản</p>
            <p className="text-xs text-on-surface-variant leading-relaxed break-words">
              {pendingVerification.message} Chúng tôi đã gửi liên kết kích hoạt tới{" "}
              <strong className="text-on-surface break-all">{pendingVerification.email}</strong>. Liên kết có hiệu lực trong 24 giờ.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/30">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Không thấy email? Hãy kiểm tra thư mục Spam / Quảng cáo, hoặc gửi lại liên kết mới.
          </p>
          <ResendVerificationAction email={pendingVerification.email} />
        </div>

        <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs border-t border-outline-variant/30">
          <button
            type="button"
            onClick={resetVerification}
            className="self-start font-medium text-on-surface-variant hover:text-on-surface underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            ← Đăng ký bằng email khác
          </button>
          <Link
            to="/login"
            state={{ registeredEmail: pendingVerification.email }}
            className="font-semibold text-primary hover:text-tertiary transition-colors"
          >
            Đã kích hoạt? Đăng nhập →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-secondary/10 text-secondary text-xs border border-secondary/30 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium leading-relaxed">
            {successMessage} Đang chuyển sang trang Đăng nhập...
          </div>
        </div>
      )}

      {/* API Error Notification */}
      {apiError && (
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{apiError}</div>
        </div>
      )}

      {/* Full Name */}
      <Input
        id="register-fullname"
        name="fullName"
        type="text"
        label="Họ và tên học viên"
        placeholder="Ví dụ: Nguyễn Văn A"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        leftIcon={<User className="w-4 h-4" />}
        autoComplete="name"
        required
      />

      {/* Email */}
      <Input
        id="register-email"
        name="email"
        type="email"
        label="Email"
        placeholder="tenban@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        leftIcon={<Mail className="w-4 h-4" />}
        autoComplete="email"
        required
      />

      {/* Password */}
      <Input
        id="register-password"
        name="password"
        type={showPassword ? "text" : "password"}
        label="Mật khẩu"
        placeholder="Tối thiểu 6 ký tự"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        helperText="Mật khẩu phải có ít nhất 6 ký tự để bảo mật tài khoản"
        leftIcon={<Lock className="w-4 h-4" />}
        autoComplete="new-password"
        required
        rightAction={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-on-surface-variant hover:text-on-surface p-1 focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      {/* Confirm Password */}
      <Input
        id="register-confirm-password"
        name="confirmPassword"
        type={showConfirmPassword ? "text" : "password"}
        label="Xác nhận mật khẩu"
        placeholder="Nhập lại mật khẩu phía trên"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        leftIcon={<Lock className="w-4 h-4" />}
        autoComplete="new-password"
        required
        rightAction={
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="text-on-surface-variant hover:text-on-surface p-1 focus:outline-none"
            tabIndex={-1}
            aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full font-headline"
          isLoading={isLoading}
        >
          Hoàn tất tạo tài khoản
        </Button>
      </div>

      {/* Switch to Login */}
      <div className="pt-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/30">
        <span>Đã có tài khoản NihonGen AI? </span>
        <Link
          to="/login"
          className="font-semibold text-primary hover:text-tertiary transition-colors"
        >
          Đăng nhập ngay →
        </Link>
      </div>
    </form>
  );
};
