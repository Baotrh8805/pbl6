import React from "react";
import { SERVER_PENDING_MESSAGE } from "@/lib/apiErrorInfo";

interface AdminPendingNoticeProps {
  /** Câu phụ; mặc định nói rõ không cần thao tác gì. */
  children?: React.ReactNode;
}

/**
 * Backend đợt 2 triển khai song song: endpoint mới trả 404/405 thì trang hiện khung thông tin bình tĩnh này
 * (role="status", tông xanh) thay cho lỗi đỏ + "Thử lại" vốn khiến admin tưởng hệ thống hỏng.
 */
export const AdminPendingNotice: React.FC<AdminPendingNoticeProps> = ({ children }) => (
  <div
    role="status"
    className="flex items-start gap-3 p-space-md rounded-2xl border border-dashed border-primary-container/30 bg-primary-fixed/30 text-body-sm text-on-surface-variant"
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-primary shrink-0">
      construction
    </span>
    <div className="min-w-0">
      <p className="font-semibold text-on-surface">{SERVER_PENDING_MESSAGE}</p>
      <p className="mt-0.5">
        {children ?? "Trang sẽ tự hoạt động khi máy chủ được cập nhật; hiện không cần thao tác gì thêm."}
      </p>
    </div>
  </div>
);
