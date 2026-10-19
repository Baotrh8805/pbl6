import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { homeFor } from "@/lib/roles";

export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, userProfile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    // Vừa đăng nhập: token đã có nhưng hồ sơ (vai trò) chưa về. Chưa biết vai trò mà đã điều hướng theo homeFor(undefined)
    // = "/" thì staff bị đưa qua Tổng quan của người học trước (gọi ~9 API học tập, toàn 403) rồi mới sang /admin.
    // Chờ hồ sơ: useLoginForm tự điều hướng theo vai trò trong response đăng nhập, còn không thì hồ sơ về sẽ render lại đây.
    if (!userProfile) return null;
    // Đồng bộ với useLoginForm: quay lại trang bị chặn trước đó nếu có.
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from && from !== "/login" ? from : homeFor(userProfile.role)} replace />;
  }

  return <>{children}</>;
};
