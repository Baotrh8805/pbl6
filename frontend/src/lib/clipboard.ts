import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Nơi gắn textarea tạm. Khi một <dialog> đang mở bằng showModal() (Modal của app), phần còn lại
 * của trang bị inert: textarea gắn vào body không nhận focus/selection được nên execCommand("copy")
 * trả về true mà clipboard không đổi -> phải gắn vào chính dialog đang mở.
 * Ưu tiên dialog đang chứa focus (nút vừa bấm) để đúng cả khi lồng nhiều modal.
 */
const fallbackHost = (): HTMLElement => {
    const focused = document.activeElement?.closest<HTMLDialogElement>("dialog[open]");
    if (focused) return focused;
    try {
        const modal = document.querySelector<HTMLDialogElement>("dialog:modal");
        if (modal) return modal;
    } catch {
        // Engine cũ chưa hiểu :modal -> querySelector ném lỗi, coi như không có modal
    }
    return document.body;
};

/**
 * Chép văn bản vào clipboard. Clipboard API chỉ có trên HTTPS/localhost và có thể bị chặn
 * quyền; khi đó rơi về cách cũ: chọn nội dung trong một ô input rồi execCommand("copy")
 * (vẫn chạy trên http LAN / WebView cũ). Trả về false khi cả hai cách đều thất bại
 * để UI nhắc người dùng chọn và chép thủ công.
 */
export const copyText = async (text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Bị từ chối quyền / không bảo mật -> thử cách cũ bên dưới
    }
    // Không có ô input sẵn thì tạo tạm một textarea ngoài màn hình (không đổi layout).
    const temp = fallbackInput ? null : document.createElement("textarea");
    // select() kéo focus sang textarea; gỡ nó đi thì focus rơi mất -> trả lại cho nút vừa bấm.
    const previouslyFocused = temp ? document.activeElement : null;
    try {
        const el = fallbackInput ?? temp!;
        if (temp) {
            temp.value = text;
            temp.setAttribute("readonly", "");
            temp.style.position = "fixed";
            temp.style.opacity = "0";
            fallbackHost().appendChild(temp);
        }
        el.select();
        el.setSelectionRange(0, text.length); // iOS Safari bỏ qua select()
        return document.execCommand("copy");
    } catch {
        return false;
    } finally {
        temp?.remove();
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    }
};

/**
 * Trạng thái "Đã chép" tự tắt sau `resetMs`; huỷ timer khi unmount để không setState lên
 * component đã gỡ. Dùng chung cho mọi nút sao chép liên kết.
 */
export const useCopyToClipboard = (resetMs = 2000) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const copy = useCallback(
        async (text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> => {
            const ok = await copyText(text, fallbackInput);
            window.clearTimeout(timer.current);
            setCopied(ok);
            if (ok) timer.current = window.setTimeout(() => setCopied(false), resetMs);
            return ok;
        },
        [resetMs]
    );

    return { copied, copy };
};
