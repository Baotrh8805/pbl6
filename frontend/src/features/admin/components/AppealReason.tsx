import React from "react";
import type { AccountAppeal } from "@/types/adminModeration.types";
import { appealReasonView } from "../moderationUtils.ts";

interface AppealReasonProps {
  appeal: Pick<AccountAppeal, "userId" | "userLocked" | "lockedReason" | "lockedReasonAtSubmit">;
}

/**
 * Lý do khoá lúc gửi của một khiếu nại (STAFF-07), dùng chung cho bảng và modal xử lý: khiếu nại cũ / lý do đã đổi có dòng
 * ghi chú nhỏ bên dưới để admin không nhầm lý do hiện tại với lý do lúc gửi.
 */
export const AppealReason: React.FC<AppealReasonProps> = ({ appeal }) => {
  const view = appealReasonView(appeal);
  return (
    <>
      {view.text ?? <span className="italic text-outline">{view.placeholder}</span>}
      {view.note && <span className="block text-label-sm text-outline">{view.note}</span>}
    </>
  );
};
