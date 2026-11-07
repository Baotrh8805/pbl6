import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDecks } from "@/services/deckService";
import { fetchQuizPreview, fetchQuizResults } from "@/services/studyService";
import { JLPT_LEVELS, secondsLeft } from "@/lib/deckUtils";
import { calcQuizAccuracy, examResultsOnly } from "@/lib/learningStats";
import type { Deck, QuizResult } from "@/types/api.types";
import type { TypedQuestion } from "@/types/quiz.types";
import { QUESTION_TYPE_LABELS } from "@/features/quiz/quizUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { useAsync } from "@/lib/useAsync";
import { Ruby } from "@/lib/ja";

const SECONDS_PER_Q = 30; // QuizService.SECONDS_PER_QUESTION

const LEVEL_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-900 border-blue-300",
  N4: "bg-emerald-100 text-emerald-900 border-emerald-300",
  N3: "bg-amber-100 text-amber-900 border-amber-300",
  N2: "bg-rose-100 text-rose-900 border-rose-300",
  N1: "bg-purple-100 text-purple-900 border-purple-300",
};

/** Nhãn mức nắm vững từ độ chính xác thật; chưa có bài thi thì nói rõ. */
const masteryLabel = (accuracy: number | null): { title: string; hint: string } =>
    accuracy === null
        ? { title: "Chưa có dữ liệu", hint: "Làm bài thi đầu tiên để đánh giá" }
        : accuracy >= 90
          ? { title: "Vững vàng", hint: "Sẵn sàng thử bộ thẻ khó hơn" }
          : accuracy >= 70
            ? { title: "Khá", hint: "Ôn lại các câu sai để củng cố" }
            : accuracy >= 50
              ? { title: "Cần ôn thêm", hint: "Nên ôn SRS trước khi thi lại" }
              : { title: "Cần ôn nhiều", hint: "Học lại thẻ rồi quay lại thi" };

const QuizRoomSkeleton: React.FC = () => (
    <div className="flex flex-col gap-6 animate-pulse" aria-label="Đang tải dữ liệu phòng thi">
        {/* Header Skeleton */}
        <div className="flex flex-col xl:flex-row items-start xl:items-end justify-between gap-4 pb-1 border-b border-slate-200/80">
            <div className="space-y-2 max-w-2xl w-full">
                <div className="h-5 w-48 rounded-full bg-slate-200" />
                <div className="h-8 w-3/4 rounded-xl bg-slate-200" />
                <div className="h-4 w-5/6 rounded-lg bg-slate-100" />
            </div>
            <div className="flex gap-2">
                <div className="h-10 w-36 rounded-xl bg-slate-200" />
                <div className="h-10 w-28 rounded-xl bg-slate-100" />
            </div>
        </div>

        {/* 4 Bento Stat Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between gap-3 h-36">
                    <div className="flex items-center justify-between">
                        <div className="h-4 w-24 rounded bg-slate-100" />
                        <div className="w-9 h-9 rounded-xl bg-slate-100" />
                    </div>
                    <div className="h-8 w-20 rounded bg-slate-200" />
                    <div className="h-2 w-full rounded-full bg-slate-100" />
                </div>
            ))}
        </div>

        {/* Filter Bar Skeleton */}
        <div className="h-12 w-full bg-slate-100 rounded-2xl" />

        {/* 4 Exam Card Skeletons */}
        <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between gap-4 h-48">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="h-5 w-12 rounded-full bg-slate-200" />
                            <div className="h-4 w-24 rounded bg-slate-100" />
                        </div>
                        <div className="h-5 w-3/4 rounded bg-slate-200" />
                        <div className="h-4 w-1/2 rounded bg-slate-100" />
                    </div>
                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <div className="h-10 flex-1 rounded-xl bg-slate-200" />
                        <div className="h-10 w-24 rounded-xl bg-slate-100" />
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const QuizRoomPage: React.FC = () => {
    const { data, error, loading } = useAsync(
        async () => {
            const [decks, results] = await Promise.all([fetchDecks(), fetchQuizResults()]);
            return { decks, results };
        },
        []
    );

    const [selectedLevel, setSelectedLevel] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);
    const [sampleQuestions, setSampleQuestions] = useState<TypedQuestion[]>([]);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [previewError, setPreviewError] = useState("");

    // Bấm xem thử nhiều bộ liên tiếp: chỉ nhận kết quả của lần bấm cuối.
    const latestPreview = useRef<string | null>(null);

    const loadPreview = async (deckId: string) => {
        if (previewDeckId === deckId) {
            latestPreview.current = null;
            setPreviewDeckId(null);
            return;
        }
        latestPreview.current = deckId;
        setPreviewBusy(true);
        setPreviewError("");
        setSampleQuestions([]);
        setPreviewDeckId(deckId);
        try {
            const questions = await fetchQuizPreview(deckId, 2);
            if (latestPreview.current === deckId) setSampleQuestions(questions);
        } catch (e) {
            if (latestPreview.current === deckId) setPreviewError(extractErrorMessage(e));
        } finally {
            if (latestPreview.current === deckId) setPreviewBusy(false);
        }
    };

    if (loading) {
        return <QuizRoomSkeleton />;
    }

    if (error || !data) {
        return (
            <section aria-live="polite" className="py-6 flex flex-col items-start gap-3">
                <p className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{error || "Không thể tải danh sách phòng thi."}</p>
                <Link to="/" className="text-blue-600 hover:underline font-semibold text-sm">
                    ← Về trang tổng quan
                </Link>
            </section>
        );
    }

    const { decks, results } = data;

    // Lọc theo level và từ khoá tìm kiếm
    const filteredDecks = decks.filter((d: Deck) => {
        if (selectedLevel && d.level !== selectedLevel) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchTitle = d.title.toLowerCase().includes(q);
            const matchDesc = (d.description ?? "").toLowerCase().includes(q);
            if (!matchTitle && !matchDesc) return false;
        }
        return true;
    });

    // Thống kê từ 10 bài gần nhất (server chấm). Chưa có bài nào -> không bịa số.
    // Chỉ bài thi (exam): luyện tập thấy đáp án ngay nên không đưa vào số liệu trình độ.
    const examResults = examResultsOnly(results);
    const totalSolved = examResults.reduce((acc: number, r: QuizResult) => acc + r.total, 0);
    const totalScore = examResults.reduce((acc: number, r: QuizResult) => acc + r.score, 0);
    const accuracyRate = calcQuizAccuracy(results);
    const mastery = masteryLabel(accuracyRate);

    return (
        <section className="flex flex-col gap-6 pb-12">
            <div className="relative w-full">
                {/* 1. Top Header & Action Buttons */}
                <div className="flex flex-col xl:flex-row items-start xl:items-end justify-between gap-4 pb-1 border-b border-slate-200/80 mb-6">
                    <div className="max-w-2xl space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>AI EXAM ENGINE 3.4 • ADAPTIVE SRS ACTIVE</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                            Trung Tâm Luyện Thi Quiz &amp; Trắc Nghiệm AI
                        </h1>
                        <p className="text-sm md:text-base text-slate-600">
                            Luyện tập trắc nghiệm thông minh theo chuẩn đề thi JLPT N5–N1, tự động sinh từ giáo trình và
                            bộ thẻ của bạn với đồng hồ đếm ngược tiêu chuẩn.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
                        {decks[0] && (
                            <Link
                                to={`/decks/${decks[0].id}/quiz`}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all font-semibold text-xs shadow-xs active:scale-95 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">flash_on</span>
                                <span>Luyện Thi Cấp Tốc</span>
                            </Link>
                        )}
                        <a
                            href="#history"
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-medium text-xs shadow-xs"
                        >
                            <span className="material-symbols-outlined text-[18px] text-slate-400">history</span>
                            <span>Lịch Sử ({results.length})</span>
                        </a>
                    </div>
                </div>

                {/* 2. Performance Metagrid (4 Bento Stat Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                    {/* Stat 1: Accuracy Rate */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                                Độ chính xác TB
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">done_all</span>
                            </div>
                        </div>
                        <div className="my-2 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {accuracyRate === null ? "—" : `${accuracyRate}%`}
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${accuracyRate ?? 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 mt-2">
                            {examResults.length > 0
                                ? `Dựa trên ${examResults.length} bài thi gần nhất`
                                : "Chưa có bài thi nào"}
                        </span>
                    </div>

                    {/* Stat 2: Total Solved */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                                Tổng câu đã giải
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">task_alt</span>
                            </div>
                        </div>
                        <div className="my-2 flex items-baseline gap-1.5">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {totalSolved}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">câu</span>
                        </div>
                        <div className="text-xs text-slate-600 font-medium">
                            Đúng: <span className="text-emerald-700 font-bold">{totalScore}</span> câu
                        </div>
                        <span className="text-xs text-slate-500 mt-2">
                            Trong 10 bài thi gần nhất
                        </span>
                    </div>

                    {/* Stat 3: Avg Time per Question */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                                Thời gian cho mỗi câu
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">timer</span>
                            </div>
                        </div>
                        <div className="my-2 flex items-baseline gap-1.5">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {SECONDS_PER_Q}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">giây</span>
                        </div>
                        <span className="text-xs text-slate-500 mt-2">
                            Hết giờ bài tự nộp; câu bỏ trống tính là sai
                        </span>
                    </div>

                    {/* Stat 4: Mastery Status */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                                Cấp độ làm chủ
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">military_tech</span>
                            </div>
                        </div>
                        <div className="my-2">
                            <div className="text-lg font-bold text-slate-900">
                                {mastery.title}
                            </div>
                            <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-[14px]">verified</span>
                                {mastery.hint}
                            </div>
                        </div>
                        <span className="text-xs text-slate-500 mt-2">
                            Theo độ chính xác 10 bài gần nhất
                        </span>
                    </div>
                </div>

                {/* 3. Category & Filter Navigation Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 sm:p-2.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs mb-6">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                        <button
                            type="button"
                            onClick={() => setSelectedLevel("")}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                                selectedLevel === ""
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                        >
                            Tất cả ({decks.length})
                        </button>
                        {JLPT_LEVELS.map((lvl) => {
                            const count = decks.filter((d: Deck) => d.level === lvl).length;
                            const isSelected = selectedLevel === lvl;
                            return (
                                <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => setSelectedLevel(isSelected ? "" : lvl)}
                                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                                        isSelected
                                            ? "bg-blue-600 text-white shadow-xs"
                                            : LEVEL_BADGES[lvl] ?? "bg-slate-100 text-slate-700"
                                    }`}
                                >
                                    <span>{lvl}</span>
                                    <span className="opacity-75 text-[11px]">({count})</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="relative min-w-[200px] sm:w-64">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            search
                        </span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm đề thi..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
                        />
                    </div>
                </div>

                {/* 4. Danh Sách Phòng Thi (Exam Cards Grid) */}
                <div className="flex flex-col gap-3 mb-8">
                    {filteredDecks.length === 0 ? (
                        <div className="p-8 text-center rounded-2xl bg-white border border-dashed border-slate-200/90 shadow-xs">
                            <p className="text-slate-500 text-sm">
                                Không có bộ thẻ nào phù hợp với bộ lọc đã chọn.
                            </p>
                        </div>
                    ) : (
                        <ul className="grid gap-5 sm:grid-cols-2">
                            {filteredDecks.map((deck: Deck) => {
                                const qCount = Math.min(10, deck.cards.length);
                                const durSec = secondsLeft(qCount * SECONDS_PER_Q * 1000, 0);
                                const durMin = Math.ceil(durSec / 60);

                                return (
                                    <li
                                        key={deck.id}
                                        className="p-5 rounded-2xl bg-white border border-slate-200/90 flex flex-col justify-between gap-4 hover:border-blue-300 hover:shadow-md transition-all"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${LEVEL_BADGES[deck.level] ?? "bg-slate-100 text-slate-800"}`}>
                                                    {deck.level}
                                                </span>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                                    <span className="flex items-center gap-1">
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[15px]">style</span>
                                                        {deck.cards.length} thẻ
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[15px]">timer</span>
                                                        ~{durMin} phút ({durSec}s)
                                                    </span>
                                                </div>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                                                {deck.title}
                                            </h3>
                                            <p className="text-xs text-slate-600 line-clamp-2">
                                                {deck.description ?? `${deck.cards.length} thẻ từ vựng trong bộ`}
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    to={`/decks/${deck.id}/quiz`}
                                                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                >
                                                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">quiz</span>
                                                    Vào thi ngay
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => void loadPreview(deck.id)}
                                                    className="inline-flex items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                                                >
                                                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                                        {previewDeckId === deck.id ? "expand_less" : "visibility"}
                                                    </span>
                                                    {previewDeckId === deck.id ? "Đóng mẫu" : "Xem câu mẫu"}
                                                </button>
                                            </div>

                                            {/* Preview Box using parseQuestions */}
                                            {previewDeckId === deck.id && (
                                                <div
                                                    aria-live="polite"
                                                    className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col gap-2"
                                                >
                                                    {previewBusy && (
                                                        <p className="text-slate-500 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[16px] animate-spin text-blue-600">
                                                                progress_activity
                                                            </span>
                                                            Đang tải câu hỏi mẫu...
                                                        </p>
                                                    )}
                                                    {previewError && <p className="text-rose-700">{previewError}</p>}
                                                    {!previewBusy &&
                                                        !previewError &&
                                                        sampleQuestions.length === 0 && (
                                                            <p className="text-slate-500">
                                                                Không có câu hỏi mẫu hợp lệ.
                                                            </p>
                                                        )}
                                                    {sampleQuestions.map((q, idx) => (
                                                        <div
                                                            key={q.cardId}
                                                            className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-col gap-1"
                                                        >
                                                            <div className="font-bold text-slate-900 text-sm">
                                                                Câu {idx + 1}:{" "}
                                                                <Ruby term={q.term} reading={q.reading ?? undefined} />
                                                                {q.type !== "meaning" && (
                                                                    <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                                                                        {QUESTION_TYPE_LABELS[q.type]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {q.prompt && (
                                                                <div className="text-xs text-slate-600">{q.prompt}</div>
                                                            )}
                                                            <div className="text-xs text-slate-500">
                                                                {q.inputMode === "typing"
                                                                    ? "Tự gõ cách đọc, không có phương án gợi ý"
                                                                    : `Phương án: ${q.options.join(" · ")}`}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* 5. Lịch Sử Làm Bài Gần Đây (Recent History) */}
                <div id="history" className="flex flex-col gap-3 pt-6 border-t border-slate-200/80">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px] text-blue-600">history</span>
                            Lịch Sử Bài Thi Gần Đây
                        </h2>
                        <span className="text-xs text-slate-500 font-medium">10 lần thi gần nhất</span>
                    </div>

                    {results.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3">
                            Bạn chưa có bài thi nào. Chọn một bộ thẻ ở trên để bắt đầu!
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
                            <table className="w-full text-xs text-left">
                                <caption className="sr-only">10 bài kiểm tra gần nhất</caption>
                                <thead className="text-xs text-slate-600 font-semibold bg-slate-50 border-b border-slate-200/80">
                                    <tr>
                                        <th scope="col" className="p-3.5">
                                            Bộ thẻ
                                        </th>
                                        <th scope="col" className="p-3.5">
                                            Điểm số
                                        </th>
                                        <th scope="col" className="p-3.5">
                                            Tỷ lệ
                                        </th>
                                        <th scope="col" className="p-3.5">
                                            Thời gian nộp
                                        </th>
                                        <th scope="col" className="p-3.5 text-right">
                                            Thao tác
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {results.map((r: QuizResult) => {
                                        const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
                                        return (
                                            <tr key={`${r.deckId}-${r.createdAt}`} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="p-3.5 font-semibold text-blue-700">
                                                    {r.deckTitle ?? decks.find((d) => d.id === r.deckId)?.title ?? "Bộ thẻ"}
                                                </td>
                                                <td className="p-3.5 font-bold text-slate-900">
                                                    {r.score}/{r.total}
                                                </td>
                                                <td className="p-3.5">
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                            pct >= 80
                                                                ? "bg-emerald-100 text-emerald-900"
                                                                : "bg-slate-100 text-slate-700"
                                                        }`}
                                                    >
                                                        {pct}%
                                                    </span>
                                                </td>
                                                <td className="p-3.5 text-slate-500">
                                                    {new Date(r.createdAt).toLocaleString("vi-VN")}
                                                </td>
                                                <td className="p-3.5 text-right">
                                                    <Link
                                                        to={`/decks/${encodeURIComponent(r.deckId)}/quiz`}
                                                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-700 font-semibold text-xs inline-block transition-colors"
                                                    >
                                                        Thi lại
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default QuizRoomPage;
