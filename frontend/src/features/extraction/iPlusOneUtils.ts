// Câu ví dụ i+1 (C6, hợp đồng đợt 2 §9): đọc response (dữ liệu không đáng tin), tách câu để tô từ đích và gắn furigana
// cho dạng gặp trong câu. Hàm thuần -> kiểm được bằng scripts/selfcheck/learner.ts.
import type { ReadingSegment } from "../../types/api.types.ts";
import type { IPlusOneResponse, IPlusOneSentence, IPlusOneTarget } from "../../types/learner.types.ts";

/** Số câu tối đa xin server (mặc định của hợp đồng). */
export const I_PLUS_ONE_LIMIT = 50;

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const idOf = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null;

const parseSegments = (raw: unknown): ReadingSegment[] | null => {
    if (!Array.isArray(raw)) return null;
    const out: ReadingSegment[] = [];
    for (const item of raw) {
        const s = asRecord(item);
        if (!s || typeof s.kanji !== "string" || typeof s.kana !== "string" || !s.kanji) return null; // hỏng một đoạn -> bỏ cả
        out.push({ kanji: s.kanji, kana: s.kana });
    }
    return out.length > 0 ? out : null;
};

const parseTarget = (raw: unknown): IPlusOneTarget | null => {
    const t = asRecord(raw);
    const lemma = t ? (strOrNull(t.lemma) ?? strOrNull(t.surface)) : null;
    if (!t || !lemma) return null;
    const level = strOrNull(t.level);
    return {
        lemma,
        surface: strOrNull(t.surface) ?? lemma,
        reading: strOrNull(t.reading),
        level: level && LEVELS.includes(level) ? level : null,
        meaningEn: strOrNull(t.meaningEn),
        readingSegments: parseSegments(t.readingSegments),
    };
};

/** GET /extractions/{id}/i-plus-one; câu thiếu nội dung hoặc từ đích bị bỏ, câu trùng chỉ giữ một. */
export function parseIPlusOne(raw: unknown): IPlusOneResponse {
    const r = asRecord(raw) ?? {};
    const items: IPlusOneSentence[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(r.items) ? r.items : []) {
        const s = asRecord(item);
        const sentence = s ? strOrNull(s.sentence) : null;
        const target = s ? parseTarget(s.target) : null;
        if (!s || !sentence || !target) continue;
        const key = `${sentence}\u0000${target.lemma}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            sentence,
            target,
            unknownCount: count(s.unknownCount),
            knownCount: count(s.knownCount),
            length: count(s.length) || [...sentence].length,
            score: num(s.score),
            itemId: idOf(s.itemId),
        });
    }
    return { items, knownCount: count(r.knownCount) };
}

export interface HighlightParts {
    before: string;
    match: string;
    after: string;
}

/**
 * Tách câu quanh lần xuất hiện ĐẦU TIÊN của từ đích. Thử lần lượt các ứng viên (dạng gặp trong câu, rồi lemma), ứng viên
 * rỗng bị bỏ; không thấy -> null (câu hiện nguyên, từ đích ghi riêng bên dưới).
 */
export function splitHighlight(sentence: string, candidates: readonly (string | null | undefined)[]): HighlightParts | null {
    for (const c of candidates) {
        const needle = c?.trim();
        if (!needle) continue;
        const at = sentence.indexOf(needle);
        if (at < 0) continue;
        return { before: sentence.slice(0, at), match: needle, after: sentence.slice(at + needle.length) };
    }
    return null;
}

/**
 * Furigana cho dạng gặp trong câu (vd. 読んだ) từ furigana của lemma (読む = 読|よ + む): giữ các đoạn đầu khớp chữ
 * của dạng gặp, phần đuôi biến đổi (んだ) thêm thành đoạn kana thường. Một đoạn có kanji mà không khớp (dạng viết khác,
 * vd. よんだ) -> null: thà không có furigana còn hơn furigana sai.
 */
export function surfaceSegments(surface: string, segments: readonly ReadingSegment[] | null): ReadingSegment[] | null {
    if (!segments || segments.length === 0 || !surface) return null;
    const out: ReadingSegment[] = [];
    let acc = "";
    for (const seg of segments) {
        if (surface.startsWith(acc + seg.kanji)) {
            out.push(seg);
            acc += seg.kanji;
            continue;
        }
        if (seg.kana && seg.kana !== seg.kanji) return null; // đoạn có kanji lệch dạng gặp
        break; // đoạn kana (đuôi okurigana) đã biến đổi: phần còn lại lấy nguyên từ dạng gặp
    }
    if (acc.length === 0) return null;
    if (acc.length < surface.length) {
        const rest = surface.slice(acc.length);
        out.push({ kanji: rest, kana: rest });
    }
    return out.some((s) => s.kana && s.kana !== s.kanji) ? out : null;
}

/** Furigana hiển thị cho phần được tô: đoạn căn sẵn nếu khớp, không thì cách đọc cả từ khi dạng gặp = lemma. */
export function highlightRuby(
    match: string,
    target: Pick<IPlusOneTarget, "lemma" | "reading" | "readingSegments">
): { segments: ReadingSegment[] | null; reading: string | null } {
    const segments = surfaceSegments(match, target.readingSegments);
    if (segments) return { segments, reading: null };
    return { segments: null, reading: match === target.lemma && target.reading && target.reading !== match ? target.reading : null };
}

/** "1 từ mới · 8 từ đã biết" */
export const sentenceCountsLabel = (s: Pick<IPlusOneSentence, "unknownCount" | "knownCount">): string =>
    `${s.unknownCount} từ mới · ${s.knownCount} từ đã biết`;

/**
 * Phạm vi của tuỳ chọn "coi từ theo cấp là đã biết", khớp ai-service (sentence_mining._is_known: cấp ≤ cấp người học,
 * tức là GỒM cả cấp của người học): "các từ cấp N4 và các cấp dễ hơn"; N5 là cấp dễ nhất nên chỉ "các từ cấp N5".
 */
export const assumeKnownScope = (userLevel: string): string =>
    userLevel === "N5" || !LEVELS.includes(userLevel) ? `các từ cấp ${userLevel}` : `các từ cấp ${userLevel} và các cấp dễ hơn`;
