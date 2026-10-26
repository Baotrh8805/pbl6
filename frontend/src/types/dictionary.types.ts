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
    kind: "ENTRY" | "COMMENT";
    entryKey: DictKey;
    term?: string | null;
    commentId?: number | null;
    commentContent?: string | null;
    field?: DictReportField | null;
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
}

export interface DictAdminEntry extends DictEntry {
    missing?: boolean;
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
