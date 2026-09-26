// Import tương đối + đuôi .ts để scripts/selfCheck.ts chạy được bằng node (node không hiểu alias @/).
import axios, { AxiosError } from "axios";
import { tokenStorage } from "./tokenStorage.ts";

/** AuthProvider nghe sự kiện này để reset state; ProtectedRoute tự đưa về /login. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

// Base API client pointing to Vite proxy (/api -> http://localhost:8080)
export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 trên request CÓ gửi token = phiên hết hạn/bị thu hồi -> đăng xuất.
// Request không kèm token (vd. sai mật khẩu ở /auth/login) cũng trả 401 nhưng không phải hết phiên.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const sentToken = !!error.config?.headers?.Authorization;
    if (error.response?.status === 401 && sentToken) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

/**
 * Safely extracts human-readable error messages from backend responses.
 * Handles both Spring Boot plain-text errors (e.g. register) and JSON error bodies.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") {
        return data.message;
      }
      if ("error" in data && typeof data.error === "string") {
        return data.error;
      }
    }
    if (error.response?.status === 401) {
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }
    if (error.response?.status === 403) {
      return "Bạn không có quyền thực hiện thao tác này.";
    }
    if (error.response?.status === 404) {
      return "Không tìm thấy dữ liệu yêu cầu.";
    }
    if (error.code === "ECONNABORTED" || error.message.includes("Network Error")) {
      return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra backend.";
    }
    return error.message || "Đã xảy ra lỗi khi gửi yêu cầu.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Đã xảy ra lỗi không xác định.";
}
