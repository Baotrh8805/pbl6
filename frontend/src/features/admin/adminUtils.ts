// Hàm thuần cho Admin Panel (không gọi API); import tương đối để selfCheck chạy bằng node.
import type { Role } from "../../lib/roles.ts";
import { dayKey } from "../../lib/learningStats.ts";

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
  QUESTION: "Câu hỏi quiz",
  MNEMONIC: "Mẹo nhớ",
  KNOWLEDGE_SOURCE: "Nguồn tri thức",
  APPEAL: "Khiếu nại",
};

/** Vai trò được phép gán qua UI (SUPER_ADMIN chọn). */
export const ASSIGNABLE_ROLES: Role[] = ["USER", "ADMIN", "SUPER_ADMIN"];

export type AdminAccountStatus = "deleted" | "locked" | "active";

/**
 * Trạng thái tài khoản cho nhãn / nút ở trang Người dùng. Tài khoản đã tự xoá cũng có lockedAt (khoá vĩnh viễn) nhưng không
 * phải "bị khoá" chờ mở: backend trả 409 cho mở khoá / Premium / hạn mức / vai trò, nên "deleted" thắng "locked" để UI hiện
 * "Đã xoá" và ẩn các nút đó thay vì để admin bấm rồi mới thấy lỗi.
 */
export const adminAccountStatus = (u: { lockedAt: string | null; deleted?: boolean }): AdminAccountStatus =>
  u.deleted ? "deleted" : u.lockedAt ? "locked" : "active";

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



// ---------- Sửa sau kiểm tay trên trình duyệt (STAFF-04/06/12) ----------

/** Giá trị ?role= của tab "Đội ngũ Staff": backend chỉ lọc một vai trò mỗi lần nên máy khách gộp ADMIN + SUPER_ADMIN. */
export const STAFF_ROLE_FILTER = "STAFF";
export const STAFF_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];

/**
 * Gộp danh sách staff của các vai trò (mỗi vai trò một lần gọi) theo đúng thứ tự server (mới tạo trước, rồi id giảm dần,
 * UserRepository.search) và cắt đúng trang đang xem.
 */
export function mergeStaffPage<T extends { id: number; createdAt: string | null }>(
  rows: readonly T[],
  page: number,
  size: number
): { items: T[]; total: number; page: number; size: number } {
  const seen = new Set<number>();
  const sorted = rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id - a.id);
  return { items: sorted.slice(page * size, (page + 1) * size), total: sorted.length, page, size };
}

/** Bộ lọc Nhật ký sai thì báo ngay ở máy khách thay vì gửi lên server (400) hoặc lặng lẽ ra 0 dòng; hợp lệ -> null. */
export function auditFilterError(f: { actorId: string; from: string; to: string }): string | null {
  const actor = f.actorId.trim();
  if (actor && !/^[1-9]\d{0,17}$/.test(actor)) return "ID người thao tác phải là số nguyên dương (vd. 1).";
  if (f.from && f.to && f.from > f.to) return "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
  return null;
}

export const INCOMPLETE_DATE_ERROR = "Ngày chưa nhập đủ (dd/mm/yyyy).";

/**
 * Ô type=date gõ dở (vd. 12/__/2026) có value "" y như ô trống, chỉ validity.badInput phân biệt được. Form admin đặt
 * noValidate (lời báo tiếng Việt thay bong bóng tiếng Anh) nên trình duyệt không chặn nữa: không tự kiểm thì bộ lọc
 * Nhật ký lặng lẽ bỏ điều kiện ngày, hạn Pro lặng lẽ thành "vĩnh viễn". Không có ô / ô hợp lệ -> null.
 */
export const incompleteDateError = (input: { validity: { badInput: boolean } } | null | undefined): string | null =>
  input?.validity.badInput ? INCOMPLETE_DATE_ERROR : null;

/**
 * "7 ngày gần nhất" của Nhật ký: from / to theo ngày LỊCH ở máy admin (dayKey) — server đọc hai mốc này là ngày theo giờ
 * Việt Nam (to tính trọn tới nửa đêm). Trước đây cắt từ toISOString() (giờ UTC): 00:00–06:59 sáng ở Việt Nam ngày UTC vẫn là
 * hôm qua nên "đến ngày" thành hôm qua, mọi thao tác sáng nay biến mất khỏi bộ lọc mà không có dấu hiệu gì.
 */
export function lastDaysRange(days: number, now: Date = new Date()): { from: string; to: string } {
  return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)), to: dayKey(now) };
}

/** max của ô "Hạn dùng" Pro: không có max thì ô type=date nhận năm tới 275760. */
export const PREMIUM_UNTIL_MAX = "9999-12-31";

/**
 * Hạn Pro đã nhập đủ (ô gõ dở báo riêng bằng incompleteDateError); "" = vĩnh viễn -> null. Năm 5–6 chữ số ("20266-12-31",
 * gõ thừa một phím) là giá trị hợp lệ với trình duyệt nhưng new Date(...) thành Invalid Date -> toISOString ném "Invalid time
 * value" tiếng Anh lên banner; ngày đã qua thì lưu "thành công" một gói Pro hết hạn sẵn (kèm thông báo cho người dùng).
 * today: ngày lịch ở máy admin (dayKey), hạn tính trọn tới hết ngày nên hôm nay vẫn hợp lệ.
 */
export function premiumUntilDateError(value: string, today: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Năm của hạn dùng phải có 4 chữ số (dd/mm/yyyy).";
  if (value < today) return "Hạn dùng phải từ hôm nay trở đi (để trống = vĩnh viễn).";
  return null;
}

/**
 * Tỉ lệ (%) các nhóm của "Cơ cấu Bóc tách AI". "Khác" = phần còn lại của 100 % chỉ khi thật sự có lượt khác: tổng 0
 * (hoặc không có lượt khác) thì 0 %, không phải "Khác: 0 (100%)".
 */
export function extractionBreakdown(total: number, done: number, running: number, failed: number) {
  const pct = (v: number) => (total > 0 && v > 0 ? Math.min(100, Math.round((v / total) * 100)) : 0);
  const other = Math.max(0, total - done - running - failed);
  const donePct = pct(done);
  const runningPct = pct(running);
  const failedPct = pct(failed);
  const otherPct = total > 0 && other > 0 ? Math.max(0, 100 - donePct - runningPct - failedPct) : 0;
  return { other, donePct, runningPct, failedPct, otherPct };
}

/**
 * Bề rộng vẽ của biểu đồ xu hướng (đơn vị viewBox) theo bề rộng khung đo được: bằng đúng số px (1 đơn vị ≈ 1 px, chữ
 * trục 11 px đọc được trên điện thoại), kẹp [240, max] — khung rộng hơn max thì phóng to như trước.
 */
export const chartWidthFor = (containerWidth: number, max: number): number =>
  Math.round(Math.min(max, Math.max(240, containerWidth)));

/** Bước nhãn trục X: tối đa 6 nhãn, và mỗi nhãn "dd/mm" cần ~70 px nên khung hẹp ít nhãn hơn (tối thiểu 2). */
export const xLabelStep = (points: number, width: number): number => {
  const maxLabels = Math.max(2, Math.min(6, Math.floor(width / 70)));
  return Math.max(1, Math.ceil(points / maxLabels));
};
