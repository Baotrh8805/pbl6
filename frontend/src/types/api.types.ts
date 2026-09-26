// Kiểu dữ liệu khớp DTO backend (com.pbl6.flashcard.dto.*, model.*).
// Review (SRS) nằm ở lib/srs.ts cùng logic đọc lịch ôn.

/** DeckResponse.CardResponse */
export interface Card {
    id: string;
    term: string;
    reading: string | null;
    meaning: string;
    example: string | null;
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
    example?: string | null;
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

/** DeckService.QuizOutcome */
export interface QuizGrade {
    score: number;
    total: number;
    wrong: Record<string, string>; // cardId -> nghĩa đúng
}

/** model.QuizResult (10 kết quả gần nhất). */
export interface QuizResult {
    deckId: string;
    score: number;
    total: number;
    createdAt: string; // ISO
}
