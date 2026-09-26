import { createContext, useContext, type ReactNode } from "react";

export type DialogTone = "danger" | "warning" | "info" | "success" | "error";

export interface ConfirmOptions {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** danger: nút xác nhận màu đỏ, focus mặc định vào "Hủy" để Enter không lỡ tay xoá. */
    tone?: DialogTone;
    /**
     * Thao tác chạy khi bấm xác nhận. Hộp thoại giữ mở + hiện loading tới khi xong;
     * lỗi hiện ngay trong hộp thoại để người dùng thử lại hoặc hủy.
     */
    action?: () => Promise<unknown>;
}

export interface AlertOptions {
    title: string;
    message: ReactNode;
    okLabel?: string;
    tone?: DialogTone;
}

export interface DialogApi {
    /** true = đã xác nhận (và action, nếu có, chạy thành công); false = hủy. */
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions) => Promise<void>;
}

export const DialogContext = createContext<DialogApi | null>(null);

export const useDialog = (): DialogApi => {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog must be used within a DialogProvider");
    return ctx;
};
