// Hàm thuần cho các trang admin đợt 2: dashboard AI (§8), mẹo nhớ (§4), nguồn tri thức (§5), khiếu nại (§6).
// Không gọi API, không React; import tương đối + đuôi .ts để scripts/selfcheck/admin.ts chạy thẳng bằng node.
import { RANK, atLeast, isStaff, type Role } from "../../lib/roles.ts";
import type { AccountAppeal } from "../../types/adminModeration.types.ts";

// Nhãn trạng thái mẹo nhớ dùng chung với phía người học (một bản đồ duy nhất, cùng chữ "Đã từ chối").
export { MNEMONIC_STATUS_LABELS } from "../kanji/mnemonicUtils.ts";

// ---------- số liệu & định dạng ----------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** % làm tròn 0.1, kẹp 0..100; total ≤ 0 hoặc thiếu số -> null (hiện "—" thay vì 0% gây hiểu nhầm). */
export const ratePct = (part: number | null | undefined, total: number | null | undefined): number | null => {
  if (!isNum(part) || !isNum(total) || total <= 0) return null;
  const pct = (Math.max(0, part) / total) * 100;
  return Math.round(Math.min(100, pct) * 10) / 10;
};

/** "12,5%" (dấu phẩy thập phân kiểu Việt); null -> "—". */
export const formatPct = (v: number | null | undefined): string =>
  isNum(v) ? `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "—";

/** Độ tin cậy trung bình: ai-service trả 0..1 (như textMeta.meanConfidence); phòng khi server đã nhân 100. */
export const confidencePct = (v: number | null | undefined): number | null => {
  if (!isNum(v) || v < 0) return null;
  const pct = v <= 1 ? v * 100 : v;
  return Math.round(Math.min(100, pct) * 10) / 10;
};

/** Thời gian xử lý trung bình: "0,8 giây" / "12,3 giây" / "2 phút 5 giây"; null -> "—". */
export const formatSeconds = (v: number | null | undefined): string => {
  if (!isNum(v) || v < 0) return "—";
  if (v < 60) return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`;
  const m = Math.floor(v / 60);
  const s = Math.round(v - m * 60);
  return s > 0 ? `${m} phút ${s} giây` : `${m} phút`;
};

// ---------- §8 engine đọc văn bản & thành phần ai-service ----------

/** Engine bước TEXT (ai.engines[].engine) — khoá lạ hiện nguyên tên. */
const EXTRACT_ENGINE_LABELS: Record<string, string> = {
  tesseract: "OCR Tesseract",
  gemini: "Gemini Vision",
  "pdf-text": "PDF có lớp chữ",
  pdf: "PDF",
  docx: "Word (DOCX)",
  text: "Văn bản dán / TXT",
  txt: "Tệp TXT",
};

export const extractEngineLabel = (engine: string | null | undefined): string =>
  (engine && EXTRACT_ENGINE_LABELS[engine]) || engine || "Không rõ";

/**
 * Thành phần ai-service (health.engines). Thứ tự khai báo = thứ tự hiển thị: đọc văn bản trước, rồi phân tích,
 * rồi các tính năng học. Khoá lạ (ai-service thêm sau) xếp cuối theo ABC với nhãn là chính tên khoá.
 */
const ENGINE_HEALTH_LABELS: Record<string, string> = {
  tesseract: "OCR Tesseract",
  gemini: "Gemini (AI)",
  sudachi: "Tách từ Sudachi",
  jmdict: "Từ điển JMdict",
  jlpt: "Danh sách JLPT",
  grammar: "Mẫu ngữ pháp",
  unihan: "Âm Hán–Việt (Unihan)",
  radicals: "Dữ liệu bộ thủ",
  kradfile: "Phân rã chữ (KRADFILE)",
  kanjivg: "Nét chữ KanjiVG",
  kanjiStrokes: "Chấm nét viết Kanji",
  pitch: "Trọng âm",
  distractors: "Phương án nhiễu quiz",
  conjugation: "Quiz chia động từ",
  conflicts: "Kiểm tra mâu thuẫn",
  mining: "Câu ví dụ i+1",
  radicalCards: "Thẻ bộ thủ",
  kanjiCards: "Thẻ chữ Hán",
  hanVietGraph: "Bản đồ Hán–Việt",
};

export const engineHealthLabel = (key: string): string => ENGINE_HEALTH_LABELS[key] ?? key;

export interface EngineHealthItem {
  key: string;
  label: string;
  ok: boolean;
}

/** Bỏ khoá không phải boolean (phòng server gửi kèm thông tin khác); không có cờ nào -> []. */
export const engineHealthList = (flags: Record<string, unknown> | null | undefined): EngineHealthItem[] => {
  if (!flags || typeof flags !== "object") return [];
  const order = Object.keys(ENGINE_HEALTH_LABELS);
  const keys = Object.keys(flags).filter((k) => typeof flags[k] === "boolean");
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return keys
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => ({ key, label: engineHealthLabel(key), ok: flags[key] === true }));
};

export interface AiEngineRow {
  engine: string;
  label: string;
  total: number;
  failed: number;
  failedPct: number | null;
  lowConfidence: number;
  lowPct: number | null;
  avgConfidencePct: number | null;
  avgSeconds: number | null;
}

type EngineStatLike = {
  engine: string;
  total?: number | null;
  failed?: number | null;
  lowConfidence?: number | null;
  avgConfidence?: number | null;
  avgSeconds?: number | null;
};

/** Bảng "Hiệu suất mô hình AI": engine nhiều lượt nhất lên đầu; số thiếu coi là 0 / null. */
export const aiEngineRows = (engines: readonly EngineStatLike[] | null | undefined): AiEngineRow[] =>
  (engines ?? [])
    .filter((e) => e && typeof e.engine === "string")
    .map((e) => {
      const total = isNum(e.total) ? e.total : 0;
      const failed = isNum(e.failed) ? e.failed : 0;
      const low = isNum(e.lowConfidence) ? e.lowConfidence : 0;
      return {
        engine: e.engine,
        label: extractEngineLabel(e.engine),
        total,
        failed,
        failedPct: ratePct(failed, total),
        lowConfidence: low,
        lowPct: ratePct(low, total),
        avgConfidencePct: confidencePct(e.avgConfidence),
        avgSeconds: isNum(e.avgSeconds) ? e.avgSeconds : null,
      };
    })
    .sort((a, b) => b.total - a.total || a.engine.localeCompare(b.engine));

export interface EnrichSummary {
  total: number;
  enriched: number;
  enrichedPct: number | null;
  quota: number;
  error: number;
  /** Phần còn lại (chưa chạy / lý do khác như thiếu khoá API). */
  other: number;
}

export const enrichSummary = (
  e: { total?: number | null; enriched?: number | null; quota?: number | null; error?: number | null } | null | undefined
): EnrichSummary | null => {
  if (!e || !isNum(e.total)) return null;
  const enriched = isNum(e.enriched) ? e.enriched : 0;
  const quota = isNum(e.quota) ? e.quota : 0;
  const error = isNum(e.error) ? e.error : 0;
  return {
    total: e.total,
    enriched,
    enrichedPct: ratePct(enriched, e.total),
    quota,
    error,
    other: Math.max(0, e.total - enriched - quota - error),
  };
};

type OcrPointLike = {
  date: string;
  ocrJobs?: number | null;
  failed?: number | null;
  lowConfidence?: number | null;
  geminiFallback?: number | null;
  errorRate?: number | null;
};

/**
 * Tỉ lệ lỗi OCR của một ngày, đơn vị %. Hợp đồng không nói errorRate là 0..1 hay 0..100: > 1 chắc chắn là %;
 * trong [0, 1] thì so với failed/ocrJobs xem giá trị gần dạng phân số hay dạng % hơn (1 lỗi / 100 lượt -> errorRate 1
 * là 1 %, còn 100 / 100 lỗi -> errorRate 1 là 100 %). Thiếu errorRate -> tự tính failed/ocrJobs.
 */
export const ocrErrorPct = (p: OcrPointLike): number => {
  const jobs = isNum(p.ocrJobs) ? p.ocrJobs : 0;
  const failed = isNum(p.failed) ? p.failed : 0;
  const frac = jobs > 0 ? Math.min(1, Math.max(0, failed / jobs)) : 0;
  const r = p.errorRate;
  let pct: number;
  if (!isNum(r) || r < 0) pct = frac * 100;
  else if (r > 1) pct = r;
  else if (jobs > 0 && Math.abs(r - frac * 100) < Math.abs(r - frac)) pct = r;
  else pct = r * 100;
  return Math.round(Math.min(100, pct) * 10) / 10;
};

export interface OcrChartRow {
  date: string;
  errorPct: number;
  ocrJobs: number;
  failed: number;
  geminiFallback: number;
  lowConfidence: number;
}

export const ocrChartRows = (series: readonly OcrPointLike[] | null | undefined): OcrChartRow[] =>
  (series ?? []).map((p) => ({
    date: p.date,
    errorPct: ocrErrorPct(p),
    ocrJobs: isNum(p.ocrJobs) ? p.ocrJobs : 0,
    failed: isNum(p.failed) ? p.failed : 0,
    geminiFallback: isNum(p.geminiFallback) ? p.geminiFallback : 0,
    lowConfidence: isNum(p.lowConfidence) ? p.lowConfidence : 0,
  }));

/** Tỉ lệ lỗi cả kỳ = trung bình các ngày có trọng số theo số lượt OCR (ngày vắng không kéo tỉ lệ về 0). */
export const ocrOverallErrorPct = (rows: readonly OcrChartRow[]): number | null => {
  const jobs = rows.reduce((s, r) => s + r.ocrJobs, 0);
  if (jobs <= 0) return null;
  const weighted = rows.reduce((s, r) => s + r.errorPct * r.ocrJobs, 0);
  return Math.round((weighted / jobs) * 10) / 10;
};

/** Bộ đếm hàng đợi kiểm duyệt từ AdminStats; null = backend chưa trả trường đó (ẩn thẻ / badge). */
export const queueCounts = (
  s:
    | { pendingMnemonics?: unknown; openAppeals?: unknown; openQuestionFlags?: unknown; openReports?: unknown; openDictReports?: unknown; openModeration?: unknown }
    | null
    | undefined
): {
  pendingMnemonics: number | null;
  openAppeals: number | null;
  openQuestionFlags: number | null;
  openReports: number | null;
  openDictReports: number | null;
  openModeration: number | null;
} => ({
  pendingMnemonics: isNum(s?.pendingMnemonics) ? s.pendingMnemonics : null,
  openAppeals: isNum(s?.openAppeals) ? s.openAppeals : null,
  openQuestionFlags: isNum(s?.openQuestionFlags) ? s.openQuestionFlags : null,
  openReports: isNum(s?.openReports) ? s.openReports : null,
  openDictReports: isNum(s?.openDictReports) ? s.openDictReports : null,
  openModeration: isNum(s?.openModeration) ? s.openModeration : null,
});

// ---------- §4 mẹo nhớ ----------

const MNEMONIC_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type MnemonicStatusKey = (typeof MNEMONIC_STATUSES)[number];

const MNEMONIC_SOURCE_LABELS: Record<string, string> = {
  AI: "AI",
  TEMPLATE: "Mẫu",
  USER: "Người dùng",
};

export const mnemonicSourceLabel = (source: string | null | undefined): string =>
  (source && MNEMONIC_SOURCE_LABELS[source]) || source || "—";

/** Tham số ?status= lạ / thiếu -> PENDING (hàng đợi là màn hình mặc định). */
export const parseMnemonicStatus = (raw: string | null | undefined): MnemonicStatusKey =>
  (MNEMONIC_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as MnemonicStatusKey) : "PENDING";

/**
 * Cột mnemonic_vi varchar(500): giới hạn khi admin sửa mẹo. Khác MNEMONIC_USER_MAX (300) của người học tự viết
 * (kanji/mnemonicUtils) — hai giới hạn đều đúng hợp đồng nên đặt tên riêng cho khỏi nhầm.
 */
export const MNEMONIC_DB_MAX = 500;
/** Ghi chú duyệt / từ chối / khiếu nại: varchar(500). */
export const REVIEW_NOTE_MAX = 500;

export const mnemonicTextError = (text: string): string | null => {
  const t = text.trim();
  if (!t) return "Mẹo nhớ không được để trống.";
  if (t.length > MNEMONIC_DB_MAX) return `Mẹo nhớ tối đa ${MNEMONIC_DB_MAX} ký tự.`;
  return null;
};

/** Từ chối bắt buộc có ghi chú (backend 400 nếu thiếu) để tác giả biết cần sửa gì. */
export const rejectNoteError = (note: string): string | null => {
  const t = note.trim();
  if (!t) return "Nhập lý do từ chối để tác giả biết cần sửa gì.";
  if (t.length > REVIEW_NOTE_MAX) return `Ghi chú tối đa ${REVIEW_NOTE_MAX} ký tự.`;
  return null;
};

/** Chỉ sửa / duyệt / từ chối được mẹo PENDING (backend 409 với trạng thái khác). */
export const canReviewMnemonic = (status: string | null | undefined, viewerRole: string | null | undefined): boolean =>
  status === "PENDING" && atLeast(viewerRole, "ADMIN");

// ---------- §5 nguồn tri thức ----------

export const KNOWLEDGE_KINDS = ["VOCAB", "GRAMMAR", "KANJI", "OTHER"] as const;
export type KnowledgeKindKey = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKindKey, string> = {
  VOCAB: "Từ vựng",
  GRAMMAR: "Ngữ pháp",
  KANJI: "Chữ Hán",
  OTHER: "Khác",
};

export const KNOWLEDGE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang dùng",
  ARCHIVED: "Lưu trữ",
};

export const KNOWLEDGE_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/** Hợp đồng §5: ≤ 2 MB / 20 trang (số trang do server kiểm). */
const KNOWLEDGE_MAX_BYTES = 2 * 1024 * 1024;
export const KNOWLEDGE_TITLE_MAX = 200;

export const knowledgeKindLabel = (kind: string | null | undefined): string =>
  (kind && KNOWLEDGE_KIND_LABELS[kind as KnowledgeKindKey]) || kind || "—";

export const knowledgeUploadError = (input: {
  source: "file" | "text";
  file: { size: number } | null;
  text: string;
  title: string;
  kind: string;
}): string | null => {
  const title = input.title.trim();
  if (!title) return "Nhập tiêu đề nguồn tri thức.";
  if (title.length > KNOWLEDGE_TITLE_MAX) return `Tiêu đề tối đa ${KNOWLEDGE_TITLE_MAX} ký tự.`;
  if (!(KNOWLEDGE_KINDS as readonly string[]).includes(input.kind)) return "Chọn loại nguồn.";
  if (input.source === "file") {
    if (!input.file) return "Chọn tệp cần tải lên.";
    if (input.file.size > KNOWLEDGE_MAX_BYTES) return "Tệp vượt giới hạn 2 MB của nguồn tri thức.";
  } else if (!input.text.trim()) {
    return "Dán nội dung văn bản.";
  }
  return null;
};

/** Xoá nguồn chuẩn là thao tác SUPER_ADMIN (ADMIN chỉ lưu trữ). */
export const canDeleteKnowledge = (viewerRole: string | null | undefined): boolean => atLeast(viewerRole, "SUPER_ADMIN");

/** Lọc bảng entries phía client (≤ 500 dòng nên không cần gọi server). */
export const filterKnowledgeEntries = <T extends { term: string; reading?: string | null; meaning?: string | null }>(
  entries: readonly T[],
  q: string
): T[] => {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter(
    (e) =>
      e.term.toLowerCase().includes(needle) ||
      (e.reading ?? "").toLowerCase().includes(needle) ||
      (e.meaning ?? "").toLowerCase().includes(needle)
  );
};

// ---------- §6 khiếu nại ----------

const APPEAL_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type AppealStatusKey = (typeof APPEAL_STATUSES)[number];

export const APPEAL_STATUS_LABELS: Record<AppealStatusKey, string> = {
  OPEN: "Đang mở",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bỏ qua",
};

export const parseAppealStatus = (raw: string | null | undefined): AppealStatusKey =>
  (APPEAL_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as AppealStatusKey) : "OPEN";

/**
 * Backend trả JSON với @JsonInclude(NON_NULL): tài khoản đã xoá (user_id SET NULL) đến KHÔNG có userId / userLocked
 * (undefined chứ không phải null). Đưa mọi trường có thể vắng về null để trang so `=== null` đúng hợp đồng, thay vì
 * coi là tài khoản còn sống (link /admin/users/undefined, bật "Mở khoá" cho tài khoản không tồn tại).
 */
export const normalizeAppeal = (raw: AccountAppeal): AccountAppeal => ({
  ...raw,
  userId: raw.userId ?? null,
  userLocked: raw.userLocked ?? null,
  lockedReason: raw.lockedReason ?? null,
  lockedReasonAtSubmit: raw.lockedReasonAtSubmit ?? null,
  action: raw.action ?? null,
  resolutionNote: raw.resolutionNote ?? null,
  resolvedByEmail: raw.resolvedByEmail ?? null,
  resolvedAt: raw.resolvedAt ?? null,
});

/** Kiểu tối thiểu để đọc trạng thái tài khoản; `== null` để cả phần tử chưa qua normalizeAppeal cũng đúng. */
type AppealAccount = { userId?: number | null; userLocked?: boolean | null };

export const appealLockLabel = (a: AppealAccount): string =>
  a.userId == null ? "Không còn tài khoản" : a.userLocked === true ? "Đang khoá" : a.userLocked === false ? "Đã mở khoá" : "—";

export interface AppealActionState {
  /** Xử lý / bỏ qua được (khiếu nại còn mở + người xem là staff). */
  canHandle: boolean;
  canUnlock: boolean;
  /** Vì sao "Mở khoá" bị tắt (hiện cạnh lựa chọn); null khi bật được. */
  unlockHint: string | null;
}

/**
 * Khả dụng của "Mở khoá" theo quy tắc bậc của backend (AdminUserService: chỉ thao tác lên người bậc thấp hơn mình).
 * targetRole: undefined = đang tải; null = không tra được -> chỉ Super admin được thử (backend vẫn là nơi chặn cuối),
 * đúng tinh thần roles.ts: thông tin chưa chắc thì không nới quyền trên UI.
 */
export const appealActionState = (
  appeal: AppealAccount & { status: string },
  targetRole: string | null | undefined,
  viewerRole: string | null | undefined
): AppealActionState => {
  const canHandle = appeal.status === "OPEN" && atLeast(viewerRole, "ADMIN");
  if (!canHandle) return { canHandle, canUnlock: false, unlockHint: null };
  if (appeal.userId == null) return { canHandle, canUnlock: false, unlockHint: "Tài khoản không còn tồn tại." };
  if (appeal.userLocked === false) return { canHandle, canUnlock: false, unlockHint: "Tài khoản đã được mở khoá." };
  if (targetRole === undefined) return { canHandle, canUnlock: false, unlockHint: "Đang kiểm tra vai trò tài khoản…" };
  const known = targetRole !== null && targetRole in RANK;
  const viewerRank = viewerRole && viewerRole in RANK ? RANK[viewerRole as Role] : -1;
  if (!known) {
    return viewerRank >= RANK.SUPER_ADMIN
      ? { canHandle, canUnlock: true, unlockHint: null }
      : { canHandle, canUnlock: false, unlockHint: "Không xác định được vai trò tài khoản; chỉ Super admin mở khoá được." };
  }
  if (RANK[targetRole as Role] >= viewerRank) {
    return {
      canHandle,
      canUnlock: false,
      unlockHint:
        isStaff(targetRole) && viewerRank < RANK.SUPER_ADMIN
          ? "Tài khoản staff: chỉ Super admin mở khoá được."
          : "Không thể mở khoá tài khoản cùng bậc với bạn.",
    };
  }
  return { canHandle, canUnlock: true, unlockHint: null };
};

// ---------- Sửa sau kiểm tay trên trình duyệt (STAFF-07/08) ----------

/** Lý do khoá trong bảng / modal khiếu nại: text null -> hiện `placeholder` bằng chữ mờ; `note` là dòng nhỏ bên dưới. */
export interface AppealReasonView {
  text: string | null;
  placeholder: string;
  note: string | null;
}

export const APPEAL_LEGACY_REASON_NOTE = "Lý do hiện tại · khiếu nại cũ không lưu lý do lúc gửi";

/**
 * Lý do khoá LÚC GỬI khiếu nại. Backend chụp `lockedReasonAtSubmit` khi nhận khiếu nại ("" = khoá không ghi lý do) vì
 * `lockedReason` chỉ là trạng thái HIỆN TẠI: mở khoá thì mất, khoá lại thì thành lý do mới. Khiếu nại gửi trước khi có
 * trường này (null) chỉ còn lý do hiện tại -> hiện lý do đó kèm nhãn để admin không tưởng là lý do lúc gửi. Tài khoản vẫn
 * khoá nhưng lý do đã khác lúc gửi (bị khoá lại) -> ghi thêm lý do hiện tại.
 */
export const appealReasonView = (
  a: AppealAccount & { lockedReason?: string | null; lockedReasonAtSubmit?: string | null }
): AppealReasonView => {
  // null = không còn khoá / không còn tài khoản; "" = đang khoá không ghi lý do
  const current = a.userLocked === true ? (a.lockedReason?.trim() ?? "") : null;
  if (a.lockedReasonAtSubmit != null) {
    const atSubmit = a.lockedReasonAtSubmit.trim();
    return {
      text: atSubmit || null,
      placeholder: "Không ghi lý do",
      note: current !== null && current !== atSubmit ? `Hiện tại: ${current ? `“${current}”` : "không ghi lý do"}` : null,
    };
  }
  if (a.userId == null) return { text: null, placeholder: "—", note: null };
  return {
    text: current || null,
    placeholder: current === null ? "— (không còn khoá)" : "Không ghi lý do",
    note: APPEAL_LEGACY_REASON_NOTE,
  };
};

/**
 * Trạng thái khoá HIỆN TẠI cho modal xử lý khiếu nại. Dòng trong danh sách có thể đã cũ (admin khác vừa mở khoá, hay khoá lại
 * không ghi lý do) -> đã tra được chi tiết người dùng thì lấy CẢ userLocked lẫn lockedReason từ đó, kể cả khi lockedReason null
 * (không còn khoá / khoá không ghi lý do: `?? appeal.lockedReason` sẽ hiện lại lý do cũ). Chưa tra / tra lỗi -> giữ dòng danh sách.
 */
export const appealWithAccount = <T extends AppealAccount & { lockedReason?: string | null }>(
  appeal: T,
  account: { lockedAt: string | null; lockedReason: string | null } | null | undefined
): T => (account ? { ...appeal, userLocked: account.lockedAt != null, lockedReason: account.lockedReason } : appeal);

/** Nhãn kết quả xử lý báo cáo; NONE là "Không làm gì" (đã xử lý), khác với trạng thái "Đã bỏ qua" (DISMISSED). */
export const reportActionLabel = (action: string | null | undefined): string =>
  action === "UNPUBLISH_DECK"
    ? "Gỡ bộ thẻ"
    : action === "CLEAR_COMMENT"
      ? "Xoá bình luận"
      : action === "NONE"
        ? "Không làm gì"
        : (action ?? "—");

// ---------- Sửa sau kiểm tay trên trình duyệt (NEW-12) ----------

/** Kết quả của modal xử lý báo cáo: một hành động (ReportAction) hoặc "Bỏ qua báo cáo". */
export type ReportOutcome = "NONE" | "UNPUBLISH_DECK" | "CLEAR_COMMENT" | "DISMISS";

/**
 * Lời báo sau khi xử lý / bỏ qua một báo cáo: modal đóng và dòng biến khỏi tab "Đang mở" — không báo thì admin không
 * biết đã ghi hay chưa. Nêu luôn hệ quả (gỡ bộ thẻ / xoá bình luận) để khỏi phải mở tab "Đã xử lý" kiểm lại.
 */
export const reportDoneMessage = (
  report: { id: number; deckId: string; deckTitle?: string | null },
  outcome: ReportOutcome
): string => {
  const deck = `“${report.deckTitle?.trim() || report.deckId}”`;
  switch (outcome) {
    case "UNPUBLISH_DECK":
      return `Đã gỡ ${deck} khỏi Thư viện và đóng báo cáo #${report.id}.`;
    case "CLEAR_COMMENT":
      return `Đã xoá bình luận trên ${deck} và đóng báo cáo #${report.id}.`;
    case "DISMISS":
      return `Đã bỏ qua báo cáo #${report.id} về ${deck}.`;
    default:
      return `Đã đánh dấu xử lý báo cáo #${report.id} về ${deck} (không thao tác thêm).`;
  }
};
