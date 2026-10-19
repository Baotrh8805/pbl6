// Chuông thông báo (/api/notifications): 20 mục mới nhất + số chưa đọc. Không realtime: tải khi mở trang / mở chuông.
import { apiClient } from "./apiClient.ts";

export type NotificationType =
    | "REPORT_RESOLVED"
    | "DECK_UNPUBLISHED"
    | "DECK_DELETED"
    | "COMMENT_CLEARED"
    | "PREMIUM_CHANGED"
    | "ROLE_CHANGED"
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

/** Câu hiển thị cho từng loại; loại chưa biết (thêm sau ở backend) vẫn hiện được nhờ fallback. */
export const describeNotification = (n: AppNotification): { text: string; to?: string } => {
    const p = n.payload;
    const title = str(p.deckTitle) ? `"${str(p.deckTitle)}"` : "một bộ thẻ";
    const deckLink = str(p.deckId) ? `/decks/${str(p.deckId)}` : undefined;
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
            return { text: `Báo cáo của bạn về ${title} đã ${outcome}.${str(p.note) ? ` Ghi chú: ${str(p.note)}` : ""}`, to: deckLink };
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
        default:
            return { text: `Thông báo: ${n.type}` };
    }
};
