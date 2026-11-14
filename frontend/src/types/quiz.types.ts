// Kiểu dữ liệu quiz đa loại + ngân hàng câu hỏi (hợp đồng API đợt 2, §1 — docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md).
// Tách khỏi api.types.ts để làn quiz không đụng các khối kiểu dùng chung; các interface ở đây MỞ RỘNG kiểu cũ
// (Question / QuizQuestionState / QuizFeedback / QuizAttemptState) nên nơi nào đang nhận kiểu cũ vẫn nhận được kiểu mới.
import type {
    AdminPage,
    Question,
    QuizAnswerResult,
    QuizAttemptState,
    QuizFeedback,
    QuizQuestionState,
} from "./api.types.ts";

/** QuestionState.type: loại câu hỏi người học thấy (chữ thường, snake_case như body questionTypes). */
export type QuizQuestionType = "meaning" | "kanji_lookalike" | "homophone" | "reading" | "conjugation";

/** choice = chọn một phương án; typing = tự gõ (options = []), server chuẩn hoá kana rồi so. */
export type QuizInputMode = "choice" | "typing";

/** GET /api/decks/{id}/quiz-capabilities: số thẻ dùng được cho từng loại (khoá camelCase). */
export interface QuizCapabilities {
    meaning: number;
    kanjiLookalike: number;
    homophone: number;
    reading: number;
    conjugation: number;
}

/** POST /api/decks/{id}/distractors */
export interface DistractorResult {
    updated: number;
    withLookalike: number;
    withHomophone: number;
}

/** Trường mới của QuestionState (đợt 2). Server cũ không gửi -> mặc định meaning / choice / null. */
export interface QuizQuestionMeta {
    type: QuizQuestionType;
    /** Câu hỏi hiển thị, vd. "Thể て của 書く (かく)"; null = câu nghĩa kiểu cũ (chỉ hiện từ). */
    prompt: string | null;
    inputMode: QuizInputMode;
    /** id trong ngân hàng câu hỏi để báo lỗi; null = câu sinh tức thời, không báo lỗi được. */
    questionId: string | null;
}

/** Câu hỏi xem trước (GET /quizzes/{deckId}/preview) kèm loại câu. */
export interface TypedQuestion extends Question, QuizQuestionMeta {}

/** Feedback đợt 2: thêm câu ví dụ (chỉ có ở câu chia thể). */
export interface TypedQuizFeedback extends QuizFeedback {
    example: string | null;
}

export interface TypedQuizQuestion extends QuizQuestionState, QuizQuestionMeta {
    feedback: TypedQuizFeedback | null;
}

export interface TypedQuizAttempt extends QuizAttemptState {
    questions: TypedQuizQuestion[];
}

export interface TypedQuizAnswer extends QuizAnswerResult {
    feedback: TypedQuizFeedback | null;
}

// ---------- báo lỗi câu hỏi (người học) ----------

export type QuestionFlagReason = "WRONG_ANSWER" | "BAD_DISTRACTOR" | "TYPO" | "OTHER";
export type QuestionFlagStatus = "OPEN" | "RESOLVED";

export interface QuestionFlagRequest {
    reason: QuestionFlagReason;
    /** Bắt buộc khi OTHER; ≤ 500 ký tự. */
    detail?: string;
}

/** 201 của POST /api/quiz-questions/{questionId}/flags */
export interface QuestionFlagCreated {
    id: number;
    status: QuestionFlagStatus;
}

// ---------- ngân hàng câu hỏi (admin G3) ----------

/** quiz_questions.kind (chữ hoa như cột DB). */
export type QuizQuestionKind = "MEANING" | "READING" | "KANJI_LOOKALIKE" | "HOMOPHONE" | "CONJUGATION";
export type QuizQuestionStatus = "ACTIVE" | "HIDDEN";
export type QuizQuestionGenerator = "RULE" | "AI";

export interface AdminQuestionRow {
    id: string;
    deckId: string;
    deckTitle: string | null;
    cardId: string;
    term: string;
    kind: QuizQuestionKind;
    prompt: string | null;
    /** [] với câu gõ (READING). */
    options: string[];
    correct: string;
    status: QuizQuestionStatus;
    flagCount: number;
    openFlags: number;
    generator: QuizQuestionGenerator | null;
    updatedAt: string | null;
}

export interface AdminQuestionFlag {
    id: number;
    userEmail: string;
    reason: QuestionFlagReason;
    detail: string | null;
    status: QuestionFlagStatus;
    createdAt: string;
    resolutionNote: string | null;
}

export interface AdminQuestionDetail extends AdminQuestionRow {
    flags: AdminQuestionFlag[];
}

/** PATCH /api/admin/questions/{id}: trường bỏ trống = giữ nguyên; correct ∈ options khi options không rỗng. */
export interface AdminQuestionPatch {
    prompt?: string;
    options?: string[];
    correct?: string;
}

/** Tham số lọc GET /api/admin/questions (chuỗi rỗng = không lọc). */
export interface AdminQuestionQuery {
    deckId?: string;
    kind?: QuizQuestionKind | "";
    flagged?: boolean;
    status?: QuizQuestionStatus | "";
    q?: string;
    page?: number;
    size?: number;
}

export type AdminQuestionPage = AdminPage<AdminQuestionRow>;
