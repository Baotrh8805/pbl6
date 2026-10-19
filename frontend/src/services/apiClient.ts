// Import tương đối + đuôi .ts để scripts/selfCheck.ts chạy được bằng node (node không hiểu alias @/).
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { tokenStorage } from "./tokenStorage.ts";

/** AuthProvider nghe sự kiện này để reset state; ProtectedRoute tự đưa về /login. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

/**
 * Phát sau mỗi request ghi (POST/PUT/DELETE) thành công. AppLayout nghe để tải lại số liệu dùng chung
 * (dashboard, badge đến hạn, lộ trình) thay vì mỗi trang tự nhớ gọi reloadStats.
 */
export const DATA_CHANGED_EVENT = "data:changed";

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

/** Request đã được gửi lại sau khi làm mới token: không làm mới lần hai (tránh lặp vô hạn). */
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Nhiều request cùng dính 401 một lúc chỉ gọi làm mới một lần, tất cả chờ chung kết quả.
let refreshing: Promise<string> | null = null;

/**
 * Đổi refresh token lấy access token mới. Dùng axios trần (không qua apiClient) để 401 của chính request này
 * không kích hoạt lại interceptor. Refresh token bị từ chối (hết 3 ngày / đã thu hồi) -> ném lỗi có response;
 * lỗi mạng -> ném lỗi không có response (giữ nguyên phiên, người dùng thử lại được).
 */
function refreshAccessToken(): Promise<string> {
  refreshing ??= axios
    .post<{ accessToken: string }>(`${apiClient.defaults.baseURL}/auth/refresh`, {
      refreshToken: tokenStorage.getRefreshToken(),
    })
    .then((res) => {
      tokenStorage.setToken(res.data.accessToken);
      return res.data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function expireSession() {
  tokenStorage.clear();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

// 401 trên request CÓ gửi token = access token hết hạn/bị thu hồi -> thử làm mới bằng refresh token rồi gửi lại.
// Làm mới thất bại vì refresh token bị từ chối -> đăng xuất. Lỗi mạng khi làm mới -> giữ phiên.
// Request không kèm token (vd. sai mật khẩu ở /auth/login) cũng trả 401 nhưng không phải hết phiên.
apiClient.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase();
    if (method && method !== "get" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const sentToken = !!config?.headers?.Authorization;
    if (error.response?.status !== 401 || !sentToken || !config) {
      return Promise.reject(error);
    }
    if (config._retried || !tokenStorage.getRefreshToken()) {
      expireSession();
      return Promise.reject(error);
    }
    try {
      const token = await refreshAccessToken();
      config._retried = true;
      config.headers.Authorization = `Bearer ${token}`;
      return apiClient(config);
    } catch (refreshError) {
      const rejected = axios.isAxiosError(refreshError) && !!refreshError.response;
      if (rejected) expireSession();
      return Promise.reject(rejected ? error : refreshError);
    }
  }
);

/**
 * Lỗi kiểm tra dữ liệu của Spring (ApiExceptionHandler.onInvalidBody, HTTP 400) có dạng
 * "newPassword: Mật khẩu mới phải từ 6 đến 72 ký tự; email: …" — tên trường là của lập trình viên, người dùng chỉ cần
 * câu tiếng Việt. Chỉ bỏ tiền tố là định danh kiểu camelCase (chữ thường đầu, có thể có .con / [0]) ngay trước ": ".
 */
export function stripFieldPrefixes(message: string): string {
  return message
    .split("; ")
    .map((part) => part.replace(/^[a-z][A-Za-z0-9_]*(?:\[\d+\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)*: (?=\S)/, ""))
    .join("; ");
}

/**
 * Safely extracts human-readable error messages from backend responses.
 * Handles both Spring Boot plain-text errors (e.g. register) and JSON error bodies.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    let data = error.response?.data;
    // Body lỗi JSON nhưng được đọc dưới dạng text -> parse lại để lấy message thay vì hiện chuỗi thô
    if (typeof data === "string" && data.trim().startsWith("{")) {
      try {
        data = JSON.parse(data);
      } catch {
        // không phải JSON: dùng nguyên chuỗi
      }
    }
    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") {
        return error.response?.status === 400 ? stripFieldPrefixes(data.message) : data.message;
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
