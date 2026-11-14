import React from "react";

export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Tiêu chuẩn thanh tiêu đề trang Admin: tiêu đề, phụ đề và vùng nút tác vụ (Refresh, Lọc, Xuất CSV).
 */
export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  actions,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-space-md">
    <div>
      <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface tracking-tight">
        {title}
      </h1>
      {description && (
        <p className="text-body-sm text-on-surface-variant mt-0.5">{description}</p>
      )}
    </div>
    {actions && (
      <div className="flex items-center gap-3 flex-wrap shrink-0">{actions}</div>
    )}
  </div>
);
