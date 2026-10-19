// Hàm thuần cho xác thực email (A1) + khiếu nại tài khoản bị khoá (G1) — hợp đồng API đợt 2 §3, §6. Không gọi API /
// DOM, import tương đối + đuôi .ts -> kiểm được bằng scripts/selfcheck/practice.ts.
import { errorCodeOf, errorMessageOf, httpStatusOf } from "../../lib/apiErrorInfo.ts";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 255;

/** Mã lỗi đăng nhập khi chưa xác thực email (403). */
export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

export const REGISTER_DEFAULT_MESSAGE = "Đăng ký tài khoản thành công!";

export interface RegisterResult {
    message: string;
    /** true = phải bấm link trong email trước khi đăng nhập được. */
    needsVerification: boolean;
}

/**
 * Response POST /auth/register: backend cũ trả chuỗi thường, backend mới trả JSON {message, needsVerification}.
 * Đọc cả hai dạng (kể cả JSON bị axios để nguyên chuỗi); thiếu cờ -> coi như không cần xác thực (hành vi cũ).
 */
export const parseRegisterResponse = (data: unknown): RegisterResult => {
    let d = data;
    if (typeof d === "string" && d.trim().startsWith("{")) {
        try {
            d = JSON.parse(d);
        } catch {
            // không phải JSON: dùng nguyên chuỗi
        }
    }
    if (typeof d === "string") return { message: d.trim() || REGISTER_DEFAULT_MESSAGE, needsVerification: false };
    if (typeof d === "object" && d !== null && !Array.isArray(d)) {
        const o = d as Record<string, unknown>;
        const message = typeof o.message === "string" && o.message.trim() ? o.message.trim() : REGISTER_DEFAULT_MESSAGE;
        return { message, needsVerification: o.needsVerification === true };
    }
    return { message: REGISTER_DEFAULT_MESSAGE, needsVerification: false };
};

export type LoginErrorKind = "email-not-verified" | "locked" | null;

// AuthService.login: "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ." / "Tài khoản đã bị khoá: <lý do>". Chuẩn hoá NFC
// rồi nhận cả "khoá" lẫn "khóa" (hai cách bỏ dấu đều gặp trong tiếng Việt).
const LOCKED_RE = /bị\s+kh(oá|óa)/i;
const UNVERIFIED_RE = /chưa\s+(được\s+)?xác\s+(thực|minh)\s+email/i;

/**
 * Loại lỗi đăng nhập cần nút riêng: chưa xác thực email (gửi lại email) hoặc tài khoản bị khoá (gửi khiếu nại).
 * Ưu tiên `code` máy đọc được; khoá chưa có code nên nhận theo 403 + câu thông báo của AuthService.
 */
export const loginErrorKind = (error: unknown): LoginErrorKind => {
    const code = errorCodeOf(error);
    if (code === EMAIL_NOT_VERIFIED) return "email-not-verified";
    if (code === "ACCOUNT_LOCKED") return "locked";
    if (httpStatusOf(error) !== 403) return null;
    const msg = (errorMessageOf(error) ?? "").normalize("NFC");
    if (UNVERIFIED_RE.test(msg)) return "email-not-verified";
    if (LOCKED_RE.test(msg)) return "locked";
    return null;
};

/** Giới hạn nội dung khiếu nại (account_appeals.message varchar(1000), tối thiểu 10 ký tự). */
export const APPEAL_MIN = 10;
export const APPEAL_MAX = 1000;

export interface AppealErrors {
    email?: string;
    message?: string;
}

/** Kiểm tra form khiếu nại trước khi gửi; đếm ký tự sau khi bỏ khoảng trắng hai đầu như máy chủ. */
export const validateAppeal = (email: string, message: string): AppealErrors => {
    const errors: AppealErrors = {};
    const e = email.trim();
    if (!e) errors.email = "Email không được để trống";
    else if (e.length > EMAIL_MAX) errors.email = `Email tối đa ${EMAIL_MAX} ký tự`;
    else if (!EMAIL_RE.test(e)) errors.email = "Email không đúng định dạng";
    const len = message.trim().length;
    if (len < APPEAL_MIN) errors.message = `Nội dung khiếu nại cần ít nhất ${APPEAL_MIN} ký tự`;
    else if (len > APPEAL_MAX) errors.message = `Nội dung khiếu nại tối đa ${APPEAL_MAX} ký tự`;
    return errors;
};

/** Số giây còn phải chờ trước khi được bấm gửi lại (làm tròn lên; 0 = bấm được). */
export const cooldownSecondsLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / 1000));
