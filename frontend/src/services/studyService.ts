import { apiClient } from "./apiClient.ts";
import { MAX_REACTION_MS, parseReviews, type Grade, type Review } from "../lib/srs.ts";
import type { QuizGrade, QuizMode, QuizResult, ReviewRequest } from "../types/api.types.ts";
import type {
    DistractorResult,
    QuestionFlagCreated,
    QuestionFlagRequest,
    QuizCapabilities,
    QuizQuestionType,
    TypedQuestion,
    TypedQuizAnswer,
    TypedQuizAttempt,
    TypedQuizFeedback,
    TypedQuizQuestion,
} from "../types/quiz.types.ts";
import { isQuestionType, parseCapabilities, parseDistractorResult } from "../features/quiz/quizUtils.ts";
import { parseReviewOutcome } from "../lib/moderation.ts";
import type { DeckRecall, ReviewOutcome } from "../types/moderation.types.ts";
import { isAxiosError } from "axios";

export const fetchReviews = async (): Promise<Record<string, Review>> =>
    parseReviews((await apiClient.get("/reviews")).data);

/** Tuỳ chọn khi chấm: cram = chỉ ghi log; reactionMs / pathId (lộ trình 2.0) chỉ vào review_logs, không đổi SRS. */
export interface SubmitReviewOptions {
    cram?: boolean;
    /** ms từ lúc hiện thẻ tới lúc chấm, 0..600000 (ngoài khoảng server trả 400 -> bỏ qua ở đây). */
    reactionMs?: number;
    pathId?: string;
}

/**
 * Lưu một lần chấm. Tham số thứ ba nhận boolean (cram, như 1.0) hoặc object tuỳ chọn để nơi gọi cũ không đổi.
 * reactionMs không hợp lệ (NaN, âm, quá MAX_REACTION_MS của lib/srs) thì không gửi: một số đo hỏng không được làm mất lượt chấm.
 */
export const submitReview = async (
    cardId: string,
    grade: Grade,
    options: boolean | SubmitReviewOptions = false
): Promise<ReviewOutcome | null> => {
    const opts: SubmitReviewOptions = typeof options === "boolean" ? { cram: options } : options;
    const body: ReviewRequest = { cardId, grade, cram: opts.cram ?? false };
    if (
        opts.reactionMs != null &&
        Number.isFinite(opts.reactionMs) &&
        opts.reactionMs >= 0 &&
        opts.reactionMs <= MAX_REACTION_MS
    ) {
        body.reactionMs = Math.round(opts.reactionMs);
    }
    if (opts.pathId) body.pathId = opts.pathId;
    // HLR (V38): response mang khoảng ôn + p nhớ trước lượt chấm + cờ phanh để StudyPage hiện một dòng; server cũ -> null
    return parseReviewOutcome((await apiClient.post("/reviews", body)).data);
};

/** Độ nhớ dự đoán của bộ thẻ (HLR): 503 (ai-service lỗi / tắt) hoặc response hỏng -> null, giao diện ẩn chip. */
export const fetchDeckRecall = async (deckId: string): Promise<DeckRecall | null> => {
    try {
        const d = (await apiClient.get(`/decks/${encodeURIComponent(deckId)}/recall`)).data as Partial<DeckRecall> | null;
        if (!d || typeof d.studied !== "number" || typeof d.cards !== "number") return null;
        return {
            cards: d.cards,
            studied: d.studied,
            avgRecall: typeof d.avgRecall === "number" ? d.avgRecall : null,
            forgettingSoon: typeof d.forgettingSoon === "number" ? d.forgettingSoon : 0,
            items: Array.isArray(d.items) ? (d.items as DeckRecall["items"]) : [],
        };
    } catch (err) {
        if (isAxiosError(err) && (err.response?.status === 503 || err.response?.status === 404)) return null;
        throw err;
    }
};

/**
 * Hoàn tác lượt chấm mới nhất của thẻ (lật / cram, trong 30 phút): server khôi phục lịch cũ từ nhật ký và xoá lượt đó.
 * 409 = không còn gì để hoàn tác (quá hạn, lượt quiz, lượt ghi trước khi có tính năng này).
 */
export const undoReview = async (cardId: string): Promise<void> => {
    await apiClient.post("/reviews/undo", { cardId });
};

// Response là ranh giới không đáng tin: câu hỏi hỏng thì bỏ, không để trang trắng.
// Đợt 2 (hợp đồng §1.2): câu gõ (inputMode = "typing") có options = [] nên KHÔNG được loại vì thiếu phương án;
// câu chọn vẫn cần ≥ 2 phương án như cũ. Server cũ không gửi type / inputMode -> câu nghĩa, chọn đáp án.
const toQuestion = (v: unknown): TypedQuestion | null => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const q = v as Record<string, unknown>;
    if (typeof q.cardId !== "string" || typeof q.term !== "string") return null;
    const type: QuizQuestionType = isQuestionType(q.type) ? q.type : "meaning";
    const noOptions = q.options == null || (Array.isArray(q.options) && q.options.length === 0);
    // Thiếu inputMode mà câu đọc không có phương án: chỉ có thể là câu gõ.
    const typing = q.inputMode === "typing" || (q.inputMode == null && type === "reading" && noOptions);
    let options: string[];
    if (typing) {
        if (q.options != null && !Array.isArray(q.options)) return null;
        options = [];
    } else {
        if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every((o) => typeof o === "string")) return null;
        options = q.options as string[];
    }
    const questionId =
        typeof q.questionId === "string" && q.questionId
            ? q.questionId
            : typeof q.questionId === "number"
              ? String(q.questionId)
              : null;
    return {
        cardId: q.cardId,
        term: q.term,
        reading: typeof q.reading === "string" && q.reading ? q.reading : null,
        options,
        type,
        prompt: typeof q.prompt === "string" && q.prompt.trim() ? q.prompt : null,
        inputMode: typing ? "typing" : "choice",
        questionId,
    };
};

export const parseQuestions = (raw: unknown): TypedQuestion[] =>
    Array.isArray(raw) ? raw.map(toQuestion).filter((q): q is TypedQuestion => q !== null) : [];

const parseFeedback = (raw: unknown): TypedQuizFeedback | null => {
    const f = raw as Partial<TypedQuizFeedback> | null;
    if (!f || typeof f.correctAnswer !== "string") return null;
    return {
        correct: f.correct === true,
        correctAnswer: f.correctAnswer,
        explanation: typeof f.explanation === "string" && f.explanation ? f.explanation : null,
        example: typeof f.example === "string" && f.example.trim() ? f.example : null,
    };
};

/** Response là ranh giới không đáng tin: trạng thái hỏng -> null (không dựng được lượt làm). */
export const parseAttemptState = (raw: unknown): TypedQuizAttempt | null => {
    const p = raw as Partial<TypedQuizAttempt> | null;
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const questions: TypedQuizQuestion[] = [];
    for (const item of Array.isArray(p.questions) ? (p.questions as unknown[]) : []) {
        const q = toQuestion(item);
        if (!q) continue;
        const extra = item as { chosen?: unknown; feedback?: unknown };
        questions.push({
            ...q,
            chosen: typeof extra.chosen === "string" ? extra.chosen : null,
            feedback: parseFeedback(extra.feedback),
        });
    }
    return {
        attemptId: typeof p.attemptId === "string" ? p.attemptId : null,
        deckId: typeof p.deckId === "string" ? p.deckId : "",
        mode: p.mode === "practice" ? "practice" : "exam",
        resumed: p.resumed === true,
        finished: p.finished === true,
        expired: p.expired === true,
        score: typeof p.score === "number" ? p.score : null,
        total: typeof p.total === "number" ? p.total : null,
        timeLimitSeconds: typeof p.timeLimitSeconds === "number" ? p.timeLimitSeconds : 0,
        expiresAt: typeof p.expiresAt === "string" ? p.expiresAt : null,
        serverNow: typeof p.serverNow === "string" ? p.serverNow : new Date().toISOString(),
        questions,
    };
};

const quizUrl = (deckId: string) => `/quizzes/${encodeURIComponent(deckId)}`;
const attemptUrl = (attemptId: string) => `/quiz-attempts/${encodeURIComponent(attemptId)}`;

/**
 * Mở lượt làm (practice | exam) hoặc tiếp tục lượt đang mở của bộ thẻ (resumed = true: giữ chế độ và đề cũ).
 * Chỉ gọi khi người dùng bấm bắt đầu.
 */
export const createQuizAttempt = async (
    deckId: string,
    size: number,
    mode: QuizMode,
    questionTypes?: readonly QuizQuestionType[]
): Promise<TypedQuizAttempt | null> =>
    parseAttemptState(
        (
            await apiClient.post("/quiz-attempts", {
                deckId,
                size,
                mode,
                // Không truyền (server chưa hỗ trợ loại câu) -> giữ đúng body cũ; server mặc định ["meaning"].
                ...(questionTypes && questionTypes.length > 0 ? { questionTypes } : {}),
            })
        ).data
    );

/** Lượt đang mở của bộ thẻ để đề nghị "Tiếp tục"; null nếu không có (204). */
export const fetchOpenQuizAttempt = async (deckId: string): Promise<TypedQuizAttempt | null> => {
    const res = await apiClient.get("/quiz-attempts/open", { params: { deckId } });
    return res.status === 204 ? null : parseAttemptState(res.data);
};

/** Khôi phục một lượt (đã nộp thì kèm đáp án đúng + lời giải để xem lại). */
export const fetchQuizAttempt = async (attemptId: string): Promise<TypedQuizAttempt | null> =>
    parseAttemptState((await apiClient.get(attemptUrl(attemptId))).data);

/**
 * Lưu đáp án một câu. practice: server khoá câu và trả phản hồi; exam: tự lưu, sửa được tới khi nộp.
 * option rỗng: practice = bỏ qua câu, exam = xoá đáp án. Câu gõ: option là chuỗi tự gõ (≤ 100), server chuẩn hoá kana.
 */
export const saveQuizAnswer = async (attemptId: string, cardId: string, option: string): Promise<TypedQuizAnswer> => {
    const data = (await apiClient.put(`${attemptUrl(attemptId)}/answers/${encodeURIComponent(cardId)}`, { option })).data;
    return { feedback: parseFeedback(data?.feedback), answered: typeof data?.answered === "number" ? data.answered : 0 };
};

/** Nộp bài. Gọi lại an toàn (trả đúng kết quả cũ). answers: bản đầy đủ phía client để bù chỗ tự lưu chưa kịp tới. */
export const submitQuizAttempt = async (attemptId: string, answers?: Record<string, string>): Promise<QuizGrade> =>
    (await apiClient.post<QuizGrade>(`${attemptUrl(attemptId)}/submit`, answers ? { answers } : {})).data;

/** Câu hỏi mẫu để xem trước; không mở lượt làm bài. */
export const fetchQuizPreview = async (deckId: string, size = 2): Promise<TypedQuestion[]> =>
    parseQuestions((await apiClient.get(`${quizUrl(deckId)}/preview`, { params: { size } })).data);

export const fetchQuizResults = async (): Promise<QuizResult[]> =>
    (await apiClient.get<QuizResult[]>("/quiz-results")).data;

export const fetchQuizResultCount = async (): Promise<number> => {
    const n = Number((await apiClient.get("/quiz-results/count")).data);
    return Number.isFinite(n) ? n : 0;
};

// ---------- quiz đa loại (hợp đồng API đợt 2, §1.2) ----------

const deckUrl = (deckId: string) => `/decks/${encodeURIComponent(deckId)}`;

/** Số thẻ dùng được cho từng loại câu; null = response hỏng (coi như server chưa hỗ trợ). 404/405 ném lỗi cho nơi gọi xử lý. */
export const fetchQuizCapabilities = async (deckId: string): Promise<QuizCapabilities | null> =>
    parseCapabilities((await apiClient.get(`${deckUrl(deckId)}/quiz-capabilities`)).data);

/**
 * Sinh câu nhiễu (kanji giống hình, từ đồng âm) cho cả bộ thẻ qua ai-service (EDITOR+; 503 khi ai-service tắt).
 * Một bộ thẻ lớn có thể mất hàng chục giây nên nới timeout riêng thay vì 15 s mặc định của apiClient.
 */
export const generateDistractors = async (deckId: string): Promise<DistractorResult> =>
    parseDistractorResult((await apiClient.post(`${deckUrl(deckId)}/distractors`, undefined, { timeout: 120_000 })).data);

/** Người học báo lỗi một câu trong ngân hàng (409: đã có báo cáo đang mở của mình; 429: quá 20 lần/giờ). */
export const flagQuizQuestion = async (questionId: string, body: QuestionFlagRequest): Promise<QuestionFlagCreated> => {
    const data = (await apiClient.post(`/quiz-questions/${encodeURIComponent(questionId)}/flags`, body)).data as
        | Partial<QuestionFlagCreated>
        | null;
    return { id: typeof data?.id === "number" ? data.id : 0, status: data?.status === "RESOLVED" ? "RESOLVED" : "OPEN" };
};
