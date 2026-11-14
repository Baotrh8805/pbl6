import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { submitReview, undoReview } from "@/services/studyService";
import type { Grade } from "@/lib/srs";
import type { ReviewOutcome } from "@/types/moderation.types";
import { extractErrorMessage } from "@/services/apiClient";

export interface ReviewTask {
    type: "review";
    cardId: string;
    grade: Grade;
    cramThis: boolean;
    reactionMs?: number;
    pathId?: string;
    term: string;
}

export interface UndoTask {
    type: "undo";
    cardId: string;
    term: string;
}

export type QueueTask = ReviewTask | UndoTask;

interface QueueItem {
    id: number;
    task: QueueTask;
    retries: number;
}

// Module-level state: tồn tại độc lập với vòng đời render của component,
// giúp các request tiếp tục gửi hoàn tất ngay cả khi người dùng chuyển trang hoặc unmount StudyPage.
let nextItemId = 1;
const taskQueue: QueueItem[] = [];
let isWorkerRunning = false;
let globalLastError = "";
let globalLastOutcome: ReviewOutcome | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
    for (const listener of listeners) {
        listener();
    }
}

/** Kiểm tra xem lỗi có phải do mạng tạm thời hoặc server quá tải để retry */
function isTransientError(err: unknown): boolean {
    if (axios.isAxiosError(err)) {
        // Lỗi không có response (offline, rớt mạng, CORS, timeout)
        if (!err.response) return true;
        // Lỗi 5xx (server tạm thời gián đoạn)
        if (err.response.status >= 500 && err.response.status <= 504) return true;
        // 429 Too Many Requests
        if (err.response.status === 429) return true;
    }
    return false;
}

/** Worker tuần tự ngầm (FIFO): gửi từng request lên backend theo thứ tự */
async function processQueue() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        while (taskQueue.length > 0) {
            const currentItem = taskQueue[0];
            const { task } = currentItem;

            try {
                if (task.type === "review") {
                    const outcome = await submitReview(task.cardId, task.grade, {
                        cram: task.cramThis,
                        reactionMs: task.reactionMs,
                        pathId: task.pathId,
                    });
                    globalLastOutcome = outcome;
                } else if (task.type === "undo") {
                    await undoReview(task.cardId);
                }

                // Xử lý thành công -> loại bỏ khỏi hàng đợi
                taskQueue.shift();
                globalLastError = "";
                notifyListeners();
            } catch (err) {
                // Nếu là lỗi tạm thời và chưa quá 3 lần thử -> chờ với backoff rồi thử lại
                if (isTransientError(err) && currentItem.retries < 3) {
                    currentItem.retries++;
                    notifyListeners();
                    const delayMs = 1000 * Math.pow(2, currentItem.retries - 1);
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    continue; // tiếp tục vòng lặp thử lại currentItem
                }

                // Nếu lỗi vĩnh viễn (404, 403, 409) hoặc đã vượt số lần retry:
                // Bỏ qua task này để không làm nghẽn hàng đợi
                taskQueue.shift();
                
                if (axios.isAxiosError(err) && err.response?.status === 409 && task.type === "undo") {
                    globalLastError = "Không thể hoàn tác thêm trên máy chủ (quá hạn hoặc không còn lịch sử).";
                } else {
                    globalLastError = `Chưa đồng bộ được thẻ «${task.term}»: ${extractErrorMessage(err)}`;
                }

                notifyListeners();
            }
        }
    } finally {
        isWorkerRunning = false;
        notifyListeners();
    }
}

/**
 * Đẩy một tác vụ vào hàng đợi ngầm.
 * Tự động tối ưu hủy cặp (Review chưa gửi + Undo ngay lập tức).
 */
export function enqueueReviewTask(task: QueueTask) {
    // Tối ưu: Nếu là Undo và có Review của cùng thẻ đang CHỜ trong hàng (chưa gửi lên mạng, index > 0),
    // ta có thể hủy cả hai vì server chưa hề nhận được bản review này.
    if (task.type === "undo") {
        const pendingReviewIndex = taskQueue.findIndex(
            (item, idx) => idx > 0 && item.task.type === "review" && item.task.cardId === task.cardId
        );
        if (pendingReviewIndex > 0) {
            taskQueue.splice(pendingReviewIndex, 1);
            notifyListeners();
            return;
        }
    }

    taskQueue.push({
        id: nextItemId++,
        task,
        retries: 0,
    });
    notifyListeners();

    // Kích hoạt worker xử lý ngầm
    void processQueue();
}

/** Hook dùng trong component React để theo dõi trạng thái hàng đợi */
export function useReviewQueue() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const onUpdate = () => setTick((t) => t + 1);
        listeners.add(onUpdate);
        return () => {
            listeners.delete(onUpdate);
        };
    }, []);

    // Cảnh báo người dùng nếu định đóng tab/trình duyệt khi còn dữ liệu chưa lưu
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (taskQueue.length > 0) {
                e.preventDefault();
                e.returnValue = "Đang lưu tiến độ học tập lên máy chủ...";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, []);

    const clearError = useCallback(() => {
        globalLastError = "";
        notifyListeners();
    }, []);

    return {
        enqueue: enqueueReviewTask,
        pendingCount: taskQueue.length,
        isSyncing: taskQueue.length > 0,
        lastOutcome: globalLastOutcome,
        lastError: globalLastError,
        clearError,
    };
}
