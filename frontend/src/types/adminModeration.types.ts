// Kiểu cho các trang kiểm duyệt admin đợt 2 (hợp đồng docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md §4, §5, §6).
// Tách khỏi api.types.ts để các làn song song không sửa chung một tệp; mọi trường "mới" để tuỳ chọn khi backend có thể
// chưa trả (FE phải chịu được phản hồi cũ).

// ---------- §4 Mẹo nhớ bộ thủ (G2) ----------

export type AdminMnemonicStatus = "PENDING" | "APPROVED" | "REJECTED";
/** Nguồn mẹo: AI = Gemini sinh, TEMPLATE = mẫu tự động, USER = người học tự viết. */
export type AdminMnemonicSource = "AI" | "TEMPLATE" | "USER";

export interface AdminMnemonicRadical {
    no: number;
    char: string;
    nameVi: string | null;
}

export interface AdminMnemonic {
    id: string;
    kanji: string;
    radical: AdminMnemonicRadical | null;
    mnemonicVi: string;
    source: AdminMnemonicSource;
    status: AdminMnemonicStatus;
    /** null = mẹo do hệ thống sinh (không có tác giả) hoặc tác giả đã xoá tài khoản. */
    authorEmail: string | null;
    generatedModel: string | null;
    createdAt: string;
    reviewedByEmail: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    /** V38: nhãn AI 0 sạch / 1 xúc phạm / 2 thù ghét + từ bị đánh dấu (chỉ mẹo người dùng viết). */
    modLabel?: number | null;
    modScore?: number | null;
    modSpans?: string[];
}

// ---------- §5 Nguồn tri thức chuẩn (G4) ----------

export type KnowledgeKind = "VOCAB" | "GRAMMAR" | "KANJI" | "OTHER";
export type KnowledgeStatus = "ACTIVE" | "ARCHIVED";

export interface KnowledgeSourceRow {
    id: string;
    title: string;
    kind: KnowledgeKind;
    level: string | null;
    version: number;
    sourceName: string | null;
    status: KnowledgeStatus;
    entryCount: number;
    uploadedByEmail: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface KnowledgeEntry {
    term: string;
    reading: string | null;
    meaning: string | null;
    level: string | null;
}

export interface KnowledgeSourceDetail extends KnowledgeSourceRow {
    /** ≤ 4000 ký tự đầu của nội dung gốc. */
    contentPreview?: string | null;
    /** ≤ 500 mục đầu. */
    entries?: KnowledgeEntry[];
}

/** Thân multipart cho POST (tạo) / PUT (phiên bản mới): đúng một trong file | text. */
export interface KnowledgeUploadInput {
    file?: File | null;
    text?: string | null;
    title: string;
    kind: KnowledgeKind;
    /** "" / null = không gắn cấp. */
    level?: string | null;
}

// ---------- §6 Khiếu nại tài khoản (G1) ----------

export type AppealStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type AppealAction = "UNLOCK" | "NONE";

export interface AccountAppeal {
    id: number;
    email: string;
    /** null = tài khoản không còn (đã xoá). */
    userId: number | null;
    userLocked: boolean | null;
    /** Lý do khoá HIỆN TẠI (null khi tài khoản không còn khoá); đổi theo mở / khoá lại. */
    lockedReason: string | null;
    /**
     * Lý do khoá chụp lúc gửi (STAFF-07), không đổi khi tài khoản được mở / khoá lại. "" = lúc gửi bị khoá không ghi lý do;
     * null = khiếu nại gửi trước khi backend lưu trường này (trang hiện lý do hiện tại kèm nhãn, xem appealReasonView).
     */
    lockedReasonAtSubmit: string | null;
    message: string;
    status: AppealStatus;
    action: AppealAction | null;
    resolutionNote: string | null;
    resolvedByEmail: string | null;
    resolvedAt: string | null;
    createdAt: string;
    /** Không có trong hợp đồng: nếu backend trả thêm thì trang khỏi gọi chi tiết người dùng để biết bậc. */
    userRole?: string | null;
}
