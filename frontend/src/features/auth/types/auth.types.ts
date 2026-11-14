export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  /** Hạn trượt 3 ngày: không vào web quá 3 ngày thì phải đăng nhập lại. */
  refreshToken: string;
  tokenType: string;
  /** Staff vào thẳng /admin sau đăng nhập. */
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  /** Staff còn phải đổi mật khẩu seed -> /setup. */
  mustChangePassword?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

/** Khớp entity User backend trả ở GET /auth/me (passwordHash đã @JsonIgnore). */
export interface UserProfile {
  id?: number;
  email: string;
  fullName?: string;
  jlptLevel?: string;
  isPremium?: boolean;
  role?: string;
  mustChangePassword?: boolean;
  premiumUntil?: string | null;
  /** Đợt 2 (A1): đã bấm link xác thực email; backend cũ không gửi trường này. */
  emailVerified?: boolean;
}

/** POST /auth/verify-email -> 200 {message, email}: email để điền sẵn ở trang đăng nhập. */
export interface VerifyEmailResult {
  message: string;
  /** "" khi máy chủ không gửi. */
  email: string;
}
