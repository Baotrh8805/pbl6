import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { httpStatusOf } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { flagQuizQuestion } from "@/services/studyService";
import type { QuestionFlagReason, QuizInputMode } from "@/types/quiz.types";
import {
    FLAG_DETAIL_MAX,
    FLAG_REASON_LABELS,
    buildFlagRequest,
    flagErrorMessage,
    flagReasonsFor,
    validateFlag,
} from "../quizUtils";

export interface FlagTarget {
    questionId: string;
    term: string;
    prompt: string | null;
    inputMode: QuizInputMode;
}

interface FlagQuestionModalProps {
    target: FlagTarget | null;
    onClose: () => void;
    /**
     * Gửi xong (201) hoặc server báo đã có báo cáo đang mở của mình (409): cả hai đều nghĩa là câu này đã nằm trong
     * hàng chờ của admin -> nơi gọi khoá nút "Báo lỗi" và hiện câu thông báo.
     */
    onFlagged: (questionId: string, message: string) => void;
}

/** "Báo lỗi câu hỏi" (hợp đồng §1.2): lý do + mô tả (bắt buộc khi "Khác") -> POST /quiz-questions/{id}/flags. */
export const FlagQuestionModal: React.FC<FlagQuestionModalProps> = ({ target, onClose, onFlagged }) => {
    const formId = useId();
    const [busy, setBusy] = useState(false);
    return (
        <Modal
            isOpen={target !== null}
            onClose={onClose}
            icon="flag"
            size="md"
            title="Báo lỗi câu hỏi"
            subtitle={target ? target.prompt ?? target.term : undefined}
            closeOnBackdrop={!busy}
            footer={
                <>
                    <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                        Hủy
                    </Button>
                    <Button type="submit" form={formId} size="sm" isLoading={busy}>
                        Gửi báo lỗi
                    </Button>
                </>
            }
        >
            {/* Modal gỡ nội dung khi đóng -> mở lại cho câu khác thì form trống. */}
            {target && (
                <FlagForm formId={formId} target={target} onBusyChange={setBusy} onFlagged={onFlagged} onDone={onClose} />
            )}
        </Modal>
    );
};

const FlagForm: React.FC<{
    formId: string;
    target: FlagTarget;
    onBusyChange: (busy: boolean) => void;
    onFlagged: (questionId: string, message: string) => void;
    onDone: () => void;
}> = ({ formId, target, onBusyChange, onFlagged, onDone }) => {
    const [reason, setReason] = useState<QuestionFlagReason | null>(null);
    const [detail, setDetail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const detailId = useId();
    const errorId = useId();
    const reasons = flagReasonsFor(target.inputMode);
    const detailRequired = reason === "OTHER";

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;
        const invalid = validateFlag(reason, detail);
        setError(invalid);
        if (invalid || !reason) return;
        setBusy(true);
        onBusyChange(true);
        try {
            await flagQuizQuestion(target.questionId, buildFlagRequest(reason, detail));
            onFlagged(target.questionId, "Đã gửi báo lỗi. Cảm ơn bạn đã giúp câu hỏi chính xác hơn!");
            onBusyChange(false);
            onDone();
        } catch (err) {
            const status = httpStatusOf(err);
            if (status === 409) {
                onFlagged(target.questionId, flagErrorMessage(err) ?? extractErrorMessage(err));
                onBusyChange(false);
                onDone();
                return;
            }
            // 429 / server chưa có endpoint / lỗi khác: giữ hộp thoại để người học đọc lý do và thử lại sau.
            setError(flagErrorMessage(err) ?? extractErrorMessage(err));
            setBusy(false);
            onBusyChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 text-body-sm" noValidate>
            <fieldset className="flex flex-col gap-1.5" disabled={busy}>
                <legend className="font-semibold mb-1">Câu hỏi này bị lỗi gì?</legend>
                {reasons.map((r) => (
                    <label key={r} className="flex items-center gap-2 min-h-11 px-2 rounded-lg hover:bg-surface-container-low cursor-pointer">
                        <input type="radio" name={`${formId}-reason`} checked={reason === r} onChange={() => setReason(r)} />
                        {FLAG_REASON_LABELS[r]}
                    </label>
                ))}
            </fieldset>
            <div className="flex flex-col gap-1">
                <label htmlFor={detailId} className="font-semibold">
                    Mô tả{" "}
                    {detailRequired ? (
                        <span className="text-tertiary">*</span>
                    ) : (
                        <span className="font-normal text-on-surface-variant">(không bắt buộc)</span>
                    )}
                </label>
                <textarea
                    id={detailId}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    maxLength={FLAG_DETAIL_MAX}
                    rows={3}
                    required={detailRequired}
                    disabled={busy}
                    aria-invalid={!!error && detailRequired && !detail.trim()}
                    aria-describedby={error ? errorId : undefined}
                    placeholder="Ví dụ: đáp án đúng phải là 書いて"
                    className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-label-sm text-outline text-right">
                    {detail.length}/{FLAG_DETAIL_MAX}
                </p>
            </div>
            {error && (
                <p id={errorId} role="alert" className="text-error">
                    {error}
                </p>
            )}
        </form>
    );
};
