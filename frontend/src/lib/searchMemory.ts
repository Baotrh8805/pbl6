// Nhớ trạng thái URL (?…) của một trang trong tab trình duyệt: các mục sidebar dẫn tới trang không kèm tham số nên rời trang rồi
// quay lại là mất câu đang tra. Trang ghi tham số của mình vào sessionStorage và khôi phục khi vào lại với URL trống.
// Dùng cho Từ điển và Sơ đồ chữ Hán. Phần thuần (pickParams, restoreOnEnter) được selfcheck kiểm.

/** Chuỗi tham số chỉ gồm các khoá được phép, theo thứ tự trong URL; không còn gì → "". */
export function pickParams(params: URLSearchParams, allowed: readonly string[]): string {
    const out = new URLSearchParams();
    for (const [k, v] of params) {
        if (allowed.includes(k) && v) out.append(k, v);
    }
    return out.toString();
}

/**
 * URL hiện không có tham số nào của trang và có trạng thái đã nhớ (khác rỗng sau khi lọc) → tham số để khôi phục; còn lại → null.
 * URL đã có tham số (link "Tra chữ này", đổi tab) thì giữ nguyên, không đè.
 */
export function restoreOnEnter(current: URLSearchParams, stored: string | null, allowed: readonly string[]): URLSearchParams | null {
    if (pickParams(current, allowed) || !stored) return null;
    const saved = pickParams(new URLSearchParams(stored), allowed);
    return saved ? new URLSearchParams(saved) : null;
}

/** Đọc / ghi sessionStorage không bao giờ ném (chế độ riêng tư, chặn lưu trữ): lỗi thì coi như không nhớ. */
export function readSearchMemory(key: string): string | null {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeSearchMemory(key: string, value: string): void {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // không lưu được thì lần sau vào trang trống như trước, không ảnh hưởng gì khác
    }
}
