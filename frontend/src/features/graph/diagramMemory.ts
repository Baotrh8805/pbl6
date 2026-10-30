// Nhớ câu tìm gần nhất của Sơ đồ chữ Hán trong tab trình duyệt: mục sidebar dẫn tới /graph không kèm ?q= nên rời trang rồi quay
// lại là mất từ đang tra. Trang ghi q / mode / k vào sessionStorage mỗi khi có q, và khi mở /graph trống thì khôi phục (replace).
// Phần thuần (chọn tham số, kiểm dữ liệu đã lưu) tách riêng để scripts/selfcheck/diagram.ts kiểm được.

export const DIAGRAM_MEMORY_KEY = "kanjiDiagram:lastSearch";
const MAX_QUERY_CHARS = 32;
const KEPT = ["q", "mode", "k"] as const;

/** Chuỗi tham số cần nhớ (chỉ q / mode / k); không có q → null (không ghi gì). */
export function searchToRemember(params: URLSearchParams): string | null {
    const q = (params.get("q") ?? "").trim();
    if (!q) return null;
    const out = new URLSearchParams();
    for (const name of KEPT) {
        const v = params.get(name);
        if (v) out.set(name, v);
    }
    return out.toString();
}

/** URL hiện chưa có q và có câu tìm đã nhớ hợp lệ → tham số để khôi phục; còn lại → null. */
export function restoredSearch(current: URLSearchParams, stored: string | null): URLSearchParams | null {
    if ((current.get("q") ?? "").trim() || !stored) return null;
    const saved = new URLSearchParams(stored);
    const q = (saved.get("q") ?? "").trim();
    if (!q || q.length > MAX_QUERY_CHARS) return null;
    const out = new URLSearchParams();
    for (const name of KEPT) {
        const v = saved.get(name);
        if (v) out.set(name, v);
    }
    return out;
}

/** Đọc / ghi sessionStorage không bao giờ ném (chế độ riêng tư, chặn lưu trữ): lỗi thì coi như không nhớ. */
export function readDiagramMemory(): string | null {
    try {
        return sessionStorage.getItem(DIAGRAM_MEMORY_KEY);
    } catch {
        return null;
    }
}

export function writeDiagramMemory(value: string): void {
    try {
        sessionStorage.setItem(DIAGRAM_MEMORY_KEY, value);
    } catch {
        // không lưu được thì lần sau mở trang trống như trước, không ảnh hưởng gì khác
    }
}
