import React from "react";
import type { TypedQuizQuestion } from "@/types/quiz.types";
import type { FlagTarget } from "./FlagQuestionModal";

/** Nút "Báo lỗi câu hỏi": chỉ câu có trong ngân hàng (questionId) mới báo được; đã báo thì khoá để không gửi trùng. */
export const FlagButton: React.FC<{ q: TypedQuizQuestion; flagged: boolean; onFlag: (target: FlagTarget) => void }> = ({
    q,
    flagged,
    onFlag,
}) => {
    if (!q.questionId) return null;
    const questionId = q.questionId;
    return (
        <button
            type="button"
            disabled={flagged}
            onClick={() => onFlag({ questionId, term: q.term, prompt: q.prompt, inputMode: q.inputMode })}
            className="self-start inline-flex items-center gap-1 px-2 py-1.5 min-h-11 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-60 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {flagged ? "outlined_flag" : "flag"}
            </span>
            {flagged ? "Đã báo lỗi câu này" : "Báo lỗi câu hỏi"}
        </button>
    );
};
