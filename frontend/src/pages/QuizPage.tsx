import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
    createQuizAttempt,
    fetchOpenQuizAttempt,
    fetchQuizAttempt,
    saveQuizAnswer,
    submitQuizAttempt,
} from "@/services/studyService";
import type { QuizMode } from "@/types/api.types";
import type { QuizQuestionType, TypedQuizAttempt, TypedQuizFeedback } from "@/types/quiz.types";
import { extractErrorMessage } from "@/services/apiClient";
import { canSpeak } from "@/lib/speech";
import { parseAudioMode } from "@/lib/audioOnly";
import { useAuth } from "@/context/useAuth";
import { loadLearningSettings } from "@/features/dashboard/lib/dashboardUtils";
import { useQuizCapabilities } from "@/features/quiz/useQuizCapabilities";
import { TypingAnswer } from "@/features/quiz/components/TypingAnswer";
import { FlagQuestionModal, type FlagTarget } from "@/features/quiz/components/FlagQuestionModal";
import { FeedbackBlock } from "@/features/quiz/components/FeedbackBlock";
import { FlagButton } from "@/features/quiz/components/FlagButton";
import { QuestionHeading } from "@/features/quiz/components/QuestionHeading";
import { QuizReview } from "@/features/quiz/components/QuizReview";
import { QuizStartScreen } from "@/features/quiz/components/QuizStartScreen";
import { useTypingAutosave } from "@/features/quiz/useTypingAutosave";
import { modeLabel, quizPrimaryBtn as primaryBtn, quizSecondaryBtn as secondaryBtn, quizShell as shell } from "@/features/quiz/quizUi";
import {
    DEFAULT_QUESTION_TYPES,
    QUESTION_TYPE_LABELS,
    normalizeTypedAnswer,
    questionDisplay,
    questionTypesForRequest,
} from "@/features/quiz/quizUtils";

const GRACE_SECONDS = 60; // QuizService.GRACE_SECONDS: expiresAt của server đã cộng sẵn khoảng bù này
const MAX_SAVE_TRIES = 3;
const TYPING_SAVE_DELAY_MS = 800; // câu gõ ở exam: lưu sau khi ngừng gõ chừng này

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SaveState = "saved" | "saving" | "error";

/** Lỗi do trạng thái lượt làm (đã nộp / hết giờ / không còn): tải lại từ server thay vì thử lại. */
const isStateConflict = (e: unknown) => isAxiosError(e) && (e.response?.status === 409 || e.response?.status === 404);

export const QuizPage: React.FC = () => {
    const { deckId = "" } = useParams(); // server kiểm quyền bộ thẻ, sai thì 404
    const [params, setParams] = useSearchParams();
    const attemptParam = params.get("attempt");
    // E5 – chế độ chỉ nghe (cài đặt hoặc ?mode=audio): chốt lúc mở trang vì setParams({ attempt }) bên dưới xoá ?mode=.
    const { userEmail } = useAuth();
    const [audioOnly] = useState(() => canSpeak && (parseAudioMode(params.get("mode")) ?? loadLearningSettings(userEmail).audioOnly));

    const [size, setSize] = useState(10);
    const [mode, setMode] = useState<QuizMode>("practice");
    const [questionTypes, setQuestionTypes] = useState<QuizQuestionType[]>(() => [...DEFAULT_QUESTION_TYPES]);
    const [attempt, setAttempt] = useState<TypedQuizAttempt | null>(null);
    const [openAttempt, setOpenAttempt] = useState<TypedQuizAttempt | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [feedbacks, setFeedbacks] = useState<Record<string, TypedQuizFeedback>>({});
    // Câu gõ: chuỗi đang gõ của từng câu (practice chỉ gửi khi Enter; exam tự lưu sau khi ngừng gõ).
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);
    const [flaggedIds, setFlaggedIds] = useState<ReadonlySet<string>>(() => new Set());
    // Thông báo sau khi báo lỗi, gắn với đúng câu đó (sang câu khác thì không hiện nữa).
    const [flagNotice, setFlagNotice] = useState<{ questionId: string; text: string } | null>(null);
    const [index, setIndex] = useState(0);
    const [deadline, setDeadline] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [saveState, setSaveState] = useState<SaveState>("saved");
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);

    const nextRef = useRef<HTMLButtonElement>(null);
    // Hàng đợi tự lưu tuần tự (exam): các lần lưu lên server đúng thứ tự người dùng chọn, không đè nhau.
    const queue = useRef<Promise<void>>(Promise.resolve());
    const pending = useRef(0);
    const failedCards = useRef<Set<string>>(new Set()); // câu có lần lưu gần nhất thất bại; lưu lại thành công thì bỏ

    // ---------- exam: tự lưu tuần tự (thử lại có giãn cách; lượt đã đóng thì thôi) ----------
    const enqueueSave = (attemptId: string, cardId: string, option: string) => {
        pending.current++;
        setSaveState("saving");
        queue.current = queue.current.then(async () => {
            let ok = false;
            for (let i = 0; i < MAX_SAVE_TRIES && !ok; i++) {
                try {
                    await saveQuizAnswer(attemptId, cardId, option);
                    ok = true;
                } catch (e) {
                    if (isStateConflict(e)) break; // lượt đã đóng: thử lại vô ích
                    await sleep(500 * 2 ** i);
                }
            }
            pending.current--;
            if (ok) failedCards.current.delete(cardId);
            else failedCards.current.add(cardId);
            if (pending.current === 0) setSaveState(failedCards.current.size > 0 ? "error" : "saved");
        });
    };
    // Câu gõ ở exam: lưu sau khi ngừng gõ (gửi mỗi phím là spam hàng đợi lưu); Enter / nộp / rời trang thì gửi ngay.
    const {
        schedule: scheduleTypingSave,
        flush: flushTypingSaves,
        cancel: cancelTypingSave,
        cancelAll: cancelTypingSaves,
    } = useTypingAutosave(enqueueSave, TYPING_SAVE_DELAY_MS);

    const running = attempt !== null && !attempt.finished;
    const isExam = attempt?.mode === "exam";
    const left = running && isExam ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
    // Số thẻ dùng được cho từng loại câu: chỉ màn bắt đầu cần (đang làm / xem lại bài thì không gọi).
    const onStartScreen = !loading && !attempt?.finished && !(running && attempt?.questions[index]);
    const capabilities = useQuizCapabilities(deckId, onStartScreen);
    const requestTypes = questionTypesForRequest(questionTypes, capabilities.caps);
    // Server có số liệu mà không loại nào được chọn còn dùng được -> chặn "Bắt đầu" (fieldset tự nói lý do).
    const typesBlocked = capabilities.status === "ok" && requestTypes !== undefined && requestTypes.length === 0;

    /** Dựng giao diện từ trạng thái server (nguồn sự thật): đáp án đã chọn, phản hồi, câu đang làm, giờ còn lại. */
    const load = useCallback((state: TypedQuizAttempt) => {
        const chosen: Record<string, string> = {};
        const fb: Record<string, TypedQuizFeedback> = {};
        const typed: Record<string, string> = {};
        for (const q of state.questions) {
            if (q.chosen !== null) chosen[q.cardId] = q.chosen;
            if (q.feedback) fb[q.cardId] = q.feedback;
            if (q.inputMode === "typing" && q.chosen) typed[q.cardId] = q.chosen;
        }
        cancelTypingSaves();
        setAttempt(state);
        setAnswers(chosen);
        setFeedbacks(fb);
        setDrafts(typed);
        setFlagNotice(null);
        const firstOpen = state.questions.findIndex((q) => q.chosen === null);
        setIndex(state.mode === "practice" && !state.finished && firstOpen >= 0 ? firstOpen : 0);
        // Giờ còn lại tính theo đồng hồ server (expiresAt - serverNow), không phụ thuộc đồng hồ máy người dùng.
        if (state.mode === "exam" && state.expiresAt) {
            const remainMs = Date.parse(state.expiresAt) - Date.parse(state.serverNow) - GRACE_SECONDS * 1000;
            setDeadline(Date.now() + remainMs);
        }
        setConfirmSubmit(false);
        setError("");
        setNotice("");
        failedCards.current.clear();
        setSaveState("saved");
    }, [cancelTypingSaves]);

    // Vào trang: có ?attempt= thì khôi phục đúng lượt đó (kể cả xem lại bài đã nộp), không thì hỏi server có bài dở không.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (attemptParam) {
                    const state = await fetchQuizAttempt(attemptParam);
                    if (!cancelled && state?.attemptId) {
                        load(state);
                        return;
                    }
                }
                const open = await fetchOpenQuizAttempt(deckId);
                if (!cancelled) setOpenAttempt(open?.attemptId ? open : null);
            } catch {
                // Không khôi phục được (404, mạng): về màn bắt đầu, người dùng vẫn bắt đầu bài mới được.
                if (!cancelled && attemptParam) setParams({}, { replace: true });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // Chỉ chạy lúc mở trang: các lần đổi ?attempt= sau đó do chính trang này đặt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckId]);

    const start = async (m: QuizMode) => {
        setBusy(true);
        setError("");
        try {
            // Server chưa hỗ trợ loại câu (capabilities 404/405) -> undefined: gửi đúng body cũ.
            const state = await createQuizAttempt(deckId, size, m, requestTypes);
            if (!state?.attemptId || state.questions.length === 0) {
                setError(
                    requestTypes && requestTypes.some((t) => t !== "meaning")
                        ? "Chưa tạo được câu hỏi nào với các loại đã chọn. Hãy thử thêm loại \"Nghĩa\" hoặc chọn loại khác."
                        : "Bộ thẻ cần ít nhất 2 thẻ có nghĩa khác nhau để tạo câu hỏi trắc nghiệm."
                );
                return;
            }
            setOpenAttempt(null);
            load(state);
            if (state.resumed) {
                // Đã có lượt đang mở (vd. ở tab khác): không tạo lượt mới, nói rõ để người dùng không tưởng đang ở chế độ vừa chọn
                setNotice(`Bạn đang có bài ${modeLabel(state.mode).toLowerCase()} chưa nộp nên đã tiếp tục bài đó.`);
            }
            setParams({ attempt: state.attemptId }, { replace: true });
        } catch (e) {
            setError(extractErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const resume = () => {
        if (!openAttempt?.attemptId) return;
        load(openAttempt);
        setParams({ attempt: openAttempt.attemptId }, { replace: true });
        setOpenAttempt(null);
    };

    /** Tải lại trạng thái từ server (khi server báo lượt đã đóng/hết giờ, hoặc sau khi nộp để xem đáp án). */
    const syncFromServer = async (attemptId: string) => {
        const state = await fetchQuizAttempt(attemptId);
        if (state?.attemptId) load(state);
    };

    // Đồng hồ + tự nộp khi hết giờ (exam).
    useEffect(() => {
        if (!running || !isExam) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running, isExam]);

    // Chỉ cảnh báo đóng tab khi còn đáp án chưa lên server; còn lại bài đã được lưu và khôi phục được.
    useEffect(() => {
        if (!running || saveState === "saved") return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [running, saveState]);

    const finish = async () => {
        if (!attempt?.attemptId) return;
        setBusy(true);
        setError("");
        try {
            flushTypingSaves(); // câu gõ còn hẹn lưu: đưa vào hàng đợi trước khi chờ
            await queue.current; // chờ các lần tự lưu đang bay xong rồi mới chốt
            // exam: gửi kèm bản đầy đủ để bù chỗ tự lưu thất bại; server vẫn chấm trên bản đã lưu nếu quá hạn
            await submitQuizAttempt(attempt.attemptId, isExam ? answers : undefined);
            await syncFromServer(attempt.attemptId);
        } catch (e) {
            setError(extractErrorMessage(e)); // giữ nguyên bài làm, nộp lại an toàn (server idempotent)
        } finally {
            setBusy(false);
        }
    };

    const autoSubmitted = useRef(false);
    const finishLatest = useRef<() => void>(() => {});
    useEffect(() => {
        finishLatest.current = () => void finish();
    });
    useEffect(() => {
        if (!running || !isExam) {
            autoSubmitted.current = false;
            return;
        }
        if (!busy && !autoSubmitted.current && left === 0 && deadline > 0) {
            autoSubmitted.current = true;
            finishLatest.current();
        }
    }, [running, isExam, busy, left, deadline]);

    // ---------- chọn đáp án ----------
    const current = running && attempt ? attempt.questions[index] : undefined;

    const choose = async (option: string) => {
        if (!current || !attempt?.attemptId || busy) return;
        const cardId = current.cardId;
        if (attempt.mode === "practice") {
            if (feedbacks[cardId]) return; // đã khoá
            setBusy(true);
            setError("");
            try {
                const res = await saveQuizAnswer(attempt.attemptId, cardId, option);
                setAnswers((a) => ({ ...a, [cardId]: option }));
                if (res.feedback) setFeedbacks((f) => ({ ...f, [cardId]: res.feedback! }));
                setTimeout(() => nextRef.current?.focus(), 0); // đưa focus tới "Câu tiếp" để đọc phản hồi rồi đi tiếp
            } catch (e) {
                if (isStateConflict(e)) void syncFromServer(attempt.attemptId);
                else setError(extractErrorMessage(e)); // không hiện phản hồi trước khi server xác nhận
            } finally {
                setBusy(false);
            }
            return;
        }
        // exam: lưu ngầm, không phản hồi. Chọn lại đúng đáp án đang chọn thì không làm gì (radio không tự bỏ chọn);
        // muốn xoá đáp án dùng nút "Xoá lựa chọn".
        if (answers[cardId] === option) return;
        setAnswers((a) => ({ ...a, [cardId]: option }));
        enqueueSave(attempt.attemptId, cardId, option);
    };

    const clearAnswer = () => {
        if (!current || !attempt?.attemptId || !answers[current.cardId]) return;
        const cardId = current.cardId;
        cancelTypingSave(cardId);
        setAnswers((a) => {
            const copy = { ...a };
            delete copy[cardId];
            return copy;
        });
        setDrafts((d) => ({ ...d, [cardId]: "" }));
        enqueueSave(attempt.attemptId, cardId, "");
    };

    // ---------- câu gõ (inputMode = typing) ----------
    const typeAnswer = (value: string) => {
        if (!current || !attempt?.attemptId) return;
        const cardId = current.cardId;
        setDrafts((d) => ({ ...d, [cardId]: value }));
        if (attempt.mode !== "exam") return; // practice: chỉ gửi khi Enter (gửi là khoá câu + hiện đáp án)
        // exam: như chọn phương án — đáp án vào bản nộp ngay, lên server sau khi ngừng gõ.
        const has = normalizeTypedAnswer(value) !== "";
        setAnswers((a) => {
            const copy = { ...a };
            if (has) copy[cardId] = value;
            else delete copy[cardId];
            return copy;
        });
        scheduleTypingSave(attempt.attemptId, cardId, has ? value : "");
        setSaveState("saving"); // "Đang lưu..." hiện ngay để cảnh báo đóng tab có hiệu lực trong lúc chờ ngừng gõ
    };

    const submitTyped = (value: string) => {
        if (!current || !attempt?.attemptId) return;
        if (attempt.mode === "practice") {
            if (normalizeTypedAnswer(value)) void choose(value);
            return;
        }
        typeAnswer(value);
        flushTypingSaves(current.cardId);
    };

    const openFlag = (target: FlagTarget) => {
        setFlagNotice(null);
        setFlagTarget(target);
    };

    const onFlagged = (questionId: string, message: string) => {
        setFlaggedIds((s) => new Set(s).add(questionId));
        setFlagNotice({ questionId, text: message });
    };

    const skip = async () => {
        if (!current || !attempt?.attemptId || busy || feedbacks[current.cardId]) return;
        await choose("");
    };

    // Phím 1..n chọn đáp án.
    useEffect(() => {
        if (!current) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            if (el?.closest?.("dialog[open]")) return; // đang mở hộp thoại báo lỗi: phím số không được chọn đáp án phía sau
            const i = Number(e.key) - 1;
            if (i >= 0 && i < current.options.length) void choose(current.options[i]);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const backToStart = () => {
        setAttempt(null);
        setAnswers({});
        setFeedbacks({});
        setDrafts({});
        setFlagNotice(null);
        setParams({}, { replace: true });
        void fetchOpenQuizAttempt(deckId)
            .then((o) => setOpenAttempt(o?.attemptId ? o : null))
            .catch(() => setOpenAttempt(null));
    };

    // ---------- giao diện ----------
    if (loading) {
        return (
            <section className={shell} aria-busy="true" aria-live="polite">
                <p className="max-w-md mx-auto text-on-surface-variant">Đang tải...</p>
            </section>
        );
    }

    // Đã nộp: tổng kết + xem lại toàn bộ đáp án và lời giải
    if (attempt?.finished) {
        return (
            <QuizReview
                attempt={attempt}
                deckId={deckId}
                flaggedIds={flaggedIds}
                flagNotice={flagNotice}
                onFlag={openFlag}
                onRestart={backToStart}
            >
                <FlagQuestionModal target={flagTarget} onClose={() => setFlagTarget(null)} onFlagged={onFlagged} />
            </QuizReview>
        );
    }

    // Màn bắt đầu: chọn chế độ, hoặc tiếp tục bài đang làm dở
    if (!attempt || !current) {
        return (
            <QuizStartScreen
                deckId={deckId}
                openAttempt={openAttempt}
                onResume={resume}
                mode={mode}
                onModeChange={setMode}
                questionTypes={questionTypes}
                onQuestionTypesChange={setQuestionTypes}
                capabilities={capabilities}
                size={size}
                onSizeChange={setSize}
                busy={busy}
                error={error}
                typesBlocked={typesBlocked}
                onStart={() => void start(mode)}
            />
        );
    }

    // Đang làm bài
    const total = attempt.questions.length;
    const feedback = feedbacks[current.cardId] ?? null;
    const chosen = answers[current.cardId] ?? null;
    const answeredCount = Object.keys(answers).length;
    const unanswered = total - answeredCount;
    const isLast = index + 1 >= total;
    const practiceDone = !isExam && answeredCount >= total;
    const display = questionDisplay(current);
    const mixedTypes = new Set(attempt.questions.map((q) => q.type)).size > 1;

    return (
        <section className={`${shell} pb-28`}>
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <div className="flex items-center justify-between gap-2 text-label-md text-on-surface-variant">
                    <span>
                        Câu {index + 1}/{total} · {modeLabel(attempt.mode)}
                    </span>
                    {isExam ? (
                        <>
                            {/* role="timer" không tự đọc mỗi giây; chỉ báo cho screen reader ở vài mốc. */}
                            <span role="timer" className={left <= 30 ? "text-error font-semibold" : ""}>
                                Còn {mmss(left)}
                            </span>
                            <span aria-live="assertive" className="sr-only">
                                {left === 60 || left === 30 || left === 10 ? `Còn ${left} giây` : ""}
                            </span>
                        </>
                    ) : (
                        <span>
                            Đã trả lời {answeredCount}/{total}
                        </span>
                    )}
                </div>

                {isExam && (
                    <nav aria-label="Danh sách câu hỏi" className="flex gap-1.5 overflow-x-auto pb-1">
                        {attempt.questions.map((q, i) => (
                            <button
                                key={q.cardId}
                                type="button"
                                onClick={() => setIndex(i)}
                                aria-label={`Câu ${i + 1}${answers[q.cardId] ? ", đã làm" : ", chưa làm"}`}
                                aria-current={i === index ? "step" : undefined}
                                className={`shrink-0 w-11 h-11 rounded-lg text-label-md font-semibold border ${
                                    i === index
                                        ? "border-primary bg-primary text-on-primary"
                                        : answers[q.cardId]
                                          ? "border-primary/40 bg-primary/10"
                                          : "border-surface-container-high bg-surface-container-lowest"
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </nav>
                )}

                {/* Loại câu (đợt 2): nhãn nhỏ khi khác "Nghĩa" hoặc đề trộn nhiều loại, để người học biết đang được hỏi gì */}
                {(mixedTypes || current.type !== "meaning") && (
                    <p className="self-center px-3 py-1 rounded-full bg-surface-container text-label-sm font-semibold text-on-surface-variant">
                        {QUESTION_TYPE_LABELS[current.type]}
                    </p>
                )}

                {/* E5: nút loa cạnh từ; chế độ chỉ nghe tự đọc và ẩn chữ sau "Hiện chữ" (key theo câu để trạng thái reset).
                    Loại khác nghĩa: QuestionHeading ẩn từ / furigana / loa khi đó chính là đáp án. */}
                <QuestionHeading key={`heading-${current.cardId}`} q={current} audioOnly={audioOnly} />

                {current.inputMode === "typing" ? (
                    <TypingAnswer
                        key={`typing-${current.cardId}`}
                        value={drafts[current.cardId] ?? ""}
                        onChange={typeAnswer}
                        onSubmit={submitTyped}
                        submitLabel={isExam ? "Lưu đáp án" : "Trả lời"}
                        disabled={busy || feedback !== null}
                        autoFocus
                    />
                ) : (
                    <div role="radiogroup" aria-label={display.groupLabel} className="flex flex-col gap-2">
                        {current.options.map((option, i) => {
                            const isChosen = chosen === option;
                            const isCorrect = feedback?.correctAnswer === option;
                            const revealed = feedback !== null;
                            const tone = revealed
                                ? isCorrect
                                    ? "border-secondary bg-secondary-container/40"
                                    : isChosen
                                      ? "border-error bg-error-container/30"
                                      : "border-surface-container-high opacity-70"
                                : isChosen
                                  ? "border-primary bg-primary/10"
                                  : "border-surface-container-high bg-surface-container-lowest hover:bg-surface-container";
                            return (
                                <button
                                    key={`${i}-${option}`}
                                    type="button"
                                    role="radio"
                                    aria-checked={isChosen}
                                    onClick={() => void choose(option)}
                                    disabled={busy || revealed}
                                    className={`text-left p-space-sm min-h-11 rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone}`}
                                >
                                    <kbd className="text-label-sm text-outline mr-2">{i + 1}</kbd>
                                    <span lang={display.optionsLang} className={display.optionsLang ? "font-japanese text-title-md" : undefined}>
                                        {option}
                                    </span>
                                    {revealed && isCorrect && <span className="sr-only"> (đáp án đúng)</span>}
                                    {revealed && isChosen && !isCorrect && <span className="sr-only"> (bạn chọn, chưa đúng)</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Phản hồi từng câu (practice): vùng live để trình đọc màn hình đọc kết quả ngay */}
                <div aria-live="polite">{feedback && <FeedbackBlock q={current} feedback={feedback} chosen={chosen} />}</div>

                <FlagButton
                    q={current}
                    flagged={!!current.questionId && flaggedIds.has(current.questionId)}
                    onFlag={openFlag}
                />
                {flagNotice && flagNotice.questionId === current.questionId && (
                    <p role="status" className="text-label-md rounded-lg bg-primary/10 p-space-sm">
                        {flagNotice.text}
                    </p>
                )}

                {!isExam && !feedback && (
                    <button type="button" onClick={() => void skip()} disabled={busy} className={`${secondaryBtn} self-start`}>
                        Bỏ qua câu này
                    </button>
                )}

                {isExam && chosen && (
                    <button type="button" onClick={clearAnswer} className={`${secondaryBtn} self-start`}>
                        {current.inputMode === "typing" ? "Xoá câu trả lời" : "Xoá lựa chọn"}
                    </button>
                )}

                {isExam && (
                    <p aria-live="polite" className="text-label-sm text-on-surface-variant">
                        {saveState === "saving" && "Đang lưu..."}
                        {saveState === "saved" && "Đã lưu"}
                        {saveState === "error" && "Chưa lưu được một số đáp án. Đáp án vẫn được gửi lại khi nộp bài."}
                    </p>
                )}

                {confirmSubmit && unanswered > 0 && (
                    <p role="alert" className="text-label-md text-error">
                        Còn {unanswered} câu chưa làm (tính là sai). Bấm "Nộp bài" lần nữa để nộp.
                    </p>
                )}
                {notice && (
                    <p role="status" className="text-label-md rounded-lg bg-primary/10 p-space-sm">
                        {notice}
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-error text-label-md">
                        {error}{" "}
                        <button type="button" onClick={() => void finish()} disabled={busy} className="underline disabled:opacity-60">
                            Nộp lại
                        </button>
                    </p>
                )}
            </div>

            <FlagQuestionModal target={flagTarget} onClose={() => setFlagTarget(null)} onFlagged={onFlagged} />

            {/* Thanh hành động cố định ở đáy: dễ chạm bằng ngón cái trên điện thoại */}
            <div className="fixed bottom-0 inset-x-0 bg-surface/95 border-t border-surface-container-high px-gutter py-space-sm">
                <div className="max-w-2xl mx-auto flex items-center justify-between gap-space-sm">
                    {isExam ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                                disabled={index === 0}
                                className={secondaryBtn}
                            >
                                Câu trước
                            </button>
                            {isLast ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (unanswered > 0 && !confirmSubmit) setConfirmSubmit(true);
                                        else void finish();
                                    }}
                                    disabled={busy}
                                    className={primaryBtn}
                                >
                                    {busy ? "Đang nộp..." : "Nộp bài"}
                                </button>
                            ) : (
                                <div className="flex gap-space-sm">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (unanswered > 0 && !confirmSubmit) setConfirmSubmit(true);
                                            else void finish();
                                        }}
                                        disabled={busy}
                                        className={secondaryBtn}
                                    >
                                        Nộp bài
                                    </button>
                                    <button type="button" onClick={() => setIndex((i) => i + 1)} className={primaryBtn}>
                                        Câu sau
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <span className="text-label-sm text-on-surface-variant">
                                {feedback
                                    ? "Xem lời giải rồi sang câu tiếp"
                                    : current.inputMode === "typing"
                                      ? "Gõ cách đọc rồi nhấn Enter"
                                      : "Chọn một đáp án"}
                            </span>
                            {practiceDone && feedback ? (
                                <button ref={nextRef} type="button" onClick={() => void finish()} disabled={busy} className={primaryBtn}>
                                    {busy ? "Đang chấm..." : "Xem kết quả"}
                                </button>
                            ) : (
                                <button
                                    ref={nextRef}
                                    type="button"
                                    onClick={() =>
                                        setIndex((i) => {
                                            const n = attempt.questions.findIndex((q, k) => k > i && answers[q.cardId] === undefined);
                                            return n >= 0 ? n : Math.min(total - 1, i + 1);
                                        })
                                    }
                                    disabled={!feedback || isLast}
                                    className={primaryBtn}
                                >
                                    Câu tiếp
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default QuizPage;
