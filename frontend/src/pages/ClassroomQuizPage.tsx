import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { startClassroomQuiz, submitClassroomQuiz } from "../services/classroomService";
import type { QuizStartResponse, QuizSubmissionResult } from "../types/classroom.types";

export const ClassroomQuizPage: React.FC = () => {
    const { classroomId, quizId } = useParams<{ classroomId: string; quizId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Quiz Session State
    const [quizData, setQuizData] = useState<QuizStartResponse | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
    const [result, setResult] = useState<QuizSubmissionResult | null>(null);

    // Ref để tính thời gian làm bài thực tế
    const startTimeRef = useRef<number>(Date.now());
    const timerRef = useRef<any>(null);

    // Bắt đầu bài kiểm tra
    useEffect(() => {
        if (!classroomId || !quizId) return;

        let isMounted = true;
        setLoading(true);
        setError(null);

        startClassroomQuiz(Number(classroomId), Number(quizId))
            .then((data) => {
                if (!isMounted) return;
                setQuizData(data);
                startTimeRef.current = Date.now();

                // Tính thời gian làm bài (giây)
                const expires = new Date(data.expiresAt).getTime();
                const now = Date.now();
                const remaining = Math.max(10, Math.floor((expires - now) / 1000));
                setTimeLeft(remaining);
            })
            .catch((err: any) => {
                if (!isMounted) return;
                setError(err.response?.data?.message || err.message || "Không thể tải đề thi");
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [classroomId, quizId]);

    // Đếm ngược thời gian
    useEffect(() => {
        if (!quizData || result || timeLeft <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    // Hết giờ -> Tự động nộp bài
                    void handleAutoSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [quizData, result, timeLeft]);

    // Xử lý nộp bài
    const handleSubmitQuiz = async () => {
        if (!classroomId || !quizId || !quizData || isSubmitting) return;

        setIsSubmitting(true);
        setSubmitConfirmOpen(false);

        const timeSpent = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));

        try {
            const res = await submitClassroomQuiz(Number(classroomId), Number(quizId), {
                attemptId: quizData.attemptId,
                timeSpentSeconds: timeSpent,
                answers: userAnswers,
            });
            setResult(res);
        } catch (err: any) {
            alert(err.response?.data?.message || err.message || "Lỗi khi nộp bài");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAutoSubmit = useCallback(async () => {
        if (!classroomId || !quizId || !quizData || isSubmitting || result) return;
        setIsSubmitting(true);
        const timeSpent = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
        try {
            const res = await submitClassroomQuiz(Number(classroomId), Number(quizId), {
                attemptId: quizData.attemptId,
                timeSpentSeconds: timeSpent,
                answers: userAnswers,
            });
            setResult(res);
        } catch (err: any) {
            console.error("Lỗi tự động nộp bài:", err);
        } finally {
            setIsSubmitting(false);
        }
    }, [classroomId, quizId, quizData, isSubmitting, result, userAnswers]);

    // Chọn đáp án cho câu hỏi
    const handleSelectOption = (option: string) => {
        if (result || isSubmitting) return;
        setUserAnswers((prev) => ({
            ...prev,
            [currentIndex]: option,
        }));
    };

    // Phím tắt bàn phím: 1, 2, 3, 4 hoặc A, B, C, D
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (result || isSubmitting || !quizData) return;

            const currentQ = quizData.questions[currentIndex];
            if (!currentQ) return;

            if (e.key === "1" || e.key.toLowerCase() === "a") {
                if (currentQ.options[0]) handleSelectOption(currentQ.options[0]);
            } else if (e.key === "2" || e.key.toLowerCase() === "b") {
                if (currentQ.options[1]) handleSelectOption(currentQ.options[1]);
            } else if (e.key === "3" || e.key.toLowerCase() === "c") {
                if (currentQ.options[2]) handleSelectOption(currentQ.options[2]);
            } else if (e.key === "4" || e.key.toLowerCase() === "d") {
                if (currentQ.options[3]) handleSelectOption(currentQ.options[3]);
            } else if (e.key === "ArrowLeft") {
                if (currentIndex > 0) setCurrentIndex((i) => i - 1);
            } else if (e.key === "ArrowRight") {
                if (currentIndex < quizData.questions.length - 1) setCurrentIndex((i) => i + 1);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex, quizData, result, isSubmitting]);

    // Định dạng mm:ss
    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    // Màn hình loading
    if (loading) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-600 font-medium text-sm">Đang tải và tạo đề thi ngẫu nhiên...</p>
            </div>
        );
    }

    // Màn hình lỗi
    if (error || !quizData) {
        return (
            <div className="max-w-md mx-auto my-16 p-6 rounded-3xl bg-white border border-slate-200 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[32px]">error</span>
                </div>
                <h3 className="text-lg font-bold text-slate-800">Không thể mở bài kiểm tra</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{error || "Đã xảy ra lỗi không xác định."}</p>
                <div className="pt-2">
                    <Link
                        to={`/classrooms/${classroomId}`}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-colors inline-block"
                    >
                        ← Quay lại Lớp học
                    </Link>
                </div>
            </div>
        );
    }

    // MÀN HÌNH KẾT QUẢ BÀI KIỂM TRA
    if (result) {
        const isPassed = result.score >= 60;
        return (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {/* Header kết quả */}
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm text-center space-y-4">
                    <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-blue-50 to-indigo-50 border border-blue-100">
                        <span className="material-symbols-outlined text-[40px] text-blue-600">
                            {isPassed ? "military_tech" : "sentiment_neutral"}
                        </span>
                    </div>

                    <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kết quả bài kiểm tra</span>
                        <h2 className="text-2xl font-black text-slate-900 mt-0.5">{quizData.title}</h2>
                    </div>

                    {/* Điểm số */}
                    <div className="py-2">
                        <span className="text-5xl md:text-6xl font-black tracking-tight text-blue-600">
                            {result.score}
                        </span>
                        <span className="text-2xl font-bold text-slate-400"> / 100</span>
                    </div>

                    <p className={`text-sm font-bold ${isPassed ? "text-emerald-600" : "text-amber-600"}`}>
                        {result.score >= 90
                            ? "🎉 Xuất sắc! Bạn nắm rất vững kiến thức."
                            : isPassed
                            ? "👏 Đạt yêu cầu! Tiếp tục phát huy nhé."
                            : "💪 Chưa đạt! Hãy xem lại các từ vựng sai và thử lại nhé."}
                    </p>

                    {/* Thống kê nhanh */}
                    <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2 text-xs">
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[11px]">Số câu đúng</span>
                            <span className="text-sm font-bold text-slate-800">
                                {result.correctCount} / {result.totalQuestions}
                            </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[11px]">Tỉ lệ chính xác</span>
                            <span className="text-sm font-bold text-slate-800">
                                {Math.round((result.correctCount / (result.totalQuestions || 1)) * 100)}%
                            </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[11px]">Thời gian làm</span>
                            <span className="text-sm font-bold text-slate-800">
                                {formatTime(result.timeSpentSeconds)}
                            </span>
                        </div>
                    </div>

                    {/* Các nút hành động */}
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                        <Link
                            to={`/classrooms/${classroomId}`}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                        >
                            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                            <span>← Quay về Lớp học</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">replay</span>
                            <span>Làm lại bài kiểm tra</span>
                        </button>
                    </div>
                </div>

                {/* Chi tiết từng câu hỏi đúng/sai */}
                <div className="space-y-3">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-blue-600">fact_check</span>
                        <span>Chi tiết đáp án ({result.items.length} câu)</span>
                    </h3>

                    <div className="space-y-3">
                        {result.items.map((item, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-2xl border transition-all ${
                                    item.isCorrect
                                        ? "bg-white border-emerald-200"
                                        : "bg-rose-50/20 border-rose-200"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                                Câu {idx + 1}
                                            </span>
                                            {item.isCorrect ? (
                                                <span className="text-emerald-600 font-bold text-xs flex items-center gap-0.5">
                                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                    <span>Chính xác</span>
                                                </span>
                                            ) : (
                                                <span className="text-rose-600 font-bold text-xs flex items-center gap-0.5">
                                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                                    <span>Chưa đúng</span>
                                                </span>
                                            )}
                                        </div>

                                        <div className="pt-1">
                                            <span className="text-lg font-black text-slate-900 mr-2">{item.term}</span>
                                            {item.reading && (
                                                <span className="text-xs font-semibold text-blue-600">({item.reading})</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                        <span className="text-[10px] text-slate-400 font-medium block">Bạn đã chọn:</span>
                                        <span
                                            className={`font-semibold ${
                                                item.isCorrect ? "text-emerald-700" : "text-rose-600 line-through"
                                            }`}
                                        >
                                            {item.chosenAnswer || "(Chưa chọn đáp án)"}
                                        </span>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                                        <span className="text-[10px] text-emerald-600 font-medium block">Đáp án chính xác:</span>
                                        <span className="font-bold text-emerald-800">{item.correctAnswer}</span>
                                    </div>
                                </div>

                                {item.explanation && (
                                    <div className="mt-2.5 p-2.5 rounded-xl bg-blue-50/40 border border-blue-100/60 text-xs text-slate-600">
                                        <strong className="text-blue-900 font-semibold">Giải thích / Ví dụ: </strong>
                                        <span className="whitespace-pre-line">{item.explanation}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // MÀN HÌNH LÀM BÀI THI
    const questions = quizData.questions;
    const currentQ = questions[currentIndex];
    const totalQuestions = questions.length;
    const answeredCount = Object.keys(userAnswers).length;
    const currentSelected = userAnswers[currentIndex];
    const isUrgent = timeLeft < 120; // Dưới 2 phút

    return (
        <div className="min-h-screen bg-slate-50/60 pb-16">
            {/* Top Bar cố định */}
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-2xs">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm("Bạn có chắc muốn rời đi? Bài làm chưa nộp sẽ không được lưu!")) {
                                navigate(`/classrooms/${classroomId}`);
                            }
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 cursor-pointer"
                    >
                        <span>← Quay về lớp</span>
                    </button>

                    <div className="flex-1 max-w-md hidden md:block text-center">
                        <h2 className="text-xs font-bold text-slate-800 truncate">{quizData.title}</h2>
                        <div className="text-[11px] text-slate-400">
                            Đã làm: <strong>{answeredCount}</strong> / {totalQuestions} câu
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Đồng hồ đếm ngược */}
                        <div
                            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                                isUrgent
                                    ? "bg-rose-50 text-rose-600 border-rose-200 animate-pulse"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">timer</span>
                            <span>{formatTime(timeLeft)}</span>
                        </div>

                        {/* Nút Nộp bài */}
                        <button
                            type="button"
                            onClick={() => setSubmitConfirmOpen(true)}
                            disabled={isSubmitting}
                            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[16px]">send</span>
                            <span>Nộp bài</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                {/* Lưới điều hướng câu hỏi (Palette) */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">Danh sách câu hỏi:</span>
                        <span className="text-slate-400 text-[11px]">
                            {answeredCount} / {totalQuestions} câu đã chọn
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
                        {questions.map((q, idx) => {
                            const isAnswered = userAnswers[idx] !== undefined;
                            const isCurrent = idx === currentIndex;
                            return (
                                <button
                                    key={q.index}
                                    type="button"
                                    onClick={() => setCurrentIndex(idx)}
                                    className={`w-8 h-8 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center ${
                                        isCurrent
                                            ? "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1"
                                            : isAnswered
                                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                                    }`}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Khung hiển thị câu hỏi hiện tại */}
                {currentQ && (
                    <div className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
                        {/* Header câu hỏi */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs">
                                Câu {currentIndex + 1} / {totalQuestions}
                            </span>
                            <span className="text-[11px] text-slate-400">Dùng phím số 1, 2, 3, 4 để chọn nhanh</span>
                        </div>

                        {/* Thẻ từ vựng */}
                        <div className="text-center py-6 px-4 bg-gradient-to-b from-slate-50/80 to-white rounded-2xl border border-slate-100 space-y-2">
                            {currentQ.reading && (
                                <span className="text-sm md:text-base font-semibold text-blue-600 block">
                                    {currentQ.reading}
                                </span>
                            )}
                            <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
                                {currentQ.term}
                            </h1>
                            <p className="text-xs text-slate-400 pt-2 font-medium">
                                Chọn nghĩa tiếng Việt đúng nhất của từ vựng trên:
                            </p>
                        </div>

                        {/* 4 Lựa chọn A, B, C, D */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            {currentQ.options.map((option, optIdx) => {
                                const letters = ["A", "B", "C", "D"];
                                const isSelected = currentSelected === option;
                                return (
                                    <button
                                        key={optIdx}
                                        type="button"
                                        onClick={() => handleSelectOption(option)}
                                        className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer group ${
                                            isSelected
                                                ? "bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/30 text-blue-900 shadow-xs"
                                                : "bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 text-slate-800"
                                        }`}
                                    >
                                        <div
                                            className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-colors ${
                                                isSelected
                                                    ? "bg-blue-600 text-white"
                                                    : "bg-slate-100 group-hover:bg-slate-200 text-slate-600"
                                            }`}
                                        >
                                            {letters[optIdx]}
                                        </div>
                                        <span className="text-xs md:text-sm font-semibold leading-relaxed pt-0.5">
                                            {option}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Thanh điều hướng câu trước/sau */}
                        <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                                disabled={currentIndex === 0}
                                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                            >
                                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                <span>Câu trước</span>
                            </button>

                            <div className="text-xs text-slate-400 hidden sm:block">
                                Phím ← / → để chuyển câu
                            </div>

                            {currentIndex < totalQuestions - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                    <span>Câu tiếp theo</span>
                                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setSubmitConfirmOpen(true)}
                                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                >
                                    <span>Hoàn thành & Nộp bài</span>
                                    <span className="material-symbols-outlined text-[16px]">done_all</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Modal xác nhận nộp bài */}
            {submitConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
                    <div className="w-full max-w-md p-6 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[28px]">assignment_turned_in</span>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Xác nhận nộp bài kiểm tra</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Bạn đã hoàn thành <strong>{answeredCount}</strong> / {totalQuestions} câu hỏi.
                                {answeredCount < totalQuestions && (
                                    <span className="text-amber-600 block mt-1 font-semibold">
                                        ⚠️ Còn {totalQuestions - answeredCount} câu bạn chưa trả lời!
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setSubmitConfirmOpen(false)}
                                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                            >
                                Tiếp tục làm
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSubmitQuiz()}
                                disabled={isSubmitting}
                                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? "Đang chấm điểm..." : "Nộp bài ngay"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default ClassroomQuizPage;
