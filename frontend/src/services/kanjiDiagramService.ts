// Sơ đồ chữ Hán (/graph, spec 2026-10-30 + spec từ nhiều chữ): GET /api/nlp/kanji-diagram?q=&mode=&k= — backend kiểm tham số,
// cache 10 phút, ghép nghĩa Việt từ dict_meanings; ai-service tắt → 503 (apiClient đổi thành thông điệp tiếng Việt).
// mode null = để ai-service tự chọn (từ 2–4 chữ → word); k = chữ chọn trong từ cho structure / compounds.
import { apiClient } from "./apiClient.ts";
import type { KanjiDiagramMode, KanjiDiagramResponse } from "../types/kanjiDiagram.types.ts";

export const fetchKanjiDiagram = async (
    q: string,
    mode: KanjiDiagramMode | null = null,
    k: string | null = null,
    signal?: AbortSignal
): Promise<KanjiDiagramResponse> => {
    const params: Record<string, string> = { q };
    if (mode) params.mode = mode;
    if (k) params.k = k;
    return (await apiClient.get<KanjiDiagramResponse>("/nlp/kanji-diagram", { params, signal })).data;
};
