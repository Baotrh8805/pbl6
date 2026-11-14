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

// ---------- Quay lại trang bị chặn sau khi đăng nhập (state.from của ProtectedRoute) ----------

/**
 * Người gần nhất dùng tab này và phiên đó đang ở đâu: "active" = còn đăng nhập, "logout" = chủ động đăng xuất,
 * "expired" = hết phiên (401 / refresh hỏng). owner: email đã chuẩn hoá, "" = không rõ là ai. AuthContext giữ dấu này ở
 * sessionStorage (mỗi tab một người) để cả sau khi tải lại trang vẫn biết trang đang bị chặn là của ai.
 */
export interface SessionMark {
    reason: "active" | "logout" | "expired";
    owner: string;
}

/** state ProtectedRoute gắn khi đẩy về /login. */
export interface LoginRedirectState {
    from: { pathname: string; search: string };
    /** Có = trang của phiên vừa hết hạn: chỉ đúng email này đăng nhập lại mới quay về. Không có = tab chưa ai đăng nhập. */
    fromOwner?: string;
}

/** So email không phân biệt hoa thường / khoảng trắng: email gõ ở form đăng nhập vs email hồ sơ server trả. */
export const normalizeEmail = (email: string | null | undefined): string => (email ?? "").trim().toLowerCase();

/** Đọc dấu đã lưu; chuỗi hỏng / sai dạng -> null (coi như tab chưa ai đăng nhập). */
export const parseSessionMark = (raw: string | null): SessionMark | null => {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as Partial<SessionMark> | null;
        if (v && (v.reason === "active" || v.reason === "logout" || v.reason === "expired") && typeof v.owner === "string") {
            return { reason: v.reason, owner: v.owner };
        }
    } catch {
        // không phải JSON: bỏ qua
    }
    return null;
};

/**
 * Phiên kết thúc: giữ chủ phiên, ghi lý do. Dấu đã là logout/expired thì giữ nguyên — lần xoá phiên thứ hai (vd. request
 * còn bay về 401 ngay sau khi bấm Đăng xuất) không biến một lần chủ động đăng xuất thành "hết phiên".
 */
export const endSessionMark = (mark: SessionMark | null, reason: "logout" | "expired"): SessionMark =>
    mark && mark.reason !== "active" ? mark : { reason, owner: mark?.owner ?? "" };

/**
 * Dấu phiên lúc mở app (AuthProvider khởi tạo). Còn phiên -> "active" của email đã lưu. Hết phiên thì dấu cũ trong
 * sessionStorage chỉ đúng khi trang này là trang của người trước: tải lại (reload) hay Back / Forward về sau khi đăng xuất.
 * Trang được MỞ MỚI trong tab (dán link chia sẻ, bookmark, gõ URL, link từ email — navigation type "navigate") là ý của
 * người đang ngồi trước máy, không phải trang cũ của ai -> bỏ dấu, coi như tab chưa ai đăng nhập: ai đăng nhập cũng quay
 * về đúng trang đó. Không đọc được loại điều hướng (trình duyệt cũ / chặn API) -> giữ dấu như trước.
 */
export const startupSessionMark = (
    session: { token: string | null; email: string | null },
    stored: SessionMark | null,
    navigationType: string | null | undefined
): SessionMark | null => {
    if (session.token && session.email) return { reason: "active", owner: normalizeEmail(session.email) };
    return navigationType === "navigate" ? null : stored;
};

/**
 * state cho <Navigate to="/login"> của ProtectedRoute; undefined = không nhớ trang nào.
 * - Tab chưa ai đăng nhập (mở link chia sẻ / gõ URL): ai đăng nhập cũng quay về đúng trang đó.
 * - Chủ động đăng xuất: trang đang mở (hay trang Back tới) là của người cũ — người sau đăng nhập mà bị đưa vào đó thì 404,
 *   nên bỏ hẳn.
 * - Hết phiên / token biến mất (tab khác đăng xuất rồi tải lại): giữ trang nhưng gắn chủ, chỉ đúng người đó quay lại.
 */
export const loginRedirectState = (
    location: { pathname: string; search?: string },
    mark: SessionMark | null
): LoginRedirectState | undefined => {
    const from = { pathname: location.pathname, search: location.search ?? "" };
    if (!mark) return { from };
    if (mark.reason === "logout") return undefined;
    return { from, fromOwner: mark.owner };
};

/**
 * Trang quay lại sau khi `email` đăng nhập, null = về trang chủ theo vai trò. state là location.state (dữ liệu lịch sử
 * trình duyệt, không tin): chỉ nhận đường dẫn trong app ("/..." — không "//host" hay "/\host"), không vòng lại /login,
 * và trang có chủ thì phải đúng người đó (chủ rỗng = không rõ ai -> không ai được quay lại).
 */
export const postLoginPath = (state: unknown, email: string | null | undefined): string | null => {
    if (typeof state !== "object" || state === null) return null;
    const { from, fromOwner } = state as { from?: unknown; fromOwner?: unknown };
    if (typeof from !== "object" || from === null) return null;
    const { pathname, search } = from as { pathname?: unknown; search?: unknown };
    if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) return null;
    if (pathname === "/login") return null;
    if (fromOwner !== undefined && (typeof fromOwner !== "string" || !fromOwner || fromOwner !== normalizeEmail(email))) return null;
    return pathname + (typeof search === "string" && search.startsWith("?") ? search : "");
};
