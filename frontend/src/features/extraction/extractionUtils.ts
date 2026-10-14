// Hàm thuần cho luồng bóc tách (không gọi API): nhãn, mặc định, lọc item, đọc/ghi tuỳ chọn.
import type {
  CardKind,
  ExtractionItem,
  ExtractionJob,
  ExtractionOptions,
  ExtractionStage,
  ExtractionStatus,
} from "../../types/api.types.ts";
import { JLPT_LEVELS } from "../../lib/deckUtils.ts";

export const UPLOAD_ACCEPT = ".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp";
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const TEXT_MAX_CHARS = 50_000;

/** Khoá "chưa rõ cấp" dùng chung cho chip lọc và stats.byLevel. */
export const UNKNOWN_LEVEL = "unknown";

export const LEVEL_FILTER_LABELS: Record<ExtractionOptions["levelFilter"], string> = {
  all: "Tất cả cấp độ",
  at_or_above: "Từ trình độ của tôi trở lên",
  only_unknown_to_me: "Chỉ từ khó hơn trình độ của tôi",
};

export const UNKNOWN_POLICY_LABELS: Record<ExtractionOptions["treatUnknownAs"], string> = {
  above: "Giữ lại (coi như trên trình độ)",
  drop: "Bỏ qua",
};

export const OCR_MODE_LABELS: Record<ExtractionOptions["ocrMode"], string> = {
  auto: "Tự nhận dạng",
  vertical: "Chữ dọc",
  horizontal: "Chữ ngang",
};

export const EXTRACT_MODE_LABELS: Record<ExtractionOptions["extractMode"], string> = {
  auto: "Tự nhận dạng",
  list: "Danh sách từ vựng (mỗi dòng một cụm)",
  prose: "Văn bản (tách từng từ)",
};

export const KIND_LABELS: Record<CardKind, string> = { vocab: "Từ vựng", grammar: "Ngữ pháp" };

export const STATUS_LABELS: Record<ExtractionStatus, string> = {
  QUEUED: "Đang chờ",
  RUNNING: "Đang xử lý",
  DONE: "Hoàn tất",
  FAILED: "Thất bại",
  CANCELLED: "Đã huỷ",
};

/** Các bước hiển thị trên thanh tiến trình (QUEUED gộp vào bước đầu). */
export const STAGE_STEPS: { stage: ExtractionStage; label: string; icon: string }[] = [
  { stage: "TEXT", label: "Nhận văn bản", icon: "description" },
  { stage: "ANALYZE", label: "Phân tích", icon: "manage_search" },
  { stage: "ENRICH", label: "Làm giàu nghĩa", icon: "translate" },
  { stage: "DONE", label: "Hoàn tất", icon: "check_circle" },
];

/** Chỉ số bước hiện tại trên STAGE_STEPS; QUEUED = chưa tới bước nào (-1). */
export function stageIndex(stage: ExtractionStage): number {
  return STAGE_STEPS.findIndex((s) => s.stage === stage);
}

export const isActiveStatus = (status: ExtractionStatus): boolean => status === "QUEUED" || status === "RUNNING";

export const SOURCE_TYPE_LABELS: Record<ExtractionJob["sourceType"], string> = {
  text: "Văn bản dán",
  txt: "Tệp văn bản",
  docx: "Word",
  pdf: "PDF",
  image: "Ảnh",
};

/** Ảnh / PDF mới cần tuỳ chọn OCR. */
export function needsOcr(file: File | null): boolean {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return /\.(pdf|png|jpe?g|webp)$/.test(name) || file.type.startsWith("image/") || file.type === "application/pdf";
}

export function defaultOptions(userLevel: string | undefined): ExtractionOptions {
  return {
    userLevel: userLevel && (JLPT_LEVELS as readonly string[]).includes(userLevel) ? userLevel : "N5",
    levelFilter: "all",
    includeGrammar: true,
    includeFurigana: true,
    includeHanViet: true,
    meaningLang: "vi",
    treatUnknownAs: "above",
    minFrequency: 1,
    ocrMode: "auto",
    extractMode: "auto",
  };
}

const OPTIONS_KEY = "extraction:options";

/** Tuỳ chọn lần trước (localStorage); trình độ luôn lấy theo hồ sơ hiện tại nếu có. */
export function loadSavedOptions(userLevel: string | undefined): ExtractionOptions {
  const base = defaultOptions(userLevel);
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ExtractionOptions>;
    return { ...base, ...saved, userLevel: userLevel ? base.userLevel : (saved.userLevel ?? base.userLevel) };
  } catch {
    return base;
  }
}

export function saveOptions(options: ExtractionOptions): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // storage đầy / bị chặn: không nhớ tuỳ chọn, không chặn gửi
  }
}

/** Lý do Gemini lỗi (ai-service) -> câu hiển thị cho người dùng. */
export const geminiReasonText = (reason: string): string =>
  reason === "quota"
    ? "AI (Gemini) đã hết hạn mức"
    : reason === "no_api_key"
      ? "Chưa cấu hình khoá Gemini"
      : "AI (Gemini) đang gặp lỗi";

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "";

/** Nghĩa hiển thị: ưu tiên tiếng Việt (bước ENRICH), không có thì tiếng Anh (JMdict). */
export const itemMeaning = (item: Pick<ExtractionItem, "meaningVi" | "meaningEn">): string =>
  item.meaningVi?.trim() || item.meaningEn?.trim() || "";

/** Cấp trong chuỗi nguồn "jlpt_list:N4" -> "N4"; không có dấu ':' -> nguyên chuỗi. */
const sourceLevel = (src: string): string => src.slice(src.indexOf(":") + 1);

/**
 * Tooltip badge cấp: "N3 · 50% · nguồn khác: N2". Cấp mơ hồ chọn cấp dễ nhất, các cấp còn lại liệt kê
 * để người dùng tự quyết.
 */
export function levelTooltip(item: Pick<ExtractionItem, "level" | "levelConfidence" | "levelSources">): string {
  if (!item.level) return "Không tìm thấy trong danh sách JLPT";
  const parts = [item.level, `${Math.round(item.levelConfidence * 100)}%`];
  const others = [...new Set((item.levelSources ?? []).map(sourceLevel))].filter(
    (lvl) => lvl !== item.level && (JLPT_LEVELS as readonly string[]).includes(lvl)
  );
  if (others.length) parts.push(`nguồn khác: ${others.join(", ")}`);
  return parts.join(" · ");
}

export interface ItemFilter {
  kind: CardKind;
  /** "" = mọi cấp; "unknown" = không rõ cấp. */
  level: string;
  query: string;
}

export function filterItems(items: ExtractionItem[], f: ItemFilter): ExtractionItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((it) => {
    if (it.kind !== f.kind) return false;
    if (f.level === UNKNOWN_LEVEL ? it.level != null : f.level && it.level !== f.level) return false;
    if (!q) return true;
    return [it.term, it.surface, it.reading, it.hanViet, it.meaningVi, it.meaningEn]
      .some((v) => v?.toLowerCase().includes(q));
  });
}

/** Cấp phổ biến nhất trong các item (bỏ item không rõ cấp); hoà thì lấy cấp dễ hơn. */
export function mostCommonLevel(items: Pick<ExtractionItem, "level">[]): string | null {
  const counts = new Map<string, number>();
  for (const it of items) if (it.level) counts.set(it.level, (counts.get(it.level) ?? 0) + 1);
  let best: string | null = null;
  for (const lvl of JLPT_LEVELS) {
    if ((counts.get(lvl) ?? 0) > (best ? counts.get(best)! : 0)) best = lvl;
  }
  return best;
}

/** Tên bộ thẻ mặc định: tên file (bỏ đuôi) hoặc "<Loại> trích xuất – <ngày>". */
export function defaultDeckTitle(job: Pick<ExtractionJob, "sourceName" | "createdAt">, kind: CardKind): string {
  const base = job.sourceName?.replace(/\.[^.]+$/, "").trim();
  const date = new Date(job.createdAt).toLocaleDateString("vi-VN");
  if (kind === "grammar") return base ? `Ngữ pháp – ${base}` : `Ngữ pháp trích xuất – ${date}`;
  return base || `Từ vựng trích xuất – ${date}`;
}
