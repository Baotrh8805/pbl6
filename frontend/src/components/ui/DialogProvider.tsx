import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { extractErrorMessage } from "@/services/apiClient";
import { DialogContext, type AlertOptions, type ConfirmOptions, type DialogApi, type DialogTone } from "./dialogContext";

// Thay window.alert/confirm: cùng giao diện với các modal khác, đọc được trên mobile,
// và thao tác gọi API chạy ngay trong hộp thoại (loading + lỗi tại chỗ, không bật alert chồng alert).

const TONE: Record<DialogTone, { icon: string; className: string }> = {
    danger: { icon: "delete_forever", className: "bg-error-container text-error" },
    warning: { icon: "warning", className: "bg-[#FEF3C7] text-[#B45309]" },
    info: { icon: "help", className: "bg-primary-fixed text-primary" },
    success: { icon: "check_circle", className: "bg-secondary-container text-on-secondary-container" },
    error: { icon: "error", className: "bg-error-container text-error" },
};

type Pending =
    | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
    | { kind: "alert"; options: AlertOptions; resolve: () => void };

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);
    // Cờ đồng bộ bên cạnh `busy` (LP-13): bấm đúp nút xác nhận trước khi `busy` kịp render chạy `action` hai lần
    // (cân lại lịch / hoàn thành / xoá gửi hai request).
    const actionRunning = useRef(false);
    const [error, setError] = useState("");
    const bodyRef = useRef<HTMLDivElement>(null);

    const open = useCallback((next: Pending) => {
        // Hộp thoại cũ chưa trả lời mà có hộp mới -> coi như hủy hộp cũ.
        setPending((prev) => {
            if (prev?.kind === "confirm") prev.resolve(false);
            else prev?.resolve();
            return next;
        });
        setBusy(false);
        setError("");
    }, []);

    const api = useMemo<DialogApi>(
        () => ({
            confirm: (options) => new Promise<boolean>((resolve) => open({ kind: "confirm", options, resolve })),
            alert: (options) => new Promise<void>((resolve) => open({ kind: "alert", options, resolve })),
        }),
        [open]
    );

    // showModal() focus nút đầu tiên (nút X); dời focus sang nút an toàn nhất.
    // Effect của Modal (con) chạy trước effect này nên dialog đã mở.
    useEffect(() => {
        if (pending) bodyRef.current?.closest("dialog")?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, [pending]);

    const close = (ok: boolean) => {
        if (!pending || busy) return;
        if (pending.kind === "confirm") pending.resolve(ok);
        else pending.resolve();
        setPending(null);
    };

    const handleConfirm = async () => {
        if (!pending || pending.kind !== "confirm" || busy || actionRunning.current) return;
        const { action } = pending.options;
        if (!action) return close(true);
        actionRunning.current = true;
        setBusy(true);
        setError("");
        try {
            await action();
            pending.resolve(true);
            setPending(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            actionRunning.current = false;
            setBusy(false);
        }
    };

    const tone = pending?.options.tone ?? "info";
    const toneStyle = TONE[tone];
    const isDanger = tone === "danger";

    const footer =
        pending?.kind === "confirm" ? (
            <>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => close(false)}
                    disabled={busy}
                    data-autofocus={isDanger ? "" : undefined}
                >
                    {pending.options.cancelLabel ?? "Hủy"}
                </Button>
                <Button
                    type="button"
                    variant={isDanger ? "danger" : "primary"}
                    size="sm"
                    onClick={() => void handleConfirm()}
                    isLoading={busy}
                    data-autofocus={isDanger ? undefined : ""}
                >
                    {error ? "Thử lại" : (pending.options.confirmLabel ?? "Xác nhận")}
                </Button>
            </>
        ) : pending ? (
            <Button type="button" size="sm" onClick={() => close(true)} data-autofocus="">
                {pending.options.okLabel ?? "Đã hiểu"}
            </Button>
        ) : null;

    return (
        <DialogContext.Provider value={api}>
            {children}
            <Modal
                isOpen={!!pending}
                onClose={() => close(false)}
                title={pending?.options.title ?? ""}
                size="md"
                closeOnBackdrop={!busy}
                footer={footer}
            >
                <div ref={bodyRef} className="flex items-start gap-4">
                    <span
                        aria-hidden="true"
                        className={`material-symbols-outlined shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-[24px] ${toneStyle.className}`}
                    >
                        {toneStyle.icon}
                    </span>
                    <div className="min-w-0 flex-1 flex flex-col gap-3 pt-1.5">
                        {/* pre-line: giữ xuống dòng "\n" trong thông báo cũ */}
                        <div className="text-body-md text-on-surface-variant whitespace-pre-line break-words">
                            {pending?.options.message}
                        </div>
                        {error && (
                            <p
                                role="alert"
                                className="flex items-start gap-1.5 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">
                                    error
                                </span>
                                {error}
                            </p>
                        )}
                    </div>
                </div>
            </Modal>
        </DialogContext.Provider>
    );
};
