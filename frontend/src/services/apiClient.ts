import axios, { AxiosError } from "axios";

// Base API client pointing to Vite proxy (/api -> http://localhost:8080)
export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle unauthorized 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear token if expired/unauthorized and not already on auth page
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
        localStorage.removeItem("accessToken");
        window.location.href = "/login";
      }
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
