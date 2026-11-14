// Proxy NLP của backend (/api/nlp/*): bản đồ Hán–Việt (F1). Response đi qua parse* vì là dữ liệu không đáng tin.
import { apiClient } from "./apiClient.ts";
import { parseHanVietGraph, parseHanVietSuggestions } from "../lib/hanVietUtils.ts";
import type { HanVietGraph, HanVietSuggestion } from "../types/api.types.ts";

export const HAN_VIET_GRAPH_LIMIT = 100;

/**
 * GET /nlp/han-viet-graph?reading=&level=&limit= -> âm + chữ Hán mang âm đó + từ ghép (tối đa `limit`, 1..100).
 * Âm không có trong từ điển: server trả 200 với nodes rỗng (không phải lỗi).
 */
export const fetchHanVietGraph = async (reading: string, level?: string, limit = HAN_VIET_GRAPH_LIMIT): Promise<HanVietGraph> => {
    const params: Record<string, string | number> = { reading, limit: Math.min(100, Math.max(1, Math.round(limit))) };
    if (level) params.level = level;
    return parseHanVietGraph((await apiClient.get("/nlp/han-viet-graph", { params })).data);
};

/** GET /nlp/han-viet-suggest?q=&limit= -> các âm bắt đầu bằng `q` kèm số chữ Hán và vài chữ ví dụ. */
export const suggestHanViet = async (q: string, limit = 8): Promise<HanVietSuggestion[]> =>
    parseHanVietSuggestions((await apiClient.get("/nlp/han-viet-suggest", { params: { q, limit } })).data);
