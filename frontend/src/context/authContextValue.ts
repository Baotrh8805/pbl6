import { createContext } from "react";
import type { UserProfile } from "@/features/auth/types/auth.types";

export interface AuthContextType {
  token: string | null;
  userEmail: string | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** `remember` bỏ trống = giữ nơi lưu hiện tại (dùng khi đổi mật khẩu nhận token mới). */
  login: (token: string, email?: string, remember?: boolean) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateJlptLevel: (newLevel: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
