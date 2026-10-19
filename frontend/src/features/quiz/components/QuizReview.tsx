import React from "react";
import { Link } from "react-router-dom";
import type { TypedQuizAttempt } from "@/types/quiz.types";
import { Ruby } from "@/lib/ja";
import { QUESTION_TYPE_LABELS } from "../quizUtils";
import { modeLabel, quizPrimaryBtn, quizSecondaryBtn, quizShell } from "../quizUi";
import { FeedbackBlock } from "./FeedbackBlock";
import { FlagButton } from "./FlagButton";
import type { FlagTarget } from "./FlagQuestionModal";

interface QuizReviewProps {
    /** Lượt đã nộp (finished): tổng kết + xem lại toàn bộ đáp án và lời giải. */
    attempt: TypedQuizAttempt;
    deckId: string;
    /** Bài "Kiểm tra chương" mở từ lộ trình: nút chính là quay về lộ trình (chương hiện "Đã qua" nếu đạt ngưỡng). */
    pathId?: string | null;
    flaggedIds: ReadonlySet<string>;
    /** Thông báo sau khi báo lỗi, chỉ hiện dưới đúng câu vừa báo. */
    flagNotice: { questionId: string; text: string } | null;
    onFlag: (target: FlagTarget) => void;
    onRestart: () => void;
    /** Hộp thoại báo lỗi (QuizPage giữ state), đặt trong khung trang như màn đang làm bài. */
    children?: React.ReactNode;
}

/** Màn xem lại sau khi nộp: điểm, thanh tỉ lệ, từng câu kèm phản hồi + nút báo lỗi câu hỏi. */
export const QuizReview: React.FC<QuizReviewProps> = ({
    attempt,
    deckId,
    pathId,
    flaggedIds,
    flagNotice,
    onFlag,
    onRestart,
    children,
}) => {
    const total = attempt.total ?? attempt.questions.length;
    const score = attempt.score ?? 0;
    const pct = total ? Math.round((score / total) * 100) : 0;
    return (
        <section className={quizShell}>
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <h1 className="font-headline-sm text-headline-sm font-bold">
                    {score}/{total} câu đúng ({pct}%)
                </h1>
                <p className="text-label-md text-on-surface-variant">
                    {modeLabel(attempt.mode)}
                    {attempt.mode === "practice" && " · không tính vào độ chính xác bài thi"}
                </p>
                {attempt.expired && (
                    <p role="alert" className="text-error text-label-md">
                        Đã hết thời gian: chỉ các đáp án lưu trước giờ hết hạn được tính.
                    </p>
                )}
                <div className="h-3 rounded-full bg-surface-container-high overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <ol className="flex flex-col gap-3">
                    {attempt.questions.map((q, i) => (
                        <li
                            key={q.cardId}
                            className="p-space-sm rounded-lg bg-surface-container-lowest border border-surface-container-high flex flex-col gap-2"
                        >
                            <div className="text-title-md">
                                <span className="text-outline text-label-md mr-2">{i + 1}.</span>
                                <Ruby term={q.term} reading={q.reading ?? undefined} />
                                {q.type !== "meaning" && (
                                    <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-surface-container text-label-sm text-on-surface-variant">
                                        {QUESTION_TYPE_LABELS[q.type]}
                                    </span>
                                )}
                            </div>
                            {q.prompt && <p className="text-body-sm text-on-surface-variant">{q.prompt}</p>}
                            {q.feedback && <FeedbackBlock q={q} feedback={q.feedback} chosen={q.chosen} />}
                            <FlagButton q={q} flagged={!!q.questionId && flaggedIds.has(q.questionId)} onFlag={onFlag} />
                            {flagNotice && flagNotice.questionId === q.questionId && (
                                <p role="status" className="text-label-md rounded-lg bg-primary/10 p-space-sm">
                                    {flagNotice.text}
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
                {children}
                <div className="flex flex-wrap gap-space-sm">
                    {pathId && (
                        <Link
                            to={`/roadmap/${encodeURIComponent(pathId)}`}
                            className={`${quizPrimaryBtn} inline-flex items-center justify-center`}
                        >
                            Về lộ trình
                        </Link>
                    )}
                    <button type="button" onClick={onRestart} className={pathId ? quizSecondaryBtn : quizPrimaryBtn}>
                        Làm lại
                    </button>
                    <Link to={`/decks/${deckId}`} className={`${quizSecondaryBtn} inline-flex items-center`}>
                        Về bộ thẻ
                    </Link>
                </div>
            </div>
        </section>
    );
};
