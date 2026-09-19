import { apiClient } from "@/services/apiClient";
import type { AuthRequest, AuthResponse, RegisterRequest } from "../types/auth.types";

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
  async getProfile(): Promise<{
    id: number;
    email: string;
    fullName: string;
    jlptLevel: string;
    isPremium: boolean;
    role: string;
  }> {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  /**
   * Cập nhật cấp độ JLPT cho người dùng
   */
  async updateJlptLevel(jlptLevel: string): Promise<any> {
    const response = await apiClient.put("/auth/jlpt-level", { jlptLevel });
    return response.data;
  },
};
