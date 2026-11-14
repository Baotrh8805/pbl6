// Proxy NLP của backend (/api/nlp/*) phần chữ Hán & bộ thủ (C4, C5) — tách khỏi nlpService (bản đồ Hán–Việt) cho gọn.
// Response đi qua parse* (lib/kanjiUtils) vì là dữ liệu không đáng tin.
import { apiClient } from "./apiClient.ts";
import { parseKanjiCards, parseRadicalKanji, parseRadicals } from "../lib/kanjiUtils.ts";
import type { KanjiInfoCard, Radical, RadicalKanjiList } from "../types/api.types.ts";

/**
 * POST /nlp/kanji-cards {kanji, userLevel?}: thẻ từng chữ (Hán-Việt, bộ, On/Kun kèm ví dụ). userLevel (N5..N1) để ví dụ
 * đúng cấp đang học xếp trước; mục không phải một chữ Hán bị server bỏ qua.
 */
export const fetchKanjiCards = async (kanji: string[], userLevel?: string | null): Promise<KanjiInfoCard[]> =>
    parseKanjiCards(
        (await apiClient.post("/nlp/kanji-cards", userLevel ? { kanji, userLevel } : { kanji }, { timeout: 30_000 })).data
    );

// Bảng 214 bộ thủ không đổi trong phiên: tải một lần cho cả hai tab (tra chữ cần tên bộ, tab bộ thủ cần cả bảng).
// Lỗi hoặc bảng rỗng (ai-service thiếu / chưa nạp xong dữ liệu) thì xoá cache để lần sau (nút "Thử lại") gọi lại server.
let radicalsCache: Promise<Radical[]> | null = null;

/** GET /nlp/radicals -> 214 bộ thủ Khang Hi (rỗng khi ai-service thiếu dữ liệu). */
export const fetchRadicals = (): Promise<Radical[]> => {
    radicalsCache ??= apiClient
        .get("/nlp/radicals")
        .then((res) => {
            const radicals = parseRadicals(res.data);
            if (radicals.length === 0) radicalsCache = null;
            return radicals;
        })
        .catch((e: unknown) => {
            radicalsCache = null;
            throw e;
        });
    return radicalsCache;
};

/** GET /nlp/radicals/{no}/kanji?levels=N5,N4 -> chữ JLPT thuộc bộ (dễ -> khó); levels rỗng = mọi cấp. */
export const fetchRadicalKanji = async (no: number, levels: string[] = []): Promise<RadicalKanjiList> =>
    parseRadicalKanji(
        (
            await apiClient.get(`/nlp/radicals/${encodeURIComponent(String(no))}/kanji`, {
                params: levels.length > 0 ? { levels: levels.join(",") } : {},
            })
        ).data
    );
