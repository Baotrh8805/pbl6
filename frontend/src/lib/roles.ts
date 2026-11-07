// Vai trò (khớp enum Role backend). Chỉ import tương đối để scripts/selfCheck.ts chạy bằng node.
export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

/** Bậc: thao tác được lên người thấp hơn mình; so sánh quyền bằng atLeast. */
export const RANK: Record<Role, number> = { USER: 0, ADMIN: 1, SUPER_ADMIN: 2 };

const rankOf = (role: string | undefined | null): number =>
  role && role in RANK ? RANK[role as Role] : -1;

/** role chưa biết / chưa tải -> false (không bao giờ nới quyền trên UI; backend mới là nơi chặn). */
export const atLeast = (role: string | undefined | null, min: Role): boolean => rankOf(role) >= RANK[min];

/** Staff = mọi vai trò trừ USER; staff không dùng tính năng học. */
export const isStaff = (role: string | undefined | null): boolean => rankOf(role) >= RANK.ADMIN;

/** Staff còn phải đổi mật khẩu seed: backend chỉ cấp ROLE_SETUP, mọi trang đưa về /setup. */
export const setupPending = (p: { role?: string | null; mustChangePassword?: boolean } | null | undefined): boolean =>
  !!p && isStaff(p.role) && !!p.mustChangePassword;

export const homeFor = (role: string | undefined | null): "/" | "/admin" => (isStaff(role) ? "/admin" : "/");

/** Hồ sơ của staff (đổi mật khẩu) nằm trong Admin Panel. */
export const STAFF_ACCOUNT_PATH = "/admin/account";

/** Staff mở trang học: /profile -> Hồ sơ của staff (cùng mục đích), trang khác -> /admin. */
export const staffRedirectFor = (pathname: string): string =>
  pathname === "/profile" ? STAFF_ACCOUNT_PATH : "/admin";

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Người học",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};
