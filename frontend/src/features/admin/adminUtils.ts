// Hàm thuần cho Admin Panel (không gọi API); import tương đối để selfCheck chạy bằng node.
import type { Role } from "../../lib/roles.ts";

/** Chiều cao cột (0–100) theo giá trị lớn nhất; toàn 0 -> toàn 0 (không chia cho 0). */
export const toPercentHeights = (values: number[]): number[] => {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return values.map((v) => (max === 0 ? 0 : Math.round((v / max) * 100)));
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  WRONG_CONTENT: "Sai nội dung",
  COPYRIGHT: "Vi phạm bản quyền",
  OFFENSIVE: "Xúc phạm",
  SPAM: "Spam",
  OTHER: "Khác",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Đang mở",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bỏ qua",
};

export const AUDIT_TARGET_LABELS: Record<string, string> = {
  USER: "Người dùng",
  DECK: "Bộ thẻ",
  RATING: "Đánh giá",
  EXTRACTION: "Bóc tách",
  REPORT: "Báo cáo",
  SETTINGS: "Cấu hình",
};

/** Vai trò được phép gán qua UI (SUPER_ADMIN chọn). */
export const ASSIGNABLE_ROLES: Role[] = ["USER", "ADMIN", "SUPER_ADMIN"];

/** dd/MM HH:mm cho bảng admin; null -> "—". */
export const formatShort = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
