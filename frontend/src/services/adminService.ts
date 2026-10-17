// Gọi API Admin Panel (/api/admin/*) + báo cáo bộ thẻ + thông báo hệ thống. Khớp spec docs/Plan/specs/2026-10-17.
import { apiClient } from "./apiClient.ts";
import type {
    AdminDeckDetail,
    AdminDeckRow,
    AdminExtractionRow,
    AdminHealth,
    AdminPage,
    AdminRatingRow,
    AdminSettings,
    AdminStats,
    AdminUserDetail,
    AdminUserPatch,
    AdminUserRow,
    AuditLog,
    ContentReport,
    ReportAction,
    ReportReason,
    Role,
} from "../types/api.types.ts";

type Params = Record<string, string | number | boolean | null | undefined>;

/** Bỏ tham số rỗng để URL gọn và backend hiểu là "không lọc". */
const clean = (p: Params): Params =>
    Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));

const enc = (v: string | number) => encodeURIComponent(String(v));

// ---------- tổng quan ----------

export const fetchAdminStats = async (days = 30): Promise<AdminStats> =>
    (await apiClient.get<AdminStats>("/admin/stats", { params: { days } })).data;

export const fetchAdminHealth = async (): Promise<AdminHealth> =>
    (await apiClient.get<AdminHealth>("/admin/health")).data;

// ---------- người dùng ----------

export const fetchAdminUsers = async (params: Params): Promise<AdminPage<AdminUserRow>> =>
    (await apiClient.get<AdminPage<AdminUserRow>>("/admin/users", { params: clean(params) })).data;

export const fetchAdminUser = async (id: number | string): Promise<AdminUserDetail> =>
    (await apiClient.get<AdminUserDetail>(`/admin/users/${enc(id)}`)).data;

export const patchAdminUser = async (id: number, body: AdminUserPatch): Promise<AdminUserDetail> =>
    (await apiClient.patch<AdminUserDetail>(`/admin/users/${enc(id)}`, body)).data;

export const setUserRole = async (id: number, role: Role): Promise<AdminUserDetail> =>
    (await apiClient.put<AdminUserDetail>(`/admin/users/${enc(id)}/role`, { role })).data;

export const revokeUserSessions = async (id: number): Promise<void> => {
    await apiClient.post(`/admin/users/${enc(id)}/revoke-sessions`);
};

// ---------- nội dung ----------

export const fetchAdminDecks = async (params: Params): Promise<AdminPage<AdminDeckRow>> =>
    (await apiClient.get<AdminPage<AdminDeckRow>>("/admin/decks", { params: clean(params) })).data;

export const fetchAdminDeck = async (id: string): Promise<AdminDeckDetail> =>
    (await apiClient.get<AdminDeckDetail>(`/admin/decks/${enc(id)}`)).data;

export const unpublishDeck = async (id: string): Promise<AdminDeckDetail> =>
    (await apiClient.post<AdminDeckDetail>(`/admin/decks/${enc(id)}/unpublish`)).data;

export const setDeckFlags = async (id: string, body: { official?: boolean; featured?: boolean }): Promise<AdminDeckRow> =>
    (await apiClient.patch<AdminDeckRow>(`/admin/decks/${enc(id)}/flags`, body)).data;

export const deleteAdminDeck = async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/decks/${enc(id)}`);
};

export const fetchAdminRatings = async (params: Params): Promise<AdminPage<AdminRatingRow>> =>
    (await apiClient.get<AdminPage<AdminRatingRow>>("/admin/ratings", { params: clean(params) })).data;

export const clearRatingComment = async (id: number): Promise<void> => {
    await apiClient.delete(`/admin/ratings/${enc(id)}/comment`);
};

export const fetchAdminExtractions = async (params: Params): Promise<AdminPage<AdminExtractionRow>> =>
    (await apiClient.get<AdminPage<AdminExtractionRow>>("/admin/extractions", { params: clean(params) })).data;

export const deleteAdminExtraction = async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/extractions/${enc(id)}`);
};

// ---------- báo cáo ----------

export const fetchReports = async (params: Params): Promise<AdminPage<ContentReport>> =>
    (await apiClient.get<AdminPage<ContentReport>>("/admin/reports", { params: clean(params) })).data;

export const resolveReport = async (
    id: number,
    body: { action: ReportAction; note?: string; ratingId?: number }
): Promise<ContentReport> => (await apiClient.post<ContentReport>(`/admin/reports/${enc(id)}/resolve`, body)).data;

export const dismissReport = async (id: number, body: { note?: string }): Promise<ContentReport> =>
    (await apiClient.post<ContentReport>(`/admin/reports/${enc(id)}/dismiss`, body)).data;

/** Người học báo cáo bộ thẻ public (409 = đã báo cáo rồi). */
export const reportDeck = async (deckId: string, body: { reason: ReportReason; detail?: string }): Promise<void> => {
    await apiClient.post(`/library/decks/${enc(deckId)}/reports`, body);
};

// ---------- nhật ký, cấu hình, thông báo ----------

export const fetchAuditLogs = async (params: Params): Promise<AdminPage<AuditLog>> =>
    (await apiClient.get<AdminPage<AuditLog>>("/admin/audit-logs", { params: clean(params) })).data;

export const fetchSettings = async (): Promise<AdminSettings> =>
    (await apiClient.get<AdminSettings>("/admin/settings")).data;

export const updateSettings = async (body: AdminSettings): Promise<AdminSettings> =>
    (await apiClient.put<AdminSettings>("/admin/settings", body)).data;

export const fetchAnnouncement = async (): Promise<string> =>
    (await apiClient.get<{ text: string }>("/announcement")).data.text;
