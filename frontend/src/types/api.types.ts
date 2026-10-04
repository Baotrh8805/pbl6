// Kiểu dữ liệu khớp DTO backend (com.pbl6.flashcard.dto.*, model.*).
// Review (SRS) nằm ở lib/srs.ts cùng logic đọc lịch ôn.

/** DeckResponse.CardResponse */
export interface Card {
    id: string;
    term: string;
    reading: string | null;
    /** Nội dung nhiều dòng: định nghĩa, ví dụ, ghi chú. Dòng đầu = định nghĩa chính (Quiz dùng làm đáp án). */
    meaning: string;
    position?: number | null;
}

/** DeckResponse */
export interface Deck {
    id: string;
    title: string;
    level: string;
    description: string | null;
    cards: Card[];
    ownerId?: number | null;
    /** Chỉ chủ bộ thẻ thấy thư mục (thư mục là cách chủ sắp xếp). */
    folderId?: string | null;
    /** Quyền của người đang đăng nhập trên bộ thẻ này. */
    access: DeckAccess;
    visibility: DeckVisibility;
    category?: string | null;
}

/** owner: toàn quyền; editor (được chia sẻ): sửa thông tin và thẻ; viewer: xem/học (public hoặc được chia sẻ). */
export type DeckAccess = "owner" | "editor" | "viewer";
export type DeckVisibility = "private" | "public";

/** DeckRequest.Card */
export interface CardDto {
    /** Có khi sửa thẻ đã tồn tại: backend khớp theo id để giữ lịch sử ôn SRS. */
    id?: string;
    term: string;
    reading?: string | null;
    meaning: string;
}

/** DeckRequest (dùng chung cho POST và PUT /decks). */
export interface DeckDto {
    title: string;
    level: string;
    description?: string;
    folderId?: string | null;
    /** Bỏ trống khi sửa = giữ nguyên. Chỉ chủ bộ thẻ đổi được. */
    visibility?: DeckVisibility;
    category?: string;
    cards?: CardDto[];
}

/** DeckShareRepository.Member */
export interface DeckMember {
    userId: number;
    email: string;
    fullName: string | null;
    permission: SharePermission;
}

export type SharePermission = "VIEWER" | "EDITOR";

/** LibraryDeckResponse: số liệu tính từ dữ liệu thật ở backend. */
export interface LibraryDeck {
    id: string;
    title: string;
    level: string;
    description: string | null;
    category: string | null;
    official: boolean;
    featured: boolean;
    authorName: string;
    /** Bộ thẻ của chính mình (không tự chấm sao được). */
    mine: boolean;
    cardsCount: number;
    downloadsCount: number;
    quizCount: number;
    /** null = chưa có đánh giá */
    rating: number | null;
    ratingsCount: number;
    myRating: number | null;
}

/** LibraryDeckResponse.Page */
export interface LibraryPage {
    items: LibraryDeck[];
    total: number;
    page: number;
    size: number;
    allCount: number;
    featured: { deck: LibraryDeck; sampleCard: Card | null } | null;
}

/** LibraryDeckResponse.Rating */
export interface LibraryRating {
    rating: number | null;
    ratingsCount: number;
    myRating: number;
}

/** DeckRatingsResponse.Item */
export interface DeckRatingItem {
    displayName: string;
    stars: number;
    comment: string | null;
    updatedAt: string;
    mine: boolean;
}

/** DeckRatingsResponse: tổng hợp + đánh giá của mình (null nếu chưa chấm) + một trang đánh giá */
export interface DeckRatings {
    rating: number | null;
    ratingsCount: number;
    mine: { stars: number; comment: string | null } | null;
    items: DeckRatingItem[];
    page: number;
    size: number;
}

/** FolderResponse */
export interface FolderNode {
    id: string;
    title: string;
    description?: string | null;
    level?: string | null;
    accessType?: string | null;
    isPinned?: boolean;
    metadata?: string | null;
    parentId?: string | null;
    children?: FolderNode[];
    /** owner: thư mục của mình; viewer: người khác chia sẻ / public (chỉ xem & học). */
    access?: "owner" | "viewer";
    /** Tên chủ thư mục, chỉ có khi access = viewer. */
    ownerName?: string | null;
}

/** FolderShareRepository.Member: người được xem thư mục. */
export interface FolderMember {
    userId: number;
    email: string;
    fullName: string | null;
}

export type FolderAccess = "private" | "shared" | "public";

/** FolderRequest */
export interface FolderDto {
    title: string;
    description?: string;
    /** Backend chỉ nhận N1..N5. */
    level?: string;
    accessType?: FolderAccess;
    isPinned?: boolean;
    parentId?: string | null;
}

/** QuizService.Question: không chứa đáp án đúng. */
export interface Question {
    cardId: string;
    term: string;
    reading: string | null;
    options: string[];
}

/** practice = làm từng câu (thấy đáp án ngay); exam = làm hết bài rồi nộp. */
export type QuizMode = "practice" | "exam";

/** QuizAttemptDtos.Feedback: chỉ có khi server cho phép xem đáp án câu đó. */
export interface QuizFeedback {
    correct: boolean;
    correctAnswer: string;
    /** Phần nội dung thẻ sau dòng đầu (định nghĩa phụ, ví dụ, ghi chú). */
    explanation: string | null;
}

/** QuizAttemptDtos.QuestionState: chosen = đáp án đã lưu ở server ("" = bỏ qua). */
export interface QuizQuestionState extends Question {
    chosen: string | null;
    feedback: QuizFeedback | null;
}

/**
 * QuizAttemptDtos.AttemptState: toàn bộ trạng thái một lượt làm (server là nguồn sự thật).
 * attemptId = null: bộ thẻ trống. timeLimitSeconds = 0: không giới hạn giờ.
 */
export interface QuizAttemptState {
    attemptId: string | null;
    deckId: string;
    mode: QuizMode;
    resumed: boolean;
    finished: boolean;
    expired: boolean;
    score: number | null;
    total: number | null;
    timeLimitSeconds: number;
    expiresAt: string | null; // ISO
    serverNow: string; // ISO
    questions: QuizQuestionState[];
}

/** QuizAttemptDtos.AnswerResponse */
export interface QuizAnswerResult {
    feedback: QuizFeedback | null;
    answered: number;
}

/** DeckService.QuizOutcome */
export interface QuizGrade {
    score: number;
    total: number;
    wrong: Record<string, string>; // cardId -> nghĩa đúng
    /** Nộp sau hạn giờ: bài không được chấm, ghi 0 điểm. */
    expired?: boolean;
}

/** model.QuizResult (10 kết quả gần nhất). */
export interface QuizResult {
    deckId: string;
    /** QuizResultRepository.View: có sẵn tên, kể cả bộ thẻ Thư viện không nằm trong "Bộ thẻ của tôi". */
    deckTitle?: string;
    score: number;
    total: number;
    /** Bản ghi cũ không có mode: coi là exam. */
    mode?: QuizMode;
    createdAt: string; // ISO
}
