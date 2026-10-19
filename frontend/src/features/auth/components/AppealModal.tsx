import React, { useId, useState } from "react";
import { Mail } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { SERVER_PENDING_MESSAGE } from "@/lib/apiErrorInfo";
import { authErrorMessage, authService } from "../services/authService";
import { APPEAL_MAX, APPEAL_MIN, EMAIL_MAX, validateAppeal, type AppealErrors } from "../authUtils";

// Khiếu nại tài khoản bị khoá (G1, hợp đồng API đợt 2 §6): mở từ form đăng nhập khi máy chủ báo tài khoản bị khoá.
// Không cần đăng nhập. Máy chủ luôn trả cùng một câu (không lộ email nào đang bị khoá) nên giao diện cũng chỉ báo chung.

interface AppealModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Email vừa đăng nhập bị từ chối: điền sẵn, người dùng vẫn sửa được. */
    defaultEmail?: string;
}

const AppealForm: React.FC<{ defaultEmail: string; onClose: () => void }> = ({ defaultEmail, onClose }) => {
    const messageId = useId();
    const counterId = useId();
    const [email, setEmail] = useState(defaultEmail);
    const [message, setMessage] = useState("");
    const [errors, setErrors] = useState<AppealErrors>({});
    const [apiError, setApiError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setApiError(null);
        const found = validateAppeal(email, message);
        setErrors(found);
        if (found.email || found.message) return;
        setBusy(true);
        try {
            setDone(await authService.submitAppeal(email.trim(), message.trim()));
        } catch (err) {
            setApiError(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div className="flex flex-col gap-4">
                <div role="status" className="flex items-start gap-3 p-3.5 rounded-lg bg-secondary/10 border border-secondary/30 text-sm text-on-surface">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-secondary shrink-0">
                        mark_email_read
                    </span>
                    <p className="leading-relaxed">{done}</p>
                </div>
                <div className="flex justify-end">
                    <Button type="button" variant="primary" size="md" onClick={onClose}>
                        Đóng
                    </Button>
                </div>
            </div>
        );
    }

    const length = message.trim().length;
    const pending = apiError === SERVER_PENDING_MESSAGE;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
            <p className="text-sm text-on-surface-variant leading-relaxed">
                Nếu bạn cho rằng tài khoản bị khoá nhầm, hãy trình bày ngắn gọn lý do. Quản trị viên sẽ xem xét và phản hồi qua email.
            </p>

            {apiError && (
                <div
                    role={pending ? "status" : "alert"}
                    className={`p-3.5 rounded-lg text-xs border ${
                        pending ? "bg-surface-container-low text-on-surface-variant border-outline-variant/30" : "bg-error-container text-error border-error/20"
                    }`}
                >
                    {apiError}
                </div>
            )}

            <Input
                id="appeal-email"
                name="email"
                type="email"
                label="Email tài khoản"
                autoComplete="email"
                maxLength={EMAIL_MAX}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
                required
            />

            <div className="flex flex-col gap-1.5">
                <label htmlFor={messageId} className={labelClass}>
                    Nội dung khiếu nại<span className="text-tertiary ml-1">*</span>
                </label>
                <textarea
                    id={messageId}
                    rows={5}
                    maxLength={APPEAL_MAX}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    aria-invalid={!!errors.message}
                    aria-describedby={counterId}
                    placeholder="Ví dụ: Tôi không vi phạm quy định nào, có thể tài khoản bị khoá do nhầm lẫn khi báo cáo bộ thẻ…"
                    className={`${fieldClass} resize-y min-h-[7rem] ${errors.message ? "border-error focus:ring-error/20" : ""}`}
                    required
                />
                <div id={counterId} className="flex items-start justify-between gap-3 text-xs">
                    <span className={errors.message ? "text-error" : "text-on-surface-variant"}>
                        {errors.message ?? `Từ ${APPEAL_MIN} đến ${APPEAL_MAX} ký tự.`}
                    </span>
                    <span className={`tabular-nums shrink-0 ${length > APPEAL_MAX ? "text-error" : "text-outline"}`}>
                        {length}/{APPEAL_MAX}
                    </span>
                </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={busy}>
                    Huỷ
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={busy}>
                    Gửi khiếu nại
                </Button>
            </div>
        </form>
    );
};

export const AppealModal: React.FC<AppealModalProps> = ({ isOpen, onClose, defaultEmail = "" }) => (
    // Không đóng khi bấm ra nền: tránh mất đoạn khiếu nại đang gõ vì một cú bấm trượt.
    <Modal isOpen={isOpen} onClose={onClose} title="Gửi khiếu nại" subtitle="Tài khoản bị khoá" icon="gavel" size="lg" closeOnBackdrop={false}>
        {/* Modal gỡ nội dung khi đóng -> mở lại là form mới, email điền lại theo lần đăng nhập gần nhất. */}
        <AppealForm defaultEmail={defaultEmail} onClose={onClose} />
    </Modal>
);

export default AppealModal;
