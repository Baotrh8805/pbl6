import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useLoginForm } from "../hooks/useLoginForm";

export const LoginForm: React.FC = () => {
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const {
    email,
    setEmail,
    password,
    setPassword,
    rememberMe,
    setRememberMe,
    errors,
    apiError,
    isLoading,
    handleSubmit,
  } = useLoginForm();

  // If redirected from register with registered email
  useEffect(() => {
    const state = location.state as { registeredEmail?: string } | null;
    if (state?.registeredEmail) {
      setEmail(state.registeredEmail);
    }
  }, [location.state, setEmail]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
      {/* API Error Notification */}
      {apiError && (
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{apiError}</div>
        </div>
      )}

      {/* Email Input */}
      <Input
        id="login-email"
        name="email"
        type="email"
        label="Email học viên"
        placeholder="tenban@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        leftIcon={<Mail className="w-4 h-4" />}
        autoComplete="email"
        required
      />

      {/* Password Input */}
      <Input
        id="login-password"
        name="password"
        type={showPassword ? "text" : "password"}
        label="Mật khẩu"
        placeholder="Nhập mật khẩu của bạn"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        leftIcon={<Lock className="w-4 h-4" />}
        autoComplete="current-password"
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

      {/* Remember me & Forgot password row */}
      <div className="flex items-center justify-between text-xs pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-on-surface-variant hover:text-on-surface">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/30 accent-primary cursor-pointer"
          />
          <span>Ghi nhớ đăng nhập</span>
        </label>

        <Link
          to="/forgot-password"
          className="text-primary hover:text-tertiary font-medium transition-colors"
        >
          Quên mật khẩu?
        </Link>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full font-headline"
          isLoading={isLoading}
        >
          Đăng nhập vào hệ thống
        </Button>
      </div>

      {/* Switch to Register */}
      <div className="pt-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/30">
        <span>Chưa có tài khoản học viên? </span>
        <Link
          to="/register"
          className="font-semibold text-primary hover:text-tertiary transition-colors"
        >
          Đăng ký tài khoản mới →
        </Link>
      </div>
    </form>
  );
};
