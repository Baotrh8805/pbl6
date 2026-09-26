import React from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ComingSoonBadge } from "@/components/ui/Modal";

// ponytail: backend chưa có API khôi phục mật khẩu (gửi mail + token đặt lại) -> form bị khóa.
// Nâng cấp khi có POST /auth/forgot-password: bỏ `disabled` và gọi authService, không mô phỏng "đã gửi".
export const ForgotPasswordForm: React.FC = () => {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 text-left" noValidate>
      <div className="flex items-center gap-2">
        <ComingSoonBadge />
        <p className="font-body text-xs text-on-surface-variant leading-relaxed">
          Chức năng khôi phục mật khẩu qua email đang được phát triển.
        </p>
      </div>

      <p className="font-body text-xs text-on-surface-variant leading-relaxed">
        Nếu quên mật khẩu, vui lòng liên hệ quản trị viên để được hỗ trợ đặt lại. Nếu vẫn nhớ mật khẩu cũ, bạn có
        thể đổi mật khẩu trong Trang cá nhân sau khi đăng nhập.
      </p>

      <fieldset disabled className="flex flex-col gap-4 opacity-70">
        <Input
          id="forgot-email"
          name="email"
          type="email"
          label="Email tài khoản"
          placeholder="tenban@example.com"
          leftIcon={<Mail className="w-4 h-4" />}
        />

        <div className="pt-2">
          <Button type="submit" variant="primary" size="lg" className="w-full font-headline">
            Gửi liên kết khôi phục
          </Button>
        </div>
      </fieldset>

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
