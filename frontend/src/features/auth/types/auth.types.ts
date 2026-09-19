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

export interface UserProfile {
  email: string;
  fullName?: string;
}
