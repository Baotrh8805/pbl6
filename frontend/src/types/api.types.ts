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

/** Cấp JLPT (N5 dễ nhất -> N1 khó nhất); cùng tập giá trị với JLPT_LEVELS trong lib/deckUtils.ts. */
export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

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
    /**
     * B6 – phân bố cấp toàn tài liệu: đếm mọi ứng viên TRƯỚC khi áp levelFilter / treatUnknownAs / minFrequency / cap
     * (từ vựng + ngữ pháp, một term đếm một lần). Job cũ không có các khoá này -> client rơi về byLevel (sau lọc).
     */
    byLevelAll?: Record<JlptLevel | "unknown", number>;
    byLevelAllVocab?: Record<JlptLevel | "unknown", number>;
    byLevelAllGrammar?: Record<JlptLevel | "unknown", number>;
    /** % mỗi cấp trên ứng viên có cấp, làm tròn 0.1 (tổng ≈ 100); không có ứng viên có cấp -> toàn 0. */
    levelPct?: Record<JlptLevel, number>;
    /** Cấp L thấp nhất (N5 -> N1) sao cho N5..L gom ≥ 80 % từ vựng có cấp; dưới 10 từ có cấp -> null. */
    overallLevel?: JlptLevel | null;
    /** Tên quy tắc tính overallLevel ("cumulative80") để client không phải đoán. */
    overallRule?: string;
    /** Cap từ vựng chia theo chương (LP-17); chỉ có khi tách được ≥ 2 chương. */
    capPerChapter?: { index: number; cap: number; candidates: number; kept: number }[];
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
    // ----- 2.0 (chỉ ACTIVE; NON_NULL nên thiếu ở DRAFT) -----
    /** Thẻ đã học (có ít nhất một lần chấm) / đã thuộc (khoảng ôn ≥ 21 ngày). */
    learned?: number;
    mastered?: number;
    state?: LearningPathChapterState;
    /** Điểm quiz exam cao nhất (%) trên bộ của chương; quizPassedAt khi đạt ngưỡng (mặc định 80 %). */
    quizBestPct?: number | null;
    quizPassedAt?: string | null;
}

/**
 * locked = chưa tới ngày; current = đang trong dải ngày; open = qua dải mà còn thẻ chưa học (nợ); review = học hết nhưng chưa
 * qua kiểm tra; passed = đã qua kiểm tra chương; empty = không còn thẻ nào trong lịch (thẻ / bộ thẻ bị xoá) mà chưa qua (spec §7
 * "trống" — không có gì để học hay kiểm tra).
 */
export type LearningPathChapterState = "locked" | "current" | "open" | "review" | "passed" | "empty";

export interface LearningPathTask {
    chapterId: string;
    chapterTitle?: string;
    deckId: string | null;
    fromPos: number;
    toPos: number;
    /** 2.0: số thẻ và id thẻ của việc (lịch theo thẻ, không theo vị trí); cardIds là nguồn đúng. */
    count?: number;
    cardIds?: string[];
}

export interface LearningPathDay {
    dayIndex: number;
    date: string;
    tasks: LearningPathTask[];
}

/** rest (2.0) = hôm nay là ngày nghỉ theo `studyDays`; dayIndex khi đó = ngày học cuối trước đó. */
export type LearningPathTodayState = "before" | "during" | "rest" | "after";

export interface LearningPathToday {
    date: string;
    dayIndex: number;
    state: LearningPathTodayState;
    tasks: LearningPathTask[];
    /** 2.0: thẻ mới hôm nay / đến hạn ôn / nợ (đã qua ngày mà chưa học). Thiếu ở response 1.0. */
    newCount?: number;
    dueCount?: number;
    behindCount?: number;
}

export interface LearningPath {
    id: string;
    title: string;
    status: LearningPathStatus;
    /** "remedial" = lộ trình bổ khuyết dựng từ điểm yếu (không có job / tài liệu nguồn). */
    sourceType: LearningPathSourceType;
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
    // ----- 2.0 -----
    /** Trần tải (thẻ mới + ôn dự báo) mỗi ngày, 5..200. */
    dailyCap?: number;
    /** 7 ký tự 0/1 cho Thứ 2..Chủ nhật; "1111111" = học cả tuần. */
    studyDays?: string;
    reminder?: boolean;
    completedAt?: string | null;
    lastRebalancedAt?: string | null;
    /** ACTIVE: hai thước đo tiến độ (đã học / đã thuộc) + chương đã qua kiểm tra. */
    completion?: LearningPathCompletion | null;
    /** GET /{id} khi ACTIVE: ngưỡng % qua bài kiểm tra chương (Admin > Cấu hình, mặc định 80) cho nhãn "Chưa đạt N%". */
    quizPassPct?: number;
    /** GET /{id} khi ACTIVE: dự báo tải từng ngày (biểu đồ khối lượng). */
    forecast?: LearningPathForecastDay[];
    /** DRAFT: số ngày gợi ý từ số thẻ & trần; overCap = lịch với totalDays hiện tại vượt trần. */
    suggestedDays?: number;
    overCap?: boolean;
    /** Chỉ ở response activate / PATCH / rebalance: lịch không xếp vừa trần (gợi ý tăng ngày hoặc trần). */
    overflow?: boolean;
}

export interface LearningPathPatch {
    title?: string;
    totalDays?: number;
    startDate?: string;
    // 2.0: đổi dailyCap/studyDays ở ACTIVE -> server xếp lại thẻ chưa học
    dailyCap?: number;
    studyDays?: string;
    reminder?: boolean;
}

export interface ActivateLearningPathDto {
    startDate?: string;
    totalDays?: number;
    dailyCap?: number;
    studyDays?: string;
}

export interface CreateLearningPathInput {
    file?: File;
    text?: string;
    days: number;
    title?: string;
    startDate?: string;
    options: ExtractionOptions;
    dailyCap?: number;
    studyDays?: string;
}

// ----- Lộ trình 2.0: tiến độ, dự báo, phiên học hợp nhất, tóm tắt hôm nay -----

export interface LearningPathCompletion {
    total: number;
    learned: number;
    mastered: number;
    /** floor(100 * x / total). */
    learnedPct: number;
    masteredPct: number;
    chaptersPassed: number;
    /**
     * Chương đã qua hoặc có bài kiểm tra tính được — không đếm chương "empty" (hết thẻ, chưa qua) và chương mà bộ thẻ không ra đủ
     * min(10, số thẻ) câu nghĩa (1 thẻ, mọi thẻ cùng một nghĩa), nên chaptersPassed tới được số này.
     */
    chaptersTotal: number;
    /** completedAt đã đặt, hoặc đã học hết thẻ (UI mời bấm "Hoàn thành"). */
    done: boolean;
}

export interface LearningPathForecastDay {
    dayIndex: number;
    date: string;
    newCount: number;
    newWeight?: number;
    /** Có thể lẻ (× retention 0.9). */
    predictedReviews: number;
    load: number;
    overCap: boolean;
}

/** GET /{id}/session?kind=: today = đến hạn -> nợ -> mới; catchup = mọi thẻ nợ; due = mọi thẻ đến hạn; chapter = cả chương. */
export type SessionKind = "today" | "catchup" | "due" | "chapter";

/** new = chưa chấm lần nào; due = đến hạn ôn; cram = đã ôn nhưng chưa đến hạn (chỉ ghi log, không đổi SRS). */
export type SessionCardMode = "new" | "due" | "cram";

export interface SessionCard {
    cardId: string;
    deckId: string;
    chapterId?: string;
    chapterTitle?: string;
    term: string;
    reading: string | null;
    readingSegments: ReadingSegment[] | null;
    meaning: string;
    hanViet: string | null;
    level: string | null;
    kind: CardKind;
    mode: SessionCardMode;
}

export interface SessionCounts {
    new: number;
    due: number;
    catchup: number;
    total: number;
}

export interface SessionResponse {
    kind: SessionKind;
    date: string;
    dayIndex: number;
    state: LearningPathTodayState;
    counts: SessionCounts;
    cards: SessionCard[];
}

/**
 * GET /learning-paths/today-summary: một dòng cho mỗi lộ trình ACTIVE (badge sidebar, widget Tổng quan). LP-10: lộ trình đã
 * xong vẫn ACTIVE nên vẫn có dòng — done = đã chốt hoặc học hết thẻ (server xếp các dòng này cuối), completedAt chỉ có khi
 * đã chốt hoàn thành.
 */
export interface TodaySummaryItem {
    pathId: string;
    title: string;
    dayIndex: number;
    totalDays: number;
    state: LearningPathTodayState;
    newCount: number;
    dueCount: number;
    behindCount: number;
    studyDays?: string;
    dailyCap?: number;
    completedAt?: string;
    done?: boolean;
}

/**
 * POST /reviews (ReviewRequest). cram: chỉ ghi log, không đổi lịch. 2.0: reactionMs (0..600000, từ lúc hiện thẻ
 * tới lúc chấm) và pathId chỉ ghi vào review_logs để phân tích, không đổi SRS.
 */
export interface ReviewRequest {
    cardId: string;
    grade: "again" | "hard" | "good" | "easy";
    cram?: boolean;
    reactionMs?: number;
    pathId?: string;
}

// ---------- Admin Panel (dto.admin.*) ----------

export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

/** AdminPage<T>: trang kết quả dùng chung cho mọi danh sách admin. */
export interface AdminPage<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
}

export interface AdminStats {
    users: {
        total: number;
        new7d: number;
        new30d: number;
        locked: number;
        premium: number;
        active7d: number;
        /** Staff chưa đổi mật khẩu seed. */
        staffPendingSetup: number;
    };
    decks: { total: number; public: number; official: number };
    cards: number;
    extractions: { total: number; done: number; failed: number; running: number };
    quizAttempts: number;
    /** Tổng số lộ trình (mọi trạng thái); phân rã theo trạng thái ở learningPathBreakdown. */
    learningPaths: number;
    openReports: number;
    series: { date: string; newUsers: number; extractions: number; quizzes: number }[];
    // ----- Hợp đồng API đợt 2 (§1.3, §4, §6, §8): thiếu khi backend chưa trả -> dashboard ẩn phần tương ứng -----
    /** Mẹo nhớ bộ thủ chờ duyệt (G2). */
    pendingMnemonics?: number;
    /** Khiếu nại tài khoản đang mở (G1). */
    openAppeals?: number;
    /** Báo lỗi câu hỏi quiz đang mở (G3). */
    openQuestionFlags?: number;
    /** Hiệu suất AI theo engine đọc văn bản + bước dịch nghĩa (G6). */
    ai?: AdminAiStats;
    /** Chuỗi OCR theo ngày, đủ `days` phần tử như series. */
    ocrSeries?: AdminOcrPoint[];
    /** Cờ dữ liệu / thành phần của ai-service (có thể nằm ở đây hoặc ở GET /admin/health). */
    health?: { engines?: AdminEngineFlags };
    /** Lộ trình 2.0 theo trạng thái (spec §4.5); backend bỏ trường khi null (NON_NULL) -> thẻ "Lộ trình học tập" tự ẩn. */
    learningPathBreakdown?: AdminLearningPathBreakdown;
}

/**
 * AdminStatsResponse.LearningPathBreakdown: active = ACTIVE chưa chốt hoàn thành; completed = đã chốt (completed_at, vẫn ACTIVE);
 * failed / draft theo status; PROCESSING không đếm riêng (tổng các mục có thể nhỏ hơn learningPaths); remedial = lộ trình bổ khuyết,
 * đếm chéo (cũng nằm trong active / completed).
 */
export interface AdminLearningPathBreakdown {
    active: number;
    completed: number;
    failed: number;
    remedial: number;
    draft: number;
}

/** Một engine đọc văn bản (tesseract | gemini | pdf-text | docx | text …); avg* = null khi chưa có mẫu. */
export interface AdminAiEngineStat {
    engine: string;
    total: number;
    failed: number;
    lowConfidence: number;
    /** 0..1 như meanConfidence của textMeta. */
    avgConfidence: number | null;
    avgSeconds: number | null;
}

/** Bước dịch nghĩa tiếng Việt: enriched = chạy được; quota / error = số lần hỏng theo lý do. */
export interface AdminEnrichStat {
    total: number;
    enriched: number;
    quota: number;
    error: number;
}

export interface AdminAiStats {
    engines?: AdminAiEngineStat[];
    enrich?: AdminEnrichStat;
}

export interface AdminOcrPoint {
    date: string;
    ocrJobs: number;
    failed: number;
    lowConfidence: number;
    geminiFallback: number;
    /** Tỉ lệ lỗi của ngày; client chuẩn hoá về % (xem ocrErrorPct). */
    errorRate: number | null;
}

/** Khoá = thành phần ai-service (sudachi, jmdict, tesseract, gemini, kanjivg …), true = sẵn sàng. */
export type AdminEngineFlags = Record<string, boolean>;

export interface AdminHealth {
    db: string;
    aiService: "ok" | "down";
    version: string;
    /** Sao lưu (file LAST_OK của scripts/backup.*): unmonitored = chưa cấu hình app.backup.marker. */
    backup: "ok" | "stale" | "missing" | "unmonitored";
    lastBackupAt: string | null;
    /** §8: cờ thành phần ai-service; thiếu khi backend chưa trả. */
    engines?: AdminEngineFlags;
    /** Model Gemini ai-service nhận cho "Model AI chính"; null / thiếu = ai-service tắt hoặc bản cũ chưa trả. */
    aiModels?: AdminAiModels | null;
}

export interface AdminAiModels {
    /** GEMINI_MODEL của ai-service (dùng khi ô cấu hình trống hoặc tên không được nhận). */
    default: string | null;
    allowed: string[];
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
    /**
     * Tài khoản đã tự xoá (email ẩn danh, khoá vĩnh viễn): backend luôn trả (boolean nguyên thuỷ) và trả 409 cho mở khoá /
     * Premium / hạn mức / vai trò -> hiện nhãn "Đã xoá" thay "Bị khoá" và ẩn các nút đó (adminAccountStatus).
     */
    deleted: boolean;
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
    lockedReason: string | null;
    mustChangePassword: boolean;
    /** null = Premium vĩnh viễn (khi isPremium). */
    premiumUntil: string | null;
    /** §3 (A1): thiếu khi backend chưa có xác thực email -> trang chi tiết ẩn dòng này. */
    emailVerified?: boolean;
}

/** Trường bỏ trống = giữ nguyên; clearLimit = bỏ hạn mức riêng. */
export interface AdminUserPatch {
    locked?: boolean;
    /** Chỉ dùng khi locked = true; người bị khoá thấy lý do lúc đăng nhập. */
    lockedReason?: string;
    premium?: boolean;
    /** ISO-8601; chỉ dùng cùng premium = true; bỏ trống = vĩnh viễn. */
    premiumUntil?: string | null;
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
    // ----- V20/V21 (G5): thiếu khi backend chưa trả -> trang cấu hình khoá ô nhập và PUT chỉ gửi 4 khoá cũ -----
    /** Trần tải mặc định mỗi ngày của lộ trình, 5..200. */
    learning_path_daily_cap_default?: number;
    /** Điểm kiểm tra chương tối thiểu (%), 50..100. */
    learning_path_quiz_pass_pct?: number;
    /** Giờ gửi nhắc học (Asia/Ho_Chi_Minh), 0..23. */
    learning_path_reminder_hour?: number;
    /** Ngưỡng 0..1. */
    ocr_fallback_confidence?: number;
    ocr_low_line_confidence?: number;
    distractor_min_confidence?: number;
    contradiction_alert_threshold?: number;
    /** Tên model AI chính (≤ 40 ký tự); rỗng = mặc định của ai-service. */
    ai_model_primary?: string;
    email_verification_required?: boolean;
}

// ===== Bản đồ Hán–Việt (F1, proxy /api/nlp/han-viet-graph & han-viet-suggest) =====

export type HanVietNodeType = "reading" | "kanji" | "word";

/** Nút tâm: âm Hán-Việt đang tra (id "r:NHẬT"). */
export interface HanVietReadingNode {
    id: string;
    type: "reading";
    label: string;
}

/** Chữ Hán mang âm đó (id "k:日"). */
export interface HanVietKanjiNode {
    id: string;
    type: "kanji";
    label: string;
    hanViet: string;
    on: string[];
    kun: string[];
    /** N5..N1 hoặc null = không rõ. */
    level: string | null;
    strokes: number | null;
    radical: string | null;
}

/** Từ ghép chứa chữ Hán (id "w:日本"). */
export interface HanVietWordNode {
    id: string;
    type: "word";
    label: string;
    reading: string;
    meaning: string;
    level: string | null;
    hanViet: string;
}

export type HanVietNode = HanVietReadingNode | HanVietKanjiNode | HanVietWordNode;

/** has_kanji: âm -> chữ (hoặc chữ -> từ); in_word: chữ -> từ. Client đọc theo loại hai đầu, không theo chiều. */
export interface HanVietEdge {
    from: string;
    to: string;
    type: "has_kanji" | "in_word";
}

/** Âm không có trong từ điển -> nodes rỗng (200, không phải lỗi). */
export interface HanVietGraph {
    query: string;
    nodes: HanVietNode[];
    edges: HanVietEdge[];
}

/** Một gợi ý âm khi gõ: số chữ Hán mang âm đó + vài chữ ví dụ. */
export interface HanVietSuggestion {
    reading: string;
    count: number;
    kanji: string[];
}

// ===== Insights người học (/api/insights) + lộ trình bổ khuyết (POST /learning-paths/remedial) =====

/** sourceType của lộ trình: loại tài liệu bóc tách, hoặc "remedial" (bổ khuyết từ điểm yếu). */
export type LearningPathSourceType = ExtractionSourceType | "remedial";

/** lapses = hay quên (≥ 3 lần "again" / 14 ngày hoặc ease < 1.8); low_ease = khó nhớ; slow = phản xạ chậm; quiz_wrong = sai quiz ≥ 2 lần. */
export type WeaknessReason = "lapses" | "low_ease" | "slow" | "quiz_wrong";

/** Cách gom thẻ yếu thành chương của lộ trình bổ khuyết (cũng là các nhóm của GET /weaknesses). */
export type WeaknessGroupBy = "level" | "kind" | "kanji" | "deck";

/** WeaknessResponse.WeakCard (NON_NULL: trường null bị bỏ -> client chuẩn hoá về null). */
export interface WeakCard {
    cardId: string;
    deckId: string;
    deckTitle: string | null;
    term: string;
    reading: string | null;
    meaning: string;
    level: string | null;
    kind: CardKind | null;
    reasons: WeaknessReason[];
    againCount: number;
    ease: number | null;
    intervalDays: number | null;
    /** Chỉ có khi thẻ đủ 5 lần đo phản xạ. */
    medianReactionMs: number | null;
    quizWrong: number;
}

/** Một nhóm: level "N5".."N1" | "Khác"; kind vocab | grammar; kanji một chữ Hán | "Khác"; deck = deckId (+ title). */
export interface WeaknessGroup {
    key: string;
    title: string | null;
    count: number;
}

export interface WeaknessResponse {
    total: number;
    cards: WeakCard[];
    groups: Record<WeaknessGroupBy, WeaknessGroup[]>;
    /** Đủ 8 thẻ yếu để tạo lộ trình bổ khuyết. */
    canRemedial: boolean;
    /** Gợi ý số ngày cho lộ trình bổ khuyết, đã kẹp 3..30. */
    suggestedDays: number;
}

/** FrictionResponse.FrictionCard: ratio = trung vị thẻ / trung vị cá nhân (null khi chưa có trung vị cá nhân). */
export interface FrictionCard {
    cardId: string;
    term: string;
    reading: string | null;
    meaning: string;
    deckId: string;
    medianReactionMs: number;
    samples: number;
    ratio: number | null;
}

export interface FrictionResponse {
    personalMedianMs: number | null;
    cards: FrictionCard[];
}

export type NextStepKind = "path_today" | "due" | "catchup" | "remedial" | "next_chapter" | "library";

/** GET /insights/next: đã sắp theo ưu tiên; `to` = đường dẫn frontend. */
export interface NextStep {
    kind: NextStepKind;
    title: string;
    count: number;
    to: string;
}

/** POST /learning-paths/remedial: days 3..30; title rỗng = "Bổ khuyết dd/MM/yyyy". */
export interface CreateRemedialDto {
    days: number;
    groupBy: WeaknessGroupBy;
    title?: string;
}

// ===== Chữ Hán & bộ thủ (C4, C5 — proxy /api/nlp/kanji-cards, /api/nlp/radicals*) =====

/** Từ ví dụ JLPT chứa chữ. */
export interface KanjiExample {
    term: string;
    reading: string | null;
    meaning: string | null;
    level: string | null;
}

/** Âm On (katakana) kèm ≤ 3 từ ví dụ. */
export interface KanjiOnReading {
    reading: string;
    examples: KanjiExample[];
}

/** Âm Kun (hiragana); okurigana thường rỗng với dữ liệu hiện tại. */
export interface KanjiKunReading {
    reading: string;
    okurigana: string;
    examples: KanjiExample[];
}

/** POST /nlp/kanji-cards -> items[]: thẻ một chữ Hán. radical.strokes = số nét của riêng bộ thủ. */
export interface KanjiInfoCard {
    kanji: string;
    hanViet: string | null;
    radical: { no: number; strokes: number } | null;
    on: KanjiOnReading[];
    kun: KanjiKunReading[];
    meaningEn: string | null;
    strokeCount: number | null;
}

/** GET /nlp/radicals -> items[]: một trong 214 bộ thủ Khang Hi; char = ký tự khối Kangxi, unified = chữ CJK thường (font nào cũng có). */
export interface Radical {
    no: number;
    char: string;
    unified: string;
    strokes: number;
    nameVi: string;
    meaningVi: string;
    hanViet: string;
}

/** Bộ thủ gắn trên thẻ: char đã là chữ CJK thống nhất (水, không phải ⽔). */
export interface RadicalRef {
    no: number;
    char: string;
    nameVi: string;
    meaningVi: string;
    hanViet: string;
}

export interface RadicalKanjiItem {
    kanji: string;
    /** Cấp dễ nhất của từ chứa chữ. */
    level: string | null;
    strokeCount: number | null;
}

/** GET /nlp/radicals/{no}/kanji?levels= */
export interface RadicalKanjiList {
    radical: RadicalRef | null;
    levels: string[] | null;
    items: RadicalKanjiItem[];
}

/** gemini = mẹo AI viết (admin duyệt trước khi công khai); template = câu mẫu tự động. */
export type MnemonicSource = "gemini" | "template";

export interface RadicalCard {
    kanji: string;
    hanViet: string | null;
    meaningEn: string | null;
    strokeCount: number | null;
    radical: RadicalRef | null;
    mnemonicVi: string | null;
    mnemonicSource: MnemonicSource | null;
    examples: KanjiExample[];
}

/** Nhóm chữ theo bộ; radical null = chữ không tra được bộ. */
export interface RadicalGroup {
    radical: RadicalRef | null;
    kanji: string[];
}

/** POST /nlp/radicals/cards; reason = lý do Gemini không viết được mẹo (no_key | quota | error) hoặc null. */
export interface RadicalCardsResponse {
    items: RadicalCard[];
    groups: RadicalGroup[];
    reason: string | null;
}
