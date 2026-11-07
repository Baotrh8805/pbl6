import React from "react";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export type BadgeTone = "neutral" | "info" | "success" | "warn" | "error" | "primary";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-container text-on-surface-variant border border-surface-container-high",
  info: "bg-primary-fixed/60 text-on-primary-fixed-variant border border-primary-container/20",
  success: "bg-secondary-container/50 text-on-secondary-container border border-secondary/20",
  warn: "bg-tertiary-fixed/60 text-on-tertiary-fixed-variant border border-tertiary/20",
  error: "bg-error-container/60 text-on-error-container border border-error/20",
  primary: "bg-primary-container text-on-primary border border-primary",
};

export interface AdminStatusBadgeProps {
  label: React.ReactNode;
  tone?: BadgeTone;
  icon?: string;
  className?: string;
}

/**
 * ponytail: Badge chuẩn hoá hiển thị text + màu nền (tránh dùng màu đơn độc vi phạm a11y).
 */
export const AdminStatusBadge: React.FC<AdminStatusBadgeProps> = ({
  label,
  tone = "neutral",
  icon,
  className = "",
}) => (
  <span
    className={`inline-flex items-center gap-1 text-label-sm font-semibold px-2 py-0.5 rounded-full whitespace-nowrap select-none ${TONE_CLASSES[tone]} ${className}`}
  >
    {icon && (
      <span aria-hidden="true" className="material-symbols-outlined text-[14px] leading-none shrink-0">
        {icon}
      </span>
    )}
    <span>{label}</span>
  </span>
);

/** Helper chuyển đổi role tương thích với RoleBadge cũ */
export const RoleStatusBadge: React.FC<{ role: Role | string }> = ({ role }) => {
  const isSuper = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";
  const tone: BadgeTone = isSuper ? "warn" : isAdmin ? "success" : "neutral";
  const label = (role in ROLE_LABELS ? ROLE_LABELS[role as Role] : role) || "USER";
  return <AdminStatusBadge label={label} tone={tone} icon={isSuper ? "shield_person" : isAdmin ? "shield" : undefined} />;
};
