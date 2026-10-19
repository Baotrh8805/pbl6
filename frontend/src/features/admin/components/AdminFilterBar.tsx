import React from "react";

export const adminFieldClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const adminLabelClass =
  "flex flex-col gap-1 text-label-sm text-outline font-semibold";

interface AdminFilterBarProps {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * ponytail: Native flex-wrap form container, không kéo thêm thư viện form state để giữ bundle 0 kB.
 * noValidate: mỗi trang tự kiểm bộ lọc và báo lỗi tiếng Việt cạnh ô (vd. auditFilterError) — để trình duyệt kiểm
 * (pattern / min / max của ô ngày) thì bong bóng tiếng Anh chặn submit, lời báo của trang không bao giờ chạy.
 */
export const AdminFilterBar: React.FC<AdminFilterBarProps> = ({
  onSubmit,
  children,
  className = "",
}) => (
  <form
    noValidate
    onSubmit={onSubmit}
    className={`flex flex-wrap items-end gap-3 p-space-md rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-xs ${className}`}
  >
    {children}
  </form>
);
