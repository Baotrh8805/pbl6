// Cảnh báo mâu thuẫn tài liệu ↔ nguồn tri thức chuẩn (F2, hợp đồng đợt 2 §5): đọc `conflicts` của item và
// `stats.conflicts` của job (ExtractionItem / ExtractionStats trong api.types chưa có các trường này — làn khác giữ tệp đó),
// dựng nhãn + tooltip. Hàm thuần -> kiểm được bằng scripts/selfcheck/learner.ts.
import type { ConflictField, ItemConflict } from "../../types/learner.types.ts";

const CONFLICT_FIELD_LABELS: Record<ConflictField, string> = {
    reading: "Cách đọc",
    furigana: "Furigana",
    meaning: "Nghĩa",
    level: "Cấp JLPT",
    grammar: "Ngữ pháp",
};

/** Trường lạ (server thêm loại mới) -> nhãn chung, vẫn hiện cảnh báo. hasOwn để "toString"... không trả về hàm. */
export const conflictFieldLabel = (field: string): string =>
    Object.hasOwn(CONFLICT_FIELD_LABELS, field) ? CONFLICT_FIELD_LABELS[field as ConflictField] : "Nội dung";

const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
/** Giá trị tài liệu / chuẩn có thể là chuỗi, số (cấp) hoặc mảng (nhiều nghĩa) -> chuỗi hiển thị. */
const textOrNull = (v: unknown): string | null => {
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (Array.isArray(v)) {
        const parts = v.map(textOrNull).filter((s): s is string => !!s);
        return parts.length > 0 ? parts.join("; ") : null;
    }
    return null;
};

/** Độ tin cậy về 0..1: ai-service gửi 0..1, nhưng chấp nhận cả phần trăm 0..100 để không hiện "8500%". */
export const normalizeConfidence = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    if (v <= 1) return v;
    return v <= 100 ? v / 100 : null;
};

/** `conflicts` của ExtractionItemResponse (luôn là mảng theo hợp đồng; server cũ không có -> []). */
export function parseConflicts(raw: unknown): ItemConflict[] {
    if (!Array.isArray(raw)) return [];
    const out: ItemConflict[] = [];
    for (const item of raw) {
        const c = asRecord(item);
        const field = c && typeof c.field === "string" ? c.field.trim().toLowerCase() : "";
        if (!c || !field) continue;
        out.push({
            field,
            document: textOrNull(c.document),
            reference: textOrNull(c.reference),
            source: textOrNull(c.source),
            confidence: normalizeConfidence(c.confidence),
            noteVi: textOrNull(c.noteVi),
        });
    }
    return out;
}

/** Mâu thuẫn của một item (ExtractionItem chưa khai báo `conflicts` nên đọc như dữ liệu lạ). */
export const itemConflicts = (item: object): ItemConflict[] => parseConflicts((item as { conflicts?: unknown }).conflicts);

export const hasConflicts = (item: object): boolean => itemConflicts(item).length > 0;

/** Số item có ít nhất một mâu thuẫn. */
export const countConflictItems = (items: readonly object[]): number => items.filter(hasConflicts).length;

/** "(JMdict, độ tin cậy 85%)"; thiếu cả hai -> "". */
const sourcePart = (c: Pick<ItemConflict, "source" | "confidence">): string => {
    const parts = [c.source, c.confidence != null ? `độ tin cậy ${Math.round(c.confidence * 100)}%` : null].filter(
        (s): s is string => !!s
    );
    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
};

/** Một dòng so sánh: "Tài liệu: よむ / Chuẩn: よみ (JMdict, độ tin cậy 85%)". */
export const conflictComparison = (c: ItemConflict): string =>
    `Tài liệu: ${c.document ?? "—"} / Chuẩn: ${c.reference ?? "—"}${sourcePart(c)}`;

/** Tooltip một mâu thuẫn: "Cách đọc — Tài liệu: … / Chuẩn: … (nguồn, độ tin cậy %)" + dòng ghi chú tiếng Việt. */
export const conflictTooltip = (c: ItemConflict): string =>
    [`${conflictFieldLabel(c.field)} — ${conflictComparison(c)}`, c.noteVi].filter((s): s is string => !!s).join("\n");

/** Nhãn badge: các trường mâu thuẫn, không lặp ("Cách đọc, Nghĩa"). */
export const conflictBadgeLabel = (conflicts: ItemConflict[]): string =>
    [...new Set(conflicts.map((c) => conflictFieldLabel(c.field)))].join(", ");

/** Số cảnh báo của job (`stats.conflicts`); null = server chưa kiểm (job cũ / backend chưa có F2). */
export const statsConflictCount = (stats: unknown): number | null => {
    const n = asRecord(stats)?.conflicts;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.round(n);
    // Phòng server gửi luôn mảng chi tiết thay vì số đếm.
    return Array.isArray(n) ? n.length : null;
};

/** `stats.conflictsByField` -> [{field, label, count}] (bỏ số 0 / lạ), nhiều trước. */
const statsConflictsByField = (stats: unknown): { field: string; label: string; count: number }[] => {
    const by = asRecord(asRecord(stats)?.conflictsByField);
    if (!by) return [];
    return Object.entries(by)
        .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0)
        .map(([field, count]) => ({ field, label: conflictFieldLabel(field), count: Math.round(count) }))
        .sort((a, b) => b.count - a.count);
};

/** "Cách đọc 3 · Nghĩa 1" cho dòng tóm tắt trên trang bóc tách. */
export const conflictsByFieldSummary = (stats: unknown): string =>
    statsConflictsByField(stats)
        .map((f) => `${f.label} ${f.count}`)
        .join(" · ");

/** Câu báo sau "Kiểm tra lại" mâu thuẫn (trang bóc tách lẫn bản nháp lộ trình), theo `stats.conflicts` server trả. */
export const recheckResultText = (stats: unknown): string => {
    const n = statsConflictCount(stats);
    return n == null ? "Đã kiểm tra lại." : n > 0 ? `Đã kiểm tra lại: còn ${n} cảnh báo mâu thuẫn.` : "Đã kiểm tra lại: không còn mâu thuẫn.";
};
