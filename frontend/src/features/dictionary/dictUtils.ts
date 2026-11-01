// Hàm thuần của từ điển (spec 2026-10-26 §7): chọn chế độ tìm, romaji → kana, nhãn trường / từ loại, dựng thẻ từ mục từ.
// Import tương đối để scripts/selfcheck chạy được bằng node.
import { romajiToKanaFull } from "../../lib/romaji.ts";
import type { DictEntry, DictKey, DictReportField, DictSummary, DictTranslateEngine, DictTranslateState, DictTranslateToken, DictViState } from "../../types/dictionary.types.ts";

const JA_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;
const VI_RE = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const ROMAJI_RE = /^[a-z' -]+$/i;

export const hasJapanese = (s: string): boolean => JA_RE.test(s);

/**
 * Chuẩn bị truy vấn: có chữ Nhật → ja; chữ Latin không dấu + công tắc romaji bật → đổi sang kana rồi ja (nếu đổi trọn được);
 * có dấu tiếng Việt hoặc công tắc tắt → auto (backend tìm Việt + Anh).
 */
export const prepareQuery = (raw: string, romaji: boolean): { q: string; mode: "ja" | "auto"; converted: boolean } => {
    const q = raw.trim().slice(0, 64);
    if (!q) return { q, mode: "auto", converted: false };
    if (hasJapanese(q)) return { q, mode: "ja", converted: false };
    if (romaji && ROMAJI_RE.test(q) && !VI_RE.test(q)) {
        const kana = romajiToKanaFull(q.toLowerCase().replace(/[\s'-]+/g, ""));
        if (kana && !/[a-z]/i.test(kana)) return { q: kana, mode: "ja", converted: true };
    }
    return { q, mode: "auto", converted: false };
};

// ---------- Dịch câu (tab Dịch, spec 2026-10-28-dich-cau-design, D33) ----------

export const TRANSLATE_MAX_CHARS = 1000;

/** Hướng dịch tự nhận như backend: có chữ Nhật → Nhật → Việt, không thì Việt → Nhật. */
export const detectTranslateDirection = (text: string): "ja-vi" | "vi-ja" => (hasJapanese(text) ? "ja-vi" : "vi-ja");

export const translateDirectionLabel = (d: "ja-vi" | "vi-ja"): string => (d === "ja-vi" ? "Nhật → Việt" : "Việt → Nhật");

/**
 * Dòng giải thích dưới hướng dịch, giọng nhẹ nhàng — tab Dịch không bao giờ hiện lỗi đỏ (D34). Có bản dịch máy offline: nói rõ
 * đó là bản offline và vì sao (để người học biết độ tin cậy). Không có bản dịch: phần phân tích câu vẫn hiện nhưng KHÔNG ghép
 * thành câu (câu ghép không trôi chảy, sai nghĩa — spec §2). Bản AI → null.
 */
export const translateStateNote = (
    state: DictTranslateState,
    aiLeft?: number,
    aiLimit?: number,
    engine?: DictTranslateEngine | null
): string | null => {
    if (engine === "offline") {
        const why =
            state === "LIMIT"
                ? `Bạn đã dùng hết lượt dịch AI trong giờ này (${aiLeft ?? 0}/${aiLimit ?? 0})`
                : state === "AI_DOWN"
                  ? "AI đang bận"
                  : "Dịch bằng AI đang tắt";
        return `${why}, nên đây là bản dịch máy offline: dịch được cả câu nhưng có thể sát chữ hoặc chưa chính xác, hãy đối chiếu phần phân tích bên dưới.`;
    }
    if (engine === "ai" || state === "OK") return null;
    switch (state) {
        case "BUSY":
            return "Bạn dịch hơi nhanh. Đợi vài giây rồi bấm Dịch lại nhé.";
        case "UNAVAILABLE":
            return "Dịch vụ dịch đang khởi động hoặc bận, chưa trả lời kịp. Đợi vài giây rồi bấm Dịch lại nhé.";
        case "LIMIT":
            return `Bạn đã dùng hết lượt dịch AI trong giờ này (${aiLeft ?? 0}/${aiLimit ?? 0}) và bản dịch offline chưa sẵn sàng. Dưới đây là phân tích từng cụm từ; thử lại sau ít phút.`;
        case "AI_DOWN":
            return "Chưa dịch được câu này lúc này. Dưới đây là phân tích từng cụm từ; bấm Dịch lại sau ít phút.";
        default:
            return "Dịch bằng AI đang tắt và bản dịch offline chưa sẵn sàng. Dưới đây là phân tích từng cụm từ.";
    }
};

/** Ô tra từ nhận cả câu tiếng Nhật (có dấu câu hoặc dài ≥ 10 ký tự) → gợi ý sang tab Dịch; từ đơn / câu Việt thì không. */
export const looksLikeSentence = (q: string): boolean => {
    const s = q.trim();
    return hasJapanese(s) && (/[。、！？!?,.「」]/.test(s) || s.length >= 10);
};

/** Nghĩa hiện cho một cụm: AI theo ngữ cảnh → nghĩa Việt của từ điển → gloss Anh; trợ từ không có nghĩa thì nhãn từ loại. */
export const tokenMeaning = (
    t: Pick<DictTranslateToken, "meaning" | "dictVi" | "glossEn" | "posVi" | "particle">
): { text: string; lang: "vi" | "en"; source: "ai" | "dict" | "en" | "pos" } | null => {
    if (t.meaning) return { text: t.meaning, lang: "vi", source: "ai" };
    if (t.dictVi) return { text: t.dictVi, lang: "vi", source: "dict" };
    if (t.glossEn) return { text: t.glossEn, lang: "en", source: "en" };
    if (t.particle && t.posVi) return { text: t.posVi, lang: "vi", source: "pos" };
    return null;
};

export const isKanjiKey = (key: DictKey): boolean => key.startsWith("k:");
export const kanjiKey = (ch: string): DictKey => `k:${ch}`;

/** Dòng tiêu đề của mục: chữ Hán (nếu có) và cách đọc. */
export const headOf = (e: Pick<DictSummary, "headKanji" | "headKana" | "reading" | "key">): { main: string; reading: string | null } => {
    if (isKanjiKey(e.key)) return { main: e.key.slice(2), reading: null };
    const main = e.headKanji || e.headKana || e.reading || e.key;
    const reading = e.headKanji ? (e.reading || e.headKana || null) : null;
    return { main, reading: reading && reading !== main ? reading : null };
};

/** Nghĩa chính hiển thị: Việt nếu có, không thì gloss Anh (không gắn nhãn "máy dịch", D23). */
export const primaryMeaning = (e: Pick<DictSummary, "meaningVi" | "glossShort">): { text: string; lang: "vi" | "en" } | null => {
    if (e.meaningVi && e.meaningVi.trim()) return { text: e.meaningVi.trim(), lang: "vi" };
    if (e.glossShort && e.glossShort.trim()) return { text: e.glossShort.trim(), lang: "en" };
    return null;
};

/** Dòng phụ dưới nghĩa khi đang hiện nghĩa Anh — chỉ nói khi hết lượt / AI lỗi, không nói "bản dịch máy". */
export const viStateNote = (state: DictViState | undefined, aiLeft?: number, aiLimit?: number): string | null => {
    if (state === "LIMIT") return `Đã hết lượt dịch trong giờ này (${aiLeft ?? 0}/${aiLimit ?? 0}). Đang hiện nghĩa tiếng Anh.`;
    if (state === "AI_DOWN") return "Chưa dịch được lúc này. Đang hiện nghĩa tiếng Anh, thử mở lại sau.";
    return null;
};

export const REPORT_FIELD_LABELS: Record<DictReportField, string> = {
    reading: "Cách đọc",
    han_viet: "Âm Hán-Việt",
    meaning_vi: "Nghĩa tiếng Việt",
    meaning_en: "Nghĩa tiếng Anh",
    kanji_meaning: "Nghĩa của chữ",
    example: "Câu ví dụ (tiếng Nhật)",
    example_vi: "Bản dịch câu ví dụ",
    other: "Khác",
};

/** Trường được báo cho loại mục (chữ Hán chỉ có Hán-Việt / nghĩa chữ / nghĩa Việt / khác). */
export const reportFieldsFor = (key: DictKey): DictReportField[] =>
    isKanjiKey(key)
        ? ["han_viet", "kanji_meaning", "meaning_vi", "other"]
        : ["meaning_vi", "reading", "han_viet", "meaning_en", "example", "example_vi", "other"];

/** Giá trị hiện tại của trường để hiện trong hộp báo lỗi (server vẫn chụp lại bản thật khi gửi). */
export const currentValueOf = (e: DictEntry, field: DictReportField, subKey?: string | null): string => {
    switch (field) {
        case "reading":
            return e.reading ?? "";
        case "meaning_vi":
            return e.meaningVi ?? "";
        case "meaning_en":
            return (isKanjiKey(e.key) ? e.meaningEn : e.glossShort) ?? "";
        case "kanji_meaning":
            return e.meaningEn ?? "";
        case "han_viet":
            if (isKanjiKey(e.key)) return e.hanViet ?? "";
            return e.hanVietChars?.find((c) => c.char === subKey)?.reading ?? "";
        case "example":
            return e.examples?.find((x) => x.id === subKey)?.jpn ?? "";
        case "example_vi":
            return e.examples?.find((x) => x.id === subKey)?.vi ?? "";
        default:
            return "";
    }
};

/** Trường cần chọn thêm chữ / câu. */
export const needsSubKey = (field: DictReportField): "char" | "example" | null =>
    field === "han_viet" ? "char" : field === "example" || field === "example_vi" ? "example" : null;

// Nhãn tiếng Việt cho mã từ loại / ghi chú JMdict hay gặp; mã lạ hiện mô tả tiếng Anh của JMdict.
export const POS_LABELS: Record<string, string> = {
    n: "Danh từ",
    "n-adv": "Danh từ (dùng như phó từ)",
    "n-t": "Danh từ chỉ thời gian",
    "n-suf": "Danh từ (hậu tố)",
    "n-pref": "Danh từ (tiền tố)",
    pn: "Đại từ",
    "adj-i": "Tính từ đuôi い",
    "adj-ix": "Tính từ đuôi い (いい / よい)",
    "adj-na": "Tính từ đuôi な",
    "adj-no": "Danh từ có thể đi với の",
    "adj-pn": "Liên thể từ",
    "adj-t": "Tính từ đuôi たる",
    "adj-f": "Danh từ / động từ bổ nghĩa danh từ",
    adv: "Phó từ",
    "adv-to": "Phó từ (đi với と)",
    aux: "Trợ động từ",
    "aux-v": "Trợ động từ",
    "aux-adj": "Tính từ phụ trợ",
    conj: "Liên từ",
    cop: "Hệ từ",
    ctr: "Lượng từ",
    exp: "Cụm từ, thành ngữ",
    int: "Thán từ",
    num: "Số từ",
    prt: "Trợ từ",
    pref: "Tiền tố",
    suf: "Hậu tố",
    v1: "Động từ nhóm 2",
    "v1-s": "Động từ nhóm 2 (đặc biệt)",
    v5aru: "Động từ nhóm 1 (kính ngữ -aru)",
    v5b: "Động từ nhóm 1 (-bu)",
    v5g: "Động từ nhóm 1 (-gu)",
    v5k: "Động từ nhóm 1 (-ku)",
    "v5k-s": "Động từ nhóm 1 (行く)",
    v5m: "Động từ nhóm 1 (-mu)",
    v5n: "Động từ nhóm 1 (-nu)",
    v5r: "Động từ nhóm 1 (-ru)",
    "v5r-i": "Động từ nhóm 1 (-ru, bất quy tắc)",
    v5s: "Động từ nhóm 1 (-su)",
    v5t: "Động từ nhóm 1 (-tsu)",
    v5u: "Động từ nhóm 1 (-u)",
    "v5u-s": "Động từ nhóm 1 (-u, đặc biệt)",
    vk: "Động từ 来る",
    vs: "Danh từ + する",
    "vs-i": "Động từ する",
    "vs-s": "Động từ -する (đặc biệt)",
    vz: "Động từ -ずる",
    vi: "Tự động từ",
    vt: "Tha động từ",
    uk: "Thường viết bằng kana",
    abbr: "Viết tắt",
    hon: "Kính ngữ",
    hum: "Khiêm nhường ngữ",
    pol: "Lịch sự",
    col: "Khẩu ngữ",
    sl: "Tiếng lóng",
    arch: "Cổ",
    obs: "Ít dùng",
    vulg: "Thô tục",
    derog: "Miệt thị",
    fam: "Thân mật",
    male: "Nam giới dùng",
    fem: "Nữ giới dùng",
    "on-mim": "Từ tượng thanh / tượng hình",
    yoji: "Thành ngữ bốn chữ",
    id: "Thành ngữ",
    proverb: "Tục ngữ",
};

export const posLabel = (code: string, fallback?: string): string => POS_LABELS[code] ?? fallback ?? code;

/** Nghĩa cho thẻ học: nghĩa chính + tối đa 2 dòng "VD: câu — dịch" (thẻ không có trường ví dụ riêng, K7). */
export const cardMeaningOf = (e: DictEntry): string => {
    const main = primaryMeaning(e)?.text ?? "";
    const lines = [main];
    for (const x of (e.examples ?? []).filter((x) => x.vi).slice(0, 2)) lines.push(`VD: ${x.jpn} — ${x.vi}`);
    return lines.filter(Boolean).join("\n").slice(0, 2000);
};

/** Mục từ → dạng nút từ của bản đồ Hán-Việt để dùng lại AddWordToDeckModal. */
export const entryToWordNode = (e: DictEntry) => {
    const { main, reading } = headOf(e);
    return {
        id: e.key,
        type: "word" as const,
        label: main,
        reading: reading ?? e.reading ?? "",
        meaning: cardMeaningOf(e),
        level: e.jlpt ?? null,
        hanViet: e.hanViet ?? "",
    };
};

// Màu chip JLPT (plan 2026-10-31): N5 xanh lá → N1 tím, dùng chung cho danh sách, chi tiết, tra nhanh, tab Dịch. Cấp lạ → primary.
const JLPT_CHIP: Record<string, string> = {
    N5: "bg-emerald-100 text-emerald-800",
    N4: "bg-teal-100 text-teal-800",
    N3: "bg-amber-100 text-amber-800",
    N2: "bg-indigo-100 text-indigo-800",
    N1: "bg-purple-100 text-purple-800",
};

export const jlptChipClass = (level: string | null | undefined): string =>
    JLPT_CHIP[(level ?? "").trim().toUpperCase()] ?? "bg-primary/10 text-primary";

// pitch.accent_kind của ai-service: heiban / atamadaka / nakadaka / odaka.
const PITCH_KIND_LABELS: Record<string, string> = {
    heiban: "Bằng",
    atamadaka: "Cao đầu",
    nakadaka: "Cao giữa",
    odaka: "Cao đuôi",
};

/** Tên kiểu trọng âm cho người Việt, kèm tên Nhật: "Bằng (heiban)". Kiểu lạ giữ nguyên. */
export const pitchKindLabel = (kind: string): string => {
    const k = kind.trim().toLowerCase();
    return PITCH_KIND_LABELS[k] ? `${PITCH_KIND_LABELS[k]} (${k})` : kind;
};

/** Mức H/L theo mora → các đoạn để vẽ bậc thang trọng âm. */
export const pitchSteps = (moras: string[], hl: ("H" | "L")[]): { mora: string; high: boolean; drop: boolean }[] =>
    moras.map((m, i) => ({ mora: m, high: hl[i] === "H", drop: hl[i] === "H" && hl[i + 1] === "L" }));

/**
 * Ghi chú trên danh sách kết quả khi server đưa dạng đã chia về dạng gốc (tìm 食べました → mục 食べる đứng đầu). null khi không
 * có hoặc dữ liệu hỏng; tối đa 5 dạng gốc, bỏ chuỗi rỗng / trùng.
 */
export function deinflectNote(result: { deinflected?: { query?: unknown; lemmas?: unknown } | null } | null | undefined): string | null {
    const d = result?.deinflected;
    if (!d || typeof d.query !== "string" || !Array.isArray(d.lemmas)) return null;
    const lemmas = [...new Set(d.lemmas.filter((l): l is string => typeof l === "string" && l.trim() !== "").map((l) => l.trim()))].slice(0, 5);
    if (lemmas.length === 0) return null;
    return `«${d.query}» là dạng đã chia hoặc là một cụm, đang hiện trước mục của dạng gốc: ${lemmas.join(", ")}.`;
}

/**
 * Tách text thành các đoạn để tô cụm q (tab Câu). Không phân biệt hoa thường; q rỗng / không có trong text -> một đoạn không tô.
 * Không bỏ dấu: gõ "an com" vẫn tìm ra câu "ăn cơm" (server khớp bỏ dấu) nhưng không tô — chấp nhận, tô sai còn tệ hơn.
 */
export function highlightParts(text: string, q: string): { text: string; hit: boolean }[] {
    const needle = q.trim().toLowerCase();
    if (!text) return [];
    if (!needle) return [{ text, hit: false }];
    const lower = text.toLowerCase();
    // toLowerCase có thể đổi độ dài (vd. "İ") -> không dám cắt theo chỉ số của bản thường
    if (lower.length !== text.length) return [{ text, hit: false }];
    const out: { text: string; hit: boolean }[] = [];
    // Như server: cụm chữ Latin chỉ khớp ở đầu một từ ("eat" tô eat / eating, không tô trong great); chữ Nhật khớp mọi chỗ.
    const wordStart = /^[\p{Script=Latin}\d]/u.test(needle);
    let from = 0;
    for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + 1)) {
        if (i < from) continue;
        if (wordStart && i > 0 && /[\p{L}\p{N}]/u.test(lower[i - 1])) continue;
        if (i > from) out.push({ text: text.slice(from, i), hit: false });
        out.push({ text: text.slice(i, i + needle.length), hit: true });
        from = i + needle.length;
    }
    if (from < text.length) out.push({ text: text.slice(from), hit: false });
    return out;
}
