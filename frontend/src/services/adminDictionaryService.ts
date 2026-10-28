// Quản lý từ điển gốc (/api/admin/dictionary/*, spec 2026-10-26 §8.3). ADMIN và SUPER_ADMIN đều sửa trực tiếp (D21).
import { apiClient } from "./apiClient.ts";
import type {
    DictAdminComment,
    DictAdminEntry,
    DictHistory,
    DictKey,
    DictPage,
    DictQueueRow,
    DictReport,
    DictSearchResult,
    DictStats,
    DictSyncResult,
} from "../types/dictionary.types.ts";

const enc = encodeURIComponent;

export type DictQueueFilter = "pending" | "reported" | "en_only" | "machine" | "verified" | "all";

export const fetchDictQueue = async (params: {
    group?: DictQueueFilter;
    level?: string;
    kind?: "word" | "kanji" | "";
    q?: string;
    page?: number;
    size?: number;
}): Promise<DictPage<DictQueueRow>> => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
    return (await apiClient.get<DictPage<DictQueueRow>>("/admin/dictionary/queue", { params: clean })).data;
};

export const searchDictAdmin = async (q: string, page = 0, size = 20): Promise<DictSearchResult> =>
    (await apiClient.get<DictSearchResult>("/admin/dictionary/search", { params: { q, page, size } })).data;

export const fetchDictAdminEntry = async (key: DictKey): Promise<DictAdminEntry> =>
    (await apiClient.get<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}`)).data;

export const setDictMeaning = async (key: DictKey, value: string, reason?: string): Promise<DictAdminEntry> =>
    (await apiClient.put<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}/meaning-vi`, { value, reason: reason || null })).data;

export const verifyDictMeaning = async (key: DictKey): Promise<DictAdminEntry> =>
    (await apiClient.post<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}/verify`)).data;

export const retranslateDictEntry = async (key: DictKey): Promise<DictAdminEntry> =>
    (await apiClient.post<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}/retranslate`)).data;

export type DictOverrideField = "reading" | "han_viet" | "meaning_en" | "kanji_meaning" | "example_jpn" | "example_eng" | "example_hidden";

/** value rỗng / null = bỏ ghi đè (về dữ liệu gốc). */
export const putDictOverride = async (
    key: DictKey,
    body: { field: DictOverrideField; subKey?: string; value: string | null; reason?: string }
): Promise<DictAdminEntry> => (await apiClient.put<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}/overrides`, body)).data;

export const setDictExampleVi = async (key: DictKey, exampleId: string, value: string | null): Promise<DictAdminEntry> =>
    (await apiClient.put<DictAdminEntry>(`/admin/dictionary/entries/${enc(key)}/examples/${enc(exampleId)}/vi`, { value })).data;

export const revertDictHistory = async (id: number): Promise<DictAdminEntry> =>
    (await apiClient.post<DictAdminEntry>(`/admin/dictionary/history/${id}/revert`)).data;

export const fetchDictHistoryAdmin = async (params: { field?: string; page?: number; size?: number }): Promise<DictPage<DictHistory>> =>
    (await apiClient.get<DictPage<DictHistory>>("/admin/dictionary/history", { params })).data;

export const fetchDictReports = async (params: {
    kind?: "ENTRY" | "COMMENT" | "";
    status?: "OPEN" | "RESOLVED" | "DISMISSED" | "ALL";
    q?: string;
    page?: number;
    size?: number;
}): Promise<DictPage<DictReport>> => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
    return (await apiClient.get<DictPage<DictReport>>("/admin/dictionary/reports", { params: clean })).data;
};

export const applyDictReport = async (id: number): Promise<DictAdminEntry> =>
    (await apiClient.post<DictAdminEntry>(`/admin/dictionary/reports/${id}/apply`)).data;

export const resolveDictReport = async (id: number, note?: string, action?: "hide" | "delete"): Promise<DictReport> =>
    (await apiClient.post<DictReport>(`/admin/dictionary/reports/${id}/resolve`, { note: note || null }, {
        params: action ? { action } : undefined,
    })).data;

export const dismissDictReport = async (id: number, note: string): Promise<DictReport> =>
    (await apiClient.post<DictReport>(`/admin/dictionary/reports/${id}/dismiss`, { note })).data;

export const fetchDictAdminComments = async (params: {
    q?: string;
    hidden?: boolean;
    page?: number;
    size?: number;
}): Promise<DictPage<DictAdminComment>> => (await apiClient.get<DictPage<DictAdminComment>>("/admin/dictionary/comments", { params })).data;

export const hideDictComment = async (id: number, note: string): Promise<void> => {
    await apiClient.post(`/admin/dictionary/comments/${id}/hide`, { note });
};

export const unhideDictComment = async (id: number): Promise<void> => {
    await apiClient.post(`/admin/dictionary/comments/${id}/unhide`);
};

export const deleteDictCommentAdmin = async (id: number): Promise<void> => {
    await apiClient.delete(`/admin/dictionary/comments/${id}`);
};

export const syncDictToAi = async (): Promise<DictSyncResult> =>
    (await apiClient.post<DictSyncResult>("/admin/dictionary/sync-ai")).data;

export const fetchDictStats = async (): Promise<DictStats> => (await apiClient.get<DictStats>("/admin/dictionary/stats")).data;
