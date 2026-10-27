import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { generateDistractors } from "@/services/studyService";
import type { QuizQuestionType } from "@/types/quiz.types";
import type { QuizCapabilitiesState } from "../useQuizCapabilities";
import {
    QUESTION_TYPES,
    QUESTION_TYPE_HINTS,
    QUESTION_TYPE_LABELS,
    capabilityCount,
    describeDistractorResult,
    distractorErrorMessage,
    toggleQuestionType,
    typeDisabledReason,
} from "../quizUtils";

interface QuestionTypeFieldsetProps {
    deckId: string;
    selected: readonly QuizQuestionType[];
    onChange: (next: QuizQuestionType[]) => void;
    capabilities: QuizCapabilitiesState;
    /** Đang tạo đề / có bài dở: khoá cả nhóm như các lựa chọn khác của màn bắt đầu. */
    disabled?: boolean;
}

/**
 * "Loại câu hỏi" ở màn bắt đầu quiz (hợp đồng §1.2): mỗi loại kèm số thẻ dùng được; loại 0 thẻ bị tắt và nói rõ vì sao
 * thay vì để người học chọn rồi mới báo lỗi. Chủ / người sửa bộ thẻ có nút "Sinh câu nhiễu" để mở thêm loại
 * kanji giống hình và từ đồng âm, xong thì tải lại số liệu.
 */
export const QuestionTypeFieldset: React.FC<QuestionTypeFieldsetProps> = ({
    deckId,
    selected,
    onChange,
    capabilities,
    disabled = false,
}) => {
    const baseId = useId();
    const [generating, setGenerating] = useState(false);
    const [genMessage, setGenMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const { status, caps, loading, error, canGenerate, reload } = capabilities;

    const runGenerate = async () => {
        setGenerating(true);
        setGenMessage(null);
        try {
            const result = await generateDistractors(deckId);
            setGenMessage({ ok: true, text: describeDistractorResult(result) });
            reload();
        } catch (e) {
            setGenMessage({ ok: false, text: distractorErrorMessage(e) ?? extractErrorMessage(e) });
        } finally {
            setGenerating(false);
        }
    };

    const noneSelected = status === "ok" && selected.every((t) => typeDisabledReason(t, caps) !== null);

    return (
        <fieldset className="flex flex-col gap-2" disabled={disabled} aria-busy={loading || undefined}>
            <legend className="text-label-md mb-1">Loại câu hỏi</legend>

            {loading && (
                <p className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                    </span>
                    Đang kiểm tra bộ thẻ hỗ trợ loại câu nào...
                </p>
            )}
            {status === "unavailable" && (
                <p className="flex items-start gap-1.5 rounded-lg bg-surface-container-low p-space-sm text-label-sm text-on-surface-variant">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        info
                    </span>
                    <span>Bộ thẻ này chưa có số liệu loại câu hỏi. Tạm thời chỉ có câu hỏi về nghĩa.</span>
                </p>
            )}
            {status === "error" && (
                <p role="alert" className="text-label-sm text-error">
                    Chưa tải được loại câu hỏi: {error}{" "}
                    <button type="button" onClick={reload} className="underline font-semibold">
                        Thử lại
                    </button>
                </p>
            )}

            <ul className="flex flex-col gap-1.5">
                {QUESTION_TYPES.map((type) => {
                    // Chưa có số liệu (đang tải / lỗi): chỉ câu nghĩa chắc chắn chạy được như trước.
                    const reason =
                        type === "meaning" && status !== "ok"
                            ? null
                            : loading
                              ? "Đang kiểm tra..."
                              : status === "error"
                                ? "Chưa tải được số liệu — bấm \"Thử lại\" ở trên."
                                : typeDisabledReason(type, caps);
                    const count = capabilityCount(caps, type);
                    const off = reason !== null;
                    const checked = !off && selected.includes(type);
                    const descId = `${baseId}-${type}`;
                    return (
                        <li key={type}>
                            <label
                                className={`flex items-start gap-3 p-space-sm rounded-lg border ${
                                    off
                                        ? "border-surface-container-high opacity-60 cursor-not-allowed"
                                        : checked
                                          ? "border-primary bg-primary/5 cursor-pointer"
                                          : "border-surface-container-high cursor-pointer"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={off}
                                    aria-describedby={descId}
                                    onChange={(e) => onChange(toggleQuestionType(selected, type, e.target.checked))}
                                    className="mt-1 w-4 h-4 shrink-0"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="font-semibold">{QUESTION_TYPE_LABELS[type]}</span>
                                        {count !== null && (
                                            <span className="px-2 py-0.5 rounded-full bg-surface-container text-label-sm text-on-surface-variant">
                                                {count} thẻ
                                            </span>
                                        )}
                                    </span>
                                    <span id={descId} className="block text-body-sm text-on-surface-variant">
                                        {off ? (
                                            <>
                                                <span aria-hidden="true" className="material-symbols-outlined align-middle text-[14px] mr-1">
                                                    block
                                                </span>
                                                {reason}
                                            </>
                                        ) : (
                                            QUESTION_TYPE_HINTS[type]
                                        )}
                                    </span>
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>

            {noneSelected && (
                <p role="alert" className="text-label-sm text-error">
                    Chọn ít nhất một loại câu hỏi.
                </p>
            )}

            {canGenerate && status !== "unavailable" && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-surface-container-high p-space-sm">
                    <p className="text-body-sm text-on-surface-variant">
                        Bạn sửa được bộ thẻ này: dùng AI tìm chữ Hán giống hình và từ đồng âm cho các thẻ để mở thêm loại câu hỏi.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runGenerate()}
                        isLoading={generating}
                        className="self-start min-h-11"
                    >
                        {!generating && (
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                auto_awesome
                            </span>
                        )}
                        {generating ? "Đang sinh câu nhiễu..." : "Sinh câu nhiễu"}
                    </Button>
                    {genMessage && (
                        <p role={genMessage.ok ? "status" : "alert"} className={`text-label-sm ${genMessage.ok ? "text-secondary" : "text-error"}`}>
                            {genMessage.text}
                        </p>
                    )}
                </div>
            )}
        </fieldset>
    );
};
