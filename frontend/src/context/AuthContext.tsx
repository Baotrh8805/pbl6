import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { authService } from "@/features/auth/services/authService";
import type { UserProfile } from "@/features/auth/types/auth.types";
import { AUTH_EXPIRED_EVENT } from "@/services/apiClient";
import { tokenStorage } from "@/services/tokenStorage";
import { AuthContext } from "./authContextValue";

const isAuthError = (e: unknown) =>
  axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Đọc storage ngay lúc khởi tạo state thay vì setState trong effect.
  const [token, setToken] = useState<string | null>(() => tokenStorage.getToken());
  const [userEmail, setUserEmail] = useState<string | null>(() => tokenStorage.getEmail());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(() => tokenStorage.getToken() !== null);

  // Chỉ xoá phiên trên máy này (dùng khi server đã báo phiên hết hạn nên không cần gọi lại server).
  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
    setUserEmail(null);
    setUserProfile(null);
  }, []);

  const logout = useCallback(() => {
    const refreshToken = tokenStorage.getRefreshToken();
    // Thu hồi ở server để refresh token bị đánh cắp không dùng tiếp được; lỗi mạng không chặn đăng xuất.
    if (refreshToken) void authService.logout(refreshToken).catch(() => {});
    clearSession();
  }, [clearSession]);

  const fetchProfile = useCallback(async () => {
    try {
      const profile = await authService.getProfile();
      setUserProfile(profile);
      if (profile.email) {
        setUserEmail(profile.email);
        tokenStorage.setEmail(profile.email);
      }
    } catch (e) {
      // Token hết hạn/không hợp lệ (backend cũ trả 403 thay vì 401) -> đăng xuất hẳn.
      if (isAuthError(e)) {
        clearSession();
        return;
      }
      // Lỗi mạng: chỉ dùng email thật đã lưu, không bịa trình độ JLPT.
      const savedEmail = tokenStorage.getEmail();
      if (savedEmail) {
        setUserProfile((prev) => prev || { email: savedEmail });
      }
    }
  }, [clearSession]);

  // Có token lưu sẵn: xác minh với server một lần lúc mở app; isLoading giữ ProtectedRoute chờ kết quả.
  useEffect(() => {
    if (!tokenStorage.getToken()) return;
    const bootstrap = async () => {
      await fetchProfile();
      setIsLoading(false);
    };
    void bootstrap();
  }, [fetchProfile]);

  // apiClient báo 401 -> reset state; ProtectedRoute tự chuyển về /login kèm trang đang mở.
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, clearSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearSession);
  }, [clearSession]);

  const login = (newToken: string, refreshToken: string, email?: string, remember?: boolean) => {
    tokenStorage.save(newToken, refreshToken, email, remember);
    setToken(newToken);
    if (email) setUserEmail(email);
    void fetchProfile();
  };

  // Chỉ đổi trình độ trên UI khi server đã lưu; lỗi ném cho nơi gọi hiển thị.
  const updateJlptLevel = async (newLevel: string) => {
    await authService.updateJlptLevel(newLevel);
    setUserProfile((prev) => (prev ? { ...prev, jlptLevel: newLevel } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        userEmail,
        userProfile,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        refreshProfile: fetchProfile,
        updateJlptLevel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
