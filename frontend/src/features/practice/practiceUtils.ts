// Hàm thuần cho luyện tập (E2 viết kanji, E3 phát âm, E4 trọng âm): đọc response máy chủ, ánh xạ kết quả chấm nét
// sang StrokeScore của bảng viết, rút gọn đường cao độ trước khi gửi, nhãn thống kê. Không gọi API / DOM, import
// tương đối + đuôi .ts -> kiểm được bằng scripts/selfcheck/practice.ts.
import { summarizeStrokeScore, type StrokeChip, type StrokeScore, type StrokeScoreItem } from "../../lib/strokes.ts";
import type { MoraLevel, PitchLevel } from "../../lib/pitch.ts";
import type {
    KanjiStrokeData,
    PitchReference,
    PracticeKind,
    PracticeKindStats,
    PracticeLogItem,
    PracticeStats,
    ServerPitchScore,
    ServerStrokeScore,
} from "../../types/practice.types.ts";

/** Giới hạn của POST /practice/kanji/score (hợp đồng §2): vượt thì máy chủ trả 400. */
export const MAX_SCORE_STROKES = 40;
/** Giới hạn contour của POST /practice/pitch/score. */
export const MAX_CONTOUR_POINTS = 2000;
/** practice_logs.target varchar(100). */
export const PRACTICE_TARGET_MAX = 100;
/** Bản nhận dạng chỉ để tham khảo trong detail; cắt bớt để một câu nhận dạng dài bất thường không làm phình nhật ký. */
export const PRACTICE_TRANSCRIPT_MAX = 200;

export const PRACTICE_KINDS: readonly PracticeKind[] = ["write", "speak", "pitch"];

export const PRACTICE_KIND_LABELS: Record<PracticeKind, string> = {
    write: "Viết",
    speak: "Phát âm",
    pitch: "Trọng âm",
};

export const PRACTICE_KIND_ICONS: Record<PracticeKind, string> = {
    write: "draw",
    speak: "record_voice_over",
    pitch: "graphic_eq",
};

/** Cửa sổ ngày cho tab thống kê luyện tập (máy chủ mặc định 30). */
export const PRACTICE_STATS_DAYS = [7, 30, 90] as const;
export const DEFAULT_PRACTICE_STATS_DAYS = 30;

// --------------------------------------------------------------------------------------------- tiện ích đọc số

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clampScore = (v: number): number => Math.min(100, Math.max(0, v));
const nonNegInt = (v: unknown): number | null => {
    const n = finite(v);
    return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};
const asRecord = (raw: unknown): Record<string, unknown> | null =>
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
/** Mảng chỉ số 0-based: bỏ phần tử hỏng, bỏ trùng, tăng dần. */
const indexList = (raw: unknown): number[] =>
    Array.isArray(raw)
        ? [...new Set(raw.map(nonNegInt).filter((n): n is number => n !== null))].sort((a, b) => a - b)
        : [];

// --------------------------------------------------------------------------------------------- viết kanji (E2)

/** Một điểm nét mẫu: [x, y] theo hợp đồng; nhận thêm {x, y} cho chắc. null = điểm hỏng (bỏ). */
const refPoint = (p: unknown): number[] | null => {
    if (Array.isArray(p)) {
        const x = finite(p[0]);
        const y = finite(p[1]);
        return x !== null && y !== null ? [x, y] : null;
    }
    const o = asRecord(p);
    if (!o) return null;
    const x = finite(o.x);
    const y = finite(o.y);
    return x !== null && y !== null ? [x, y] : null;
};

/** GET /practice/kanji/{ch}/strokes -> dữ liệu nét mẫu; không còn nét hợp lệ nào -> null (như "chưa có nét mẫu"). */
export const parseKanjiStrokes = (raw: unknown, fallbackKanji = ""): KanjiStrokeData | null => {
    const o = asRecord(raw);
    if (!o || !Array.isArray(o.strokes)) return null;
    const strokes = o.strokes
        .map((s) => (Array.isArray(s) ? s.map(refPoint).filter((p): p is number[] => p !== null) : []))
        .filter((s) => s.length > 0);
    if (strokes.length === 0) return null;
    const declared = nonNegInt(o.strokeCount);
    return {
        kanji: typeof o.kanji === "string" && o.kanji ? o.kanji : fallbackKanji,
        // Số nét theo dữ liệu thật: strokeCount lệch (hoặc thiếu) thì tin mảng nét vì chip "thiếu" dựa vào nó.
        strokeCount: declared !== null && declared === strokes.length ? declared : strokes.length,
        strokes,
    };
};

/**
 * Response POST /practice/kanji/score -> ServerStrokeScore. Thiếu totalScore -> null ("máy chủ chưa chấm được").
 * Nét nằm trong `extra` luôn có expectedIndex = null để summarizeStrokeScore gắn nhãn "thừa" (kể cả khi máy chủ
 * quên đặt expectedIndex).
 */
export const mapKanjiScore = (raw: unknown, fallbackKanji = ""): ServerStrokeScore | null => {
    const o = asRecord(raw);
    const total = o ? finite(o.totalScore) : null;
    if (!o || total === null) return null;
    const extra = indexList(o.extra);
    const extraSet = new Set(extra);
    const perStroke: StrokeScoreItem[] = (Array.isArray(o.perStroke) ? o.perStroke : [])
        .map((item, i): StrokeScoreItem | null => {
            const it = asRecord(item);
            if (!it) return null;
            const index = nonNegInt(it.index) ?? i;
            const score = finite(it.score);
            const exp = it.expectedIndex;
            const expectedIndex = extraSet.has(index) || exp === null ? null : nonNegInt(exp) ?? undefined;
            return {
                index,
                score: score === null ? 0 : clampScore(score),
                wrongDirection: it.wrongDirection === true,
                expectedIndex,
            };
        })
        .filter((s): s is StrokeScoreItem => s !== null)
        .sort((a, b) => a.index - b.index);
    return {
        kanji: typeof o.kanji === "string" && o.kanji ? o.kanji : fallbackKanji,
        totalScore: clampScore(total),
        isCorrectOrder: o.isCorrectOrder === true,
        feedback: typeof o.feedback === "string" ? o.feedback.trim() : "",
        perStroke,
        missing: Array.isArray(o.missing) ? indexList(o.missing) : null,
        extra,
        strokeCount: nonNegInt(o.strokeCount),
    };
};

/**
 * Chip từng nét cho bảng kết quả. Có danh sách `missing` của máy chủ thì dùng đúng danh sách đó cho nét thiếu
 * (máy chủ ghép nét bằng DTW nên biết chính xác nét mẫu nào chưa vẽ); không có (scorer tự tiêm / bản cũ) thì
 * suy từ số nét chuẩn như trước.
 */
export const strokeChipsFor = (score: StrokeScore & { missing?: number[] | null }, expectedCount: number | null): StrokeChip[] => {
    if (!Array.isArray(score.missing)) return summarizeStrokeScore(score, expectedCount);
    const drawn = summarizeStrokeScore(score, null);
    // Cùng nhãn "thiếu" với lib/strokes (STATUS_LABEL không export).
    const missing = indexList(score.missing).map((i): StrokeChip => ({ status: "missing", label: "thiếu", strokeNo: i + 1 }));
    return [...drawn, ...missing];
};

// --------------------------------------------------------------------------------------------- trọng âm (E4)

const isLevel = (v: unknown): v is PitchLevel => v === "H" || v === "L";

/** "LHH" hoặc ["L","H",null] -> mảng mức; ký tự / phần tử lạ -> null (không có thanh). */
const levelList = (raw: unknown): MoraLevel[] => {
    const items: unknown[] = typeof raw === "string" ? [...raw.toUpperCase()] : Array.isArray(raw) ? raw : [];
    return items.map((v) => (isLevel(v) ? v : null));
};

/** GET /practice/pitch/reference -> mẫu; thiếu accentType hợp lệ -> null (coi như chưa có dữ liệu). */
export const parsePitchReference = (raw: unknown): PitchReference | null => {
    const o = asRecord(raw);
    const accentType = o ? nonNegInt(o.accentType) : null;
    if (!o || accentType === null) return null;
    const moras = (Array.isArray(o.moras) ? o.moras : [])
        .map((m) => {
            const r = asRecord(m);
            return r && typeof r.mora === "string" && isLevel(r.level) ? { mora: r.mora, level: r.level } : null;
        })
        .filter((m): m is { mora: string; level: PitchLevel } => m !== null);
    return {
        word: typeof o.word === "string" ? o.word : "",
        reading: typeof o.reading === "string" ? o.reading : "",
        accentType,
        moras,
    };
};

/** Response POST /practice/pitch/score; thiếu pct -> null (giữ điểm của trình duyệt). */
export const parsePitchScore = (raw: unknown): ServerPitchScore | null => {
    const o = asRecord(raw);
    const pct = o ? finite(o.pct) : null;
    if (!o || pct === null) return null;
    const voiced = finite(o.voicedRatio);
    return {
        pct: Math.round(clampScore(pct)),
        userHL: levelList(o.userHL),
        refHL: levelList(o.refHL).filter(isLevel),
        wrongMora: indexList(o.wrongMora),
        voicedRatio: voiced === null ? null : Math.min(1, Math.max(0, voiced)),
        feedback: typeof o.feedback === "string" ? o.feedback.trim() : "",
    };
};

/**
 * Rút đường cao độ về ≤ `max` điểm (lấy mẫu đều, giữ điểm đầu / cuối) và làm tròn để payload gọn: t tới ms, f0 tới
 * 0.1 Hz. f0 không hữu hạn -> null (JSON không có NaN; máy chủ coi là khung không có thanh).
 */
export const downsampleContour = (
    points: readonly { t: number; f0: number | null }[],
    max: number = MAX_CONTOUR_POINTS
): { t: number; f0: number | null }[] => {
    const round = (p: { t: number; f0: number | null }) => ({
        t: Math.round(p.t * 1000) / 1000,
        f0: p.f0 !== null && Number.isFinite(p.f0) ? Math.round(p.f0 * 10) / 10 : null,
    });
    if (max <= 0 || points.length === 0) return [];
    if (points.length <= max) return points.map(round);
    if (max === 1) return [round(points[0])];
    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => round(points[Math.round(i * step)]));
};

/** Cắt chuỗi gửi lên theo độ dài cột (đếm theo code point để không cắt đôi ký tự ngoài BMP). */
export const clipText = (s: string, max: number): string => {
    const chars = [...s.trim()];
    return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
};

// --------------------------------------------------------------------------------------------- thống kê

const parseKindStats = (raw: unknown): PracticeKindStats => {
    const o = asRecord(raw);
    const count = (o ? nonNegInt(o.count) : null) ?? 0;
    const avg = o ? finite(o.avg) : null;
    return { count, avg: count === 0 || avg === null ? null : clampScore(avg) };
};

/** GET /practice/stats: loại thiếu -> 0 lượt; lượt gần đây hỏng bị bỏ, sắp mới nhất trước, tối đa 20. */
export const parsePracticeStats = (raw: unknown): PracticeStats => {
    const o = asRecord(raw) ?? {};
    const recent = (Array.isArray(o.recent) ? o.recent : [])
        .map((item): PracticeLogItem | null => {
            const r = asRecord(item);
            if (!r || !PRACTICE_KINDS.includes(r.kind as PracticeKind)) return null;
            const score = finite(r.score);
            const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
            if (score === null || !createdAt) return null;
            return {
                kind: r.kind as PracticeKind,
                target: typeof r.target === "string" ? r.target : "",
                score: Math.round(clampScore(score)),
                createdAt,
            };
        })
        .filter((r): r is PracticeLogItem => r !== null)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
        .slice(0, 20);
    return { write: parseKindStats(o.write), speak: parseKindStats(o.speak), pitch: parseKindStats(o.pitch), recent };
};

/** Điểm trung bình hiển thị: tối đa 1 chữ số thập phân kiểu Việt ("78,5"); null -> "—". */
export const formatPracticeAvg = (avg: number | null): string =>
    avg === null ? "—" : avg.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export type PracticeTone = "good" | "ok" | "poor";

/** Cùng thang với bảng luyện viết / phát âm: ≥ 80 tốt, ≥ 60 tạm được, còn lại yếu. */
export const practiceTone = (score: number): PracticeTone => (score >= 80 ? "good" : score >= 60 ? "ok" : "poor");

/** Tổng số lượt của cả ba loại (0 -> hiện trạng thái trống). */
export const totalPracticeCount = (s: PracticeStats): number => s.write.count + s.speak.count + s.pitch.count;
