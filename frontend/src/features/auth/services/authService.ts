import { apiClient } from "@/services/apiClient";
import type { AuthRequest, AuthResponse, RegisterRequest, UserProfile } from "../types/auth.types";

export const authService = {
  /**
   * Đăng nhập người dùng qua email và password
   * Trả về accessToken (15 phút), refreshToken (hạn trượt 3 ngày) và tokenType: "Bearer"
   */
  async login(credentials: AuthRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", credentials);
    return response.data;
  },

  /**
   * Đăng ký người dùng mới. Thành công: plain text "Đăng ký tài khoản thành công!"
   * (axios để nguyên chuỗi khi không parse được JSON); lỗi: JSON {status, error, message}.
   * Không đặt responseType "text": lỗi JSON sẽ thành chuỗi thô hiện lên giao diện.
   */
  async register(payload: RegisterRequest): Promise<string> {
    const response = await apiClient.post<string>("/auth/register", payload);
    return response.data;
  },

  /** Thu hồi refresh token của phiên này ở server. Gọi kèm request không cần access token (có thể đã hết hạn). */
  async logout(refreshToken: string): Promise<void> {
    await apiClient.post("/auth/logout", { refreshToken });
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

  /** Luôn trả cùng một thông báo (không lộ email nào đã đăng ký). */
  async forgotPassword(email: string): Promise<string> {
    const response = await apiClient.post<{ message: string }>("/auth/forgot-password", { email });
    return response.data.message;
  },

  /** Token lấy từ link trong email; đặt lại xong mọi phiên đăng nhập cũ bị thu hồi. */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const response = await apiClient.post<{ message: string }>("/auth/reset-password", { token, newPassword });
    return response.data.message;
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
