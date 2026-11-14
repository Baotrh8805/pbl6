import React from "react";
import { Link } from "react-router-dom";
import type { QuizMode } from "@/types/api.types";
import type { QuizQuestionType, TypedQuizAttempt } from "@/types/quiz.types";
import type { QuizCapabilitiesState } from "../useQuizCapabilities";
import { SECONDS_PER_QUESTION, modeLabel, quizPrimaryBtn, quizShell } from "../quizUi";
import { QUIZ_SIZE_OPTIONS, quizSizeNote, quizSizeOptionLabel } from "../quizUtils";
import { QuestionTypeFieldset } from "./QuestionTypeFieldset";

interface QuizStartScreenProps {
    deckId: string;
    /** Mở từ lộ trình (?path=): thêm lối về đúng lộ trình đó. */
    pathId?: string | null;
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
    pathId,
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
}) => {
    const sizeNote = quizSizeNote(size, capabilities.cardCount);
    return (
        <section className={quizShell}>
            <div className="max-w-md mx-auto flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {pathId && (
                        <Link to={`/roadmap/${encodeURIComponent(pathId)}`} className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
                            Về lộ trình
                        </Link>
                    )}
                    <Link to={`/decks/${deckId}`} className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Về bộ thẻ
                    </Link>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Kiểm tra nhanh</h1>

                {openAttempt && (
                    <div role="region" aria-label="Bài đang làm dở" className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs flex flex-col gap-2.5">
                        <p className="text-xs text-slate-700">
                            Bạn có bài <strong>{modeLabel(openAttempt.mode)}</strong> đang làm dở (
                            {openAttempt.questions.filter((q) => q.chosen !== null).length}/
                            {openAttempt.questions.length} câu đã trả lời).
                        </p>
                        <button type="button" onClick={onResume} className={quizPrimaryBtn}>
                            Tiếp tục bài đang làm
                        </button>
                        <p className="text-xs text-slate-500">
                            Muốn làm bài mới, hãy tiếp tục và nộp bài này trước. Bài dở sẽ được chấm theo các câu đã trả lời.
                        </p>
                    </div>
                )}

                <fieldset className="flex flex-col gap-2.5" disabled={busy || openAttempt !== null}>
                    <legend className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Chọn cách làm</legend>
                    {(["practice", "exam"] as const).map((m) => (
                        <label
                            key={m}
                            className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                                mode === m
                                    ? "border-2 border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-xs"
                                    : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-xs"
                            }`}
                        >
                            <input type="radio" name="quiz-mode" checked={mode === m} onChange={() => onModeChange(m)} className="mt-1 accent-blue-600" />
                            <span>
                                <span className="block font-bold text-slate-900 text-sm">{modeLabel(m)}</span>
                                <span className="block text-xs text-slate-600 mt-0.5">
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

                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                    <span>Số câu hỏi</span>
                    <select
                        value={size}
                        onChange={(e) => onSizeChange(Number(e.target.value))}
                        disabled={busy || openAttempt !== null}
                        aria-describedby={sizeNote ? "quiz-size-note" : undefined}
                        className="p-2.5 min-h-11 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
                    >
                        {QUIZ_SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                                {quizSizeOptionLabel(n, capabilities.cardCount)}
                            </option>
                        ))}
                    </select>
                </label>
                {sizeNote && (
                    <p id="quiz-size-note" className="-mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-blue-600 shrink-0">
                            info
                        </span>
                        {sizeNote}
                    </p>
                )}
                {error && (
                    <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                        {error}
                    </p>
                )}
                <button type="button" onClick={onStart} disabled={busy || openAttempt !== null || typesBlocked} className={quizPrimaryBtn}>
                    {busy ? "Đang tạo đề..." : "Bắt đầu"}
                </button>
            </div>
        </section>
    );
};
