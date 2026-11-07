import { useCallback, useEffect, useRef } from "react";

/** Đưa một đáp án vào hàng đợi lưu tuần tự của QuizPage (exam). */
type EnqueueSave = (attemptId: string, cardId: string, value: string) => void;

interface PendingSave {
    timer: ReturnType<typeof setTimeout>;
    attemptId: string;
    value: string;
}

export interface TypingAutosave {
    /** Hẹn lưu câu gõ sau khi người dùng ngừng gõ `delayMs`; gõ tiếp thì hẹn lại từ đầu. */
    schedule: (attemptId: string, cardId: string, value: string) => void;
    /** Gửi ngay các lần lưu còn hẹn (Enter, trước khi nộp); có cardId thì chỉ câu đó. */
    flush: (onlyCardId?: string) => void;
    /** Huỷ lần hẹn của một câu (vd. "Xoá câu trả lời" tự gửi chuỗi rỗng). */
    cancel: (cardId: string) => void;
    /** Huỷ mọi lần hẹn mà không gửi (dựng lại từ trạng thái server: server đã là bản đúng). */
    cancelAll: () => void;
}

/**
 * Tự lưu câu gõ ở bài thi: gửi mỗi phím sẽ spam hàng đợi lưu nên chỉ lưu sau khi ngừng gõ. Rời trang khi còn lần hẹn
 * (vd. bấm "Về bộ thẻ" ngay sau khi gõ) thì gửi luôn, không bỏ dở. Mọi hàm ổn định (chỉ đọc ref), enqueueSave mới
 * nhất được giữ trong ref nên nơi gọi không cần useCallback.
 */
export const useTypingAutosave = (enqueueSave: EnqueueSave, delayMs: number): TypingAutosave => {
    const timers = useRef<Map<string, PendingSave>>(new Map());
    const saveRef = useRef(enqueueSave);
    useEffect(() => {
        saveRef.current = enqueueSave;
    });

    const schedule = useCallback(
        (attemptId: string, cardId: string, value: string) => {
            const prev = timers.current.get(cardId);
            if (prev) clearTimeout(prev.timer);
            const timer = setTimeout(() => {
                timers.current.delete(cardId);
                saveRef.current(attemptId, cardId, value);
            }, delayMs);
            timers.current.set(cardId, { timer, attemptId, value });
        },
        [delayMs]
    );

    const flush = useCallback((onlyCardId?: string) => {
        for (const [cardId, t] of timers.current) {
            if (onlyCardId !== undefined && cardId !== onlyCardId) continue;
            clearTimeout(t.timer);
            timers.current.delete(cardId);
            saveRef.current(t.attemptId, cardId, t.value);
        }
    }, []);

    const cancel = useCallback((cardId: string) => {
        const hold = timers.current.get(cardId);
        if (!hold) return;
        clearTimeout(hold.timer);
        timers.current.delete(cardId);
    }, []);

    const cancelAll = useCallback(() => {
        for (const t of timers.current.values()) clearTimeout(t.timer);
        timers.current.clear();
    }, []);

    // Unmount: gửi các lần còn hẹn (flush chỉ đọc ref nên gọi trong cleanup an toàn).
    useEffect(() => () => flush(), [flush]);

    return { schedule, flush, cancel, cancelAll };
};
