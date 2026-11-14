import { apiClient } from "./apiClient.ts";
import type { AdminPage } from "../types/api.types.ts";
import type {
    ModerationCounts,
    ModerationKind,
    ModerationQueueItem,
    ModerationRescan,
    ModerationSensitive,
} from "../types/moderation.types.ts";

// Admin › Kiểm duyệt AI (spec 2026-10-27 đêm §6.3): hàng chờ bình luận AI gắn cờ / chặn, xử lý, quét lại, công tắc mục từ nhạy cảm.

export const fetchModerationQueue = async (params: {
    status?: string;
    kind?: string;
    q?: string;
    page?: number;
    size?: number;
}): Promise<AdminPage<ModerationQueueItem>> =>
    (await apiClient.get<AdminPage<ModerationQueueItem>>("/admin/moderation", { params })).data;

export const fetchModerationCounts = async (): Promise<ModerationCounts> =>
    (await apiClient.get<ModerationCounts>("/admin/moderation/counts")).data;

export type ModerationAction = "ignore" | "restore" | "hide";

export const moderationAction = async (
    kind: ModerationKind,
    id: number,
    action: ModerationAction,
    note?: string
): Promise<ModerationQueueItem> =>
    (await apiClient.post<ModerationQueueItem>(`/admin/moderation/${kind}/${id}/${action}`, action === "hide" ? { note: note ?? null } : undefined)).data;

export const deleteModerationItem = async (kind: ModerationKind, id: number): Promise<void> => {
    await apiClient.delete(`/admin/moderation/${kind}/${id}`);
};

export const rescanModeration = async (): Promise<ModerationRescan> =>
    (await apiClient.post<ModerationRescan>("/admin/moderation/rescan")).data;

const enc = (key: string) => encodeURIComponent(key);

export const fetchDictSensitive = async (key: string): Promise<ModerationSensitive> =>
    (await apiClient.get<ModerationSensitive>(`/admin/dictionary/entries/${enc(key)}/sensitive`)).data;

export const setDictSensitive = async (key: string, sensitive: boolean, note?: string): Promise<ModerationSensitive> =>
    (await apiClient.put<ModerationSensitive>(`/admin/dictionary/entries/${enc(key)}/sensitive`, { sensitive, note: note || null })).data;
