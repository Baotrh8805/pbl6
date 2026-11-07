// Luyện tập (/api/practice, USER — hợp đồng API đợt 2 §2): nét mẫu + chấm viết kanji, mẫu + chấm trọng âm, ghi
// nhật ký phát âm, thống kê. Response đi qua parse* (features/practice/practiceUtils) vì backend bỏ trường null.
//
import { apiClient } from "./apiClient.ts";
import { httpStatusOf } from "../lib/apiErrorInfo.ts";
import {
    DEFAULT_PRACTICE_STATS_DAYS,
    PRACTICE_TARGET_MAX,
    PRACTICE_TRANSCRIPT_MAX,
    clipText,
    downsampleContour,
    mapKanjiScore,
    parseKanjiStrokes,
    parsePitchReference,
    parsePitchScore,
    parsePracticeStats,
} from "../features/practice/practiceUtils.ts";
import type {
    KanjiScoreRequest,
    KanjiStrokeData,
    PitchReference,
    PitchScoreRequest,
    PracticeStats,
    PronunciationLogRequest,
    ServerPitchScore,
    ServerStrokeScore,
} from "../types/practice.types.ts";

/** Thêm cardId khi có: thẻ tay / trang tra cứu kanji không gắn thẻ nào. */
const withCard = <T extends object>(body: T, cardId?: string | null): T & { cardId?: string } =>
    cardId ? { ...body, cardId } : body;

/**
 * GET /practice/kanji/{ch}/strokes. 404 = chưa có dữ liệu nét mẫu cho chữ này (kể cả khi backend chưa có route:
 * kết quả với người học như nhau — vẫn vẽ / đếm nét được, chỉ khoá chấm điểm).
 */
export const fetchKanjiStrokes = async (ch: string, signal?: AbortSignal): Promise<KanjiStrokeData | null> => {
    try {
        const res = await apiClient.get(`/practice/kanji/${encodeURIComponent(ch)}/strokes`, { signal });
        return parseKanjiStrokes(res.data, ch);
    } catch (err) {
        if (httpStatusOf(err) === 404) return null;
        throw err;
    }
};

/** POST /practice/kanji/score: chấm + ghi nhật ký `write`. null = máy chủ trả dữ liệu không đọc được. */
export const scoreKanji = async (req: KanjiScoreRequest): Promise<ServerStrokeScore | null> => {
    const res = await apiClient.post("/practice/kanji/score", withCard({ kanji: req.kanji, strokes: req.strokes }, req.cardId));
    return mapKanjiScore(res.data, req.kanji);
};

/**
 * GET /practice/pitch/reference?word=&reading=. 404 (không có dữ liệu) hoặc 400 (cách đọc không phải kana) -> null:
 * bảng phát âm giữ giao diện "chưa có dữ liệu trọng âm chuẩn" như trước.
 */
export const fetchPitchReference = async (word: string, reading: string, signal?: AbortSignal): Promise<PitchReference | null> => {
    try {
        const res = await apiClient.get("/practice/pitch/reference", { params: { word, reading }, signal });
        return parsePitchReference(res.data);
    } catch (err) {
        const status = httpStatusOf(err);
        if (status === 404 || status === 400) return null;
        throw err;
    }
};

/** POST /practice/pitch/score: máy chủ chấm lại đường cao độ + ghi nhật ký `pitch`. */
export const scorePitch = async (req: PitchScoreRequest): Promise<ServerPitchScore | null> => {
    const body: Omit<PitchScoreRequest, "cardId"> = {
        word: req.word,
        contour: downsampleContour(req.contour),
        ...(req.reading ? { reading: req.reading } : {}),
        ...(req.accentType != null ? { accentType: req.accentType } : {}),
    };
    return parsePitchScore((await apiClient.post("/practice/pitch/score", withCard(body, req.cardId))).data);
};

/** POST /practice/pronunciation -> 201: chỉ ghi nhật ký `speak` (điểm do trình duyệt chấm). */
export const logPronunciation = async (req: PronunciationLogRequest): Promise<void> => {
    const body = {
        term: clipText(req.term, PRACTICE_TARGET_MAX),
        target: clipText(req.target, PRACTICE_TARGET_MAX),
        transcript: clipText(req.transcript, PRACTICE_TRANSCRIPT_MAX),
        score: Math.round(Math.min(100, Math.max(0, req.score))),
    };
    await apiClient.post("/practice/pronunciation", withCard(body, req.cardId));
};

/** GET /practice/stats?days=: số lượt + điểm trung bình từng loại, ≤ 20 lượt gần nhất. */
export const fetchPracticeStats = async (days: number = DEFAULT_PRACTICE_STATS_DAYS): Promise<PracticeStats> => {
    return parsePracticeStats((await apiClient.get("/practice/stats", { params: { days } })).data);
};
