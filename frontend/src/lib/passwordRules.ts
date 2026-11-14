// Quy tắc mật khẩu dùng chung (đăng ký, Hồ sơ > Bảo mật, /setup của staff, Admin Panel > Hồ sơ, đặt lại mật khẩu). Khớp
// PasswordPolicy của backend (rà soát 27/10): 8–72 ký tự, có chữ, số và ký tự đặc biệt; BCrypt chỉ dùng 72 byte đầu.
// Hàm thuần, import tương đối -> scripts/selfCheck.ts chạy được.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_POLICY_MESSAGE = `Mật khẩu phải từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự, có chữ, số và ký tự đặc biệt (ví dụ ! @ # $ % _ -).`;
/** Gợi ý ngắn dưới ô nhập. */
export const PASSWORD_HINT = `Ít nhất ${PASSWORD_MIN} ký tự, gồm chữ, số và ký tự đặc biệt.`;

/** Lỗi theo chính sách; hợp lệ -> null. Chữ cái lấy theo Unicode (mật khẩu tiếng Việt có dấu vẫn tính là chữ). */
export function passwordPolicyError(password: string): string | null {
    if (!password) return "Mật khẩu không được để trống.";
    if (password !== password.trim()) return "Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng.";
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return PASSWORD_POLICY_MESSAGE;
    const letter = /\p{L}/u.test(password);
    const digit = /\p{Nd}/u.test(password);
    const special = /[^\p{L}\p{Nd}\s]/u.test(password);
    return letter && digit && special ? null : PASSWORD_POLICY_MESSAGE;
}

/** Độ mạnh 0..3 cho thanh gợi ý: độ dài ≥ 8 / ≥ 12, đủ 3 loại ký tự, có cả hoa lẫn thường. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
    if (!password || passwordPolicyError(password)) return password.length >= PASSWORD_MIN ? 1 : 0;
    let score = 1;
    if (password.length >= 12) score++;
    if (/\p{Lu}/u.test(password) && /\p{Ll}/u.test(password)) score++;
    return score as 1 | 2 | 3;
}

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
    const policy = passwordPolicyError(next);
    if (policy) return policy;
    if (next !== confirm) return "Mật khẩu xác nhận không khớp.";
    if (next === current) return sameMessage;
    return null;
}
