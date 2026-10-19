// Ngân hàng câu hỏi quiz cho admin (G3) — hợp đồng API đợt 2, §1.3 (docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md).
// Import tương đối + đuôi .ts như adminService để hàm thuần dùng chung chạy được trong selfcheck.
import { apiClient } from "./apiClient.ts";
import { normalizeAdminQuestion } from "../features/quiz/quizUtils.ts";
import type {
    AdminQuestionDetail,
    AdminQuestionFlag,
    AdminQuestionPage,
    AdminQuestionPatch,
    AdminQuestionQuery,
} from "../types/quiz.types.ts";

const enc = (v: string | number) => encodeURIComponent(String(v));

/** Bỏ tham số rỗng để URL gọn và backend hiểu là "không lọc" (flagged=false cũng là không lọc). */
const clean = (p: AdminQuestionQuery): Record<string, string | number | boolean> =>
    Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)
    ) as Record<string, string | number | boolean>;

const normalizeDetail = (raw: AdminQuestionDetail): AdminQuestionDetail => ({
    ...normalizeAdminQuestion(raw),
    flags: Array.isArray(raw.flags) ? raw.flags : [],
});

export const fetchAdminQuestions = async (query: AdminQuestionQuery): Promise<AdminQuestionPage> => {
    const data = (await apiClient.get<AdminQuestionPage>("/admin/questions", { params: clean(query) })).data;
    return {
        items: Array.isArray(data?.items) ? data.items.map(normalizeAdminQuestion) : [],
        total: typeof data?.total === "number" ? data.total : 0,
        page: typeof data?.page === "number" ? data.page : 0,
        size: typeof data?.size === "number" && data.size > 0 ? data.size : (query.size ?? 20),
    };
};

export const fetchAdminQuestion = async (id: string): Promise<AdminQuestionDetail> =>
    normalizeDetail((await apiClient.get<AdminQuestionDetail>(`/admin/questions/${enc(id)}`)).data);

/** Sửa câu hỏi (audit QUESTION_EDIT); correct ∈ options khi options không rỗng — server kiểm lại. */
export const patchAdminQuestion = async (id: string, body: AdminQuestionPatch): Promise<AdminQuestionDetail> =>
    normalizeDetail((await apiClient.patch<AdminQuestionDetail>(`/admin/questions/${enc(id)}`, body)).data);

/** Ẩn câu khỏi đề (audit QUESTION_HIDE): lượt làm mới không dùng câu này nữa. */
export const hideAdminQuestion = async (id: string): Promise<AdminQuestionDetail> =>
    normalizeDetail((await apiClient.post<AdminQuestionDetail>(`/admin/questions/${enc(id)}/hide`)).data);

export const unhideAdminQuestion = async (id: string): Promise<AdminQuestionDetail> =>
    normalizeDetail((await apiClient.post<AdminQuestionDetail>(`/admin/questions/${enc(id)}/unhide`)).data);

/** Đánh dấu một báo lỗi đã xử lý (audit QUESTION_FLAG_RESOLVE); 409 khi báo lỗi không còn OPEN. */
export const resolveQuestionFlag = async (flagId: number, note?: string): Promise<AdminQuestionFlag> =>
    (await apiClient.post<AdminQuestionFlag>(`/admin/question-flags/${enc(flagId)}/resolve`, note ? { note } : {})).data;

/**
 * Số câu hỏi đang có báo lỗi mở (cho huy hiệu menu admin khi AdminStats.openQuestionFlags chưa có).
 * null = server chưa có endpoint hoặc lỗi: huy hiệu ẩn, không làm hỏng layout.
 */
export const fetchFlaggedQuestionCount = async (): Promise<number | null> => {
    try {
        return (await fetchAdminQuestions({ flagged: true, page: 0, size: 1 })).total;
    } catch {
        return null;
    }
};
