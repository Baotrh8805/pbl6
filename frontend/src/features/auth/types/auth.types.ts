export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
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
}
