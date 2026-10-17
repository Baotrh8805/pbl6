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
    // Đồng bộ với useLoginForm: quay lại trang bị chặn trước đó nếu có.
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from && from !== "/login" ? from : homeFor(userProfile?.role)} replace />;
  }

  return <>{children}</>;
};
