import { useOutletContext } from "react-router-dom";

export type QueueKey = "openReports" | "pendingMnemonics" | "openQuestionFlags" | "openAppeals" | "openDictReports";
export type QueueCounts = Record<QueueKey, number | null>;

/**
 * AdminLayout truyền qua <Outlet context>: số việc chờ (badge điều hướng) để trang kiểm duyệt dùng lại cho số trên tab,
 * thay vì mỗi trang tự gọi lại GET /admin/stats — truy vấn nặng nhất của admin. Layout đã tự tải lại sau mọi thao tác
 * ghi (DATA_CHANGED_EVENT); reloadQueues dành cho trường hợp dữ liệu đổi mà không có request ghi thành công (vd. 409).
 */
export interface AdminOutletContext {
  /** null = đang tải lần đầu / backend chưa trả; từng trường null = trường đó chưa có. */
  queues: QueueCounts | null;
  reloadQueues: () => void;
}

const NO_CONTEXT: AdminOutletContext = { queues: null, reloadQueues: () => {} };

/** Đọc số việc chờ từ AdminLayout; render ngoài layout (test, trang lẻ) thì trả rỗng an toàn. */
export const useAdminQueues = (): AdminOutletContext => useOutletContext<AdminOutletContext | undefined>() ?? NO_CONTEXT;
