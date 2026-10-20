import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { authService } from "@/features/auth/services/authService";
import type { UserProfile } from "@/features/auth/types/auth.types";
import {
  endSessionMark,
  normalizeEmail,
  parseSessionMark,
  startupSessionMark,
  type SessionMark,
} from "@/features/auth/authUtils";
import { AUTH_EXPIRED_EVENT } from "@/services/apiClient";
import { tokenStorage } from "@/services/tokenStorage";
import { AuthContext } from "./authContextValue";

const isAuthError = (e: unknown) =>
  axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403);

// Dấu "ai vừa dùng tab này" (SessionMark) chỉ ở sessionStorage: mỗi tab một người, tải lại trang / Back vẫn còn.
// Storage có thể ném (chặn cookie / chế độ riêng tư) -> coi như tab chưa ai đăng nhập.
const SESSION_MARK_KEY = "sessionMark";
const readSessionMark = (): SessionMark | null => {
  try {
    return parseSessionMark(sessionStorage.getItem(SESSION_MARK_KEY));
  } catch {
    return null;
  }
};
// Loại lần tải trang này: "navigate" (mở mới), "reload", "back_forward"…; không đọc được -> null.
const documentNavigationType = (): string | null => {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? null;
  } catch {
    return null;
  }
};
const writeSessionMark = (mark: SessionMark | null) => {
  try {
    if (mark) sessionStorage.setItem(SESSION_MARK_KEY, JSON.stringify(mark));
    else sessionStorage.removeItem(SESSION_MARK_KEY);
  } catch {
    // không lưu được: chỉ mất khả năng nhớ qua lần tải lại
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Đọc storage ngay lúc khởi tạo state thay vì setState trong effect.
  const [token, setToken] = useState<string | null>(() => tokenStorage.getToken());
  const [userEmail, setUserEmail] = useState<string | null>(() => tokenStorage.getEmail());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(() => tokenStorage.getToken() !== null);
  // ProtectedRoute dựa vào dấu này để quyết định có nhớ trang đang chặn (state.from) hay không, và nhớ cho ai.
  // Mở app khi đã có phiên: chủ phiên là email đã lưu (hồ sơ về sẽ ghi lại email server trả). Hết phiên: dấu cũ chỉ giữ
  // khi tải lại / Back-Forward; dán link mới vào tab đã đăng xuất thì như tab mới (startupSessionMark).
  const [sessionMark, setSessionMark] = useState<SessionMark | null>(() =>
    startupSessionMark(
      { token: tokenStorage.getToken(), email: tokenStorage.getEmail() },
      readSessionMark(),
      documentNavigationType()
    )
  );

  useEffect(() => writeSessionMark(sessionMark), [sessionMark]);

  // Chỉ ghi khi phiên còn: hồ sơ về muộn sau khi đã bấm Đăng xuất không được dựng lại dấu "đang đăng nhập".
  const markActive = useCallback((email: string) => {
    if (tokenStorage.getToken()) setSessionMark({ reason: "active", owner: normalizeEmail(email) });
  }, []);

  // Chỉ xoá phiên trên máy này (dùng khi server đã báo phiên hết hạn nên không cần gọi lại server).
  // reason: "logout" = người dùng tự đăng xuất -> /login không nhớ trang cũ; "expired" -> nhớ, nhưng chỉ cho đúng người đó.
  const clearSession = useCallback((reason: "logout" | "expired") => {
    tokenStorage.clear();
    setToken(null);
    setUserEmail(null);
    setUserProfile(null);
    setSessionMark((m) => endSessionMark(m, reason));
  }, []);

  const logout = useCallback(() => {
    const refreshToken = tokenStorage.getRefreshToken();
    // Thu hồi ở server để refresh token bị đánh cắp không dùng tiếp được; lỗi mạng không chặn đăng xuất.
    if (refreshToken) void authService.logout(refreshToken).catch(() => {});
    clearSession("logout");
  }, [clearSession]);

  const fetchProfile = useCallback(async () => {
    try {
      const profile = await authService.getProfile();
      setUserProfile(profile);
      if (profile.email) {
        setUserEmail(profile.email);
        tokenStorage.setEmail(profile.email);
        markActive(profile.email);
      }
    } catch (e) {
      // Token hết hạn/không hợp lệ (backend cũ trả 403 thay vì 401) -> đăng xuất hẳn.
      if (isAuthError(e)) {
        clearSession("expired");
        return;
      }
      // Lỗi mạng: chỉ dùng email thật đã lưu, không bịa trình độ JLPT.
      const savedEmail = tokenStorage.getEmail();
      if (savedEmail) {
        setUserProfile((prev) => prev || { email: savedEmail });
      }
    }
  }, [clearSession, markActive]);

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
    const onExpired = () => clearSession("expired");
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [clearSession]);

  const login = (newToken: string, refreshToken: string, email?: string, remember?: boolean) => {
    tokenStorage.save(newToken, refreshToken, email, remember);
    setToken(newToken);
    if (email) {
      setUserEmail(email);
      markActive(email);
    }
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
        sessionMark,
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
