import { useEffect, useState } from "react";

/** Giá trị chỉ cập nhật sau khi ngừng đổi `delayMs` (ô tìm kiếm gọi API: không gọi mỗi lần gõ phím). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}
