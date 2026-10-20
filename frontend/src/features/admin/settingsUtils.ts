// Cấu hình hệ thống (G5): mô tả các khoá app_settings mới, đọc response, kiểm tra khoảng giá trị, dựng body PUT.
// Hàm thuần (import tương đối + đuôi .ts) -> kiểm được bằng scripts/selfCheck.ts.
import type { AdminAiModels, AdminSettings } from "../../types/api.types.ts";

export type SettingsNumberKey =
    | "learning_path_daily_cap_default"
    | "learning_path_quiz_pass_pct"
    | "learning_path_reminder_hour"
    | "ocr_fallback_confidence"
    | "ocr_low_line_confidence"
    | "distractor_min_confidence"
    | "contradiction_alert_threshold";

export interface SettingsNumberField {
    key: SettingsNumberKey;
    label: string;
    /** Giải thích tác dụng cho quản trị viên (tiếng Việt). */
    hint: string;
    min: number;
    max: number;
    step: number;
    integer: boolean;
    unit?: string;
}

export const LEARNING_PATH_FIELDS: readonly SettingsNumberField[] = [
    {
        key: "learning_path_daily_cap_default",
        label: "Trần tải mặc định mỗi ngày",
        hint: "Số thẻ tối đa (thẻ mới + thẻ ôn dự báo) một ngày cho lộ trình khi người học không tự đặt trần.",
        min: 5,
        max: 200,
        step: 1,
        integer: true,
        unit: "thẻ / ngày",
    },
    {
        key: "learning_path_quiz_pass_pct",
        label: "Ngưỡng qua kiểm tra chương",
        hint: "Điểm bài kiểm tra chương tối thiểu để chương được tính là “đã qua”.",
        min: 50,
        max: 100,
        step: 1,
        integer: true,
        unit: "%",
    },
    {
        key: "learning_path_reminder_hour",
        label: "Giờ gửi nhắc học",
        hint: "Giờ trong ngày (giờ Việt Nam) gửi thông báo nhắc học cho lộ trình bật nhắc; mỗi lộ trình tối đa một lần / ngày.",
        min: 0,
        max: 23,
        step: 1,
        integer: true,
        unit: "giờ",
    },
];

export const AI_THRESHOLD_FIELDS: readonly SettingsNumberField[] = [
    {
        key: "ocr_fallback_confidence",
        label: "Ngưỡng chuyển sang Gemini khi OCR kém",
        hint: "Ảnh / PDF scan có độ tin cậy OCR trung bình dưới ngưỡng này sẽ được Gemini Vision đọc lại. Tăng ngưỡng = gọi Gemini nhiều hơn (chính xác hơn, tốn hạn mức hơn).",
        min: 0,
        max: 1,
        step: 0.01,
        integer: false,
    },
    {
        key: "ocr_low_line_confidence",
        label: "Ngưỡng dòng OCR cần kiểm tra",
        hint: "Dòng OCR có độ tin cậy dưới ngưỡng này được liệt kê “cần kiểm tra” ở trang bóc tách để người dùng tự sửa.",
        min: 0,
        max: 1,
        step: 0.01,
        integer: false,
    },
    {
        key: "distractor_min_confidence",
        label: "Độ tin cậy tối thiểu của phương án nhiễu",
        hint: "Phương án sai do hệ thống gợi ý (chữ giống hình, từ đồng âm) chỉ được đưa vào câu hỏi quiz khi độ tin cậy từ ngưỡng này trở lên.",
        min: 0,
        max: 1,
        step: 0.01,
        integer: false,
    },
    {
        key: "contradiction_alert_threshold",
        label: "Ngưỡng cảnh báo mâu thuẫn tài liệu",
        hint: "Cách đọc / nghĩa / cấp JLPT trong tài liệu khác từ điển hoặc nguồn chuẩn chỉ bị cảnh báo khi độ tin cậy từ ngưỡng này trở lên — thấp hơn thì bỏ qua để tránh báo nhầm.",
        min: 0,
        max: 1,
        step: 0.01,
        integer: false,
    },
];

export const SETTINGS_NUMBER_FIELDS: readonly SettingsNumberField[] = [...LEARNING_PATH_FIELDS, ...AI_THRESHOLD_FIELDS];

export const AI_MODEL_MAX = 40;

export interface AiModelHint {
  tone: "muted" | "warn";
  text: string;
}

/**
 * Dòng nhắc dưới ô "Model AI chính". ai-service thay tên ngoài danh sách cho phép bằng model mặc định mà không báo lỗi (một ô
 * cấu hình không được làm hỏng lượt bóc tách) -> trang phải nói ra, nếu không Admin lưu xong tưởng model đã gõ đang chạy.
 * options: undefined = đang tải (chưa nói gì); null = không kiểm tra được (ai-service tắt / bản cũ).
 */
export function aiModelHint(value: string | null | undefined, options: AdminAiModels | null | undefined): AiModelHint | null {
  if (options === undefined) return null;
  const typed = (value ?? "").trim();
  const allowed = (options?.allowed ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean);
  const def = options?.default?.trim() || null;
  if (allowed.length === 0) {
    return typed
      ? { tone: "muted", text: "Chưa kiểm tra được với ai-service: tên ngoài danh sách cho phép sẽ bị bỏ qua (dùng model mặc định)." }
      : null;
  }
  if (!typed) return def ? { tone: "muted", text: `Đang dùng model mặc định của ai-service: ${def}.` } : null;
  if (allowed.includes(typed.toLowerCase())) {
    return { tone: "muted", text: `ai-service nhận model này; Google báo model đã ngừng thì tự quay về ${def ?? "model mặc định"}.` };
  }
  return {
    tone: "warn",
    text: `ai-service không nhận "${typed}" — mọi lượt gọi vẫn dùng ${def ?? "model mặc định"}. Chọn một tên trong danh sách gợi ý.`,
  };
}
/** Hạn mức bóc tách / ngày (khoá cũ), cùng @Min(0) @Max(1000) của SettingsResponse. */
export const EXTRACTION_LIMIT_MAX = 1000;

/** Khoá mới (V20/V21): thiếu bất kỳ khoá nào -> coi như backend chưa hỗ trợ, PUT chỉ gửi 4 khoá cũ. */
export const EXTRA_SETTING_KEYS = [
    ...SETTINGS_NUMBER_FIELDS.map((f) => f.key),
    "ai_model_primary",
    "email_verification_required",
] as const;

const camelOf = (key: string): string => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const numberOf = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return undefined;
};

/**
 * Đọc GET /admin/settings. 4 khoá cũ giữ nguyên (snake_case = tên khoá app_settings). Khoá mới đọc snake_case trước, không
 * có thì thử camelCase (phòng backend đặt tên kiểu Java) và ghi nhớ kiểu tên đó để PUT gửi lại đúng tên server đã dùng.
 */
export function normalizeAdminSettings(raw: unknown): { settings: AdminSettings; camelExtras: boolean } {
    const rec = asRecord(raw);
    const settings: AdminSettings = {
        extraction_daily_limit_free: numberOf(rec.extraction_daily_limit_free) ?? 0,
        extraction_daily_limit_premium: numberOf(rec.extraction_daily_limit_premium) ?? 0,
        announcement: typeof rec.announcement === "string" ? rec.announcement : "",
        registration_open: rec.registration_open === true,
        updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : null,
    };
    let snakeHits = 0;
    let camelHits = 0;
    const pick = (key: string): unknown => {
        if (rec[key] !== undefined && rec[key] !== null) {
            snakeHits++;
            return rec[key];
        }
        const alt = rec[camelOf(key)];
        if (alt !== undefined && alt !== null) camelHits++;
        return alt;
    };
    for (const f of SETTINGS_NUMBER_FIELDS) {
        const v = numberOf(pick(f.key));
        if (v !== undefined) settings[f.key] = v;
    }
    const model = pick("ai_model_primary");
    if (typeof model === "string") settings.ai_model_primary = model;
    const email = pick("email_verification_required");
    if (typeof email === "boolean") settings.email_verification_required = email;
    return { settings, camelExtras: camelHits > snakeHits };
}

/** Đủ mọi khoá mới -> cho sửa và gửi chúng trong PUT. */
export const hasAllExtras = (s: AdminSettings): boolean =>
    EXTRA_SETTING_KEYS.every((k) => s[k] !== undefined && s[k] !== null);

/** Chuỗi trong ô nhập -> số hợp lệ của khoá (nhận cả dấu phẩy thập phân "0,85"); sai kiểu / ngoài khoảng -> null. */
export const parseSettingNumber = (field: SettingsNumberField, text: string): number | null => {
    const t = text.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < field.min || n > field.max) return null;
    if (field.integer && !Number.isInteger(n)) return null;
    return n;
};

/** Câu lỗi cho ô nhập; hợp lệ -> null. */
export const settingNumberError = (field: SettingsNumberField, text: string): string | null =>
    parseSettingNumber(field, text) !== null
        ? null
        : field.integer
          ? `Nhập số nguyên từ ${field.min} đến ${field.max}.`
          : `Nhập số từ ${field.min} đến ${field.max} (vd. 0.85).`;

/** Hạn mức bóc tách (khoá cũ): số nguyên 0..1000. */
export const isValidExtractionLimit = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= EXTRACTION_LIMIT_MAX;

/**
 * Ô "Hạn mức riêng" của một người dùng (Admin > Người dùng > chi tiết): chuỗi đang gõ -> câu lỗi, hợp lệ -> null.
 * Form đặt noValidate nên đây là chốt duy nhất trước khi gửi: để trình duyệt kiểm (min / max / required) thì 5000, ô trống
 * hay 1.5 chỉ ra bong bóng tiếng Anh; bỏ kiểm thì ô trống thành Number("") = 0 — lặng lẽ khoá bóc tách của người đó.
 */
export const userExtractionLimitError = (text: string): string | null => {
    const t = text.trim();
    if (t === "") return `Nhập hạn mức riêng (số nguyên 0–${EXTRACTION_LIMIT_MAX}) hoặc chọn “Theo cấu hình chung”.`;
    return isValidExtractionLimit(Number(t)) ? null : `Hạn mức riêng phải là số nguyên từ 0 đến ${EXTRACTION_LIMIT_MAX}.`;
};

/**
 * Body PUT: luôn đủ 4 khoá cũ; khoá mới chỉ gửi khi CÓ ĐỦ (backend cũ chỉ biết 4 khoá; backend mới đòi đủ mọi khoá), đặt
 * tên theo kiểu server đã trả (camelExtras). Không gửi updatedAt (server tự đặt).
 */
export function buildSettingsPayload(s: AdminSettings, camelExtras = false): AdminSettings {
    const out: AdminSettings & Record<string, unknown> = {
        extraction_daily_limit_free: s.extraction_daily_limit_free,
        extraction_daily_limit_premium: s.extraction_daily_limit_premium,
        announcement: s.announcement,
        registration_open: s.registration_open,
    };
    if (!hasAllExtras(s)) return out;
    for (const key of EXTRA_SETTING_KEYS) {
        const value = key === "ai_model_primary" ? (s.ai_model_primary ?? "").trim() : s[key];
        out[camelExtras ? camelOf(key) : key] = value;
    }
    return out;
}
