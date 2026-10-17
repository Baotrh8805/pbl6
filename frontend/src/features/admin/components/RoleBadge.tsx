import React from "react";
import { ROLE_LABELS, type Role } from "@/lib/roles";

const TONES: Record<Role, string> = {
  USER: "bg-surface-container text-on-surface",
  VIEWER: "bg-primary-fixed text-on-primary-fixed",
  ADMIN: "bg-secondary-container text-on-secondary-container",
  SUPER_ADMIN: "bg-tertiary-fixed text-on-tertiary-fixed",
};

/** Nhãn vai trò: luôn có chữ, màu chỉ bổ trợ. */
export const RoleBadge: React.FC<{ role: Role | string }> = ({ role }) => {
  const r = (role in TONES ? role : "USER") as Role;
  return (
    <span className={`inline-block text-label-sm font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TONES[r]}`}>
      {ROLE_LABELS[r] ?? role}
    </span>
  );
};
