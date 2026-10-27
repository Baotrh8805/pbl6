// Kiểm duyệt bình luận bằng AI + HLR (spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md §6).

/** mod_status của một dòng: PENDING chưa kiểm (AI lỗi) | CLEAN | FLAGGED đăng + chờ admin | BLOCKED chỉ chủ thấy | REVIEWED admin đã xử lý. */
export type ModerationStatus = "PENDING" | "CLEAN" | "FLAGGED" | "BLOCKED" | "REVIEWED";

/** Phần người học thấy trên bình luận: chủ có spans + message; người khác chỉ có masked (nội dung là bản che từ). */
export interface ModerationInfo {
    status: ModerationStatus;
    masked: boolean;
    spans: string[];
    message: string | null;
}

/** Một từ bị PhoBERT đánh dấu; start / end = vị trí ký tự trong nội dung gốc, -1 khi không tìm lại được. */
export interface ModerationSpan {
    word: string;
    start: number;
    end: number;
    score: number;
}

export type ModerationKind = "comment" | "rating";

export interface ModerationQueueItem {
    kind: ModerationKind;
    id: number;
    content: string;
    spans: ModerationSpan[];
    /** 0 sạch / 1 xúc phạm / 2 thù ghét; null khi chưa chấm. */
    label: number | null;
    score: number | null;
    status: ModerationStatus;
    verdict: ModerationStatus | null;
    author: { id: number; email: string; displayName: string; blocked24h: number; commentLockedUntil: string | null };
    /** key = entry_key (comment) | deckId (rating); sensitive chỉ có với mục từ. */
    target: { key: string; title: string | null; sensitive: boolean | null };
    createdAt: string;
    hidden: boolean;
}

export interface ModerationCounts {
    open: number;
    flagged: number;
    blocked: number;
    pending: number;
}

/** Mục từ nhạy cảm: admin (công tắc) | jmdict (nhãn vulg / X / derog / sens / sl) | none. */
export interface ModerationSensitive {
    value: boolean;
    source: "admin" | "jmdict" | "none";
    note: string | null;
}

export interface ModerationRescan {
    scanned: number;
    pending: number;
}

/** POST /api/reviews (HLR, D32): recallBefore = p nhớ dự đoán trước lượt chấm; hlrBrake = giữ khoảng ôn; scheduler sm2 | sm2+hlr. */
export interface ReviewOutcome {
    intervalDays: number;
    dueAt: string;
    recallBefore: number | null;
    hlrBrake: boolean;
    scheduler: "sm2" | "sm2+hlr";
}

/** GET /api/decks/{id}/recall. */
export interface DeckRecall {
    cards: number;
    studied: number;
    avgRecall: number | null;
    forgettingSoon: number;
    items: { cardId: string; recall: number; forget: boolean }[];
}
