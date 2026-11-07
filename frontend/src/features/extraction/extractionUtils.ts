// Hàm thuần cho luồng bóc tách (không gọi API): nhãn, mặc định, lọc item, đọc/ghi tuỳ chọn.
import type {
  CardKind,
  ExtractionItem,
  ExtractionJob,
  ExtractionOptions,
  ExtractionStage,
  ExtractionStatus,
  ExtractionTextMeta,
  JlptLevel,
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

/** Câu cảnh báo OCR hạ cấp (meta.ocrDegraded); null khi không hạ cấp. Cùng ý với cảnh báo ở bản nháp lộ trình. */
export function ocrDegradedNotice(
  meta: Pick<ExtractionTextMeta, "ocrDegraded" | "ocrDegradedPages" | "pages"> | null | undefined
): string | null {
  if (!meta?.ocrDegraded) return null;
  const where = meta.pages > 1 ? `${meta.ocrDegradedPages ?? 1}/${meta.pages} trang` : "Ảnh";
  return `${where} chưa được AI soát lại (dịch vụ AI quá tải); văn bản dưới đây là bản OCR thô, có thể sai chữ — hãy đối chiếu và sửa rồi phân tích lại.`;
}

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

// ---- Màu cấp độ (dùng chung LevelBadge, badge "Cấp tổng thể", thanh phân bố) ---------------------------------------

/** Tông nền + chữ từng cấp cho badge; đặt ở đây thay vì LevelBadge.tsx để file component chỉ export component. */
export const LEVEL_TONE: Record<string, string> = {
  N5: "bg-secondary-container/50 text-on-secondary-container",
  N4: "bg-primary-fixed text-on-primary-fixed",
  N3: "bg-[#FEF3C7] text-[#B45309]",
  N2: "bg-tertiary-fixed text-on-tertiary-fixed",
  N1: "bg-error-container text-on-error-container",
};
export const UNKNOWN_LEVEL_TONE = "bg-surface-container text-outline";

// ---- B6: phân bố cấp JLPT toàn tài liệu + cấp tổng thể -------------------------------------------------------------

/** Khoá một đoạn trên thanh phân bố: N5..N1 hoặc "unknown". */
export type LevelKey = JlptLevel | typeof UNKNOWN_LEVEL;

export interface LevelSegment {
  level: LevelKey;
  count: number;
  /**
   * Cấp rõ: % trên số mục rõ cấp, đã làm tròn để các số hiển thị cộng đúng 100.
   * "unknown": % trên tổng (kể cả chưa rõ) – chỉ để hiển thị riêng, không nằm trong tổng 100.
   */
  pct: number;
}

export interface LevelDistribution {
  /** Tổng mục, kể cả chưa rõ cấp. */
  total: number;
  /** Số mục rõ cấp (mẫu số của pct). */
  known: number;
  /** Luôn 6 phần tử, thứ tự N5 → N1 rồi "unknown"; cấp không có mục vẫn giữ với count = 0 để thanh ổn định. */
  segments: LevelSegment[];
  /** Lấy nguyên từ ai-service (quy tắc cumulative80); job cũ không có -> null, không tự suy từ số liệu sau lọc. */
  overallLevel: JlptLevel | null;
  /** "all" = toàn tài liệu (byLevelAll, trước lọc); "filtered" = chỉ item giữ lại sau lọc (byLevel của job cũ). */
  source: "all" | "filtered";
}

export const LEVEL_SOURCE_LABELS: Record<LevelDistribution["source"], string> = {
  all: "toàn tài liệu",
  filtered: "sau lọc theo cấp",
};

/** Phần stats mà phân bố cấp cần; nới kiểu vì stats là JSON đi xuyên backend, có thể thiếu khoá / sai kiểu. */
export interface LevelStatsInput {
  byLevel?: Record<string, number>;
  byLevelAll?: Partial<Record<string, number>>;
  levelPct?: Partial<Record<string, number>>;
  overallLevel?: string | null;
}

const isJlptLevel = (v: unknown): v is JlptLevel =>
  typeof v === "string" && (JLPT_LEVELS as readonly string[]).includes(v);

/** Giá trị không phải số hữu hạn dương -> 0 (stats là JSON không đáng tin). */
const nonNegative = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const safeCount = (v: unknown): number => Math.floor(nonNegative(v));
const isCountMap = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * Làm tròn tỉ lệ thành số nguyên cộng đúng 100 (largest remainder): lấy phần nguyên của từng tỉ lệ, phần còn thiếu
 * chia lần lượt cho các mục có phần thập phân lớn nhất (hoà -> mục đứng trước, tức cấp dễ hơn). Tổng 0 -> toàn 0.
 */
export function roundToHundred(shares: number[]): number[] {
  const clean = shares.map(nonNegative);
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum === 0) return clean.map(() => 0);
  const exact = clean.map((s) => (s / sum) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/**
 * Phân bố cấp để vẽ thanh. Ưu tiên byLevelAll (toàn tài liệu, trước lọc – B6); job cũ chỉ có byLevel (sau lọc) ->
 * source "filtered"; không có số liệu hoặc tổng 0 -> null (không vẽ gì). Tỉ lệ cấp rõ lấy levelPct của ai-service
 * nếu có, không thì tính từ số đếm; cả hai đều qua roundToHundred để số hiển thị cộng đúng 100.
 */
export function levelDistribution(stats: LevelStatsInput | null | undefined): LevelDistribution | null {
  if (!stats) return null;
  const all = isCountMap(stats.byLevelAll) ? stats.byLevelAll : null;
  const counts = all ?? (isCountMap(stats.byLevel) ? stats.byLevel : null);
  if (!counts) return null;

  const knownCounts = JLPT_LEVELS.map((lvl) => safeCount(counts[lvl]));
  const unknown = safeCount(counts[UNKNOWN_LEVEL]);
  const known = knownCounts.reduce((a, b) => a + b, 0);
  const total = known + unknown;
  if (total === 0) return null;

  // levelPct chỉ đi kèm byLevelAll; toàn 0 (không có ứng viên có cấp) hay hỏng -> tính lại từ số đếm.
  const pctMap = all ? stats.levelPct : undefined;
  const fromPct = isCountMap(pctMap) ? JLPT_LEVELS.map((lvl) => nonNegative(pctMap[lvl])) : [];
  const pct = roundToHundred(fromPct.some((v) => v > 0) ? fromPct : knownCounts);

  const segments: LevelSegment[] = JLPT_LEVELS.map((level, i) => ({ level, count: knownCounts[i], pct: pct[i] }));
  segments.push({ level: UNKNOWN_LEVEL, count: unknown, pct: Math.round((unknown / total) * 100) });
  return {
    total,
    known,
    segments,
    overallLevel: isJlptLevel(stats.overallLevel) ? stats.overallLevel : null,
    source: all ? "all" : "filtered",
  };
}

/** Một dòng chữ thay cho thanh (aria-label / tooltip): "Phân bố cấp JLPT (toàn tài liệu): N5 50 (50%), … · chưa rõ 7". */
export function levelDistributionSummary(dist: LevelDistribution): string {
  const parts = dist.segments
    .filter((s) => s.level !== UNKNOWN_LEVEL && s.count > 0)
    .map((s) => `${s.level} ${s.count} (${s.pct}%)`);
  const unknown = dist.segments.find((s) => s.level === UNKNOWN_LEVEL)?.count ?? 0;
  const body = parts.length ? parts.join(", ") : "không có mục rõ cấp";
  return `Phân bố cấp JLPT (${LEVEL_SOURCE_LABELS[dist.source]}): ${body}${unknown ? ` · chưa rõ ${unknown}` : ""}`;
}

/** Nhãn badge cấp tổng thể; null = ai-service chưa đủ dữ liệu (dưới 10 từ rõ cấp). */
export const overallLevelLabel = (level: JlptLevel | null): string => `Cấp tổng thể: ${level ?? "chưa xác định"}`;

/** Giải thích quy tắc cumulative80 (tooltip badge). */
export const OVERALL_RULE_HINT =
  "Cấp thấp nhất sao cho cộng dồn từ N5 đến cấp đó chiếm ít nhất 80 % số từ vựng đã rõ cấp, " +
  "tính trên toàn tài liệu trước khi lọc theo trình độ. Dưới 10 từ rõ cấp thì chưa xác định.";

/**
 * Cấp mặc định cho bộ thẻ tạo từ job: cấp phổ biến nhất trong các item đã chọn (mostCommonLevel). Riêng bộ TỪ VỰNG
 * của job KHÔNG lọc cấp (levelFilter "all") thì ưu tiên cấp tổng thể của tài liệu (B6): ai-service tính overallLevel
 * trên toàn bộ từ vựng trước lọc, nên khi đã lọc (vd. "chỉ từ chưa biết") nó không phản ánh thẻ thực sự vào bộ, và
 * ngữ pháp không nằm trong phép tính đó. Không suy ra được -> null để nơi gọi dùng trình độ người dùng.
 */
export function defaultDeckLevel(
  stats: Pick<LevelStatsInput, "overallLevel"> | null | undefined,
  items: Pick<ExtractionItem, "level">[],
  deck: { kind: CardKind; levelFilter: ExtractionOptions["levelFilter"] }
): string | null {
  const lvl = stats?.overallLevel;
  const useOverall = deck.kind === "vocab" && deck.levelFilter === "all";
  return useOverall && isJlptLevel(lvl) ? lvl : mostCommonLevel(items);
}
