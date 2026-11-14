import { createContext } from "react";
import type { UserProfile } from "@/features/auth/types/auth.types";
import type { SessionMark } from "@/features/auth/authUtils";

export interface AuthContextType {
  token: string | null;
  userEmail: string | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Ai vừa dùng tab này và phiên kết thúc thế nào: ProtectedRoute dùng để quyết định nhớ trang đang chặn cho ai. */
  sessionMark: SessionMark | null;
  /** `remember` bỏ trống = giữ nơi lưu hiện tại (dùng khi đổi mật khẩu nhận token mới). */
  login: (token: string, refreshToken: string, email?: string, remember?: boolean) => void;
  /** Đăng xuất: thu hồi phiên ở server (không chờ) rồi xoá phiên trên máy này. */
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateJlptLevel: (newLevel: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
