import { apiClient } from "./apiClient.ts";
import { parseReviews, type Grade, type Review } from "../lib/srs.ts";
import type { Question, QuizGrade, QuizResult } from "../types/api.types.ts";

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

export const fetchQuiz = async (deckId: string, size = 10): Promise<Question[]> =>
    parseQuestions((await apiClient.get(`/quizzes/${encodeURIComponent(deckId)}`, { params: { size } })).data);

export const submitQuiz = async (deckId: string, answers: Record<string, string>): Promise<QuizGrade> =>
    (await apiClient.post<QuizGrade>(`/quizzes/${encodeURIComponent(deckId)}`, answers)).data;

export const fetchQuizResults = async (): Promise<QuizResult[]> =>
    (await apiClient.get<QuizResult[]>("/quiz-results")).data;
