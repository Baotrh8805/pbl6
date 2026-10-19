import { apiClient } from "./apiClient.ts";
import { dayKey } from "../lib/learningStats.ts";
import { parseAttemptState } from "./studyService.ts";
import type {
    ActivateLearningPathDto,
    CreateLearningPathInput,
    CreateRemedialDto,
    ExtractionItem,
    LearningPath,
    LearningPathPatch,
    QuizAttemptState,
    SessionKind,
    SessionResponse,
    TodaySummaryItem,
} from "../types/api.types.ts";

const pathUrl = (id: string) => `/learning-paths/${encodeURIComponent(id)}`;
const chapterUrl = (id: string, cid: string) => `${pathUrl(id)}/chapters/${encodeURIComponent(cid)}`;

/**
 * Ngày của máy khách gửi kèm MỌI lời gọi ghi (LP-11): server tính `today` / `days[]` theo ngày này nên response
 * dùng được ngay, không phải gọi thêm GET để "vá" múi giờ.
 */
const clientDate = () => dayKey(new Date());
const dated = (date: string = clientDate()) => ({ params: { date } });

/**
 * Tạo lộ trình: multipart với `file` HOẶC `text`, `days`, `title` nếu có, `options` dạng chuỗi JSON.
 * `startDate` luôn gửi (mặc định hôm nay theo máy khách) để ngày bắt đầu không phụ thuộc múi giờ server;
 * `dailyCap` / `studyDays` (2.0) chỉ gửi khi người dùng chọn, server dùng mặc định cấu hình.
 * Ghi đè Content-Type để trình duyệt tự gắn boundary (xem extractionService).
 */
export const createLearningPath = async ({
    file,
    text,
    days,
    title,
    startDate,
    options,
    dailyCap,
    studyDays,
}: CreateLearningPathInput): Promise<LearningPath> => {
    const form = new FormData();
    if (file) form.append("file", file, file.name);
    else if (text != null) form.append("text", text);
    form.append("days", String(days));
    if (title) form.append("title", title);
    form.append("startDate", startDate || clientDate());
    if (dailyCap != null) form.append("dailyCap", String(dailyCap));
    if (studyDays) form.append("studyDays", studyDays);
    form.append("options", JSON.stringify(options));
    return (
        await apiClient.post<LearningPath>("/learning-paths", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 60_000,
        })
    ).data;
};

/** Gửi kèm ngày của máy khách để `today` của từng lộ trình khớp với trang chi tiết (tránh lệch múi giờ). */
export const fetchLearningPaths = async (date: string = clientDate()): Promise<LearningPath[]> =>
    (await apiClient.get<LearningPath[]>("/learning-paths", { params: { date } })).data;

/** `date` (yyyy-MM-dd) để server tính "hôm nay" theo ngày của người dùng. */
export const fetchLearningPath = async (id: string, date?: string): Promise<LearningPath> =>
    (await apiClient.get<LearningPath>(pathUrl(id), { params: date ? { date } : {} })).data;

export const fetchChapterItems = async (id: string, cid: string): Promise<ExtractionItem[]> =>
    (await apiClient.get<ExtractionItem[]>(`${chapterUrl(id, cid)}/items`)).data;

export const updateLearningPath = async (id: string, patch: LearningPathPatch): Promise<LearningPath> =>
    (await apiClient.patch<LearningPath>(pathUrl(id), patch, dated())).data;

export const renameChapter = async (id: string, cid: string, title: string): Promise<LearningPath> =>
    (await apiClient.patch<LearningPath>(chapterUrl(id, cid), { title }, dated())).data;

export const mergeChapterUp = async (id: string, cid: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${chapterUrl(id, cid)}/merge-up`, undefined, dated())).data;

/** Chọn/bỏ chọn item của bản nháp; trả về toàn bộ item của job. */
export const patchPathItems = async (
    id: string,
    patches: { id: string; selected: boolean }[]
): Promise<ExtractionItem[]> =>
    (await apiClient.patch<ExtractionItem[]>(`${pathUrl(id)}/items`, patches, dated())).data;

/** Kích hoạt: server tạo bộ thẻ cho từng chương nên cần timeout dài hơn mặc định. */
export const activateLearningPath = async (id: string, dto: ActivateLearningPathDto): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/activate`, dto, { ...dated(), timeout: 60_000 })).data;

export const deleteLearningPath = async (id: string): Promise<void> => {
    await apiClient.delete(pathUrl(id));
};

// ===== 2.0 =====

/**
 * Phiên học hợp nhất của lộ trình ACTIVE: thẻ đến hạn -> nợ -> mới (today), hoặc chỉ nợ / chỉ đến hạn / cả chương.
 * Thẻ trả về đầy đủ nội dung (nhiều bộ thẻ) nên trang học không cần tải từng bộ. 409 nếu lộ trình chưa ACTIVE.
 */
export const fetchSession = async (
    id: string,
    kind: SessionKind,
    chapterId?: string,
    date: string = clientDate()
): Promise<SessionResponse> =>
    (
        await apiClient.get<SessionResponse>(`${pathUrl(id)}/session`, {
            params: chapterId ? { kind, chapterId, date } : { kind, date },
        })
    ).data;

/** Cân lại lịch khi học trễ: extend=false chia thẻ nợ + chưa tới vào các ngày còn lại; extend=true kéo dài số ngày. */
export const rebalanceLearningPath = async (id: string, extend: boolean): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/rebalance`, { extend }, dated())).data;

/** FAILED -> chạy lại từ bước phân tích trên văn bản đã bóc (không tốn lượt hạn mức); trả PROCESSING, client poll như lúc tạo. */
export const retryLearningPath = async (id: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/retry`, undefined, dated())).data;

/** DRAFT/ACTIVE: dịch lại nghĩa cho item còn thiếu (cooldown 5 phút -> 429). Trạng thái lộ trình không đổi. */
export const enrichLearningPath = async (id: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/enrich`, undefined, dated())).data;

/**
 * Mở lượt kiểm tra chương (quiz exam trên bộ của chương; đang có lượt mở thì `resumed = true`).
 * Sau đó điều hướng tới `/decks/{state.deckId}/quiz?attempt={state.attemptId}`: QuizPage khôi phục đúng lượt đó.
 * null = response hỏng (không dựng được lượt làm).
 */
export const startChapterQuiz = async (id: string, cid: string): Promise<QuizAttemptState | null> =>
    parseAttemptState((await apiClient.post(`${chapterUrl(id, cid)}/quiz`)).data);

/** Chốt hoàn thành lộ trình (chỉ khi đã học hết thẻ, 409 nếu chưa). Gọi lại an toàn. */
export const completeLearningPath = async (id: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/complete`, undefined, dated())).data;

/** Tóm tắt "hôm nay" của mọi lộ trình ACTIVE (badge sidebar, widget Tổng quan) — một truy vấn batch phía server. */
export const fetchTodaySummary = async (date: string = clientDate()): Promise<TodaySummaryItem[]> =>
    (await apiClient.get<TodaySummaryItem[]>("/learning-paths/today-summary", { params: { date } })).data;

/**
 * Lộ trình bổ khuyết từ điểm yếu (spec §3.8): 201 lộ trình ACTIVE (sourceType "remedial", bộ thẻ clone theo nhóm) — server
 * clone thẻ nên timeout dài như activate; 409 kèm message khi chưa đủ 8 thẻ yếu (hiện nguyên message cho người dùng).
 */
export const createRemedialPath = async (dto: CreateRemedialDto): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>("/learning-paths/remedial", dto, { ...dated(), timeout: 60_000 })).data;

/**
 * F2 (hợp đồng đợt 2 §5): đối chiếu lại các mục của lộ trình với nguồn tri thức chuẩn ACTIVE (ai-service
 * /extract/conflicts) và trả lộ trình đã cập nhật; mâu thuẫn mới nằm ở `conflicts` của từng item (fetchChapterItems).
 * Chạy ai-service trên mọi mục nên timeout dài như activate. 404/405 = backend chưa có endpoint.
 */
export const recheckConflicts = async (id: string): Promise<LearningPath> =>
    (await apiClient.post<LearningPath>(`${pathUrl(id)}/recheck-conflicts`, undefined, { ...dated(), timeout: 60_000 })).data;
