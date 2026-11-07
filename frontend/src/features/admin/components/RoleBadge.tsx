import React from "react";
import { RoleStatusBadge } from "./AdminStatusBadge";
import type { Role } from "@/lib/roles";

/** Nhãn vai trò tương thích ngược với RoleStatusBadge mới. */
export const RoleBadge: React.FC<{ role: Role | string }> = ({ role }) => (
  <RoleStatusBadge role={role} />
);

export default RoleBadge;
