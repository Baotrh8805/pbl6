// Quy tắc đổi mật khẩu dùng chung (Hồ sơ > Bảo mật, /setup của staff, Admin Panel > Hồ sơ). Khớp PasswordChangeRequest
// của backend (6–72 ký tự; BCrypt chỉ dùng 72 byte đầu). Hàm thuần, import tương đối -> scripts/selfCheck.ts chạy được.

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/**
 * Lỗi hiển nhiên chặn ngay ở máy khách (mật khẩu hiện tại vẫn do server xác minh); hợp lệ -> null.
 * `sameMessage`: câu khi mật khẩu mới trùng mật khẩu hiện tại (trang /setup nói "mật khẩu mặc định").
 */
export function passwordChangeError(
    current: string,
    next: string,
    confirm: string,
    sameMessage = "Mật khẩu mới phải khác mật khẩu hiện tại."
): string | null {
    if (!current) return "Vui lòng nhập mật khẩu hiện tại.";
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) {
        return `Mật khẩu mới phải từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự.`;
    }
    if (next !== confirm) return "Mật khẩu xác nhận không khớp.";
    if (next === current) return sameMessage;
    return null;
}
