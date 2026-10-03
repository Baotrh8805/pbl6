import { apiClient } from "./apiClient.ts";
import { parseReviews, type Grade, type Review } from "../lib/srs.ts";
import type {
    Question,
    QuizAnswerResult,
    QuizAttemptState,
    QuizFeedback,
    QuizGrade,
    QuizMode,
    QuizQuestionState,
    QuizResult,
} from "../types/api.types.ts";

export const fetchReviews = async (): Promise<Record<string, Review>> =>
    parseReviews((await apiClient.get("/reviews")).data);

export const submitReview = async (cardId: string, grade: Grade): Promise<void> => {
    await apiClient.post("/reviews", { cardId, grade });
};

// Response là ranh giới không đáng tin: câu hỏi hỏng thì bỏ, không để trang trắng.
const isQuestion = (v: unknown): v is Question => {
    const q = v as Partial<Question> | null;
    return (
        !!q &&
        typeof q.cardId === "string" &&
        typeof q.term === "string" &&
        Array.isArray(q.options) &&
        q.options.length > 1 &&
        q.options.every((o) => typeof o === "string")
    );
};

export const parseQuestions = (raw: unknown): Question[] =>
    Array.isArray(raw) ? raw.filter(isQuestion) : [];

const parseFeedback = (raw: unknown): QuizFeedback | null => {
    const f = raw as Partial<QuizFeedback> | null;
    if (!f || typeof f.correctAnswer !== "string") return null;
    return {
        correct: f.correct === true,
        correctAnswer: f.correctAnswer,
        explanation: typeof f.explanation === "string" && f.explanation ? f.explanation : null,
    };
};

/** Response là ranh giới không đáng tin: trạng thái hỏng -> null (không dựng được lượt làm). */
export const parseAttemptState = (raw: unknown): QuizAttemptState | null => {
    const p = raw as Partial<QuizAttemptState> | null;
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const questions: QuizQuestionState[] = (Array.isArray(p.questions) ? p.questions : [])
        .filter(isQuestion)
        .map((q) => {
            const qs = q as Question & { chosen?: unknown; feedback?: unknown };
            return {
                cardId: qs.cardId,
                term: qs.term,
                reading: qs.reading ?? null,
                options: qs.options,
                chosen: typeof qs.chosen === "string" ? qs.chosen : null,
                feedback: parseFeedback(qs.feedback),
            };
        });
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
export const createQuizAttempt = async (deckId: string, size: number, mode: QuizMode): Promise<QuizAttemptState | null> =>
    parseAttemptState((await apiClient.post("/quiz-attempts", { deckId, size, mode })).data);

/** Lượt đang mở của bộ thẻ để đề nghị "Tiếp tục"; null nếu không có (204). */
export const fetchOpenQuizAttempt = async (deckId: string): Promise<QuizAttemptState | null> => {
    const res = await apiClient.get("/quiz-attempts/open", { params: { deckId } });
    return res.status === 204 ? null : parseAttemptState(res.data);
};

/** Khôi phục một lượt (đã nộp thì kèm đáp án đúng + lời giải để xem lại). */
export const fetchQuizAttempt = async (attemptId: string): Promise<QuizAttemptState | null> =>
    parseAttemptState((await apiClient.get(attemptUrl(attemptId))).data);

/**
 * Lưu đáp án một câu. practice: server khoá câu và trả phản hồi; exam: tự lưu, sửa được tới khi nộp.
 * option rỗng: practice = bỏ qua câu, exam = xoá đáp án.
 */
export const saveQuizAnswer = async (attemptId: string, cardId: string, option: string): Promise<QuizAnswerResult> => {
    const data = (await apiClient.put(`${attemptUrl(attemptId)}/answers/${encodeURIComponent(cardId)}`, { option })).data;
    return { feedback: parseFeedback(data?.feedback), answered: typeof data?.answered === "number" ? data.answered : 0 };
};

/** Nộp bài. Gọi lại an toàn (trả đúng kết quả cũ). answers: bản đầy đủ phía client để bù chỗ tự lưu chưa kịp tới. */
export const submitQuizAttempt = async (attemptId: string, answers?: Record<string, string>): Promise<QuizGrade> =>
    (await apiClient.post<QuizGrade>(`${attemptUrl(attemptId)}/submit`, answers ? { answers } : {})).data;

/** Câu hỏi mẫu để xem trước; không mở lượt làm bài. */
export const fetchQuizPreview = async (deckId: string, size = 2): Promise<Question[]> =>
    parseQuestions((await apiClient.get(`${quizUrl(deckId)}/preview`, { params: { size } })).data);

export const fetchQuizResults = async (): Promise<QuizResult[]> =>
    (await apiClient.get<QuizResult[]>("/quiz-results")).data;

export const fetchQuizResultCount = async (): Promise<number> => {
    const n = Number((await apiClient.get("/quiz-results/count")).data);
    return Number.isFinite(n) ? n : 0;
};
