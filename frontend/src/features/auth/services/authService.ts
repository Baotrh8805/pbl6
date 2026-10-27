import { apiClient, extractErrorMessage } from "@/services/apiClient";
import { parseRegisterResponse, type RegisterResult } from "../authUtils";
import type { AuthRequest, AuthResponse, RegisterRequest, UserProfile, VerifyEmailResult } from "../types/auth.types";

/** Câu lỗi của các API xác thực: body chuẩn {status, error, message} của backend qua extractErrorMessage. */
export const authErrorMessage = (err: unknown): string => extractErrorMessage(err);

export const authService = {
  /** Tự xoá tài khoản (ẩn danh hoá; bộ thẻ public giữ lại dưới tên ẩn danh). Sau đó mọi token vô hiệu. */
  async deleteAccount(password: string): Promise<void> {
    await apiClient.delete("/auth/me", { data: { password } });
  },
  /**
   * Đăng nhập người dùng qua email và password
   * Trả về accessToken (15 phút), refreshToken (hạn trượt 3 ngày) và tokenType: "Bearer"
   */
  async login(credentials: AuthRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", credentials);
    return response.data;
  },

  /**
   * Đăng ký người dùng mới. Backend mới: JSON {message, needsVerification}; backend cũ: plain text
   * "Đăng ký tài khoản thành công!" -> parseRegisterResponse đọc cả hai. Lỗi: JSON {status, error, message}.
   * Không đặt responseType "text": lỗi JSON sẽ thành chuỗi thô hiện lên giao diện.
   */
  async register(payload: RegisterRequest): Promise<RegisterResult> {
    const response = await apiClient.post<unknown>("/auth/register", payload);
    return parseRegisterResponse(response.data);
  },

  /** Token từ link trong email (/verify-email?token=…), dùng một lần, hạn 24 giờ; 400 khi sai / hết hạn. */
  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const response = await apiClient.post<Partial<VerifyEmailResult>>("/auth/verify-email", { token });
    return {
      message: response.data?.message || "Xác thực email thành công!",
      email: typeof response.data?.email === "string" ? response.data.email : "",
    };
  },

  /** 202 cùng một thông báo dù email có tồn tại hay không; giới hạn 5 lần / 15 phút (429). */
  async resendVerification(email: string): Promise<string> {
    const response = await apiClient.post<{ message?: string }>("/auth/resend-verification", { email });
    return response.data?.message || "Nếu email này cần xác thực, chúng tôi đã gửi lại liên kết kích hoạt.";
  },

  /** Khiếu nại tài khoản bị khoá (không cần đăng nhập). 202 cùng một thông báo; giới hạn 5 lần / giờ (429). */
  async submitAppeal(email: string, message: string): Promise<string> {
    const response = await apiClient.post<{ message?: string }>("/auth/appeals", { email, message });
    return (
      response.data?.message ||
      "Đã ghi nhận khiếu nại. Nếu email thuộc một tài khoản đang bị khoá, quản trị viên sẽ xem xét và phản hồi qua email."
    );
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
