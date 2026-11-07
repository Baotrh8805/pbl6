// Kiểu dữ liệu luyện tập (E2 viết kanji, E3 phát âm, E4 trọng âm) theo hợp đồng API đợt 2 §2.
// Response đi qua parse* trong features/practice/practiceUtils.ts (backend bỏ trường null, dữ liệu không đáng tin).
import type { StrokeScore } from "../lib/strokes.ts";
import type { MoraLevel, PitchLevel } from "../lib/pitch.ts";

export type PracticeKind = "write" | "speak" | "pitch";

/** GET /practice/kanji/{ch}/strokes: nét chuẩn KanjiVG, toạ độ 0..1. */
export interface KanjiStrokeData {
    kanji: string;
    strokeCount: number;
    /** [[ [x, y], ... ], ...] — cùng dạng prop `reference` của KanjiCanvas. */
    strokes: number[][][];
}

/** POST /practice/kanji/score (≤ 40 nét, ≤ 500 điểm/nét). */
export interface KanjiScoreRequest {
    kanji: string;
    cardId?: string;
    strokes: { x: number; y: number; t: number }[][];
}

/**
 * Kết quả chấm của máy chủ = StrokeScore (để KanjiWritePanel hiển thị như scorer tự tiêm) + phần máy chủ trả thêm.
 * `missing` = chỉ số nét MẪU chưa vẽ (0-based), `extra` = chỉ số nét NGƯỜI VẼ không ứng với nét mẫu nào.
 */
export interface ServerStrokeScore extends StrokeScore {
    kanji: string;
    /** null = máy chủ không gửi (bản cũ): chip "thiếu" suy ra từ số nét chuẩn như trước. */
    missing: number[] | null;
    extra: number[];
    strokeCount: number | null;
}

/** GET /practice/pitch/reference?word=&reading= */
export interface PitchReference {
    word: string;
    reading: string;
    /** Kiểu trọng âm Tokyo: 0 = heiban, 1 = atamadaka, n = hạ sau mora n. */
    accentType: number;
    moras: { mora: string; level: PitchLevel }[];
}

/** POST /practice/pitch/score (contour ≤ 2000 điểm). */
export interface PitchScoreRequest {
    cardId?: string;
    word: string;
    reading?: string;
    accentType?: number;
    contour: { t: number; f0: number | null }[];
}

export interface ServerPitchScore {
    /** 0–100. */
    pct: number;
    userHL: MoraLevel[];
    refHL: PitchLevel[];
    /** Chỉ số (0-based) các mora sai mức. */
    wrongMora: number[];
    /** Tỉ lệ khung có thanh trên cả bản ghi; null = máy chủ không gửi. */
    voicedRatio: number | null;
    feedback: string;
}

/** POST /practice/pronunciation (âm thanh không bao giờ gửi lên; chỉ điểm + bản nhận dạng). */
export interface PronunciationLogRequest {
    cardId?: string;
    term: string;
    /** Chuỗi đã dùng để chấm (cách đọc hoặc thuật ngữ). */
    target: string;
    transcript: string;
    score: number;
}

export interface PracticeKindStats {
    count: number;
    /** Điểm trung bình 0–100; null khi chưa có lượt nào. */
    avg: number | null;
}

export interface PracticeLogItem {
    kind: PracticeKind;
    target: string;
    score: number;
    createdAt: string;
}

/** GET /practice/stats?days=30 */
export interface PracticeStats {
    write: PracticeKindStats;
    speak: PracticeKindStats;
    pitch: PracticeKindStats;
    /** ≤ 20 lượt gần nhất, mới nhất trước. */
    recent: PracticeLogItem[];
}
