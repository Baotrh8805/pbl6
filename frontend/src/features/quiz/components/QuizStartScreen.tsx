import React from "react";
import { Link } from "react-router-dom";
import type { QuizMode } from "@/types/api.types";
import type { QuizQuestionType, TypedQuizAttempt } from "@/types/quiz.types";
import type { QuizCapabilitiesState } from "../useQuizCapabilities";
import { SECONDS_PER_QUESTION, modeLabel, quizPrimaryBtn, quizShell } from "../quizUi";
import { QuestionTypeFieldset } from "./QuestionTypeFieldset";

interface QuizStartScreenProps {
    deckId: string;
    /** Lượt đang làm dở trên server: phải tiếp tục và nộp trước khi tạo bài mới. */
    openAttempt: TypedQuizAttempt | null;
    onResume: () => void;
    mode: QuizMode;
    onModeChange: (mode: QuizMode) => void;
    questionTypes: QuizQuestionType[];
    onQuestionTypesChange: (types: QuizQuestionType[]) => void;
    capabilities: QuizCapabilitiesState;
    size: number;
    onSizeChange: (size: number) => void;
    busy: boolean;
    error: string;
    /** Server có số liệu mà không loại nào được chọn còn dùng được: chặn "Bắt đầu" (fieldset tự nói lý do). */
    typesBlocked: boolean;
    onStart: () => void;
}

/** Màn bắt đầu: chọn chế độ, loại câu, số câu — hoặc tiếp tục bài đang làm dở. */
export const QuizStartScreen: React.FC<QuizStartScreenProps> = ({
    deckId,
    openAttempt,
    onResume,
    mode,
    onModeChange,
    questionTypes,
    onQuestionTypesChange,
    capabilities,
    size,
    onSizeChange,
    busy,
    error,
    typesBlocked,
    onStart,
}) => (
    <section className={quizShell}>
        <div className="max-w-md mx-auto flex flex-col gap-space-md">
            <Link to={`/decks/${deckId}`} className="text-label-md text-primary hover:underline">
                ← Về bộ thẻ
            </Link>
            <h1 className="font-headline-sm text-headline-sm font-bold">Kiểm tra nhanh</h1>

            {openAttempt && (
                <div role="region" aria-label="Bài đang làm dở" className="rounded-lg border border-primary/40 bg-primary/5 p-space-sm flex flex-col gap-2">
                    <p className="text-body-sm">
                        Bạn có bài <strong>{modeLabel(openAttempt.mode)}</strong> đang làm dở (
                        {openAttempt.questions.filter((q) => q.chosen !== null).length}/
                        {openAttempt.questions.length} câu đã trả lời).
                    </p>
                    <button type="button" onClick={onResume} className={quizPrimaryBtn}>
                        Tiếp tục bài đang làm
                    </button>
                    <p className="text-label-sm text-on-surface-variant">
                        Muốn làm bài mới, hãy tiếp tục và nộp bài này trước. Bài dở sẽ được chấm theo các câu đã trả lời.
                    </p>
                </div>
            )}

            <fieldset className="flex flex-col gap-2" disabled={busy || openAttempt !== null}>
                <legend className="text-label-md mb-1">Chọn cách làm</legend>
                {(["practice", "exam"] as const).map((m) => (
                    <label
                        key={m}
                        className={`flex items-start gap-3 p-space-sm rounded-lg border cursor-pointer ${
                            mode === m ? "border-primary bg-primary/5" : "border-surface-container-high"
                        }`}
                    >
                        <input type="radio" name="quiz-mode" checked={mode === m} onChange={() => onModeChange(m)} className="mt-1" />
                        <span>
                            <span className="block font-semibold">{modeLabel(m)}</span>
                            <span className="block text-body-sm text-on-surface-variant">
                                {m === "practice"
                                    ? "Trả lời câu nào thấy ngay đáp án đúng và lời giải của câu đó. Không giới hạn giờ; kết quả không tính vào độ chính xác bài thi."
                                    : `${SECONDS_PER_QUESTION} giây/câu, sửa đáp án được tới khi nộp. Đáp án đúng và lời giải chỉ hiện sau khi nộp bài. Hết giờ tự nộp; câu bỏ trống tính là sai.`}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>

            <QuestionTypeFieldset
                deckId={deckId}
                selected={questionTypes}
                onChange={onQuestionTypesChange}
                capabilities={capabilities}
                disabled={busy || openAttempt !== null}
            />

            <label className="flex flex-col gap-1 text-label-md">
                <span>Số câu</span>
                <select
                    value={size}
                    onChange={(e) => onSizeChange(Number(e.target.value))}
                    disabled={busy || openAttempt !== null}
                    className="p-2.5 min-h-11 rounded-lg bg-surface-container-lowest border border-surface-container-high"
                >
                    <option value={10}>10 câu</option>
                    <option value={20}>20 câu</option>
                    <option value={50}>50 câu</option>
                </select>
            </label>
            {error && (
                <p role="alert" className="text-error text-label-md">
                    {error}
                </p>
            )}
            <button type="button" onClick={onStart} disabled={busy || openAttempt !== null || typesBlocked} className={quizPrimaryBtn}>
                {busy ? "Đang tạo đề..." : "Bắt đầu"}
            </button>
        </div>
    </section>
);
