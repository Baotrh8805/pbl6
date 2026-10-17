import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { atLeast, homeFor, isStaff, type Role } from "@/lib/roles";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Vai trò staff tối thiểu (route /admin/*). Bỏ trống = route học tập, staff bị đưa về /admin.
   * Chỉ là điều hướng cho dễ dùng: backend mới là nơi chặn (403).
   */
  minRole?: Role;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, minRole }) => {
  const { isAuthenticated, isLoading, userProfile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-headline text-xs font-semibold text-primary">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Hồ sơ chưa về (ngay sau đăng nhập): render tạm, hồ sơ về sẽ điều hướng lại nếu sai nơi.
  const role = userProfile?.role;
  if (role) {
    if (minRole && !atLeast(role, minRole)) return <Navigate to={homeFor(role)} replace />;
    if (!minRole && isStaff(role)) return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
};
