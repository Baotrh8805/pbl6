import React from "react";
import type { TypedQuizFeedback, TypedQuizQuestion } from "@/types/quiz.types";
import { answerLang, normalizeTypedAnswer } from "../quizUtils";

/**
 * Khối phản hồi một câu: chữ + biểu tượng (không chỉ dựa vào màu). Câu không phải nghĩa: đáp án là chữ Nhật (lang="ja");
 * câu gõ luôn hiện đáp án chuẩn (gõ "kaku" đúng vẫn nên thấy かく) và chuỗi đã chuẩn hoá khi sai; câu chia thể có câu ví dụ.
 */
export const FeedbackBlock: React.FC<{ q: TypedQuizQuestion; feedback: TypedQuizFeedback; chosen: string | null }> = ({
    q,
    feedback,
    chosen,
}) => {
    const typing = q.inputMode === "typing";
    const lang = answerLang(q.type);
    const jaClass = lang ? "font-japanese" : "";
    return (
        <div
            className={`rounded-lg p-space-sm border ${
                feedback.correct
                    ? "bg-secondary-container/40 border-secondary"
                    : "bg-error-container/30 border-error/40"
            }`}
        >
            <p className={`font-label-md font-semibold ${feedback.correct ? "text-secondary" : "text-error"}`}>
                <span aria-hidden="true" className="material-symbols-outlined align-middle text-[18px] mr-1">
                    {feedback.correct ? "check_circle" : "cancel"}
                </span>
                {feedback.correct ? "Chính xác" : chosen ? "Chưa đúng" : "Chưa trả lời"}
            </p>
            {(!feedback.correct || typing) && (
                <p className="text-body-sm mt-1">
                    {feedback.correct ? "Đáp án" : "Đáp án đúng"}:{" "}
                    <strong lang={lang} className={jaClass}>
                        {feedback.correctAnswer}
                    </strong>
                </p>
            )}
            {!feedback.correct && chosen && (
                <p className="text-body-sm text-on-surface-variant">
                    {typing ? "Bạn trả lời" : "Bạn chọn"}:{" "}
                    <span lang={lang} className={jaClass}>
                        {chosen}
                    </span>
                    {typing && normalizeTypedAnswer(chosen) !== chosen && (
                        <>
                            {" "}
                            (chấm theo{" "}
                            <span lang="ja" className="font-japanese">
                                {normalizeTypedAnswer(chosen) || "trống"}
                            </span>
                            )
                        </>
                    )}
                </p>
            )}
            {feedback.explanation && (
                <p lang="ja" className="text-body-sm text-on-surface-variant mt-2 whitespace-pre-line">
                    {feedback.explanation}
                </p>
            )}
            {feedback.example && (
                <p className="text-body-sm mt-2">
                    <span className="font-semibold">Ví dụ: </span>
                    <span lang="ja" className="font-japanese whitespace-pre-line">
                        {feedback.example}
                    </span>
                </p>
            )}
            <span className="sr-only">{q.term}</span>
        </div>
    );
};
