// Vai trò (khớp enum Role backend). Chỉ import tương đối để scripts/selfCheck.ts chạy bằng node.
export type Role = "USER" | "VIEWER" | "ADMIN" | "SUPER_ADMIN";

/** Bậc: thao tác được lên người thấp hơn mình; so sánh quyền bằng atLeast. */
export const RANK: Record<Role, number> = { USER: 0, VIEWER: 1, ADMIN: 2, SUPER_ADMIN: 3 };

const rankOf = (role: string | undefined | null): number =>
  role && role in RANK ? RANK[role as Role] : -1;

/** role chưa biết / chưa tải -> false (không bao giờ nới quyền trên UI; backend mới là nơi chặn). */
export const atLeast = (role: string | undefined | null, min: Role): boolean => rankOf(role) >= RANK[min];

/** Staff = mọi vai trò trừ USER; staff không dùng tính năng học. */
export const isStaff = (role: string | undefined | null): boolean => rankOf(role) >= RANK.VIEWER;

export const homeFor = (role: string | undefined | null): "/" | "/admin" => (isStaff(role) ? "/admin" : "/");

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Người học",
  VIEWER: "Viewer",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};
