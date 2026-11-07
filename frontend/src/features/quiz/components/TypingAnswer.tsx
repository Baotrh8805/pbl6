import React from "react";
import { KanaInput } from "@/components/ui/KanaInput";
import { TYPED_ANSWER_MAX, normalizeTypedAnswer } from "../quizUtils";

interface TypingAnswerProps {
    value: string;
    onChange: (value: string) => void;
    /** Enter hoặc bấm nút: nhận giá trị đã chốt đuôi romaji (n -> ん). */
    onSubmit: (value: string) => void;
    /** practice: "Trả lời"; exam: "Lưu đáp án". */
    submitLabel: string;
    disabled?: boolean;
    autoFocus?: boolean;
}

/**
 * Câu gõ cách đọc (inputMode = typing, hợp đồng §1.2): ô KanaInput gõ romaji ra kana ngay, Enter để trả lời.
 * Dòng "Được chấm theo" cho thấy đúng chuỗi server sẽ so (katakana -> hiragana, bỏ khoảng trắng / dấu câu) để người học
 * không bất ngờ khi gõ カク mà vẫn được tính đúng, hoặc lỡ thêm dấu chấm.
 */
export const TypingAnswer: React.FC<TypingAnswerProps> = ({ value, onChange, onSubmit, submitLabel, disabled = false, autoFocus }) => {
    const normalized = normalizeTypedAnswer(value);
    return (
        <div className="flex flex-col gap-2">
            <KanaInput
                label="Cách đọc"
                value={value}
                onChange={(v) => onChange(v.slice(0, TYPED_ANSWER_MAX))}
                onEnter={(v) => {
                    if (!disabled && normalizeTypedAnswer(v)) onSubmit(v);
                }}
                placeholder="Gõ romaji, vd. kaku"
                helperText="Gõ romaji hoặc kana (có thể bật bộ gõ tiếng Nhật), Enter để trả lời."
                disabled={disabled}
                autoFocus={autoFocus}
                className="text-title-md"
            />
            {value.trim() !== "" && (
                <p className="text-label-sm text-on-surface-variant">
                    Được chấm theo:{" "}
                    <span lang="ja" className="font-japanese font-semibold text-on-surface">
                        {normalized || "(trống)"}
                    </span>
                </p>
            )}
            <button
                type="button"
                onClick={() => onSubmit(value)}
                disabled={disabled || !normalized}
                className="self-start px-4 py-2.5 min-h-11 rounded-lg bg-primary text-on-primary font-label-md font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
                {submitLabel}
            </button>
        </div>
    );
};
