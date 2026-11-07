// Mẹo nhớ chữ Hán (C4, hợp đồng đợt 2 §4): đọc response (dữ liệu không đáng tin), nhãn nguồn / trạng thái, kiểm tra ô
// tự viết, câu lỗi. Hàm thuần, không gọi API / DOM -> kiểm được bằng scripts/selfcheck/learner.ts.
import { apiErrorText, httpStatusOf } from "../../lib/apiErrorInfo.ts";
import type {
    ApprovedMnemonic,
    GenerateMnemonicsResult,
    GeneratedMnemonic,
    KanjiMnemonicSource,
    KanjiMnemonics,
    MnemonicStatus,
    MyMnemonic,
    RadicalMnemonicSource,
} from "../../types/learner.types.ts";

/** Giới hạn của POST /api/kanji/mnemonics (mnemonicVi ≤ 300). */
export const MNEMONIC_USER_MAX = 300;
/** Server từ chối (409) khi đã có chừng này mẹo PENDING của mình cho cùng một chữ. */
export const MAX_PENDING_PER_KANJI = 3;
/** Server cũng từ chối (409) khi tổng mẹo PENDING của mình (mọi chữ) vượt chừng này — dùng cho câu dự phòng. */
export const MAX_PENDING_PER_USER = 50;

const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const idOf = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const SOURCES: readonly KanjiMnemonicSource[] = ["AI", "TEMPLATE", "USER"];
const STATUSES: readonly MnemonicStatus[] = ["PENDING", "APPROVED", "REJECTED"];

// Không phân biệt hoa thường: enum Java luôn in hoa nhưng một proxy / bản cũ có thể gửi "ai".
const parseSource = (v: unknown): KanjiMnemonicSource | null => {
    const s = typeof v === "string" ? v.trim().toUpperCase() : "";
    return (SOURCES as readonly string[]).includes(s) ? (s as KanjiMnemonicSource) : null;
};
const parseStatus = (v: unknown): MnemonicStatus | null => {
    const s = typeof v === "string" ? v.trim().toUpperCase() : "";
    return (STATUSES as readonly string[]).includes(s) ? (s as MnemonicStatus) : null;
};

const parseApproved = (raw: unknown): ApprovedMnemonic | null => {
    const r = asRecord(raw);
    const id = r ? idOf(r.id) : null;
    const mnemonicVi = r ? strOrNull(r.mnemonicVi) : null;
    if (!r || !id || !mnemonicVi) return null;
    return { id, mnemonicVi, source: parseSource(r.source) };
};

/** Một mẹo của mình; thiếu status thì coi là PENDING (mẹo mới gửi luôn chờ duyệt). */
export const parseMyMnemonic = (raw: unknown): MyMnemonic | null => {
    const r = asRecord(raw);
    const id = r ? idOf(r.id) : null;
    const mnemonicVi = r ? strOrNull(r.mnemonicVi) : null;
    if (!r || !id || !mnemonicVi) return null;
    return {
        id,
        mnemonicVi,
        source: parseSource(r.source),
        status: parseStatus(r.status) ?? "PENDING",
        reviewNote: strOrNull(r.reviewNote),
        createdAt: strOrNull(r.createdAt),
    };
};

/** Mới nhất trước; không có ngày thì giữ thứ tự server. */
const byNewest = (a: MyMnemonic, b: MyMnemonic): number => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return tb - ta;
};

/** GET /api/kanji/{ch}/mnemonics; `kanji` = chữ đã hỏi (dùng khi server không gửi lại). */
export function parseKanjiMnemonics(raw: unknown, kanji: string): KanjiMnemonics {
    const r = asRecord(raw) ?? {};
    const seen = new Set<string>();
    const mine: MyMnemonic[] = [];
    for (const item of list(r.mine)) {
        const m = parseMyMnemonic(item);
        if (!m || seen.has(m.id)) continue;
        seen.add(m.id);
        mine.push(m);
    }
    return { kanji: strOrNull(r.kanji) ?? kanji, approved: parseApproved(r.approved), mine: mine.sort(byNewest) };
}

/** POST /api/kanji/mnemonics/generate */
export function parseGenerateResult(raw: unknown): GenerateMnemonicsResult {
    const r = asRecord(raw) ?? {};
    const items: GeneratedMnemonic[] = [];
    for (const item of list(r.items)) {
        const g = asRecord(item);
        const id = g ? idOf(g.id) : null;
        const kanji = g ? strOrNull(g.kanji) : null;
        const mnemonicVi = g ? strOrNull(g.mnemonicVi) : null;
        if (!g || !id || !kanji || !mnemonicVi) continue;
        items.push({ id, kanji, mnemonicVi, source: parseSource(g.source), status: parseStatus(g.status) ?? "PENDING" });
    }
    return { items, reason: strOrNull(r.reason) };
}

export const MNEMONIC_STATUS_LABELS: Record<MnemonicStatus, string> = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Đã từ chối",
};

/** Nguồn của mẹo: `own` = mẹo của chính mình (USER -> "Bạn tự viết"), không thì "Người học viết". */
export const mnemonicOriginLabel = (source: KanjiMnemonicSource | null, own: boolean): string | null =>
    source === "AI"
        ? "AI gợi ý"
        : source === "TEMPLATE"
          ? "Câu mẫu tự động"
          : source === "USER"
            ? own
                ? "Bạn tự viết"
                : "Người học viết"
            : null;

/** Lỗi ô tự viết mẹo; null = hợp lệ. Đếm theo ký tự hiển thị (chữ Hán ngoài BMP vẫn là một). */
export const mnemonicInputError = (text: string): string | null => {
    const length = [...text.trim()].length;
    if (length === 0) return "Hãy nhập mẹo nhớ trước khi gửi.";
    if (length > MNEMONIC_USER_MAX) return `Mẹo nhớ tối đa ${MNEMONIC_USER_MAX} ký tự (đang có ${length}).`;
    return null;
};

/** Số ký tự còn lại của ô tự viết (âm = vượt giới hạn). */
export const mnemonicCharsLeft = (text: string): number => MNEMONIC_USER_MAX - [...text.trim()].length;

/** Mẹo PENDING của mình cho chữ này (để báo trước khi chạm giới hạn 3 của server). */
export const pendingCount = (mine: Pick<MyMnemonic, "status">[]): number => mine.filter((m) => m.status === "PENDING").length;

// ---- Câu lỗi khi gửi / sinh mẹo ----------------------------------------------------------------------------------------
// 409 có HAI lý do (3 mẹo chờ duyệt cho chữ này / 50 mẹo chờ duyệt tất cả) mà chỉ server biết là lý do nào, nên luôn hiện
// câu của server; câu dự phòng (proxy / body trống) nói chung cho cả hai lý do. null = lỗi mạng... -> extractErrorMessage.

const PENDING_LIMIT_FALLBACK =
    `Bạn đã có quá nhiều mẹo nhớ đang chờ duyệt (tối đa ${MAX_PENDING_PER_KANJI} cho mỗi chữ, ${MAX_PENDING_PER_USER} tất cả). ` +
    "Hãy đợi quản trị viên duyệt bớt rồi gửi thêm.";

/** Câu lỗi khi gửi mẹo tự viết (POST /kanji/mnemonics). */
export const mnemonicSubmitErrorMessage = (error: unknown): string | null =>
    apiErrorText(error, { fallbacks: { 409: PENDING_LIMIT_FALLBACK } });

/** ai-service tắt: người học vẫn tự viết được mẹo, nói rõ để họ không nghĩ cả tính năng hỏng. */
export const MNEMONIC_AI_DOWN_MESSAGE = "Dịch vụ AI đang tạm dừng. Hãy thử lại sau ít phút hoặc tự viết mẹo.";

/**
 * Câu lỗi khi nhờ AI gợi ý mẹo (POST /kanji/mnemonics/generate): 409 / 429 / 400 là câu của server. Riêng 503 dùng câu
 * của mình: message 503 là lỗi ai-service chuyển tiếp, viết cho người vận hành ("Hãy chắc ai-service đang chạy", hoặc
 * detail tiếng Anh của FastAPI), như câu nhiễu ở quizUtils.distractorErrorMessage.
 */
export const mnemonicGenerateErrorMessage = (error: unknown): string | null => {
    if (httpStatusOf(error) === 503) return MNEMONIC_AI_DOWN_MESSAGE;
    return apiErrorText(error, {
        fallbacks: {
            409: PENDING_LIMIT_FALLBACK,
            429: "Bạn đã dùng hết lượt gợi ý trong giờ này. Hãy thử lại sau hoặc tự viết mẹo.",
        },
    });
};

// ---- Thẻ bộ thủ (/api/nlp/radicals/cards) --------------------------------------------------------------------------

const isRadicalSource = (v: unknown): v is RadicalMnemonicSource => v === "approved" || v === "template" || v === "gemini";

/**
 * Nguồn mẹo từng chữ trong response thẻ bộ thủ. parseRadicalCards (lib/kanjiUtils) chỉ nhận "gemini" | "template" nên bỏ
 * mất "approved" mà server đợt 2 gửi; đọc riêng ở đây để thẻ hiện được nhãn "Đã duyệt". Chữ không có mẹo bị bỏ qua.
 */
export function parseRadicalMnemonicSources(raw: unknown): Record<string, RadicalMnemonicSource> {
    const out: Record<string, RadicalMnemonicSource> = {};
    for (const item of list(asRecord(raw)?.items)) {
        const c = asRecord(item);
        const kanji = c ? strOrNull(c.kanji) : null;
        if (!c || !kanji || !strOrNull(c.mnemonicVi) || kanji in out) continue;
        const source = typeof c.mnemonicSource === "string" ? c.mnemonicSource.trim().toLowerCase() : null;
        if (isRadicalSource(source)) out[kanji] = source;
    }
    return out;
}

export const radicalMnemonicSourceLabel = (source: RadicalMnemonicSource | null | undefined): string | null =>
    source === "approved"
        ? "Đã duyệt"
        : source === "template"
          ? "Mẹo gợi ý tự động"
          : source === "gemini"
            ? "Mẹo do AI viết"
            : null;
