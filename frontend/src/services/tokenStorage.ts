// Nơi duy nhất đọc/ghi token. "Ghi nhớ đăng nhập" -> localStorage (giữ qua lần mở trình duyệt sau),
// không tick -> sessionStorage (đóng tab là mất).
// ponytail: token vẫn đọc được bằng JS nên lộ nếu dính XSS.
// Nâng cấp khi backend hỗ trợ: chuyển sang cookie HttpOnly + SameSite.
const TOKEN_KEY = "accessToken";
const EMAIL_KEY = "userEmail";

const stores = (): Storage[] => [localStorage, sessionStorage];

const read = (key: string): string | null => {
    for (const s of stores()) {
        const v = s.getItem(key);
        if (v) return v;
    }
    return null;
};

export const tokenStorage = {
    getToken: (): string | null => read(TOKEN_KEY),
    getEmail: (): string | null => read(EMAIL_KEY),

    /** `remember` bỏ trống = giữ nguyên nơi đang lưu (vd. token mới sau khi đổi mật khẩu). */
    save(token: string, email?: string | null, remember?: boolean) {
        const keepLocal = remember ?? localStorage.getItem(TOKEN_KEY) !== null;
        const target = keepLocal ? localStorage : sessionStorage;
        const currentEmail = email ?? read(EMAIL_KEY);
        this.clear();
        target.setItem(TOKEN_KEY, token);
        if (currentEmail) target.setItem(EMAIL_KEY, currentEmail);
    },

    setEmail(email: string) {
        const target = localStorage.getItem(TOKEN_KEY) !== null ? localStorage : sessionStorage;
        target.setItem(EMAIL_KEY, email);
    },

    clear() {
        for (const s of stores()) {
            s.removeItem(TOKEN_KEY);
            s.removeItem(EMAIL_KEY);
        }
    },
};
