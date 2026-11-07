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
    /** Ôn lại riêng các câu trả lời chưa đúng mà không cần làm lại từ đầu. */
    onRetakeIncorrect?: (cardIds: string[]) => void;
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
    onRetakeIncorrect,
    children,
}) => {
    const total = attempt.total ?? attempt.questions.length;
    const score = attempt.score ?? 0;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const incorrectQuestions = attempt.questions.filter((q) => q.feedback && !q.feedback.correct);
    const incorrectCardIds = incorrectQuestions.map((q) => q.cardId);

    const grade =
        pct >= 90
            ? { title: "Xuất sắc", tone: "bg-emerald-50 text-emerald-800 border-emerald-200", icon: "military_tech" }
            : pct >= 70
              ? { title: "Đạt chuẩn", tone: "bg-blue-50 text-blue-800 border-blue-200", icon: "verified" }
              : pct >= 50
                ? { title: "Cần củng cố", tone: "bg-amber-50 text-amber-800 border-amber-200", icon: "warning" }
                : { title: "Chưa đạt", tone: "bg-rose-50 text-rose-800 border-rose-200", icon: "error" };

    return (
        <section className={quizShell}>
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
                {/* 1. Header Performance Card */}
                <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${grade.tone}`}>
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{grade.icon}</span>
                                {grade.title}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                                {modeLabel(attempt.mode)}
                                {attempt.mode === "practice" && " · không tính vào độ chính xác bài thi"}
                            </span>
                        </div>
                        {attempt.expired && (
                            <span role="alert" className="inline-flex items-center gap-1 text-rose-700 text-xs font-semibold">
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">timer_off</span>
                                Hết giờ: chỉ tính đáp án đã lưu
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{score}</span>
                            <span className="text-sm font-medium text-slate-500">/{total} câu đúng</span>
                            <span className="ml-1 text-sm font-bold text-slate-700">({pct}%)</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
                                Đúng: {score}
                            </span>
                            <span className="inline-flex items-center gap-1 text-rose-700">
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">cancel</span>
                                Sai: {total - score}
                            </span>
                        </div>
                    </div>

                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"
                            }`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>

                    {incorrectCardIds.length > 0 && onRetakeIncorrect && (
                        <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-100">
                            <div className="text-xs text-slate-600 font-medium">
                                Có <strong className="text-rose-700 font-bold">{incorrectCardIds.length}</strong> câu làm sai. Luyện tập lại riêng các câu này?
                            </div>
                            <button
                                type="button"
                                onClick={() => onRetakeIncorrect(incorrectCardIds)}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">replay</span>
                                Ôn lại {incorrectCardIds.length} câu sai
                            </button>
                        </div>
                    )}
                </div>

                {/* 2. Review Question List */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">Chi tiết từng câu</h2>
                    <span className="text-xs text-slate-500 font-medium">Tổng số: {total} câu</span>
                </div>

                <ol className="flex flex-col gap-3">
                    {attempt.questions.map((q, i) => {
                        const isCorrect = q.feedback?.correct === true;
                        const isIncorrect = q.feedback && !q.feedback.correct;
                        return (
                            <li
                                key={q.cardId}
                                className={`p-4 sm:p-5 rounded-2xl bg-white border flex flex-col gap-2.5 shadow-xs transition-colors ${
                                    isCorrect
                                        ? "border-emerald-200/90 bg-emerald-50/20"
                                        : isIncorrect
                                          ? "border-rose-200/90 bg-rose-50/20"
                                          : "border-slate-200/90"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-bold text-slate-900 flex items-center flex-wrap gap-1.5">
                                        <span className="text-slate-400 font-medium mr-1">{i + 1}.</span>
                                        <Ruby term={q.term} reading={q.reading ?? undefined} />
                                        {q.type !== "meaning" && (
                                            <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                                {QUESTION_TYPE_LABELS[q.type]}
                                            </span>
                                        )}
                                    </div>
                                    {isCorrect && (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check_circle</span>
                                            Đúng
                                        </span>
                                    )}
                                    {isIncorrect && (
                                        <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-bold">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cancel</span>
                                            Sai
                                        </span>
                                    )}
                                </div>

                                {q.prompt && <p className="text-xs text-slate-600 font-medium">{q.prompt}</p>}
                                {q.feedback && <FeedbackBlock q={q} feedback={q.feedback} chosen={q.chosen} />}
                                <FlagButton q={q} flagged={!!q.questionId && flaggedIds.has(q.questionId)} onFlag={onFlag} />
                                {flagNotice && flagNotice.questionId === q.questionId && (
                                    <p role="status" className="text-xs rounded-xl bg-blue-50 border border-blue-200 p-3 text-blue-700 font-medium">
                                        {flagNotice.text}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ol>

                {children}

                {/* 3. Bottom Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                    {pathId && (
                        <Link
                            to={`/roadmap/${encodeURIComponent(pathId)}`}
                            className={`${quizPrimaryBtn} inline-flex items-center justify-center gap-1.5`}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">alt_route</span>
                            Về lộ trình
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={onRestart}
                        className={`${pathId ? quizSecondaryBtn : quizPrimaryBtn} inline-flex items-center justify-center gap-1.5`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
                        Làm lại bài mới
                    </button>
                    <Link
                        to={`/decks/${deckId}`}
                        className={`${quizSecondaryBtn} inline-flex items-center justify-center gap-1.5`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">style</span>
                        Về bộ thẻ
                    </Link>
                </div>
            </div>
        </section>
    );
};
