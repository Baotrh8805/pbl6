// Sơ đồ chữ Hán (/graph, spec 2026-10-30): GET /api/nlp/kanji-diagram?q=&mode= — backend kiểm tham số, cache 10 phút, ghép
// nghĩa Việt từ dict_meanings; ai-service tắt → 503 (apiClient đổi thành thông điệp tiếng Việt).
import { apiClient } from "./apiClient.ts";
import type { KanjiDiagramMode, KanjiDiagramResponse } from "../types/kanjiDiagram.types.ts";

export const fetchKanjiDiagram = async (
    q: string,
    mode: KanjiDiagramMode = "structure",
    signal?: AbortSignal
): Promise<KanjiDiagramResponse> =>
    (await apiClient.get<KanjiDiagramResponse>("/nlp/kanji-diagram", { params: { q, mode }, signal })).data;
