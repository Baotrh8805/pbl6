// Kiểu dữ liệu từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §6.4–§6.5, §8.3). Tách khỏi api.types.ts để không đụng
// tệp chung đồng đội đang sửa. Mục từ là JSON gộp nhiều lớp từ backend: mọi trường ngoài key đều có thể thiếu.

/** w:<id JMdict> | w:jlpt:<từ>|<đọc> | k:<chữ Hán>. */
export type DictKey = string;

/** Lý do đang hiện nghĩa Anh thay nghĩa Việt (người học không thấy nhãn "máy dịch", D23). */
export type DictViState = "OK" | "EN_ONLY" | "LIMIT" | "AI_DOWN";

export interface DictSummary {
    key: DictKey;
    kind?: "word" | "kanji";
    id?: string;
    headKanji?: string | null;
    headKana?: string | null;
    reading?: string | null;
    glossShort?: string | null;
    meaningVi?: string | null;
    common?: boolean;
    jlpt?: string | null;
    nExamples?: number;
    unavailable?: boolean;
    note?: string | null;
    savedAt?: string | null;
    lookedUpAt?: string | null;
}

export interface DictSearchResult {
    items: DictSummary[];
    total: number;
    page: number;
    size: number;
    modeUsed: "ja" | "en" | "vi" | "vi+en";
    /** Có khi từ gõ vào không trùng dạng viết nào và ai-service đưa về dạng gốc (食べました → 食べる); mục dạng gốc đứng đầu. */
    deinflected?: { query: string; lemmas: string[] } | null;
}

export interface DictSense {
    pos?: string[];
    posText?: string[];
    misc?: string[];
    miscText?: string[];
    field?: string[];
    info?: string[];
    gloss?: string[];
}

export interface DictExample {
    id: string;
    form?: string | null;
    jpn: string;
    eng?: string | null;
    vi?: string | null;
    hidden?: boolean;
    senseIndex?: number;
}

export interface DictUserExample {
    id: string;
    jpn: string;
    vi?: string | null;
    source?: string | null;
}

export interface DictKanjiChar {
    char: string;
    hanViet?: string | null;
    meaningEn?: string | null;
    meaningVi?: string | null;
}

export interface DictPitch {
    accentType: number;
    kind: string;
    moras: string[];
    hl: ("H" | "L")[];
}

export interface DictKanjiReading {
    reading: string;
    okurigana?: string | null;
    examples?: { term: string; reading: string; meaning?: string | null; level?: string | null }[];
}

export interface DictEntry {
    key: DictKey;
    kind: "word" | "kanji";
    // từ vựng
    forms?: { text: string; kana: boolean; common: boolean }[];
    headKanji?: string | null;
    headKana?: string | null;
    reading?: string | null;
    readingOverridden?: boolean;
    hanViet?: string | null;
    hanVietChars?: { char: string; reading?: string | null }[];
    jlpt?: string | null;
    common?: boolean;
    pitch?: DictPitch | null;
    senses?: DictSense[];
    glossShort?: string | null;
    examples?: DictExample[];
    nExamples?: number;
    kanjiChars?: DictKanjiChar[];
    relatedSameReading?: { key: DictKey; headKanji: string; reading: string; glossShort: string }[];
    userExamples?: DictUserExample[];
    jlptOnly?: boolean;
    redirectFrom?: string;
    // chữ Hán (k:<chữ>)
    kanji?: string;
    radical?: { no?: number; char?: string; nameVi?: string; meaningVi?: string } | null;
    on?: DictKanjiReading[];
    kun?: DictKanjiReading[];
    meaningEn?: string | null;
    strokeCount?: number | null;
    exampleWords?: DictSummary[];
    // lớp Việt + cộng đồng
    meaningVi?: string | null;
    viState?: DictViState;
    commentCount?: number;
    favorite?: { saved: boolean; note: string | null };
    aiLeft?: number;
    aiLimit?: number;
}

export interface DictToken {
    surface: string;
    lemma: string;
    reading: string;
    key: DictKey | null;
}

export interface DictComment {
    id: number;
    entryKey: DictKey;
    userId: number;
    displayName: string;
    content: string;
    helpfulCount: number;
    votedByMe: boolean;
    mine: boolean;
    hidden: boolean;
    createdAt: string;
    updatedAt: string;
    /** V38 kiểm duyệt AI: null / thiếu = sạch; BLOCKED chỉ chủ thấy; người khác thấy masked khi content là bản che từ. */
    moderation?: import("./moderation.types.ts").ModerationInfo | null;
}

export interface DictPage<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
}

export type DictReportField = "reading" | "han_viet" | "meaning_vi" | "meaning_en" | "kanji_meaning" | "example" | "example_vi" | "other";

export interface DictReport {
    id: number;
    /** TEXT (V40): báo bản dịch sai ở tab Dịch — entryKey là hash bộ nhớ dịch, field là hướng ja-vi | vi-ja */
    kind: "ENTRY" | "COMMENT" | "TEXT";
    entryKey: DictKey;
    term?: string | null;
    commentId?: number | null;
    commentContent?: string | null;
    /** TEXT: câu gốc người học gửi kèm báo cáo */
    sourceText?: string | null;
    field?: DictReportField | DictTranslateDirectionFixed | null;
    subKey?: string | null;
    currentValue?: string | null;
    proposedValue?: string | null;
    reason?: string | null;
    note?: string | null;
    reporterId?: number | null;
    reporterEmail?: string | null;
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    action?: string | null;
    resolutionNote?: string | null;
    resolvedAt?: string | null;
    createdAt: string;
}

// ---------- admin ----------

export type DictQueueGroup = "reported" | "en_only" | "machine" | "verified";

export interface DictQueueRow {
    entryKey: DictKey;
    group: DictQueueGroup;
    openReports: number;
    lastReportAt?: string | null;
    lookups30d: number;
    term?: string | null;
    reading?: string | null;
    level?: string | null;
    meaningVi?: string | null;
    status?: "MACHINE" | "VERIFIED" | null;
    source?: "SEED" | "GEMINI" | "ADMIN" | null;
    updatedAt?: string | null;
    headKanji?: string | null;
    headKana?: string | null;
    glossShort?: string | null;
}

export interface DictHistory {
    id: number;
    entryKey: DictKey;
    field: string;
    subKey: string;
    oldValue?: string | null;
    newValue?: string | null;
    actorId?: number | null;
    actorEmail?: string | null;
    reportId?: number | null;
    reason?: string | null;
    createdAt: string;
}

export interface DictAdminComment {
    id: number;
    entryKey: DictKey;
    userId: number;
    displayName: string;
    email: string;
    content: string;
    helpfulCount: number;
    hidden: boolean;
    hiddenNote?: string | null;
    createdAt: string;
    /** V38 */
    modStatus?: import("./moderation.types.ts").ModerationStatus;
    modSpans?: string[];
}

export interface DictAdminEntry extends DictEntry {
    missing?: boolean;
    /** V38: mục từ nhạy cảm (công tắc admin / nhãn JMdict) — bình luận thù ghét ở mục này chỉ gắn cờ, không chặn. */
    sensitive?: import("./moderation.types.ts").ModerationSensitive;
    admin: {
        meaningVi: string | null;
        status?: "MACHINE" | "VERIFIED";
        source?: "SEED" | "GEMINI" | "ADMIN";
        model?: string | null;
        updatedAt?: string | null;
        verifiedAt?: string | null;
        term?: string | null;
        reading?: string | null;
        level?: string | null;
        overrides: { entryKey: DictKey; field: string; subKey: string; value: string; createdAt: string }[];
        history: DictHistory[];
        openReports: DictReport[];
        comments: DictAdminComment[];
    };
}

export interface DictSyncResult {
    backendVersion: number;
    aiVersion: number | null;
    aiCount: number | null;
    ok: boolean;
}

export interface DictStats {
    entriesVi: number;
    verified: number;
    machine: number;
    lookups7d: number;
    comments7d: number;
    openReports: number;
}

/** Tab Câu (GET /api/dictionary/sentences): câu ví dụ chứa cụm tìm; vi = bản dịch Việt (dịch sẵn hoặc admin sửa), null khi chưa có. */
export interface DictSentence {
    id: string;
    jpn: string;
    eng: string | null;
    vi: string | null;
    /** Mục từ mà câu này làm ví dụ (≤ 8). */
    words: { key: DictKey; form: string; head: string }[];
}

export interface DictSentenceResult {
    items: DictSentence[];
    total: number;
    page: number;
    size: number;
}

// ---------- Dịch câu (tab Dịch, spec 2026-10-28-dich-cau-design, D33) ----------

export type DictTranslateDirection = "auto" | "ja-vi" | "vi-ja";
export type DictTranslateDirectionFixed = Exclude<DictTranslateDirection, "auto">;

/**
 * OK: có bản dịch; OFF: admin tắt hoặc chưa cấu hình AI; LIMIT: hết lượt trong giờ; AI_DOWN: AI lỗi / quá tải. Ba trạng thái sau
 * vẫn có phân tích câu — không bao giờ ghép nghĩa từng từ thành bản dịch.
 */
export type DictTranslateState = "OK" | "OFF" | "LIMIT" | "AI_DOWN";

export interface DictRuby {
    text: string;
    reading: string | null;
}

/** Một cụm từ của câu Nhật (token Sudachi đã gom trợ động từ). Nghĩa ưu tiên: meaning (AI theo ngữ cảnh) → dictVi (từ điển) → glossEn. */
export interface DictTranslateToken {
    i: number;
    surface: string;
    lemma: string | null;
    reading: string | null;
    romaji: string | null;
    rubies: DictRuby[] | null;
    key: DictKey | null;
    jlpt: string | null;
    pos: string | null;
    posVi: string | null;
    particle: boolean;
    symbol: boolean;
    glossEn: string | null;
    meaning: string | null;
    dictVi?: string | null;
}

export interface DictTranslateAlternative {
    text: string;
    reading: string | null;
    note: string | null;
}

/** POST /api/dictionary/translate: bản dịch AI dịch cả đoạn + phân tích câu Nhật (câu gốc khi ja-vi, câu AI trả khi vi-ja). */
export interface DictTranslation {
    direction: "ja-vi" | "vi-ja";
    source: string;
    translation: string | null;
    literal: string | null;
    alternatives: DictTranslateAlternative[];
    notes: string | null;
    reading: string | null;
    romaji: string | null;
    readingAgrees: boolean | null;
    tokens: DictTranslateToken[];
    model: string | null;
    /** Quản trị viên đã sửa bản dịch này theo báo cáo của người học (V40) */
    edited?: boolean;
    state: DictTranslateState;
    cached: boolean;
    aiLeft: number;
    aiLimit: number;
}
