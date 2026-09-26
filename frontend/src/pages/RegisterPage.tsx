import React from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export const RegisterPage: React.FC = () => {
  return (
    <AuthLayout
      title="Tạo tài khoản mới"
      subtitle="Bắt đầu sinh học liệu tiếng Nhật và ôn tập thông minh ngay hôm nay."
    >
      <RegisterForm />
    </AuthLayout>
  );
};
