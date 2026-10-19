// Hàm thuần cho Admin Panel (không gọi API); import tương đối để selfCheck chạy bằng node.
import type { Role } from "../../lib/roles.ts";

/**
 * Tính các mốc vạch Y làm tròn đẹp (0, step, 2*step, ...).
 * targetCount mặc định 3 vạch (0, giữa, đỉnh).
 */
export const niceTicks = (max: number, targetCount = 3): number[] => {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const intervals = Math.max(1, targetCount - 1);
  const rawStep = max / intervals;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / power;
  let mult = 10;
  for (const m of [1, 2, 4, 5, 10]) {
    if (frac <= m + 1e-9) {
      mult = m;
      break;
    }
  }
  const step = Math.max(1, mult * power);
  const ticks: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    ticks.push(i * step);
  }
  return ticks;
};

/**
 * Sinh chuỗi SVG path thẳng M... L... từ mảng giá trị (polyline, không Catmull-Rom để tránh overshoot).
 */
export const buildLinePath = (values: number[], w: number, h: number, max: number): string => {
  if (values.length === 0) return "";
  if (values.length === 1) {
    const y = max > 0 ? h - (values[0] / max) * h : h;
    return `M 0.0 ${y.toFixed(1)}`;
  }
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = max > 0 ? h - (Math.min(v, max) / max) * h : h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

/**
 * Khép kín đường line thành vùng diện tích (Area) nối xuống đáy biểu đồ để tô gradient.
 */
export const buildAreaPath = (linePath: string, w: number, h: number): string => {
  if (!linePath) return "";
  return `${linePath} L ${w.toFixed(1)} ${h.toFixed(1)} L 0.0 ${h.toFixed(1)} Z`;
};

/**
 * Tính chênh lệch 7 ngày gần nhất so với 7 ngày trước đó.
 * Cần series tối thiểu 14 ngày, nếu prev7 = 0 thì pct = null (tránh chia 0).
 */
export const periodDelta = (
  series: Record<string, any>[],
  key: string,
): { last7: number; prev7: number; pct: number | null } | null => {
  if (!series || series.length < 14) return null;
  const last7Items = series.slice(-7);
  const prev7Items = series.slice(-14, -7);
  const last7 = last7Items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  const prev7 = prev7Items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  const pct = prev7 === 0 ? null : Math.round(((last7 - prev7) / prev7) * 100);
  return { last7, prev7, pct };
};

/**
 * Tìm chỉ số phần tử gần nhất tương ứng với vị trí chuột x trên chiều rộng w.
 */
export const indexAtX = (x: number, width: number, n: number): number => {
  if (n <= 1 || width <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, x / width));
  return Math.min(n - 1, Math.round(ratio * (n - 1)));
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

/** Xuất CSV phía trình duyệt (UTF-8 BOM để Excel đọc tiếng Việt). rows = mảng object cùng khoá; không endpoint mới. */
export const downloadCsv = (filename: string, rows: Record<string, unknown>[]): void => {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown): string => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Gom mọi trang của một API phân trang admin (size tối đa 100/lần, trần 1000 dòng). */
export const fetchAllPages = async <T,>(
  page: (p: number, size: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> => {
  const out: T[] = [];
  for (let p = 0; p < 10; p++) {
    const r = await page(p, 100);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out;
};

/**
 * Rút gọn object/mảng JSON thành 1 dòng mô tả ngắn để hiển thị trước trong bảng.
 */
export const summarizeJson = (val: unknown, maxLength = 60): string => {
  if (val === null || val === undefined) return "—";
  if (typeof val !== "object") return String(val).slice(0, maxLength);
  if (Array.isArray(val)) return `[${val.length} mục]`;
  const entries = Object.entries(val as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const preview = entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? (v === null ? "null" : "{...}") : JSON.stringify(v)}`)
    .join(", ");
  return preview.length > maxLength ? `${preview.slice(0, maxLength - 1)}…` : preview;
};

/**
 * Sinh màu nền pastel theo hash chuỗi (dùng cho avatar học viên).
 */
export const stringToHslColor = (str: string): string => {
  if (!str) return "hsl(210, 40%, 90%)";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 90%)`;
};

/**
 * Sinh màu chữ tương phản tương ứng với màu nền pastel avatar.
 */
export const stringToTextColor = (str: string): string => {
  if (!str) return "hsl(210, 60%, 25%)";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 80%, 22%)`;
};


