// Gọi API Admin Panel (/api/admin/*) + báo cáo bộ thẻ + thông báo hệ thống. Khớp spec docs/Plan/specs/2026-10-17
// và hợp đồng đợt 2 docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md (mẹo nhớ, nguồn tri thức, khiếu nại, xác thực email).
import { apiClient } from "./apiClient.ts";
import { normalizeAppeal, queueCounts } from "../features/admin/moderationUtils.ts";
import type {
    AccountAppeal,
    AdminMnemonic,
    AppealAction,
    KnowledgeSourceDetail,
    KnowledgeSourceRow,
    KnowledgeUploadInput,
} from "../types/adminModeration.types.ts";
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
    MyReport,
    ReportAction,
    ReportReason,
    ReportStatus,
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

/** Báo cáo của chính người học; deckId + status=OPEN để biết đã báo cáo bộ thẻ đó chưa. */
export const fetchMyReports = async (params: { deckId?: string; status?: ReportStatus; page?: number; size?: number }): Promise<AdminPage<MyReport>> =>
    (await apiClient.get<AdminPage<MyReport>>("/library/reports", { params: clean(params) })).data;

/** Rút lại báo cáo còn mở (409 = admin đã xử lý). */
export const withdrawReport = async (id: number): Promise<void> => {
    await apiClient.delete(`/library/reports/${enc(id)}`);
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

/**
 * Số việc chờ cho badge điều hướng admin (mẹo chờ duyệt, khiếu nại mở, báo lỗi câu hỏi, báo cáo mở).
 * Lấy từ /admin/stats (days=7 cho nhẹ); trường null = backend chưa trả -> không hiện badge.
 */
export const fetchAdminQueueCounts = async () => queueCounts(await fetchAdminStats(7));

// ---------- §3 xác thực email ----------

/** Admin xác thực thủ công email của người dùng (audit USER_VERIFY_EMAIL); trả chi tiết người dùng. */
export const verifyUserEmail = async (id: number): Promise<AdminUserDetail> =>
    apiClient.post<AdminUserDetail>(`/admin/users/${enc(id)}/verify-email`).then((r) => r.data);

// ---------- §4 mẹo nhớ bộ thủ ----------

export const fetchAdminMnemonics = async (params: Params): Promise<AdminPage<AdminMnemonic>> =>
    apiClient.get<AdminPage<AdminMnemonic>>("/admin/mnemonics", { params: clean(params) }).then((r) => r.data);

/** Chỉ khi PENDING (409 nếu đã duyệt / từ chối). */
export const patchAdminMnemonic = async (id: string, mnemonicVi: string): Promise<AdminMnemonic> =>
    apiClient.patch<AdminMnemonic>(`/admin/mnemonics/${enc(id)}`, { mnemonicVi }).then((r) => r.data);

/** Duyệt: mẹo APPROVED cũ của cùng chữ tự chuyển REJECTED ("Thay bằng mẹo mới"). */
export const approveMnemonic = async (id: string, note?: string): Promise<AdminMnemonic> =>
    apiClient.post<AdminMnemonic>(`/admin/mnemonics/${enc(id)}/approve`, note ? { note } : {}).then((r) => r.data);

/** Từ chối: note bắt buộc (tác giả nhận thông báo MNEMONIC_REVIEWED kèm ghi chú). */
export const rejectMnemonic = async (id: string, note: string): Promise<AdminMnemonic> =>
    apiClient.post<AdminMnemonic>(`/admin/mnemonics/${enc(id)}/reject`, { note }).then((r) => r.data);

// ---------- §5 nguồn tri thức chuẩn ----------

export const fetchKnowledgeSources = async (params: Params): Promise<AdminPage<KnowledgeSourceRow>> =>
    apiClient.get<AdminPage<KnowledgeSourceRow>>("/admin/knowledge-sources", { params: clean(params) }).then((r) => r.data);

export const fetchKnowledgeSource = async (id: string): Promise<KnowledgeSourceDetail> =>
    apiClient.get<KnowledgeSourceDetail>(`/admin/knowledge-sources/${enc(id)}`).then((r) => r.data);

/**
 * multipart `file` | `text` + title / kind / level. Như createExtraction: ghi đè Content-Type để axios không JSON hoá
 * FormData (trình duyệt tự gắn boundary); timeout dài vì server trích entries qua ai-service.
 */
const knowledgeForm = (input: KnowledgeUploadInput): FormData => {
    const form = new FormData();
    if (input.file) form.append("file", input.file, input.file.name);
    else if (input.text != null) form.append("text", input.text);
    form.append("title", input.title.trim());
    form.append("kind", input.kind);
    if (input.level) form.append("level", input.level);
    return form;
};

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 };

export const createKnowledgeSource = async (input: KnowledgeUploadInput): Promise<KnowledgeSourceDetail> =>
    apiClient.post<KnowledgeSourceDetail>("/admin/knowledge-sources", knowledgeForm(input), MULTIPART).then((r) => r.data);

/** Phiên bản mới (version + 1) thay nội dung của nguồn đang có. */
export const updateKnowledgeSource = async (id: string, input: KnowledgeUploadInput): Promise<KnowledgeSourceDetail> =>
    apiClient
        .put<KnowledgeSourceDetail>(`/admin/knowledge-sources/${enc(id)}`, knowledgeForm(input), MULTIPART)
        .then((r) => r.data);

export const archiveKnowledgeSource = async (id: string): Promise<void> => {
    await apiClient.post(`/admin/knowledge-sources/${enc(id)}/archive`);
};

export const activateKnowledgeSource = async (id: string): Promise<void> => {
    await apiClient.post(`/admin/knowledge-sources/${enc(id)}/activate`);
};

/** SUPER_ADMIN; 204. */
export const deleteKnowledgeSource = async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/knowledge-sources/${enc(id)}`);
};

// ---------- §6 khiếu nại tài khoản ----------

/** Phần tử đi qua normalizeAppeal: backend bỏ trường null (NON_NULL) nên tài khoản đã xoá đến với userId undefined. */
export const fetchAppeals = async (params: Params): Promise<AdminPage<AccountAppeal>> => {
    const page = await apiClient.get<AdminPage<AccountAppeal>>("/admin/appeals", { params: clean(params) }).then((r) => r.data);
    return { ...page, items: (page.items ?? []).map(normalizeAppeal) };
};

/** UNLOCK đi qua quy tắc bậc của backend (ADMIN chỉ mở khoá USER). */
export const resolveAppeal = async (id: number, body: { action: AppealAction; note?: string }): Promise<AccountAppeal> =>
    apiClient.post<AccountAppeal>(`/admin/appeals/${enc(id)}/resolve`, body).then((r) => normalizeAppeal(r.data));

export const dismissAppeal = async (id: number, body: { note?: string }): Promise<AccountAppeal> =>
    apiClient.post<AccountAppeal>(`/admin/appeals/${enc(id)}/dismiss`, body).then((r) => normalizeAppeal(r.data));
