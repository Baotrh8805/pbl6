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
    /** Thẻ sinh từ bóc tách AI mang thêm metadata; thẻ tạo tay để null. */
    level?: string | null;
    kind?: CardKind;
    /** Furigana từng đoạn kanji; null = chưa tách, Ruby hiện cách đọc cho cả từ. */
    readingSegments?: ReadingSegment[] | null;
    hanViet?: string | null;
}

export type CardKind = "vocab" | "grammar";

/** Một đoạn kanji + kana tương ứng (kana === kanji khi đoạn là chữ không cần ruby). */
export interface ReadingSegment {
    kanji: string;
    kana: string;
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
    /** Pass-through để PUT deck không xoá metadata của thẻ sinh từ bóc tách AI. */
    level?: string | null;
    kind?: CardKind;
    readingSegments?: ReadingSegment[] | null;
    hanViet?: string | null;
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

// ===== Bóc tách tài liệu -> flashcard (ExtractionController, /api/extractions) =====

export type ExtractionLevelFilter = "all" | "at_or_above" | "only_unknown_to_me";
export type ExtractionMeaningLang = "vi" | "en";
export type ExtractionUnknownPolicy = "above" | "drop";
export type ExtractionOcrMode = "auto" | "vertical" | "horizontal";
/** auto: ai-service tự nhận dạng; list: mỗi dòng một cụm + nghĩa in sẵn; prose: tách từng từ. */
export type ExtractionExtractMode = "auto" | "list" | "prose";

/** Tuỳ chọn người dùng, backend lưu và chuyển nguyên vẹn sang ai-service. */
export interface ExtractionOptions {
    /** N5..N1; backend mặc định User.jlptLevel. */
    userLevel: string;
    levelFilter: ExtractionLevelFilter;
    includeGrammar: boolean;
    includeFurigana: boolean;
    includeHanViet: boolean;
    meaningLang: ExtractionMeaningLang;
    /** above: giữ từ không rõ cấp (level=null); drop: bỏ. */
    treatUnknownAs: ExtractionUnknownPolicy;
    minFrequency: number;
    /** Chỉ ảnh hưởng ảnh / PDF scan. */
    ocrMode: ExtractionOcrMode;
    /** Bố cục tài liệu: danh sách từ vựng (cụm + nghĩa in sẵn) hay văn xuôi. */
    extractMode: ExtractionExtractMode;
}

export type ExtractionStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
export type ExtractionStage = "QUEUED" | "TEXT" | "ANALYZE" | "ENRICH" | "DONE";
export type ExtractionSourceType = "text" | "txt" | "docx" | "pdf" | "image";

/** Kết quả bước TEXT (OCR / đọc file). meanConfidence, isVertical = null khi không phải OCR. */
export interface ExtractionTextMeta {
    sourceType: ExtractionSourceType;
    engine: string;
    meanConfidence: number | null;
    isVertical: boolean | null;
    pages: number;
    lowConfidence: boolean;
    truncated: boolean;
    /** Dòng OCR Tesseract có confidence < 0.75 (tối đa 50), theo thứ tự trong văn bản; không có khi đọc file/Gemini. */
    lowLines?: { text: string; conf: number }[];
    /** Chỉ có khi OCR kém mà Gemini không chép lại được: quota | no_api_key | error. */
    geminiError?: string;
}

/** Thống kê bước ANALYZE; byLevel có khoá N5..N1 và "unknown". */
export interface ExtractionStats {
    vocab: number;
    grammar: number;
    byLevel: Record<string, number>;
    sentences: number;
    tokens: number;
    /** false khi bước dịch nghĩa tiếng Việt không chạy được; enrichReason: quota | no_api_key | error. */
    enriched?: boolean;
    enrichReason?: string;
    /** ISO thời điểm "Dịch lại nghĩa" gần nhất (POST /{id}/enrich); backend chặn gọi lại trong 5 phút. */
    enrichedAt?: string;
    /** Bố cục ai-service nhận dạng: list = danh sách từ vựng (mỗi dòng một cụm), prose = văn xuôi. */
    layout?: "list" | "prose";
    /** Lộ trình (splitChapters): có nhận ra chương theo cấu trúc không; chapters[] = số thẻ mỗi chương. */
    chaptersDetected?: boolean;
    chapters?: { index: number; title: string | null; vocab: number; grammar: number }[];
    /** Phần đầu / cuối sách đã bỏ khi tách chương (mục lục, lời nói đầu, phụ lục...). */
    skippedSections?: string[];
}

/** ExtractionJobResponse */
export interface ExtractionJob {
    id: string;
    sourceType: ExtractionSourceType;
    sourceName: string | null;
    status: ExtractionStatus;
    stage: ExtractionStage;
    options: ExtractionOptions;
    textMeta: ExtractionTextMeta | null;
    stats: ExtractionStats | null;
    /** Bộ thẻ đã tạo từ job này. */
    deckIds: string[];
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    /** Chỉ có khi gọi ?includeText=true. */
    extractedText?: string | null;
}

/** ExtractionItemResponse: một từ vựng / mẫu ngữ pháp đã bóc tách. */
export interface ExtractionItem {
    id: string;
    kind: CardKind;
    /** Thứ tự xuất hiện đầu tiên (1-based). */
    position: number;
    /** Lemma (dạng từ điển) hoặc tên mẫu ngữ pháp. */
    term: string;
    /** Dạng gặp trong văn bản; null với ngữ pháp. */
    surface: string | null;
    reading: string | null;
    readingSegments: ReadingSegment[] | null;
    hanViet: string | null;
    pos: string | null;
    meaningEn: string | null;
    meaningVi: string | null;
    /** N5..N1 hoặc null = không rõ. */
    level: string | null;
    levelConfidence: number;
    /** VD: ["jlpt_list:N4", "jlpt_list:N3"] -> tooltip giải thích cấp mơ hồ. */
    levelSources: string[];
    frequency: number;
    example: string | null;
    exampleVi: string | null;
    selected: boolean;
}

/** PATCH /extractions/{id}/items: chỉ gửi trường cần đổi. */
export interface ExtractionItemPatch {
    id: string;
    selected?: boolean;
    term?: string;
    reading?: string | null;
    meaningVi?: string | null;
    meaningEn?: string | null;
    level?: string | null;
}

/** Thông tin bộ thẻ sẽ tạo cho một loại item (từ vựng / ngữ pháp). */
export interface ExtractionDeckSpec {
    title: string;
    folderId: string | null;
    /** null = backend lấy cấp phổ biến nhất trong các item đã chọn. */
    level: string | null;
}

/** POST /extractions/{id}/decks: null = không tạo bộ thẻ cho loại đó. */
export interface CreateDecksFromExtractionDto {
    vocab: ExtractionDeckSpec | null;
    grammar: ExtractionDeckSpec | null;
}

// ===== Lộ trình học tập (/api/learning-paths) =====
export type LearningPathStatus = "PROCESSING" | "DRAFT" | "ACTIVE" | "FAILED";

export interface LearningPathJob {
    status: ExtractionStatus;
    stage: ExtractionStage;
    errorMessage: string | null;
    stats?: ExtractionStats | null;
}

export interface LearningPathChapter {
    id: string;
    position: number;
    title: string;
    deckId: string | null;
    deckDeleted?: boolean;
    cardCount: number;
    vocabCount?: number;
    grammarCount?: number;
    dayFrom: number;
    dayTo: number;
    perDay: number;
}

export interface LearningPathTask {
    chapterId: string;
    chapterTitle?: string;
    deckId: string | null;
    fromPos: number;
    toPos: number;
}

export interface LearningPathDay {
    dayIndex: number;
    date: string;
    tasks: LearningPathTask[];
}

export interface LearningPathToday {
    date: string;
    dayIndex: number;
    state: "before" | "during" | "after";
    tasks: LearningPathTask[];
}

export interface LearningPath {
    id: string;
    title: string;
    status: LearningPathStatus;
    sourceType: ExtractionSourceType;
    sourceName: string | null;
    totalDays: number;
    startDate: string;
    chaptersDetected: boolean | null;
    jobId: string | null;
    folderId: string | null;
    createdAt: string;
    activatedAt: string | null;
    errorMessage: string | null;
    job: LearningPathJob | null;
    chapters?: LearningPathChapter[];
    today?: LearningPathToday | null;
    days?: LearningPathDay[];
}

export interface LearningPathPatch {
    title?: string;
    totalDays?: number;
    startDate?: string;
}

export interface ActivateLearningPathDto {
    startDate?: string;
    totalDays?: number;
}

export interface CreateLearningPathInput {
    file?: File;
    text?: string;
    days: number;
    title?: string;
    startDate?: string;
    options: ExtractionOptions;
}

// ---------- Admin Panel (dto.admin.*) ----------

export type Role = "USER" | "VIEWER" | "ADMIN" | "SUPER_ADMIN";

/** AdminPage<T>: trang kết quả dùng chung cho mọi danh sách admin. */
export interface AdminPage<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
}

export interface AdminStats {
    users: { total: number; new7d: number; new30d: number; locked: number; premium: number; active7d: number };
    decks: { total: number; public: number; official: number };
    cards: number;
    extractions: { total: number; done: number; failed: number; running: number };
    quizAttempts: number;
    learningPaths: number;
    openReports: number;
    series: { date: string; newUsers: number; extractions: number; quizzes: number }[];
}

export interface AdminHealth {
    db: string;
    aiService: "ok" | "down";
    version: string;
}

export interface AdminUserRow {
    id: number;
    email: string;
    fullName: string | null;
    role: Role;
    isPremium: boolean | null;
    lockedAt: string | null;
    createdAt: string | null;
    deckCount: number;
}

export interface AdminUserDetail extends AdminUserRow {
    jlptLevel: string | null;
    extractionDailyLimit: number | null;
    cardCount: number;
    extractionCount: number;
    extractionsToday: number;
    quizCount: number;
    lastReviewAt: string | null;
    activeSessions: number;
}

/** Trường bỏ trống = giữ nguyên; clearLimit = bỏ hạn mức riêng. */
export interface AdminUserPatch {
    locked?: boolean;
    premium?: boolean;
    extractionDailyLimit?: number;
    clearLimit?: boolean;
}

export interface AdminDeckRow {
    id: string;
    title: string;
    level: string;
    category: string | null;
    ownerId: number;
    ownerEmail: string;
    visibility: DeckVisibility;
    official: boolean;
    featured: boolean;
    cardCount: number;
    avgStars: number | null;
    downloads: number;
    openReports: number;
}

/** cards = null khi bộ thẻ private và không bị báo cáo. */
export interface AdminDeckDetail extends AdminDeckRow {
    cards: Card[] | null;
}

export interface AdminRatingRow {
    id: number;
    deckId: string;
    deckTitle: string;
    userId: number;
    userEmail: string;
    stars: number;
    comment: string | null;
    updatedAt: string;
}

export interface AdminExtractionRow {
    job: ExtractionJob;
    userId: number;
    userEmail: string;
    purpose: "extraction" | "learning_path";
}

export type ReportReason = "WRONG_CONTENT" | "COPYRIGHT" | "OFFENSIVE" | "SPAM" | "OTHER";
export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type ReportAction = "NONE" | "UNPUBLISH_DECK" | "CLEAR_COMMENT";

export interface ContentReport {
    id: number;
    deckId: string;
    deckTitle: string | null;
    deckVisibility: DeckVisibility | null;
    reporterId: number;
    reporterEmail: string;
    reason: ReportReason;
    detail: string | null;
    status: ReportStatus;
    action: ReportAction | null;
    resolutionNote: string | null;
    resolvedByEmail: string | null;
    resolvedAt: string | null;
    createdAt: string;
    sameDeckOpen: number;
}

export interface AuditLog {
    id: number;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    detail: Record<string, unknown> | null;
    createdAt: string;
}

/** Khoá JSON = khoá app_settings. */
export interface AdminSettings {
    extraction_daily_limit_free: number;
    extraction_daily_limit_premium: number;
    announcement: string;
    registration_open: boolean;
    updatedAt?: string | null;
}
