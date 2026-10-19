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

export const QuizRoomPage: React.FC = () => {
    const { data, error, loading } = useAsync(
        async () => {
            const [decks, results] = await Promise.all([fetchDecks(), fetchQuizResults()]);
            return { decks, results };
        },
        []
    );

    const [selectedLevel, setSelectedLevel] = useState<string>("");
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
        return (
            <section aria-live="polite" className="py-space-xl flex flex-col items-center justify-center gap-space-sm">
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
                    progress_activity
                </span>
                <p className="text-on-surface-variant text-body-md font-medium">Đang tải trung tâm luyện thi Quiz...</p>
            </section>
        );
    }

    if (error || !data) {
        return (
            <section aria-live="polite" className="py-space-lg flex flex-col items-start gap-space-sm">
                <p className="text-error">{error || "Không thể tải danh sách phòng thi."}</p>
                <Link to="/" className="text-primary hover:underline font-semibold">
                    ← Về trang tổng quan
                </Link>
            </section>
        );
    }

    const { decks, results } = data;

    // Lọc theo level nếu người dùng chọn
    const filteredDecks = selectedLevel ? decks.filter((d: Deck) => d.level === selectedLevel) : decks;

    // Thống kê từ 10 bài gần nhất (server chấm). Chưa có bài nào -> không bịa số.
    // Chỉ bài thi (exam): luyện tập thấy đáp án ngay nên không đưa vào số liệu trình độ.
    const examResults = examResultsOnly(results);
    const totalSolved = examResults.reduce((acc: number, r: QuizResult) => acc + r.total, 0);
    const totalScore = examResults.reduce((acc: number, r: QuizResult) => acc + r.score, 0);
    const accuracyRate = calcQuizAccuracy(results);
    const mastery = masteryLabel(accuracyRate);

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl">
            {/* Ambient Background Accents */}
            <div className="relative w-full">
                {/* NEW-01: vệt -right-8 thò ra ngoài khung nội dung làm cả trang cuộn ngang (scrollWidth 389 > 375 ở 375 px).
                    Gom vệt vào một lớp riêng cắt theo chiều ngang (overflow-x-clip: không tạo vùng cuộn, chiều dọc vẫn tràn
                    mềm như cũ) thay vì overflow-hidden ở khung ngoài — khung ngoài chứa nút thật, cắt ở đó sẽ mất viền
                    focus / bóng của nút sát mép. */}
                <div aria-hidden="true" className="absolute inset-0 overflow-x-clip pointer-events-none -z-10">
                    <div className="absolute -right-8 -top-8 w-72 h-72 bg-secondary-container/20 rounded-full blur-3xl" />
                    <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-primary-fixed/20 rounded-full blur-2xl" />
                </div>

                {/* 1. Top Header & Action Buttons */}
                <div className="flex flex-col xl:flex-row items-start xl:items-end justify-between gap-space-md mb-space-lg">
                    <div className="max-w-2xl space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm">
                            <span className="inline-block w-2 h-2 rounded-full bg-secondary" />
                            <span className="font-bold tracking-wider">AI EXAM ENGINE 3.4 • ADAPTIVE SRS ACTIVE</span>
                        </div>
                        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
                            Trung Tâm Luyện Thi Quiz &amp; Trắc Nghiệm AI
                        </h1>
                        <p className="font-body-md text-body-md text-on-surface-variant">
                            Luyện tập trắc nghiệm thông minh theo chuẩn đề thi JLPT N5–N1, tự động sinh từ giáo trình và
                            bộ thẻ của bạn với đồng hồ đếm ngược tiêu chuẩn.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-space-xs sm:gap-space-sm w-full xl:w-auto">
                        {decks[0] && (
                            <Link
                                to={`/decks/${decks[0].id}/quiz`}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all font-label-md text-label-md shadow-sm active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px]">flash_on</span>
                                <span>Luyện Thi Cấp Tốc</span>
                            </Link>
                        )}
                        <a
                            href="#history"
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-surface-container-high text-on-surface hover:bg-surface-container transition-all font-label-md text-label-md shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[18px] text-outline">history</span>
                            <span>Lịch Sử ({results.length})</span>
                        </a>
                    </div>
                </div>

                {/* 2. Performance Metagrid (4 Bento Stat Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-lg">
                    {/* Stat 1: Accuracy Rate */}
                    <div className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                                Độ chính xác TB
                            </span>
                            <span className="p-1.5 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">done_all</span>
                            </span>
                        </div>
                        <div className="my-space-xs flex items-baseline gap-2">
                            <span className="font-headline-lg text-headline-lg text-primary font-bold">
                                {accuracyRate === null ? "—" : `${accuracyRate}%`}
                            </span>
                        </div>
                        <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                            <div className="bg-secondary h-full rounded-full" style={{ width: `${accuracyRate ?? 0}%` }} />
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface-variant mt-2">
                            {examResults.length > 0
                                ? `Dựa trên ${examResults.length} bài thi gần nhất`
                                : "Chưa có bài thi nào"}
                        </span>
                    </div>

                    {/* Stat 2: Total Solved */}
                    <div className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                                Tổng câu đã giải
                            </span>
                            <span className="p-1.5 rounded-lg bg-surface-container text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">task_alt</span>
                            </span>
                        </div>
                        <div className="my-space-xs flex items-baseline gap-2">
                            <span className="font-headline-lg text-headline-lg text-primary font-bold">
                                {totalSolved}
                            </span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">câu</span>
                        </div>
                        <div className="text-on-surface-variant font-label-sm text-label-sm">
                            Đúng: <span className="text-secondary font-bold">{totalScore}</span> câu
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface-variant mt-2">
                            Trong 10 bài thi gần nhất
                        </span>
                    </div>

                    {/* Stat 3: Avg Time per Question */}
                    <div className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                                Thời gian cho mỗi câu
                            </span>
                            <span className="p-1.5 rounded-lg bg-surface-container text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">timer</span>
                            </span>
                        </div>
                        <div className="my-space-xs flex items-baseline gap-2">
                            <span className="font-headline-lg text-headline-lg text-primary font-bold">
                                {SECONDS_PER_Q}
                            </span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">giây</span>
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface-variant mt-2">
                            Hết giờ bài tự nộp; câu bỏ trống tính là sai
                        </span>
                    </div>

                    {/* Stat 4: Mastery Status */}
                    <div className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                                Cấp độ làm chủ
                            </span>
                            <span className="p-1.5 rounded-lg bg-surface-container text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">military_tech</span>
                            </span>
                        </div>
                        <div className="my-space-xs">
                            <div className="font-headline-sm text-headline-sm text-primary font-bold">
                                {mastery.title}
                            </div>
                            <div className="font-label-sm text-label-sm text-secondary font-semibold flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-[14px]">verified</span>
                                {mastery.hint}
                            </div>
                        </div>
                        <span className="font-label-sm text-label-sm text-outline mt-2">
                            Theo độ chính xác 10 bài gần nhất
                        </span>
                    </div>
                </div>

                {/* 3. Category & Filter Navigation Bar */}
                <div className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm bg-surface-container-lowest rounded-xl border border-surface-container-high shadow-sm mb-space-md">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => setSelectedLevel("")}
                            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
                                selectedLevel === ""
                                    ? "bg-primary text-on-primary font-semibold shadow-sm"
                                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                            }`}
                        >
                            Tất cả đề ({decks.length})
                        </button>
                        {JLPT_LEVELS.map((lvl) => (
                            <button
                                key={lvl}
                                type="button"
                                onClick={() => setSelectedLevel(lvl === selectedLevel ? "" : lvl)}
                                className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm transition-colors ${
                                    selectedLevel === lvl
                                        ? "bg-primary text-on-primary font-bold shadow-sm"
                                        : "bg-surface-container text-on-surface hover:bg-surface-container-highest"
                                }`}
                            >
                                {lvl}
                            </button>
                        ))}
                    </div>
                    <span className="text-label-sm text-outline px-2">
                        {filteredDecks.length} đề thi sẵn sàng
                    </span>
                </div>

                {/* 4. Danh Sách Phòng Thi (Exam Cards Grid) */}
                <div className="flex flex-col gap-space-sm mb-space-lg">
                    {filteredDecks.length === 0 ? (
                        <p className="text-on-surface-variant py-space-md">
                            Không có bộ thẻ nào phù hợp với bộ lọc cấp độ đã chọn.
                        </p>
                    ) : (
                        <ul className="grid gap-space-md sm:grid-cols-2">
                            {filteredDecks.map((deck: Deck) => {
                                const qCount = Math.min(10, deck.cards.length);
                                const durSec = secondsLeft(qCount * SECONDS_PER_Q * 1000, 0);
                                const durMin = Math.ceil(durSec / 60);

                                return (
                                    <li
                                        key={deck.id}
                                        className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high flex flex-col justify-between gap-space-md hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary text-label-sm font-semibold">
                                                    {deck.level}
                                                </span>
                                                <span className="text-label-sm text-outline flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[15px]">timer</span>
                                                    ~{durMin} phút ({durSec}s)
                                                </span>
                                            </div>
                                            <h3 className="font-title-md text-title-md font-bold text-on-surface">
                                                {deck.title}
                                            </h3>
                                            <p className="text-body-sm text-on-surface-variant line-clamp-2">
                                                {deck.description ?? `${deck.cards.length} thẻ từ vựng`}
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-2 border-t border-surface-container-high/60">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    to={`/decks/${deck.id}/quiz`}
                                                    className="flex-1 text-center py-2.5 px-3 rounded-xl bg-primary text-on-primary font-label-md font-semibold hover:bg-primary-container transition-colors shadow-sm active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                                >
                                                    Vào thi ngay
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => void loadPreview(deck.id)}
                                                    className="py-2.5 px-3 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold hover:bg-surface-container-highest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                                >
                                                    {previewDeckId === deck.id ? "Đóng mẫu" : "Xem câu mẫu"}
                                                </button>
                                            </div>

                                            {/* Preview Box using parseQuestions */}
                                            {previewDeckId === deck.id && (
                                                <div
                                                    aria-live="polite"
                                                    className="mt-2 p-space-sm rounded-xl bg-surface-container-low border border-surface-container text-body-sm flex flex-col gap-2"
                                                >
                                                    {previewBusy && (
                                                        <p className="text-on-surface-variant flex items-center gap-1 text-label-sm">
                                                            <span className="material-symbols-outlined text-[16px] animate-spin">
                                                                progress_activity
                                                            </span>
                                                            Đang tải câu hỏi mẫu...
                                                        </p>
                                                    )}
                                                    {previewError && <p className="text-error">{previewError}</p>}
                                                    {!previewBusy &&
                                                        !previewError &&
                                                        sampleQuestions.length === 0 && (
                                                            <p className="text-on-surface-variant">
                                                                Không có câu hỏi mẫu hợp lệ.
                                                            </p>
                                                        )}
                                                    {sampleQuestions.map((q, idx) => (
                                                        <div
                                                            key={q.cardId}
                                                            className="p-2 rounded-lg bg-surface-container-lowest border border-surface-container-high/60 flex flex-col gap-1"
                                                        >
                                                            <div className="font-bold text-on-surface text-title-md">
                                                                Câu {idx + 1}:{" "}
                                                                <Ruby term={q.term} reading={q.reading ?? undefined} />
                                                                {q.type !== "meaning" && (
                                                                    <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-surface-container text-label-sm font-semibold text-on-surface-variant">
                                                                        {QUESTION_TYPE_LABELS[q.type]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {q.prompt && (
                                                                <div className="text-body-sm text-on-surface-variant">{q.prompt}</div>
                                                            )}
                                                            <div className="text-label-sm text-outline">
                                                                {/* Câu gõ (đợt 2) không có phương án: nói rõ thay vì in dòng trống */}
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
                <div id="history" className="flex flex-col gap-space-sm pt-space-md border-t border-surface-container-high">
                    <div className="flex items-center justify-between">
                        <h2 className="font-title-md text-title-md font-bold text-on-surface flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px] text-primary">history</span>
                            Lịch Sử Bài Thi Gần Đây
                        </h2>
                        <span className="text-label-sm text-outline">10 lần thi gần nhất</span>
                    </div>

                    {results.length === 0 ? (
                        <p className="text-body-sm text-on-surface-variant py-space-sm">
                            Bạn chưa có bài thi nào. Chọn một bộ thẻ ở trên để bắt đầu!
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-surface-container-high bg-surface-container-lowest">
                            <table className="w-full text-body-sm text-left">
                                <caption className="sr-only">10 bài kiểm tra gần nhất</caption>
                                <thead className="text-label-md text-on-surface-variant bg-surface-container-low border-b border-surface-container-high">
                                    <tr>
                                        <th scope="col" className="p-3">
                                            Bộ thẻ
                                        </th>
                                        <th scope="col" className="p-3">
                                            Điểm số
                                        </th>
                                        <th scope="col" className="p-3">
                                            Tỷ lệ
                                        </th>
                                        <th scope="col" className="p-3">
                                            Thời gian nộp
                                        </th>
                                        <th scope="col" className="p-3 text-right">
                                            Thao tác
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-container-high/60">
                                    {results.map((r: QuizResult) => {
                                        const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
                                        return (
                                            <tr key={`${r.deckId}-${r.createdAt}`} className="hover:bg-surface-container-low/40">
                                                <td className="p-3 font-semibold text-primary">
                                                    {r.deckTitle ?? decks.find((d) => d.id === r.deckId)?.title ?? "Bộ thẻ"}
                                                </td>
                                                <td className="p-3 font-bold">
                                                    {r.score}/{r.total}
                                                </td>
                                                <td className="p-3">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-label-sm font-bold ${
                                                            pct >= 80
                                                                ? "bg-secondary-container text-on-secondary-container"
                                                                : "bg-surface-container-high text-on-surface"
                                                        }`}
                                                    >
                                                        {pct}%
                                                    </span>
                                                </td>
                                                <td className="p-3 text-on-surface-variant">
                                                    {new Date(r.createdAt).toLocaleString("vi-VN")}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Link
                                                        to={`/decks/${encodeURIComponent(r.deckId)}/quiz`}
                                                        className="px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md font-semibold text-label-sm inline-block transition-colors"
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
