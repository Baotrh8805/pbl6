import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Vui lòng nhập địa chỉ email hợp lệ");
      return;
    }

    setError(null);
    setIsLoading(true);
    // UI-only simulation for Sprint 1 (Backend OAuth / Recovery API will come in later Sprint)
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 800);
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col gap-5 text-center py-4 animate-fadeIn">
        <div className="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-headline text-lg font-bold text-primary">
            Đã gửi liên kết khôi phục
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
            Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến email{" "}
            <span className="font-semibold text-on-surface">{email}</span>. Vui lòng kiểm tra hộp thư đến hoặc thư mục spam.
          </p>
        </div>

        <Link to="/login">
          <Button variant="primary" size="md" className="w-full mt-2">
            Quay lại trang Đăng nhập
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
      <p className="font-body text-xs text-on-surface-variant leading-relaxed">
        Nhập địa chỉ email liên kết với tài khoản của bạn để nhận liên kết khôi phục và đặt lại mật khẩu mới.
      </p>

      <Input
        id="forgot-email"
        name="email"
        type="email"
        label="Email tài khoản"
        placeholder="tenban@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error || undefined}
        leftIcon={<Mail className="w-4 h-4" />}
        required
      />

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full font-headline"
          isLoading={isLoading}
        >
          Gửi liên kết khôi phục
        </Button>
      </div>

      <div className="pt-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/30">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:text-tertiary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại trang Đăng nhập</span>
        </Link>
      </div>
    </form>
  );
};
