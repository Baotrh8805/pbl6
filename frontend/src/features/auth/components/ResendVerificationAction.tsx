import React from "react";
import { Button } from "@/components/ui/Button";
import { useResendVerification, type ResendStatus } from "../hooks/useResendVerification";

const STATUS_CLASS: Record<NonNullable<ResendStatus>["type"], string> = {
    success: "text-secondary",
    error: "text-error",
    info: "text-on-surface-variant",
};

const STATUS_ICON: Record<NonNullable<ResendStatus>["type"], string> = {
    success: "mark_email_read",
    error: "error",
    info: "info",
};

/** Dòng thông báo của lần gửi lại; vùng aria-live luôn render để trình đọc màn hình bắt được thay đổi. */
export const ResendStatusLine: React.FC<{ status: ResendStatus }> = ({ status }) => (
    <p aria-live="polite" className="min-h-[1rem] text-xs leading-relaxed">
        {status && (
            <span className={`inline-flex items-start gap-1 ${STATUS_CLASS[status.type]}`}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] shrink-0">
                    {STATUS_ICON[status.type]}
                </span>
                <span>{status.text}</span>
            </span>
        )}
    </p>
);

interface ResendVerificationActionProps {
    /** Email cần gửi lại liên kết kích hoạt (đã biết sẵn: vừa đăng ký / vừa đăng nhập). */
    email: string;
    label?: string;
    variant?: "outline" | "secondary" | "primary";
    className?: string;
}

/** Nút "Gửi lại email" + thông báo; khoá kèm đếm ngược sau mỗi lần gửi thành công. */
export const ResendVerificationAction: React.FC<ResendVerificationActionProps> = ({
    email,
    label = "Gửi lại email",
    variant = "outline",
    className = "",
}) => {
    const { send, busy, status, secondsLeft } = useResendVerification();
    return (
        <div className={`flex flex-col items-start gap-1.5 ${className}`}>
            <Button type="button" variant={variant} size="sm" onClick={() => void send(email)} isLoading={busy} disabled={secondsLeft > 0}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    forward_to_inbox
                </span>
                {secondsLeft > 0 ? `Gửi lại sau ${secondsLeft} giây` : label}
            </Button>
            <ResendStatusLine status={status} />
        </div>
    );
};
