import { apiClient } from "./apiClient.ts";
import type {
    ActivateLearningPathDto,
    CreateLearningPathInput,
    ExtractionItem,
    LearningPath,
    LearningPathPatch,
} from "../types/api.types.ts";

const pathUrl = (id: string) => `/learning-paths/${encodeURIComponent(id)}`;
const chapterUrl = (id: string, cid: string) => `${pathUrl(id)}/chapters/${encodeURIComponent(cid)}`;

/**
 * Tạo lộ trình: multipart với `file` HOẶC `text`, `days`, `title`/`startDate` nếu có, `options` dạng chuỗi JSON.
 * Ghi đè Content-Type để trình duyệt tự gắn boundary (xem extractionService).
 */
export const createLearningPath = async ({
    file,
    text,
    days,
    title,
    startDate,
    options,
}: CreateLearningPathInput): Promise<LearningPath> => {
    const form = new FormData();
    if (file) form.append("file", file, file.name);
    else if (text != null) form.append("text", text);
    form.append("days", String(days));
    if (title) form.append("title", title);
    if (startDate) form.append("startDate", startDate);
    form.append("options", JSON.stringify(options));
    return (
        await apiClient.post<LearningPath>("/learning-paths", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 60_000,
        })
    ).data;
};

export const fetchLearningPaths = async (): Promise<LearningPath[]> =>
    (await apiClient.get<LearningPath[]>("/learning-paths")).data;

/** `date` (yyyy-MM-dd) để server tính "hôm nay" theo ngày của người dùng. */
export const fetchLearningPath = async (id: string, date?: string): Promise<LearningPath> =>
    (await apiClient.get<LearningPath>(pathUrl(id), { params: date ? { date } : {} })).data;

export const fetchChapterItems = async (id: string, cid: string): Promise<ExtractionItem[]> =>
    (await apiClient.get<ExtractionItem[]>(`${chapterUrl(id, cid)}/items`)).data;

export const updateLearningPath = async (id: string, patch: LearningPathPatch): Promise<LearningPath> =>
    (await apiClient.patch<LearningPath>(pathUrl(id), patch)).data;

export const renameChapter = async (id: string, cid: string, title: string): Promise<LearningPath> =>
    (await apiClient.patch<LearningPath>(chapterUrl(id, cid), { title })).data;

export const mergeChapterUp = async (id: string, cid: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${chapterUrl(id, cid)}/merge-up`)).data;

/** Chọn/bỏ chọn item của bản nháp; trả về toàn bộ item của job. */
export const patchPathItems = async (
    id: string,
    patches: { id: string; selected: boolean }[]
): Promise<ExtractionItem[]> => (await apiClient.patch<ExtractionItem[]>(`${pathUrl(id)}/items`, patches)).data;

/** Kích hoạt: server tạo bộ thẻ cho từng chương nên cần timeout dài hơn mặc định. */
export const activateLearningPath = async (id: string, dto: ActivateLearningPathDto): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/activate`, dto, { timeout: 60_000 })).data;

export const deleteLearningPath = async (id: string): Promise<void> => {
    await apiClient.delete(pathUrl(id));
};
