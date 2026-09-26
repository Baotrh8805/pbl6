import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchQuiz, submitQuiz } from "@/services/studyService";
import { secondsLeft } from "@/lib/deckUtils";
import type { QuizGrade, Question } from "@/types/api.types";
import { Ruby } from "@/lib/ja";
import { extractErrorMessage } from "@/services/apiClient";

const SECONDS_PER_QUESTION = 30;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const QuizPage: React.FC = () => {
    const { deckId = "" } = useParams(); // server kiểm quyền bộ thẻ, sai thì 404
    const [size, setSize] = useState(10);
    const [questions, setQuestions] = useState<Question[] | null>(null);
    const [deadline, setDeadline] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<QuizGrade | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const running = questions !== null && result === null;
    const left = running ? secondsLeft(deadline, now) : 0;

    const start = async () => {
        setBusy(true);
        setError("");
        try {
            const qs = await fetchQuiz(deckId, size);
            if (qs.length === 0) {
                setError("Bộ thẻ này chưa có câu hỏi nào.");
                return;
            }
            setQuestions(qs);
            setAnswers({});
            setIndex(0);
            setResult(null);
            setDeadline(Date.now() + qs.length * SECONDS_PER_QUESTION * 1000);
        } catch (e) {
            setError(extractErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const finish = async (submitted: Record<string, string>) => {
        if (Object.keys(submitted).length === 0) {
            setResult({ score: 0, total: questions?.length ?? 0, wrong: {} });
            return;
        }
        setBusy(true);
        try {
            setResult(await submitQuiz(deckId, submitted)); // chấm ở server
            setError("");
        } catch (e) {
            setError(extractErrorMessage(e)); // giữ nguyên bài làm để bấm nộp lại
        } finally {
            setBusy(false);
        }
    };

    // Đồng hồ + tự nộp khi hết giờ.
    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running]);

    // Chỉ tự nộp một lần; nộp lỗi thì người dùng bấm "Nộp lại", không gửi lại mỗi giây.
    const autoSubmitted = useRef(false);
    // Ref giữ bản finish mới nhất (kèm bài làm hiện tại) để effect hết giờ không phụ thuộc vào answers.
    const submitLatest = useRef<() => void>(() => {});
    useEffect(() => {
        submitLatest.current = () => void finish(answers);
    });
    useEffect(() => {
        if (!running) {
            autoSubmitted.current = false;
            return;
        }
        if (!busy && !autoSubmitted.current && secondsLeft(deadline, now) === 0) {
            autoSubmitted.current = true;
            submitLatest.current();
        }
    }, [running, busy, deadline, now]);

    // Đang làm dở mà đóng tab: cảnh báo để không mất bài.
    useEffect(() => {
        if (!running) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [running]);

    const current = running ? questions[index] : undefined;

    const choose = (option: string) => {
        if (!current || !questions || busy) return;
        const next = { ...answers, [current.cardId]: option };
        setAnswers(next);
        if (index + 1 < questions.length) setIndex(index + 1);
        else void finish(next);
    };

    // Phím 1..n chọn đáp án.
    useEffect(() => {
        if (!current) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            const i = Number(e.key) - 1;
            if (i >= 0 && i < current.options.length) choose(current.options[i]);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (result) {
        const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
        return (
            <section className="min-h-screen bg-surface text-on-surface px-gutter py-space-lg">
                <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                    <h1 className="font-headline-sm text-headline-sm font-bold">
                        {result.score}/{result.total} câu đúng ({pct}%)
                    </h1>
                    {/* ponytail: thanh tiến độ bằng div, không biểu đồ.
                        Nâng cấp khi cần so sánh nhiều lần làm: thêm thư viện chart. */}
                    <div className="h-3 rounded-full bg-surface-container-high overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>

                    {Object.keys(result.wrong).length > 0 && (
                        <div>
                            <h2 className="font-title-md text-title-md font-semibold mb-2">Cần ôn lại</h2>
                            <ul className="flex flex-col gap-2">
                                {questions
                                    ?.filter((q) => q.cardId in result.wrong)
                                    .map((q) => (
                                        <li
                                            key={q.cardId}
                                            className="p-space-sm rounded-lg bg-surface-container-lowest border border-surface-container-high"
                                        >
                                            <div className="text-title-md">
                                                <Ruby term={q.term} reading={q.reading ?? undefined} />
                                            </div>
                                            <div className="text-body-sm text-on-surface-variant">
                                                Đáp án đúng: {result.wrong[q.cardId]}
                                            </div>
                                            <div className="text-body-sm text-error">
                                                Bạn chọn: {answers[q.cardId] ?? "(bỏ trống)"}
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex gap-space-sm">
                        <button
                            type="button"
                            onClick={() => {
                                setQuestions(null);
                                setResult(null);
                            }}
                            className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold"
                        >
                            Làm lại
                        </button>
                        <Link
                            to={`/decks/${deckId}`}
                            className="px-4 py-2.5 rounded-lg bg-surface-container-high font-label-md font-semibold"
                        >
                            Về bộ thẻ
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    if (!questions || !current) {
        return (
            <section className="min-h-screen bg-surface text-on-surface px-gutter py-space-lg">
                <div className="max-w-md mx-auto flex flex-col gap-space-md">
                    <Link to={`/decks/${deckId}`} className="text-label-md text-primary hover:underline">
                        ← Về bộ thẻ
                    </Link>
                    <h1 className="font-headline-sm text-headline-sm font-bold">Kiểm tra nhanh</h1>
                    <p className="text-body-sm text-on-surface-variant">
                        {SECONDS_PER_QUESTION} giây/câu, hết giờ tự nộp.
                    </p>

                    <label className="flex flex-col gap-1 text-label-md">
                        <span>Số câu</span>
                        <select
                            value={size}
                            onChange={(e) => setSize(Number(e.target.value))}
                            className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container-high"
                        >
                            <option value={10}>10 câu</option>
                            <option value={20}>20 câu</option>
                        </select>
                    </label>

                    {error && (
                        <p role="alert" className="text-error text-label-md">
                            {error}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => void start()}
                        disabled={busy}
                        className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold disabled:opacity-60"
                    >
                        {busy ? "Đang tạo đề..." : "Bắt đầu"}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="min-h-screen bg-surface text-on-surface px-gutter py-space-lg">
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <div className="flex items-center justify-between text-label-md text-on-surface-variant">
                    <span>
                        Câu {index + 1}/{questions.length}
                    </span>
                    {/* Dưới 30s đổi màu bằng class, không cần state riêng */}
                    {/* role="timer" không tự đọc mỗi giây; chỉ báo cho screen reader ở vài mốc. */}
                    <span role="timer" className={left <= 30 ? "text-error font-semibold" : ""}>
                        Còn {mmss(left)}
                    </span>
                    <span aria-live="assertive" className="sr-only">
                        {left === 60 || left === 30 || left === 10 ? `Còn ${left} giây` : ""}
                    </span>
                </div>

                <h1 lang="ja" className="text-display-sm font-bold text-center">
                    <Ruby term={current.term} reading={current.reading ?? undefined} />
                </h1>

                <fieldset className="flex flex-col gap-2">
                    <legend className="sr-only">Chọn nghĩa đúng</legend>
                    {current.options.map((option, i) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => choose(option)}
                            disabled={busy}
                            className="text-left p-space-sm rounded-lg bg-surface-container-lowest border border-surface-container-high hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                        >
                            <kbd className="text-label-sm text-outline mr-2">{i + 1}</kbd>
                            {option}
                        </button>
                    ))}
                </fieldset>

                {error && (
                    <p role="alert" className="text-error text-label-md">
                        {error}{" "}
                        <button type="button" onClick={() => void finish(answers)} disabled={busy} className="underline disabled:opacity-60">
                            Nộp lại
                        </button>
                    </p>
                )}
            </div>
        </section>
    );
};

export default QuizPage;
