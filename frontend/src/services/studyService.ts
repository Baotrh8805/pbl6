import { apiClient } from "./apiClient.ts";
import { parseReviews, type Grade, type Review } from "../lib/srs.ts";
import type { Question, QuizGrade, QuizPaper, QuizResult } from "../types/api.types.ts";

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

export const parseQuizPaper = (raw: unknown): QuizPaper => {
    const p = (raw ?? {}) as Partial<QuizPaper>;
    return {
        attemptId: typeof p.attemptId === "string" ? p.attemptId : null,
        timeLimitSeconds: typeof p.timeLimitSeconds === "number" ? p.timeLimitSeconds : 0,
        questions: parseQuestions(p.questions),
    };
};

const quizUrl = (deckId: string) => `/quizzes/${encodeURIComponent(deckId)}`;

/** Phát đề và mở lượt làm bài có hạn giờ ở server (bỏ dở = 0 điểm). Chỉ gọi khi người dùng bấm bắt đầu. */
export const fetchQuiz = async (deckId: string, size = 10): Promise<QuizPaper> =>
    parseQuizPaper((await apiClient.get(quizUrl(deckId), { params: { size } })).data);

/** Câu hỏi mẫu để xem trước; không mở lượt làm bài. */
export const fetchQuizPreview = async (deckId: string, size = 2): Promise<Question[]> =>
    parseQuestions((await apiClient.get(`${quizUrl(deckId)}/preview`, { params: { size } })).data);

/** Nộp đúng lượt làm đã phát; câu bỏ trống được tính là sai. */
export const submitQuiz = async (
    deckId: string,
    attemptId: string,
    answers: Record<string, string>
): Promise<QuizGrade> => (await apiClient.post<QuizGrade>(quizUrl(deckId), { attemptId, answers })).data;

export const fetchQuizResults = async (): Promise<QuizResult[]> =>
    (await apiClient.get<QuizResult[]>("/quiz-results")).data;

export const fetchQuizResultCount = async (): Promise<number> => {
    const n = Number((await apiClient.get("/quiz-results/count")).data);
    return Number.isFinite(n) ? n : 0;
};
