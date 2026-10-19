// Hàm thuần cho quiz đa loại + ngân hàng câu hỏi (hợp đồng API đợt 2, §1). Không gọi API, không đụng DOM;
// import tương đối + đuôi .ts để scripts/selfcheck/quiz.ts chạy được bằng node.
import { apiErrorText, httpStatusOf } from "../../lib/apiErrorInfo.ts";
import { kataToHira } from "../../lib/kana.ts";
import type {
    AdminQuestionPatch,
    AdminQuestionRow,
    DistractorResult,
    QuestionFlagReason,
    QuestionFlagRequest,
    QuestionFlagStatus,
    QuizCapabilities,
    QuizInputMode,
    QuizQuestionGenerator,
    QuizQuestionKind,
    QuizQuestionMeta,
    QuizQuestionStatus,
    QuizQuestionType,
} from "../../types/quiz.types.ts";

// ---------- loại câu hỏi ----------

/** Thứ tự hiển thị ở màn bắt đầu (và thứ tự gửi lên server: server xoay vòng theo đúng thứ tự này). */
export const QUESTION_TYPES: readonly QuizQuestionType[] = ["meaning", "kanji_lookalike", "homophone", "reading", "conjugation"];

/** Mặc định của server khi không gửi questionTypes. */
export const DEFAULT_QUESTION_TYPES: readonly QuizQuestionType[] = ["meaning"];

export const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
    meaning: "Nghĩa",
    kanji_lookalike: "Kanji giống hình",
    homophone: "Từ đồng âm",
    reading: "Gõ cách đọc (IME)",
    conjugation: "Chia thể động từ",
};

export const QUESTION_TYPE_HINTS: Record<QuizQuestionType, string> = {
    meaning: "Chọn nghĩa tiếng Việt đúng của từ.",
    kanji_lookalike: "Phân biệt chữ Hán có hình dạng gần giống nhau.",
    homophone: "Phân biệt các từ cùng cách đọc nhưng khác chữ.",
    reading: "Tự gõ cách đọc bằng romaji hoặc kana, không có phương án gợi ý.",
    conjugation: "Chọn đúng thể chia (て, ない, た...) của động từ.",
};

export const isQuestionType = (v: unknown): v is QuizQuestionType =>
    typeof v === "string" && (QUESTION_TYPES as readonly string[]).includes(v);

/** Khoá tương ứng trong QuizCapabilities (camelCase), khác tên với questionTypes (snake_case). */
const CAPABILITY_KEYS: Record<QuizQuestionType, keyof QuizCapabilities> = {
    meaning: "meaning",
    kanji_lookalike: "kanjiLookalike",
    homophone: "homophone",
    reading: "reading",
    conjugation: "conjugation",
};

const toCount = (v: unknown): number => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Response là ranh giới không đáng tin: không phải object -> null (coi như server chưa hỗ trợ);
 * khoá thiếu / hỏng -> 0 (loại đó bị tắt kèm lý do thay vì cho chọn rồi lỗi lúc tạo đề).
 */
export const parseCapabilities = (raw: unknown): QuizCapabilities | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    return {
        meaning: toCount(r.meaning),
        kanjiLookalike: toCount(r.kanjiLookalike),
        homophone: toCount(r.homophone),
        reading: toCount(r.reading),
        conjugation: toCount(r.conjugation),
    };
};

/** caps = null (server chưa có endpoint): chỉ biết chắc loại nghĩa chạy được như trước. */
export const capabilityCount = (caps: QuizCapabilities | null, type: QuizQuestionType): number | null =>
    caps ? caps[CAPABILITY_KEYS[type]] : null;

export const enabledQuestionTypes = (caps: QuizCapabilities | null): QuizQuestionType[] =>
    caps ? QUESTION_TYPES.filter((t) => caps[CAPABILITY_KEYS[t]] > 0) : ["meaning"];

/** Lý do một loại bị tắt (hiện ngay dưới ô chọn); null = chọn được. */
export const typeDisabledReason = (type: QuizQuestionType, caps: QuizCapabilities | null): string | null => {
    if (!caps) return type === "meaning" ? null : "Máy chủ chưa hỗ trợ loại câu này.";
    if (caps[CAPABILITY_KEYS[type]] > 0) return null;
    switch (type) {
        case "meaning":
            return "Cần ít nhất 2 thẻ có nghĩa khác nhau.";
        case "kanji_lookalike":
            return "Chưa thẻ nào có chữ Hán giống hình — cần sinh câu nhiễu.";
        case "homophone":
            return "Chưa thẻ nào có từ đồng âm — cần sinh câu nhiễu.";
        case "reading":
            return "Không thẻ nào có cách đọc (hoặc viết toàn kana).";
        case "conjugation":
            return "Bộ thẻ chưa có động từ chia thể được.";
    }
};

/** Bật / tắt một loại, giữ thứ tự chuẩn và không trùng (thứ tự quyết định vòng xoay của server). */
export const toggleQuestionType = (
    selected: readonly QuizQuestionType[],
    type: QuizQuestionType,
    on: boolean
): QuizQuestionType[] => QUESTION_TYPES.filter((t) => (t === type ? on : selected.includes(t)));

/**
 * Danh sách gửi kèm POST /quiz-attempts. caps = null (server cũ) -> undefined: không gửi trường mới.
 * Loại đã chọn nhưng nay bị tắt (vd. vừa tải lại khả năng) thì bỏ; rỗng -> người dùng phải chọn lại.
 */
export const questionTypesForRequest = (
    selected: readonly QuizQuestionType[],
    caps: QuizCapabilities | null
): QuizQuestionType[] | undefined => {
    if (!caps) return undefined;
    const enabled = enabledQuestionTypes(caps);
    return QUESTION_TYPES.filter((t) => selected.includes(t) && enabled.includes(t));
};

/** Số câu chọn được trên màn bắt đầu. */
export const QUIZ_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/**
 * Server sinh mỗi thẻ tối đa một câu (QuizService.build: min(size, số thẻ)) -> chọn nhiều câu hơn số thẻ thì bài chỉ có
 * bằng số thẻ. Báo trước thay vì để người học thấy "Câu 1/8" sau khi chọn 10 câu. Chưa biết số thẻ -> null.
 */
export const quizSizeNote = (size: number, cardCount: number | null | undefined): string | null => {
    if (cardCount == null || cardCount < 0 || size <= cardCount) return null;
    if (cardCount === 0) return "Bộ thẻ chưa có thẻ nào để làm bài.";
    return `Bộ thẻ chỉ có ${cardCount} thẻ nên bài sẽ có tối đa ${cardCount} câu.`;
};

/** Nhãn từng lựa chọn số câu: lựa chọn vượt số thẻ ghi rõ bài thực tế có bao nhiêu câu. */
export const quizSizeOptionLabel = (size: number, cardCount: number | null | undefined): string =>
    cardCount != null && cardCount > 0 && size > cardCount ? `${size} câu (bộ chỉ đủ ${cardCount} câu)` : `${size} câu`;

// ---------- hiển thị câu hỏi ----------

export interface QuestionDisplay {
    /** Hiện từ (term) làm tiêu đề; tắt khi chính từ đó là đáp án (kanji giống hình, đồng âm, chia thể có prompt). */
    showTerm: boolean;
    /** Furigana trên từ; tắt ở câu gõ cách đọc vì đó là đáp án. */
    showReading: boolean;
    /** Nút loa / chế độ chỉ nghe: chỉ câu nghĩa (đọc to ở các loại khác là lộ đáp án). */
    speakable: boolean;
    /** Phương án là chữ Nhật -> lang="ja" để trình đọc màn hình và font chọn đúng. */
    optionsLang: "ja" | undefined;
    groupLabel: string;
}

export const questionDisplay = (q: Pick<QuizQuestionMeta, "type" | "prompt" | "inputMode">): QuestionDisplay => {
    const hasPrompt = !!q.prompt;
    switch (q.type) {
        case "kanji_lookalike":
            return { showTerm: !hasPrompt, showReading: false, speakable: false, optionsLang: "ja", groupLabel: "Chọn chữ đúng" };
        case "homophone":
            return { showTerm: !hasPrompt, showReading: false, speakable: false, optionsLang: "ja", groupLabel: "Chọn từ đúng" };
        case "conjugation":
            return { showTerm: !hasPrompt, showReading: true, speakable: false, optionsLang: "ja", groupLabel: "Chọn thể đúng" };
        case "reading":
            return { showTerm: true, showReading: false, speakable: false, optionsLang: "ja", groupLabel: "Gõ cách đọc" };
        default:
            return { showTerm: true, showReading: true, speakable: true, optionsLang: undefined, groupLabel: "Chọn nghĩa đúng" };
    }
};

/** Đáp án đúng của câu không phải nghĩa là chữ Nhật (lang="ja"). */
export const answerLang = (type: QuizQuestionType): "ja" | undefined => (type === "meaning" ? undefined : "ja");

// ---------- câu gõ (typing) ----------

/** Giới hạn của server cho chuỗi tự gõ. */
export const TYPED_ANSWER_MAX = 100;

/**
 * Xem trước đúng quy tắc chấm của server (hợp đồng §1.2): katakana -> hiragana, bỏ khoảng trắng / dấu câu.
 * Không gập trường âm, không NFKC: server không làm thì xem trước cũng không, để người học thấy đúng chuỗi được so.
 */
export const normalizeTypedAnswer = (s: string): string => kataToHira(s).replace(/[\s\p{P}]/gu, "");

// ---------- báo lỗi câu hỏi ----------

const FLAG_REASONS: readonly QuestionFlagReason[] = ["WRONG_ANSWER", "BAD_DISTRACTOR", "TYPO", "OTHER"];

export const FLAG_REASON_LABELS: Record<QuestionFlagReason, string> = {
    WRONG_ANSWER: "Sai đáp án",
    BAD_DISTRACTOR: "Câu nhiễu không hợp lý",
    TYPO: "Lỗi chính tả",
    OTHER: "Khác",
};

export const FLAG_STATUS_LABELS: Record<QuestionFlagStatus, string> = {
    OPEN: "Đang mở",
    RESOLVED: "Đã xử lý",
};

export const FLAG_DETAIL_MAX = 500;

/** Câu gõ không có phương án nên không có "câu nhiễu" để chê. */
export const flagReasonsFor = (inputMode: QuizInputMode): QuestionFlagReason[] =>
    FLAG_REASONS.filter((r) => inputMode === "choice" || r !== "BAD_DISTRACTOR");

export const validateFlag = (reason: QuestionFlagReason | null, detail: string): string | null => {
    if (!reason) return "Hãy chọn lý do.";
    const text = detail.trim();
    if (reason === "OTHER" && !text) return "Hãy mô tả lỗi khi chọn \"Khác\".";
    if (text.length > FLAG_DETAIL_MAX) return `Mô tả tối đa ${FLAG_DETAIL_MAX} ký tự.`;
    return null;
};

export const buildFlagRequest = (reason: QuestionFlagReason, detail: string): QuestionFlagRequest => {
    const text = detail.trim();
    return text ? { reason, detail: text } : { reason };
};

// ---------- lỗi HTTP ----------
// "Endpoint chưa có" dùng chung quy tắc của src/lib/apiErrorInfo.ts: 404 chỉ tính khi body là câu mặc định của Spring
// (hoặc trống), để 404 nghiệp vụ (vd. báo lỗi câu hỏi của thẻ vừa bị xoá) vẫn hiện đúng lỗi của server.

/**
 * Câu báo lỗi khi gửi báo lỗi câu hỏi: câu của server (409 đã có báo lỗi đang mở, 429 quá 20 lần / giờ, 400 / 404...);
 * câu dự phòng chỉ khi body trống. null = lỗi mạng... -> extractErrorMessage.
 */
export const flagErrorMessage = (error: unknown): string | null =>
    apiErrorText(error, {
        fallbacks: {
            409: "Bạn đã báo lỗi câu hỏi này rồi — quản trị viên đang xem xét.",
            429: "Bạn đã gửi quá nhiều báo lỗi trong một giờ (tối đa 20). Hãy thử lại sau.",
        },
    });

/**
 * Câu lỗi khi sinh câu nhiễu: 4xx là câu của server (403 "Bạn chỉ có quyền xem bộ thẻ này"...). Riêng 503 dùng câu của
 * mình: message 503 là lỗi ai-service chuyển tiếp, viết cho người vận hành. null = lỗi mạng... -> extractErrorMessage.
 */
export const distractorErrorMessage = (error: unknown): string | null => {
    if (httpStatusOf(error) === 503) return "Dịch vụ AI đang tạm dừng nên chưa sinh được câu nhiễu. Hãy thử lại sau ít phút.";
    return apiErrorText(error, {
        fallbacks: { 403: "Chỉ chủ bộ thẻ hoặc người được chia sẻ quyền sửa mới sinh được câu nhiễu." },
    });
};

export const parseDistractorResult = (raw: unknown): DistractorResult => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { updated: toCount(r.updated), withLookalike: toCount(r.withLookalike), withHomophone: toCount(r.withHomophone) };
};

export const describeDistractorResult = (r: DistractorResult): string =>
    r.updated === 0
        ? "Không có thẻ nào cần cập nhật câu nhiễu."
        : `Đã cập nhật ${r.updated} thẻ: ${r.withLookalike} thẻ có chữ Hán giống hình, ${r.withHomophone} thẻ có từ đồng âm.`;

// ---------- ngân hàng câu hỏi (admin) ----------

export const QUESTION_KINDS: readonly QuizQuestionKind[] = ["MEANING", "KANJI_LOOKALIKE", "HOMOPHONE", "READING", "CONJUGATION"];

export const QUESTION_KIND_LABELS: Record<QuizQuestionKind, string> = {
    MEANING: QUESTION_TYPE_LABELS.meaning,
    KANJI_LOOKALIKE: QUESTION_TYPE_LABELS.kanji_lookalike,
    HOMOPHONE: QUESTION_TYPE_LABELS.homophone,
    READING: "Gõ cách đọc",
    CONJUGATION: QUESTION_TYPE_LABELS.conjugation,
};

export const QUESTION_STATUS_LABELS: Record<QuizQuestionStatus, string> = {
    ACTIVE: "Đang dùng",
    HIDDEN: "Đã ẩn",
};

export const GENERATOR_LABELS: Record<QuizQuestionGenerator, string> = {
    RULE: "Quy tắc",
    AI: "AI",
};

export const isQuestionKind = (v: unknown): v is QuizQuestionKind =>
    typeof v === "string" && (QUESTION_KINDS as readonly string[]).includes(v);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Một dòng ngân hàng câu hỏi: trường thiếu không làm vỡ bảng (options hỏng -> [], số hỏng -> 0). */
export const normalizeAdminQuestion = <T extends AdminQuestionRow>(raw: T): T => ({
    ...raw,
    id: String(raw.id ?? ""),
    deckId: str(raw.deckId),
    deckTitle: strOrNull(raw.deckTitle),
    cardId: str(raw.cardId),
    term: str(raw.term),
    kind: isQuestionKind(raw.kind) ? raw.kind : "MEANING",
    prompt: strOrNull(raw.prompt),
    options: Array.isArray(raw.options) ? raw.options.filter((o): o is string => typeof o === "string") : [],
    correct: str(raw.correct),
    status: raw.status === "HIDDEN" ? "HIDDEN" : "ACTIVE",
    flagCount: num(raw.flagCount),
    openFlags: num(raw.openFlags),
    generator: raw.generator === "AI" || raw.generator === "RULE" ? raw.generator : null,
    updatedAt: strOrNull(raw.updatedAt),
});

export const PROMPT_MAX = 500;
const OPTION_MAX = 500;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

/** Trạng thái bộ sửa câu hỏi: đáp án đúng theo VỊ TRÍ để sửa chữ của phương án đúng không làm mất lựa chọn. */
export interface QuestionDraft {
    prompt: string;
    options: string[];
    /** -1 = chưa chọn (dữ liệu cũ có correct không nằm trong options). */
    correctIndex: number;
    /** Câu gõ (options rỗng): đáp án đúng nhập tự do. */
    correctText: string;
    typing: boolean;
}

export const toQuestionDraft = (q: Pick<AdminQuestionRow, "prompt" | "options" | "correct">): QuestionDraft => ({
    prompt: q.prompt ?? "",
    options: [...q.options],
    correctIndex: q.options.indexOf(q.correct),
    correctText: q.correct,
    typing: q.options.length === 0,
});

/** Quy tắc giống server: correct ∈ options khi options không rỗng; options không rỗng / không trùng. */
export const validateQuestionOptions = (options: readonly string[], correct: string): string | null => {
    const opts = options.map((o) => o.trim());
    const answer = correct.trim();
    if (opts.length === 0) {
        if (!answer) return "Câu gõ cần có đáp án đúng.";
        return answer.length > OPTION_MAX ? `Đáp án tối đa ${OPTION_MAX} ký tự.` : null;
    }
    if (opts.length < MIN_OPTIONS) return `Cần ít nhất ${MIN_OPTIONS} phương án.`;
    if (opts.length > MAX_OPTIONS) return `Tối đa ${MAX_OPTIONS} phương án.`;
    if (opts.some((o) => !o)) return "Phương án không được để trống.";
    if (opts.some((o) => o.length > OPTION_MAX)) return `Mỗi phương án tối đa ${OPTION_MAX} ký tự.`;
    if (new Set(opts).size !== opts.length) return "Các phương án bị trùng nhau.";
    if (!answer) return "Hãy chọn đáp án đúng.";
    if (!opts.includes(answer)) return "Đáp án đúng phải là một trong các phương án.";
    return null;
};

const draftCorrect = (d: QuestionDraft): string => (d.typing ? d.correctText : (d.options[d.correctIndex] ?? ""));

export const validateQuestionDraft = (d: QuestionDraft): string | null => {
    if (d.prompt.trim().length > PROMPT_MAX) return `Câu hỏi tối đa ${PROMPT_MAX} ký tự.`;
    if (!d.typing && d.correctIndex < 0) return "Hãy chọn đáp án đúng.";
    return validateQuestionOptions(d.typing ? [] : d.options, draftCorrect(d));
};

/**
 * PATCH tối thiểu: chỉ gửi trường đổi. Đổi phương án thì gửi kèm correct (server kiểm correct ∈ options mới,
 * đáp án cũ có thể không còn trong danh sách). Rỗng = không có gì để lưu.
 */
export const buildQuestionPatch = (
    orig: Pick<AdminQuestionRow, "prompt" | "options" | "correct">,
    d: QuestionDraft
): AdminQuestionPatch => {
    const patch: AdminQuestionPatch = {};
    const prompt = d.prompt.trim();
    if (prompt !== (orig.prompt ?? "").trim()) patch.prompt = prompt;
    const correct = draftCorrect(d).trim();
    if (!d.typing) {
        const options = d.options.map((o) => o.trim());
        const changed = options.length !== orig.options.length || options.some((o, i) => o !== orig.options[i]);
        if (changed) {
            patch.options = options;
            patch.correct = correct;
        }
    }
    if (correct !== orig.correct && patch.correct === undefined) patch.correct = correct;
    return patch;
};

/** Chữ cái đánh dấu phương án (A, B, C...) dùng chung cho bảng và bộ sửa. */
export const optionLetter = (i: number): string => String.fromCharCode(65 + (i % 26));
