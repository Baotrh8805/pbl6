// Kiểm duyệt AI + HLR: hàm thuần cho giao diện (nhãn, tô từ bị đánh dấu, câu sau lượt chấm, độ nhớ) — kiểm bằng
// scripts/selfcheck/moderation.ts (import tương đối + đuôi .ts, không DOM / API).
import type { ModerationSpan, ModerationStatus, ReviewOutcome } from "../types/moderation.types.ts";

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
    PENDING: "Chưa kiểm",
    CLEAN: "Sạch",
    FLAGGED: "AI gắn cờ",
    BLOCKED: "AI chặn",
    REVIEWED: "Đã xử lý",
};

/** Tông màu badge theo trạng thái (tên tone của AdminStatusBadge). */
export const moderationTone = (s: ModerationStatus | null | undefined): "error" | "warning" | "success" | "neutral" | "info" =>
    s === "BLOCKED" ? "error" : s === "FLAGGED" ? "warning" : s === "PENDING" ? "info" : s === "REVIEWED" ? "success" : "neutral";

export const AI_LABELS = ["Sạch", "Xúc phạm", "Thù ghét"] as const;

/** Nhãn 0 / 1 / 2 của model ViHSD → chữ; null / lạ → "Chưa chấm". */
export const aiLabelText = (label: number | null | undefined): string =>
    label == null || label < 0 || label > 2 ? "Chưa chấm" : AI_LABELS[label];

export const parseModerationStatus = (v: string | null | undefined): ModerationStatus | "OPEN" | "ALL" => {
    const s = (v ?? "").toUpperCase();
    return s === "FLAGGED" || s === "BLOCKED" || s === "PENDING" || s === "REVIEWED" || s === "CLEAN" || s === "ALL" ? s : "OPEN";
};

export interface TextSegment {
    text: string;
    flagged: boolean;
    score?: number;
}

/**
 * Cắt nội dung thành đoạn để tô từ bị đánh dấu (admin, chủ bình luận). Dùng vị trí ký tự khi có; từ không có vị trí thì so
 * theo từ (không phân biệt hoa thường, `_` = khoảng trắng). Vị trí chồng lấn / ngoài chuỗi bị bỏ.
 */
export const highlightSpans = (content: string, spans: readonly ModerationSpan[]): TextSegment[] => {
    if (!content) return [];
    const marks: { start: number; end: number; score: number }[] = [];
    const loose: ModerationSpan[] = [];
    for (const sp of spans) {
        if (sp.start >= 0 && sp.end > sp.start && sp.end <= content.length) marks.push({ start: sp.start, end: sp.end, score: sp.score });
        else if (sp.word?.trim()) loose.push(sp);
    }
    const low = content.toLowerCase();
    for (const sp of loose) {
        const w = sp.word.replace(/_/g, " ").toLowerCase();
        let from = 0;
        while (from < low.length) {
            const i = low.indexOf(w, from);
            if (i < 0) break;
            const before = i === 0 ? " " : low[i - 1];
            const after = i + w.length >= low.length ? " " : low[i + w.length];
            if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) marks.push({ start: i, end: i + w.length, score: sp.score });
            from = i + w.length;
        }
    }
    marks.sort((a, b) => a.start - b.start || b.end - a.end);
    const out: TextSegment[] = [];
    let pos = 0;
    for (const m of marks) {
        if (m.start < pos) continue;
        if (m.start > pos) out.push({ text: content.slice(pos, m.start), flagged: false });
        out.push({ text: content.slice(m.start, m.end), flagged: true, score: m.score });
        pos = m.end;
    }
    if (pos < content.length) out.push({ text: content.slice(pos), flagged: false });
    return out;
};

/** 0..1 → "78 %"; null → "—". */
export const recallPct = (p: number | null | undefined): string =>
    p == null || !Number.isFinite(p) ? "—" : `${Math.round(p * 100)} %`;

/** Ngưỡng "sắp quên" (ModerationPolicy.FORGETTING_SOON của backend). */
export const FORGETTING_SOON = 0.7;

export const recallTone = (p: number | null | undefined): "error" | "warning" | "success" | "neutral" =>
    p == null ? "neutral" : p < FORGETTING_SOON ? "error" : p < 0.85 ? "warning" : "success";

/** Dòng sau khi chấm (StudyPage): khoảng ôn + độ nhớ trước lượt chấm + phanh HLR; null khi không có gì đáng nói (cram). */
export const reviewOutcomeText = (o: ReviewOutcome | null | undefined): string | null => {
    if (!o) return null;
    const parts = [`Ôn lại sau ${o.intervalDays} ngày`];
    if (o.recallBefore != null) parts.push(`trước khi ôn bạn được dự đoán nhớ ${recallPct(o.recallBefore)}`);
    if (o.hlrBrake) parts.push("mô hình trí nhớ giữ nguyên khoảng ôn vì dự đoán bạn sắp quên");
    return parts.join(" · ");
};

/** Đọc response của POST /api/reviews; thiếu trường (server cũ) → null. */
export const parseReviewOutcome = (raw: unknown): ReviewOutcome | null => {
    const r = raw as Partial<ReviewOutcome> | null;
    if (!r || typeof r !== "object" || typeof r.intervalDays !== "number" || typeof r.dueAt !== "string") return null;
    return {
        intervalDays: r.intervalDays,
        dueAt: r.dueAt,
        recallBefore: typeof r.recallBefore === "number" ? r.recallBefore : null,
        hlrBrake: r.hlrBrake === true,
        scheduler: r.scheduler === "sm2+hlr" ? "sm2+hlr" : "sm2",
    };
};

/** Câu tóm tắt độ nhớ của bộ thẻ (chip ở chi tiết bộ): null khi chưa học thẻ nào. */
export const deckRecallText = (r: { studied: number; avgRecall: number | null; forgettingSoon: number } | null | undefined): string | null => {
    if (!r || r.studied === 0 || r.avgRecall == null) return null;
    return r.forgettingSoon > 0
        ? `Độ nhớ ≈ ${recallPct(r.avgRecall)} · ${r.forgettingSoon} thẻ sắp quên`
        : `Độ nhớ ≈ ${recallPct(r.avgRecall)}`;
};
