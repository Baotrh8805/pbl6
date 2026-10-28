// Từ điển cho người học (/api/dictionary/*, spec 2026-10-26 §6.4). Khoá mục có ký tự ":" "|" và chữ Nhật → luôn encodeURIComponent.
import { apiClient } from "./apiClient.ts";
import type { DictComment, DictEntry, DictExample, DictKey, DictPage, DictReport, DictReportField, DictSearchResult, DictSentenceResult, DictSummary, DictToken, DictTranslateDirection, DictTranslation } from "../types/dictionary.types.ts";

const enc = encodeURIComponent;

export type DictSearchMode = "auto" | "ja" | "en" | "vi";

export const searchDictionary = async (
    q: string,
    mode: DictSearchMode = "auto",
    page = 0,
    size = 20,
    signal?: AbortSignal
): Promise<DictSearchResult> =>
    (await apiClient.get<DictSearchResult>("/dictionary/search", { params: { q, mode, page, size }, signal })).data;

/** Tab Câu: câu ví dụ chứa cụm q (Nhật đúng chuỗi, Anh từ đầu một từ, Việt có / không dấu); câu ngắn trước. */
export const searchDictSentences = async (q: string, page = 0, size = 20, signal?: AbortSignal): Promise<DictSentenceResult> =>
    (await apiClient.get<DictSentenceResult>("/dictionary/sentences", { params: { q, page, size }, signal })).data;

/** Vẽ chữ Hán để tra: các nét (toạ độ khung vẽ) → chữ gợi ý, giống nhất trước. */
export const recognizeHandwriting = async (strokes: { x: number; y: number }[][]): Promise<{ char: string; score: number }[]> =>
    (await apiClient.post<{ candidates: { char: string; score: number }[] }>("/dictionary/handwriting", { strokes })).data.candidates ?? [];

export const fetchDictEntry = async (key: DictKey, q?: string): Promise<DictEntry> =>
    (await apiClient.get<DictEntry>(`/dictionary/entries/${enc(key)}`, { params: q ? { q } : undefined })).data;

export const translateDictExamples = async (
    key: DictKey,
    exampleIds: string[]
): Promise<{ state: string; examples: DictExample[]; meaningVi: string | null; aiLeft: number }> =>
    (await apiClient.post(`/dictionary/entries/${enc(key)}/translate-examples`, { exampleIds })).data;

export const tokenizeForDictionary = async (text: string): Promise<DictToken[]> =>
    (await apiClient.post<{ tokens: DictToken[] }>("/dictionary/tokenize", { text })).data.tokens;

/** Tab Dịch (D33): dịch câu / đoạn Nhật ↔ Việt bằng AI (cả đoạn, có bộ nhớ dịch, trần giờ riêng) + phân tích câu Nhật. */
export const translateText = async (text: string, direction: DictTranslateDirection = "auto", signal?: AbortSignal): Promise<DictTranslation> =>
    (await apiClient.post<DictTranslation>("/dictionary/translate", { text, direction }, { signal })).data;

// ---------- bình luận ----------

export const fetchDictComments = async (key: DictKey, sort: "helpful" | "newest", page = 0, size = 20): Promise<DictPage<DictComment>> =>
    (await apiClient.get<DictPage<DictComment>>(`/dictionary/entries/${enc(key)}/comments`, { params: { sort, page, size } })).data;

export const addDictComment = async (key: DictKey, content: string): Promise<DictComment> =>
    (await apiClient.post<DictComment>(`/dictionary/entries/${enc(key)}/comments`, { content })).data;

export const editDictComment = async (id: number, content: string): Promise<DictComment> =>
    (await apiClient.patch<DictComment>(`/dictionary/comments/${id}`, { content })).data;

export const deleteDictComment = async (id: number): Promise<void> => {
    await apiClient.delete(`/dictionary/comments/${id}`);
};

export const toggleDictHelpful = async (id: number): Promise<{ helpfulCount: number; votedByMe: boolean }> =>
    (await apiClient.post(`/dictionary/comments/${id}/helpful`)).data;

// ---------- báo cáo ----------

export const reportDictEntry = async (
    key: DictKey,
    body: { field: DictReportField; subKey?: string | null; proposedValue?: string | null; note?: string | null }
): Promise<DictReport> => (await apiClient.post<DictReport>(`/dictionary/entries/${enc(key)}/reports`, body)).data;

export const reportDictComment = async (id: number, reason: "SPAM" | "OFFENSIVE" | "WRONG" | "OTHER", note?: string): Promise<DictReport> =>
    (await apiClient.post<DictReport>(`/dictionary/comments/${id}/reports`, { reason, note: note || null })).data;

export const fetchMyDictReports = async (page = 0, size = 20): Promise<DictPage<DictReport>> =>
    (await apiClient.get<DictPage<DictReport>>("/dictionary/reports/mine", { params: { page, size } })).data;

// ---------- sổ tay + lịch sử ----------

export const fetchDictFavorites = async (page = 0, size = 50): Promise<DictPage<DictSummary>> =>
    (await apiClient.get<DictPage<DictSummary>>("/dictionary/favorites", { params: { page, size } })).data;

export const saveDictFavorite = async (key: DictKey, note?: string | null): Promise<{ saved: boolean; note: string | null }> =>
    (await apiClient.put(`/dictionary/favorites/${enc(key)}`, { note: note ?? null })).data;

export const removeDictFavorite = async (key: DictKey): Promise<void> => {
    await apiClient.delete(`/dictionary/favorites/${enc(key)}`);
};

export const fetchDictHistory = async (size = 100): Promise<DictSummary[]> =>
    (await apiClient.get<{ items: DictSummary[] }>("/dictionary/history", { params: { size } })).data.items;

export const clearDictHistory = async (): Promise<void> => {
    await apiClient.delete("/dictionary/history");
};
