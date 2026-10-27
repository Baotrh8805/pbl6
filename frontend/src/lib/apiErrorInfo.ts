// Đọc mã HTTP / mã lỗi / thông điệp từ lỗi axios mà KHÔNG import axios: nhận diện bằng hình dạng (error.response)
// để hàm thuần này chạy được trong scripts/selfcheck bằng node. Body lỗi chuẩn của backend: {status, error, message}
// (+ `code` ở vài lỗi nghiệp vụ như EMAIL_NOT_VERIFIED, xem hợp đồng API đợt 2).

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
export interface ApiErrorTextOptions {
    /**
     * Câu dự phòng theo mã HTTP, CHỈ dùng khi body không có message (proxy chặn, body trống). Không dùng để thay câu của
     * server: một mã có thể có nhiều lý do — vd. 409 của POST /kanji/mnemonics là "3 mẹo chờ duyệt cho chữ này" HOẶC
     * "50 mẹo chờ duyệt tất cả" — câu đoán theo mã chỉ đúng với một lý do, còn backend biết chính xác.
     */
    fallbacks?: Partial<Record<number, string>>;
}

/**
 * Message thật của server. ApiExceptionHandler điền message = reason phrase ("Conflict", trùng trường `error`) khi exception
 * không kèm lý do: câu tiếng Anh đó không nói gì hơn mã HTTP nên coi như không có, để câu dự phòng tiếng Việt được dùng.
 */
const realMessageOf = (error: unknown): string | null => {
    const msg = errorMessageOf(error);
    const reason = errorBodyOf(error)?.error;
    return msg !== null && typeof reason === "string" && msg === reason.trim() ? null : msg;
};

/**
 * Câu lỗi cho người dùng, theo thứ tự: server có message -> đúng câu đó; không
 * có thì câu dự phòng theo mã HTTP. null = không có gì để nói (lỗi mạng, lỗi JS, mã không có câu dự phòng) -> nơi gọi
 * dùng extractErrorMessage (file này không import axios nên không gọi được nó).
 */
export const apiErrorText = (error: unknown, opts: ApiErrorTextOptions = {}): string | null => {
    const message = realMessageOf(error);
    if (message !== null) return message;
    const status = httpStatusOf(error);
    return status === null ? null : opts.fallbacks?.[status] ?? null;
};
