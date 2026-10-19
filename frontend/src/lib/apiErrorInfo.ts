// Đọc mã HTTP / mã lỗi / thông điệp từ lỗi axios mà KHÔNG import axios: nhận diện bằng hình dạng (error.response)
// để hàm thuần này chạy được trong scripts/selfcheck bằng node. Body lỗi chuẩn của backend: {status, error, message}
// (+ `code` ở vài lỗi nghiệp vụ như EMAIL_NOT_VERIFIED, xem hợp đồng API đợt 2).

/**
 * Thông báo bình tĩnh khi máy chủ chưa có endpoint (backend đợt 2 đang làm song song): người dùng không cần làm gì,
 * chỉ cần thử lại sau. Nơi dùng so sánh đúng chuỗi này để đổi màu đỏ "lỗi" sang màu trung tính "thông tin".
 */
export const SERVER_PENDING_MESSAGE = "Tính năng đang được cập nhật trên máy chủ. Vui lòng thử lại sau.";

interface ResponseLike {
    status?: unknown;
    data?: unknown;
}

const responseOf = (error: unknown): ResponseLike | null => {
    if (typeof error !== "object" || error === null || !("response" in error)) return null;
    const res = (error as { response?: unknown }).response;
    return typeof res === "object" && res !== null ? (res as ResponseLike) : null;
};

/** Mã HTTP của lỗi; null = không có response (lỗi mạng, huỷ, lỗi JS). */
export const httpStatusOf = (error: unknown): number | null => {
    const status = responseOf(error)?.status;
    return typeof status === "number" ? status : null;
};

/** Body lỗi dạng object; body JSON bị đọc thành chuỗi (responseType text) thì parse lại, như extractErrorMessage. */
export const errorBodyOf = (error: unknown): Record<string, unknown> | null => {
    let data = responseOf(error)?.data;
    if (typeof data === "string" && data.trim().startsWith("{")) {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
};

/** `code` máy đọc được trong body lỗi (vd. "EMAIL_NOT_VERIFIED"); null khi không có. */
export const errorCodeOf = (error: unknown): string | null => {
    const code = errorBodyOf(error)?.code;
    return typeof code === "string" && code.trim() ? code.trim() : null;
};

/** `message` của body lỗi (hoặc body là chuỗi thường); null khi trống. */
export const errorMessageOf = (error: unknown): string | null => {
    const body = errorBodyOf(error);
    if (body) {
        const msg = body.message;
        return typeof msg === "string" && msg.trim() ? msg.trim() : null;
    }
    const data = responseOf(error)?.data;
    return typeof data === "string" && data.trim() && !data.trim().startsWith("{") ? data.trim() : null;
};

// 404 của route chưa tồn tại: Spring trả NoResourceFoundException ("No static resource api/…") hoặc body trống;
// còn 404 nghiệp vụ ("Chưa có nét mẫu cho chữ 書") luôn có câu tiếng Việt riêng -> không coi là thiếu endpoint.
const GENERIC_NOT_FOUND = /^(no static resource|no endpoint|no handler|not found\b)/i;

export interface EndpointMissingOptions {
    /**
     * Endpoint theo hợp đồng là permitAll (verify-email, resend-verification, appeals): khi backend chưa có route,
     * Spring Security chặn trước bằng 401 body trống -> cũng là "chưa có", không phải "hết phiên".
     */
    publicEndpoint?: boolean;
}

/** Máy chủ chưa có endpoint này (404 chung / 405 / 501; 401 body trống với endpoint công khai). */
export const isEndpointMissing = (error: unknown, opts: EndpointMissingOptions = {}): boolean => {
    const status = httpStatusOf(error);
    if (status === 405 || status === 501) return true;
    if (status === 401) return !!opts.publicEndpoint && errorMessageOf(error) === null;
    if (status !== 404) return false;
    const msg = errorMessageOf(error);
    return msg === null || GENERIC_NOT_FOUND.test(msg);
};
