import React from "react";

export interface AdminFlashMessage {
  ok: boolean;
  text: string;
}

interface AdminFlashProps {
  message: AdminFlashMessage | null;
  onClose: () => void;
}

/**
 * Dải kết quả thao tác (thành công: role="status"; lỗi: role="alert") — cùng kiểu với trang chi tiết người dùng,
 * tách ra để các trang kiểm duyệt dùng chung.
 */
export const AdminFlash: React.FC<AdminFlashProps> = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div
      role={message.ok ? "status" : "alert"}
      className={`p-space-sm rounded-xl border text-body-sm flex items-center justify-between gap-2 shadow-xs ${
        message.ok ? "bg-secondary-container/20 border-secondary/30 text-secondary" : "bg-error/10 border-error/20 text-error"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">
          {message.ok ? "check_circle" : "error"}
        </span>
        <span className="break-words">{message.text}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-outline hover:text-on-surface p-1 rounded transition-colors cursor-pointer shrink-0"
        aria-label="Đóng thông báo"
      >
        ✕
      </button>
    </div>
  );
};
