// Nơi duy nhất đọc/ghi token. "Ghi nhớ đăng nhập" -> localStorage (giữ qua lần mở trình duyệt sau),
// không tick -> sessionStorage (đóng tab là mất).
// Access token ngắn hạn (15 phút) được đổi mới tự động bằng refresh token; refresh token hết hạn sau 3 ngày
// không hoạt động -> phải đăng nhập lại (xem apiClient).
// ponytail: token vẫn đọc được bằng JS nên lộ nếu dính XSS.
// Nâng cấp khi backend hỗ trợ: chuyển sang cookie HttpOnly + SameSite.
const TOKEN_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";
const EMAIL_KEY = "userEmail";

const stores = (): Storage[] => [localStorage, sessionStorage];

const read = (key: string): string | null => {
    for (const s of stores()) {
        const v = s.getItem(key);
        if (v) return v;
    }
    return null;
};

/** Nơi đang giữ phiên hiện tại: localStorage nếu có token ở đó, ngược lại sessionStorage. */
const currentStore = (): Storage => (localStorage.getItem(TOKEN_KEY) !== null ? localStorage : sessionStorage);

export const tokenStorage = {
    getToken: (): string | null => read(TOKEN_KEY),
    getRefreshToken: (): string | null => read(REFRESH_KEY),
    getEmail: (): string | null => read(EMAIL_KEY),

    /** `remember` bỏ trống = giữ nguyên nơi đang lưu (vd. token mới sau khi đổi mật khẩu). */
    save(token: string, refreshToken: string, email?: string | null, remember?: boolean) {
        const keepLocal = remember ?? localStorage.getItem(TOKEN_KEY) !== null;
        const target = keepLocal ? localStorage : sessionStorage;
        const currentEmail = email ?? read(EMAIL_KEY);
        this.clear();
        target.setItem(TOKEN_KEY, token);
        target.setItem(REFRESH_KEY, refreshToken);
        if (currentEmail) target.setItem(EMAIL_KEY, currentEmail);
    },

    /** Sau khi làm mới: chỉ thay access token, giữ nguyên nơi lưu, refresh token và email. */
    setToken(token: string) {
        currentStore().setItem(TOKEN_KEY, token);
    },

    setEmail(email: string) {
        currentStore().setItem(EMAIL_KEY, email);
    },

    clear() {
        for (const s of stores()) {
            s.removeItem(TOKEN_KEY);
            s.removeItem(REFRESH_KEY);
            s.removeItem(EMAIL_KEY);
        }
    },
};
