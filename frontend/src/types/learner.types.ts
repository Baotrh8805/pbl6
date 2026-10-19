// Kiểu dữ liệu phía người học của hợp đồng API đợt 2 (docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md §4, §5, §7, §9).
// Tách khỏi api.types.ts vì các làn đợt 2 chạy song song; mọi response đi qua parse* (dữ liệu không đáng tin, backend có
// thể chưa triển khai xong trường mới).
import type { ReadingSegment } from "./api.types.ts";

// ===== §4 Mẹo nhớ chữ Hán (C4) =====

/** Nguồn mẹo ở bảng kanji_mnemonics: AI = Gemini viết, TEMPLATE = câu mẫu tự động, USER = người học tự viết. */
export type KanjiMnemonicSource = "AI" | "TEMPLATE" | "USER";
export type MnemonicStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Mẹo đã được quản trị viên duyệt (mỗi chữ tối đa một). */
export interface ApprovedMnemonic {
    id: string;
    mnemonicVi: string;
    source: KanjiMnemonicSource | null;
}

/** Mẹo chính người học đã gửi (kể cả do AI gợi ý cho mình), mọi trạng thái. */
export interface MyMnemonic {
    id: string;
    mnemonicVi: string;
    source: KanjiMnemonicSource | null;
    status: MnemonicStatus;
    reviewNote: string | null;
    createdAt: string | null;
}

/** GET /api/kanji/{ch}/mnemonics */
export interface KanjiMnemonics {
    kanji: string;
    approved: ApprovedMnemonic | null;
    mine: MyMnemonic[];
}

/** Một mẹo vừa sinh ở POST /api/kanji/mnemonics/generate (luôn PENDING). */
export interface GeneratedMnemonic {
    id: string;
    kanji: string;
    mnemonicVi: string;
    source: KanjiMnemonicSource | null;
    status: MnemonicStatus;
}

/** reason = lý do AI không viết được (no_key | quota | error) -> mẹo là câu mẫu; null khi AI viết bình thường. */
export interface GenerateMnemonicsResult {
    items: GeneratedMnemonic[];
    reason: string | null;
}

/** mnemonicSource của /api/nlp/radicals/cards: approved = mẹo đã duyệt, template = câu mẫu, gemini = bản cũ chưa duyệt. */
export type RadicalMnemonicSource = "approved" | "template" | "gemini";

// ===== §5 Cảnh báo mâu thuẫn (F2) =====

export type ConflictField = "reading" | "furigana" | "meaning" | "level" | "grammar";

/** Một chỗ tài liệu nói khác nguồn tri thức chuẩn (JMdict, danh sách JLPT, nguồn admin tải lên...). */
export interface ItemConflict {
    /** Trường lạ (server thêm loại mới) vẫn giữ để hiện nhãn chung, không bỏ cảnh báo. */
    field: ConflictField | string;
    /** Giá trị tài liệu ghi. */
    document: string | null;
    /** Giá trị theo nguồn chuẩn. */
    reference: string | null;
    /** Tên nguồn chuẩn. */
    source: string | null;
    /** Độ tin cậy 0..1 (đã chuẩn hoá khi server gửi 0..100); null = không rõ. */
    confidence: number | null;
    noteVi: string | null;
}

// ===== §9 Câu ví dụ i+1 (C6) =====

export interface IPlusOneTarget {
    lemma: string;
    /** Dạng gặp trong câu; thiếu -> bằng lemma. */
    surface: string;
    reading: string | null;
    level: string | null;
    meaningEn: string | null;
    /** Furigana từng đoạn của lemma (như ExtractionItem.readingSegments). */
    readingSegments: ReadingSegment[] | null;
}

export interface IPlusOneSentence {
    sentence: string;
    target: IPlusOneTarget;
    /** Số từ chưa biết trong câu (i+1 = 1). */
    unknownCount: number;
    knownCount: number;
    length: number;
    score: number;
    /** Item bóc tách tương ứng từ đích; null = từ đích không nằm trong danh sách (không gắn làm ví dụ được). */
    itemId: string | null;
}

/** GET /api/extractions/{id}/i-plus-one */
export interface IPlusOneResponse {
    items: IPlusOneSentence[];
    /** Số từ người học "đã biết" (thẻ reps ≥ 2 hoặc interval ≥ 7). */
    knownCount: number;
}

// ===== §7 Dashboard cá nhân (A5) =====

export interface ActivityDay {
    /** "YYYY-MM-DD" theo múi giờ đã gửi (tz). */
    day: string;
    reviews: number;
    quizzes: number;
}

/** GET /api/reviews/activity?days=&tz= — trường số null khi server không gửi (bản cũ / đang triển khai). */
export interface ReviewActivity {
    days: ActivityDay[];
    /** Thẻ đã học có hạn ôn trước cuối ngày hôm nay. */
    dueToday: number | null;
    /** Thẻ trong các bộ của mình chưa học lần nào. */
    newCards: number | null;
    learnedTotal: number | null;
    /** Khoảng ôn ≥ 21 ngày. */
    masteredTotal: number | null;
    currentStreak: number | null;
    maxStreak: number | null;
}
