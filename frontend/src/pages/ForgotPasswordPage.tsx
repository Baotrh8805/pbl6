import React from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const ForgotPasswordPage: React.FC = () => {
  return (
    <AuthLayout
      title="Khôi phục mật khẩu"
      subtitle="Nhập email để nhận hướng dẫn đặt lại mật khẩu tài khoản."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
};
