import { apiClient } from "@/services/apiClient";
import type { AuthRequest, AuthResponse, RegisterRequest, UserProfile } from "../types/auth.types";

export const authService = {
  /**
   * Đăng nhập người dùng qua email và password
   * Trả về accessToken và tokenType: "Bearer"
   */
  async login(credentials: AuthRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", credentials);
    return response.data;
  },

  /**
   * Đăng ký người dùng mới
   * Backend Spring Boot AuthController.registerUser() trả về plain text "Đăng ký tài khoản thành công!"
   */
  async register(payload: RegisterRequest): Promise<string> {
    const response = await apiClient.post<string>("/auth/register", payload, {
      responseType: "text",
    });
    return response.data;
  },

  /**
   * Lấy thông tin người dùng hiện tại từ JWT
   */
  async getProfile(): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>("/auth/me");
    return response.data;
  },

  /**
   * Cập nhật cấp độ JLPT cho người dùng
   */
  async updateJlptLevel(jlptLevel: string): Promise<UserProfile> {
    const response = await apiClient.put<UserProfile>("/auth/jlpt-level", { jlptLevel });
    return response.data;
  },

  async updateProfile(fullName: string): Promise<void> {
    await apiClient.put("/auth/profile", { fullName });
  },

  /**
   * Mật khẩu cũ được backend xác minh; client chỉ chuyển tiếp.
   * Backend thu hồi mọi token cũ và trả token mới cho phiên hiện tại.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    const response = await apiClient.put<AuthResponse>("/auth/password", { currentPassword, newPassword });
    return response.data;
  },
};
