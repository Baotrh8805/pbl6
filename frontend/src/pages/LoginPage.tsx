import React from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const LoginPage: React.FC = () => {
  return (
    <AuthLayout
      title="Chào mừng trở lại!"
      subtitle="Đăng nhập để tiếp tục hành trình học tiếng Nhật thông minh."
    >
      <LoginForm />
    </AuthLayout>
  );
};
