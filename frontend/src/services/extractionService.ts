import { apiClient } from "./apiClient.ts";
import { I_PLUS_ONE_LIMIT, parseIPlusOne } from "../features/extraction/iPlusOneUtils.ts";
import type { IPlusOneResponse } from "../types/learner.types.ts";
import type {
    CardKind,
    CreateDecksFromExtractionDto,
    Deck,
    ExtractionItem,
    ExtractionItemPatch,
    ExtractionJob,
    ExtractionOptions,
} from "../types/api.types.ts";

const jobUrl = (id: string) => `/extractions/${encodeURIComponent(id)}`;

export interface CreateExtractionInput {
    file?: File | null;
    text?: string | null;
    options: ExtractionOptions;
}

/**
 * Tạo job bóc tách: multipart với `file` HOẶC `text`, kèm `options` dạng chuỗi JSON.
 * Phải ghi đè Content-Type (apiClient mặc định application/json, axios sẽ JSON hoá FormData):
 * với multipart + FormData axios bỏ header để trình duyệt tự gắn boundary.
 * Upload file cần timeout dài hơn mặc định 15 s.
 */
export const createExtraction = async ({ file, text, options }: CreateExtractionInput): Promise<ExtractionJob> => {
    const form = new FormData();
    if (file) form.append("file", file, file.name);
    else if (text != null) form.append("text", text);
    form.append("options", JSON.stringify(options));
    return (
        await apiClient.post<ExtractionJob>("/extractions", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 60_000,
        })
    ).data;
};

/** Job của tôi, mới nhất trước (không kèm extractedText). */
export const fetchExtractions = async (): Promise<ExtractionJob[]> =>
    (await apiClient.get<ExtractionJob[]>("/extractions")).data;

export const fetchExtraction = async (id: string, includeText = false): Promise<ExtractionJob> =>
    (await apiClient.get<ExtractionJob>(jobUrl(id), { params: includeText ? { includeText: true } : {} })).data;

/** Sửa văn bản (vd. lỗi OCR) rồi chạy lại từ bước ANALYZE. */
export const updateExtractionText = async (id: string, text: string): Promise<ExtractionJob> =>
    (await apiClient.put<ExtractionJob>(`${jobUrl(id)}/text`, { text })).data;

/** Chạy lại từ ANALYZE với văn bản đã lưu (400 nếu job chưa có văn bản). */
export const rerunExtraction = async (id: string): Promise<ExtractionJob> =>
    (await apiClient.post<ExtractionJob>(`${jobUrl(id)}/rerun`)).data;

/** Chỉ chạy lại bước dịch nghĩa VN cho item còn thiếu (Gemini hết quota); 429 nếu vừa dịch < 5 phút. */
export const reEnrichExtraction = async (id: string): Promise<ExtractionJob> =>
    (await apiClient.post<ExtractionJob>(`${jobUrl(id)}/enrich`)).data;

export interface ExtractionItemFilters {
    kind?: CardKind;
    /** N5..N1 hoặc "unknown". */
    level?: string;
    selected?: boolean;
}

export const fetchExtractionItems = async (id: string, filters: ExtractionItemFilters = {}): Promise<ExtractionItem[]> =>
    (await apiClient.get<ExtractionItem[]>(`${jobUrl(id)}/items`, { params: filters })).data;

/** Trả về TOÀN BỘ item của job sau khi sửa (không chỉ các item đã patch). */
export const patchExtractionItems = async (id: string, patches: ExtractionItemPatch[]): Promise<ExtractionItem[]> =>
    (await apiClient.patch<ExtractionItem[]>(`${jobUrl(id)}/items`, patches)).data;

/** Tạo bộ thẻ từ các item đã chọn; trả về danh sách deck vừa tạo (1 hoặc 2). */
export const createDecksFromExtraction = async (id: string, dto: CreateDecksFromExtractionDto): Promise<Deck[]> =>
    (await apiClient.post<Deck[]>(`${jobUrl(id)}/decks`, dto)).data;

export const deleteExtraction = async (id: string): Promise<void> => {
    await apiClient.delete(jobUrl(id));
};

// ===== Đợt 2 (docs/Plan/specs/2026-10-19-hop-dong-api-dot-2.md) — 404/405 = backend chưa có endpoint =====

/**
 * F2 §5: đối chiếu lại item của job với nguồn tri thức chuẩn ACTIVE (ai-service /extract/conflicts). Trả job với
 * `stats.conflicts` mới; `conflicts` của từng item đổi theo nên nơi gọi tải lại items. Gọi ai-service nên timeout dài.
 */
export const recheckExtractionConflicts = async (id: string): Promise<ExtractionJob> =>
    (await apiClient.post<ExtractionJob>(`${jobUrl(id)}/recheck-conflicts`, undefined, { timeout: 60_000 })).data;

export interface IPlusOneQuery {
    /** true = từ thuộc cấp thấp hơn trình độ của mình coi như đã biết (mặc định của hợp đồng). */
    assumeLevelKnown?: boolean;
    limit?: number;
}

/** C6 §9: câu trong tài liệu chỉ có đúng một từ mình chưa biết (i+1), tốt trước. */
export const fetchIPlusOne = async (
    id: string,
    { assumeLevelKnown = true, limit = I_PLUS_ONE_LIMIT }: IPlusOneQuery = {}
): Promise<IPlusOneResponse> =>
    parseIPlusOne(
        (await apiClient.get(`${jobUrl(id)}/i-plus-one`, { params: { assumeLevelKnown, limit }, timeout: 30_000 })).data
    );

/**
 * Đặt câu i+1 làm câu ví dụ (`example`) của item; trả item đã cập nhật (null khi response hỏng — nơi gọi tải lại items).
 */
export const applyIPlusOne = async (id: string, itemId: string, sentence: string): Promise<ExtractionItem | null> => {
    const data: unknown = (await apiClient.post(`${jobUrl(id)}/i-plus-one/apply`, { itemId, sentence })).data;
    const rec = data && typeof data === "object" ? (data as Partial<ExtractionItem>) : null;
    return rec && typeof rec.id === "string" && typeof rec.term === "string" ? (rec as ExtractionItem) : null;
};
