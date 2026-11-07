import React from "react";

export interface AdminDetailCardProps {
  title: string;
  icon?: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * ponytail: Khung card chuẩn cho trang chi tiết, chia ranh giới Danger Zone bằng màu border/bg có sẵn.
 */
export const AdminDetailCard: React.FC<AdminDetailCardProps> = ({
  title,
  icon,
  description,
  badge,
  actions,
  danger = false,
  children,
  className = "",
}) => {
  const borderTone = danger
    ? "border-error/40 bg-error/5"
    : "border-surface-container-high bg-surface-container-lowest";

  return (
    <div className={`rounded-2xl border p-space-md shadow-xs flex flex-col gap-space-md ${borderTone} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container-high/60 pb-space-sm">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[20px] ${danger ? "text-error" : "text-outline"}`}
            >
              {icon}
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`font-headline-sm text-body-lg font-bold ${danger ? "text-error" : "text-on-surface"}`}>
                {title}
              </h2>
              {badge}
            </div>
            {description && (
              <p className="text-body-sm text-on-surface-variant mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      <div className="flex flex-col gap-space-sm text-body-sm text-on-surface">
        {children}
      </div>
    </div>
  );
};
