import { apiClient } from "./apiClient.ts";
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
