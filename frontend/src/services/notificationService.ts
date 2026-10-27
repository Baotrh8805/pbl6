// Chuông thông báo (/api/notifications): 20 mục mới nhất + số chưa đọc. Không realtime: tải khi mở trang / mở chuông.
import { apiClient } from "./apiClient.ts";

export type NotificationType =
    | "REPORT_RESOLVED"
    | "DECK_UNPUBLISHED"
    | "DECK_DELETED"
    | "COMMENT_CLEARED"
    | "PREMIUM_CHANGED"
    | "ROLE_CHANGED"
    | "LEARNING_PATH_READY"
    | "LEARNING_PATH_FAILED"
    | "LEARNING_PATH_REMINDER"
    | "LEARNING_PATH_CHAPTER_PASSED"
    | "LEARNING_PATH_CHAPTER_RETRY"
    | "LEARNING_PATH_COMPLETED"
    | "MNEMONIC_REVIEWED"
    | "DICT_REPORT_RESOLVED"
    | "DICT_COMMENT_HIDDEN"
    | "MOD_COMMENT_BLOCKED"
    | "MOD_COMMENT_RESTORED"
    | "MOD_COMMENT_LOCKED"
    | (string & {});

export interface AppNotification {
    id: number;
    type: NotificationType;
    payload: Record<string, unknown>;
    readAt: string | null;
    createdAt: string;
}

export interface NotificationFeed {
    items: AppNotification[];
    unread: number;
}

export const fetchNotifications = async (): Promise<NotificationFeed> =>
    (await apiClient.get<NotificationFeed>("/notifications")).data;

export const markNotificationRead = async (id: number): Promise<void> => {
    await apiClient.post(`/notifications/${id}/read`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
    await apiClient.post("/notifications/read-all");
};

const str = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Câu hiển thị cho từng loại; loại chưa biết (thêm sau ở backend) vẫn hiện được nhờ fallback. */
export const describeNotification = (n: AppNotification): { text: string; to?: string } => {
    const p = n.payload;
    const title = str(p.deckTitle) ? `"${str(p.deckTitle)}"` : "một bộ thẻ";
    const deckLink = str(p.deckId) ? `/decks/${str(p.deckId)}` : undefined;
    // Lộ trình: READY/FAILED/REMINDER/COMPLETED gửi `title`, CHAPTER_PASSED / CHAPTER_RETRY gửi `pathTitle`.
    const pathName = str(p.title) || str(p.pathTitle) ? `"${str(p.title) || str(p.pathTitle)}"` : "học tập";
    const pathLink = str(p.pathId) ? `/roadmap/${encodeURIComponent(str(p.pathId))}` : "/roadmap";
    switch (n.type) {
        case "REPORT_RESOLVED": {
            const outcome =
                p.status === "DISMISSED"
                    ? "được xem xét và không vi phạm"
                    : p.action === "UNPUBLISH_DECK"
                      ? "được xử lý: bộ thẻ đã bị gỡ khỏi Thư viện"
                      : p.action === "CLEAR_COMMENT"
                        ? "được xử lý: bình luận vi phạm đã bị xoá"
                        : "được xử lý";
            // Mở "Báo cáo của tôi" thay vì bộ thẻ: bộ đã bị gỡ thì người báo cáo không mở được nữa.
            return { text: `Báo cáo của bạn về ${title} đã ${outcome}.${str(p.note) ? ` Ghi chú: ${str(p.note)}` : ""}`, to: "/profile?tab=reports" };
        }
        case "DECK_UNPUBLISHED":
            return { text: `Bộ thẻ ${title} của bạn đã bị quản trị viên gỡ khỏi Thư viện (chuyển về riêng tư).`, to: deckLink };
        case "DECK_DELETED":
            return { text: `Bộ thẻ ${title} của bạn đã bị quản trị viên xoá vì vi phạm quy định.` };
        case "COMMENT_CLEARED":
            return { text: `Bình luận của bạn${str(p.comment) ? ` "${str(p.comment).slice(0, 60)}"` : ""} đã bị quản trị viên xoá.`, to: deckLink };
        case "PREMIUM_CHANGED":
            return { text: p.premium ? "Tài khoản của bạn đã được nâng lên Premium." : "Tài khoản của bạn không còn Premium." };
        case "ROLE_CHANGED":
            return { text: p.role === "USER" ? "Tài khoản của bạn đã trở lại vai trò người học." : `Tài khoản của bạn được chuyển sang vai trò ${str(p.role)}.` };
        case "LEARNING_PATH_READY":
            return {
                text: `Bản nháp lộ trình ${pathName} đã sẵn sàng${num(p.chapters) > 0 ? ` (${num(p.chapters)} chương)` : ""}. Xem lại và kích hoạt để bắt đầu học.${p.ocrDegraded ? " Một số trang OCR chưa được AI soát lại, hãy kiểm tra văn bản gốc." : ""}`,
                to: pathLink,
            };
        case "LEARNING_PATH_FAILED":
            return { text: `Không tạo được lộ trình ${pathName}.${str(p.reason) ? ` Lý do: ${str(p.reason)}` : ""}`, to: pathLink };
        case "LEARNING_PATH_REMINDER": {
            const day = num(p.dayIndex) > 0 ? `Ngày ${num(p.dayIndex)}${num(p.totalDays) > 0 ? `/${num(p.totalDays)}` : ""} của lộ trình` : "Lộ trình";
            const work = [
                num(p.newCount) > 0 ? `${num(p.newCount)} thẻ mới` : "",
                num(p.dueCount) > 0 ? `${num(p.dueCount)} thẻ đến hạn` : "",
                num(p.behindCount) > 0 ? `${num(p.behindCount)} thẻ còn nợ` : "",
            ].filter(Boolean);
            return { text: `${day} ${pathName}: hôm nay có ${work.length ? work.join(", ") : "bài cần học"}.`, to: pathLink };
        }
        case "LEARNING_PATH_CHAPTER_PASSED":
            return { text: `Bạn đã qua chương${str(p.chapterTitle) ? ` "${str(p.chapterTitle)}"` : ""} của lộ trình ${pathName} (${num(p.pct)}%).`, to: pathLink };
        case "LEARNING_PATH_CHAPTER_RETRY": {
            // Chỉ gửi ở lượt trượt đầu tiên của chương (D4: nhắc làm lại, không chặn chương sau); nút "Làm lại" ở trang lộ trình.
            const pass = num(p.passPct) > 0 ? ` ${num(p.passPct)}%` : "";
            return {
                text: `Chương${str(p.chapterTitle) ? ` "${str(p.chapterTitle)}"` : ""} của lộ trình ${pathName} chưa đạt${pass} (lần này ${num(p.pct)}%). Bạn vẫn học tiếp được, làm lại bài kiểm tra khi sẵn sàng.`,
                to: pathLink,
            };
        }
        case "LEARNING_PATH_COMPLETED":
            return { text: `Chúc mừng! Bạn đã hoàn thành lộ trình ${pathName}.`, to: pathLink };
        case "MNEMONIC_REVIEWED": {
            const kanji = str(p.kanji);
            const subject = `Mẹo nhớ cho chữ ${kanji || "Hán"} của bạn`;
            const to = kanji ? `/dictionary?tab=kanji&k=${encodeURIComponent(kanji)}` : "/dictionary?tab=kanji";
            return p.status === "REJECTED"
                ? { text: `${subject} đã bị từ chối.${str(p.note) ? ` Lý do: ${str(p.note)}` : ""}`, to }
                : { text: `${subject} đã được duyệt.${str(p.note) ? ` Ghi chú: ${str(p.note)}` : ""}`, to };
        }
        case "DICT_REPORT_RESOLVED": {
            const key = str(p.entryKey);
            const to = key ? `/dictionary?e=${encodeURIComponent(key)}` : "/dictionary";
            const what = p.kind === "COMMENT" ? "Báo cáo bình luận" : "Báo lỗi từ điển";
            if (p.status === "DISMISSED") {
                return { text: `${what} của bạn không được chấp nhận.${str(p.note) ? ` Lý do: ${str(p.note)}` : ""}`, to };
            }
            return {
                text: p.action === "APPLIED" ? `${what} của bạn đã được áp dụng. Cảm ơn bạn!` : `${what} của bạn đã được xử lý.`,
                to,
            };
        }
        case "DICT_COMMENT_HIDDEN": {
            const key = str(p.entryKey);
            return {
                text: `Một bình luận từ điển của bạn đã bị ẩn.${str(p.note) ? ` Lý do: ${str(p.note)}` : ""}`,
                to: key ? `/dictionary?e=${encodeURIComponent(key)}` : "/dictionary",
            };
        }
        // Kiểm duyệt AI (V38): chặn muộn bởi job quét lại, admin khôi phục, khoá bình luận 24 giờ
        case "MOD_COMMENT_BLOCKED": {
            const to = str(p.entryKey) ? `/dictionary?e=${encodeURIComponent(str(p.entryKey))}` : str(p.deckId) ? `/decks/${encodeURIComponent(str(p.deckId))}` : "/dictionary";
            return {
                text: `Một bình luận của bạn bị hệ thống kiểm duyệt tự động chặn vì nội dung thù ghét${str(p.words) ? ` (từ bị đánh dấu: ${str(p.words)})` : ""}. Bạn có thể sửa lại; quản trị viên có thể khôi phục nếu AI nhầm.`,
                to,
            };
        }
        case "MOD_COMMENT_RESTORED": {
            const to = str(p.entryKey) ? `/dictionary?e=${encodeURIComponent(str(p.entryKey))}` : str(p.deckId) ? `/decks/${encodeURIComponent(str(p.deckId))}` : "/dictionary";
            return { text: "Quản trị viên đã khôi phục một bình luận của bạn từng bị AI chặn; bình luận đã công khai.", to };
        }
        case "MOD_COMMENT_LOCKED": {
            const until = str(p.until) ? new Date(str(p.until)).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "";
            return {
                text: `Bạn tạm thời không thể bình luận / đánh giá${until ? ` tới ${until}` : " trong 24 giờ"}${p.byAdmin ? " (quản trị viên khoá)" : " (bị AI chặn 3 lần trong 24 giờ)"}.`,
            };
        }
        default:
            return { text: `Thông báo: ${n.type}` };
    }
};
