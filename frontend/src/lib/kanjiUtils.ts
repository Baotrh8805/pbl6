// Tra chữ Hán & bộ thủ (C4, C5): hàm thuần cho trang /kanji — đọc response (dữ liệu không đáng tin), dựng thẻ cho bộ thẻ
// On/Kun và bộ thẻ theo bộ thủ, lọc bảng bộ thủ. Không gọi API / DOM -> kiểm được bằng scripts/selfCheck.ts.
import type {
    CardDto,
    KanjiExample,
    KanjiInfoCard,
    KanjiKunReading,
    KanjiOnReading,
    MnemonicSource,
    Radical,
    RadicalCard,
    RadicalCardsResponse,
    RadicalGroup,
    RadicalKanjiItem,
    RadicalKanjiList,
    RadicalRef,
} from "../types/api.types.ts";
import { JLPT_LEVELS } from "./deckUtils.ts";

// Một nguồn cho "chữ Hán trong chuỗi" (cùng quy tắc nút Luyện viết ở trang bộ thẻ: bỏ 々〆〇).
export { extractKanji } from "./textUtils.ts";

/** Số chữ tra một lần: mỗi chữ là một khối lớn trên trang, quá nhiều thì khó đọc (ai-service nhận tới 200). */
export const MAX_LOOKUP_KANJI = 20;
/** Số chữ tối đa cho "Thẻ bộ thủ" (một lô POST /nlp/radicals/cards). */
export const MAX_RADICAL_CARD_KANJI = 30;
/** Ví dụ tối đa đưa vào mặt sau một thẻ (server trả ≤ 3 mỗi cách đọc). */
const MAX_EXAMPLES_PER_CARD = 6;
/** Giới hạn cột của DeckRequest.Card (vượt -> 400). */
const TERM_MAX = 200;
const READING_MAX = 200;
const MEANING_MAX = 2000;
const HAN_VIET_MAX = 100;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

type Level = (typeof JLPT_LEVELS)[number];
const isLevel = (v: unknown): v is Level => typeof v === "string" && (JLPT_LEVELS as readonly string[]).includes(v);

/** Cấp dễ nhất (N5 dễ nhất) trong danh sách; không có cấp hợp lệ nào -> null. */
export const easiestLevel = (levels: Iterable<string | null | undefined>): Level | null => {
    let best = -1;
    for (const lv of levels) {
        if (!isLevel(lv)) continue;
        const i = JLPT_LEVELS.indexOf(lv);
        if (best < 0 || i < best) best = i;
    }
    return best < 0 ? null : JLPT_LEVELS[best];
};

/**
 * Cắt chuỗi về ≤ max rồi thêm "…". Đo theo đơn vị UTF-16 vì @Size của backend đếm String.length() của Java (chữ Hán mở
 * rộng như 𠮟 tính 2), nhưng cắt theo code point để không tách đôi cặp surrogate.
 */
const clip = (s: string, max: number): string => {
    if (s.length <= max) return s;
    let out = "";
    for (const cp of s) {
        if (out.length + cp.length > max - 1) break;
        out += cp;
    }
    return `${out}…`;
};

// ---- Đọc response -------------------------------------------------------------------------------------------------

const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseExamples(v: unknown): KanjiExample[] {
    const out: KanjiExample[] = [];
    for (const item of list(v)) {
        const e = asRecord(item);
        const term = e ? strOrNull(e.term) : null;
        if (!e || !term) continue;
        out.push({ term, reading: strOrNull(e.reading), meaning: strOrNull(e.meaning), level: isLevel(e.level) ? e.level : null });
    }
    return out;
}

function parseRadicalRef(v: unknown): RadicalRef | null {
    const r = asRecord(v);
    const no = r ? intOrNull(r.no) : null;
    if (!r || no === null || !strOrNull(r.char)) return null;
    return { no, char: str(r.char).trim(), nameVi: str(r.nameVi), meaningVi: str(r.meaningVi), hanViet: str(r.hanViet) };
}

/** POST /nlp/kanji-cards: bỏ mục không có chữ / trùng chữ; cách đọc rỗng bị bỏ. */
export function parseKanjiCards(raw: unknown): KanjiInfoCard[] {
    const out: KanjiInfoCard[] = [];
    const seen = new Set<string>();
    for (const item of list(asRecord(raw)?.items)) {
        const c = asRecord(item);
        const kanji = c ? strOrNull(c.kanji) : null;
        if (!c || !kanji || seen.has(kanji)) continue;
        seen.add(kanji);
        const rad = asRecord(c.radical);
        const radNo = rad ? intOrNull(rad.no) : null;
        const on: KanjiOnReading[] = [];
        for (const r of list(c.on)) {
            const o = asRecord(r);
            const reading = o ? strOrNull(o.reading) : null;
            if (o && reading) on.push({ reading, examples: parseExamples(o.examples) });
        }
        const kun: KanjiKunReading[] = [];
        for (const r of list(c.kun)) {
            const k = asRecord(r);
            const reading = k ? strOrNull(k.reading) : null;
            if (k && reading) kun.push({ reading, okurigana: str(k.okurigana).trim(), examples: parseExamples(k.examples) });
        }
        out.push({
            kanji,
            hanViet: strOrNull(c.hanViet),
            radical: rad && radNo !== null ? { no: radNo, strokes: Math.max(0, intOrNull(rad.strokes) ?? 0) } : null,
            on,
            kun,
            meaningEn: strOrNull(c.meaningEn),
            strokeCount: intOrNull(c.strokeCount),
        });
    }
    return out;
}

/** GET /nlp/radicals: bảng 214 bộ, sắp theo số bộ; bỏ dòng thiếu số / chữ. */
export function parseRadicals(raw: unknown): Radical[] {
    const out: Radical[] = [];
    for (const item of list(asRecord(raw)?.items)) {
        const r = asRecord(item);
        const no = r ? intOrNull(r.no) : null;
        const unified = r ? strOrNull(r.unified) ?? strOrNull(r.char) : null;
        if (!r || no === null || !unified) continue;
        out.push({
            no,
            char: strOrNull(r.char) ?? unified,
            unified,
            strokes: Math.max(0, intOrNull(r.strokes) ?? 0),
            nameVi: str(r.nameVi),
            meaningVi: str(r.meaningVi),
            hanViet: str(r.hanViet),
        });
    }
    return out.sort((a, b) => a.no - b.no);
}

/** GET /nlp/radicals/{no}/kanji */
export function parseRadicalKanji(raw: unknown): RadicalKanjiList {
    const rec = asRecord(raw) ?? {};
    const items: RadicalKanjiItem[] = [];
    const seen = new Set<string>();
    for (const item of list(rec.items)) {
        const k = asRecord(item);
        const kanji = k ? strOrNull(k.kanji) : null;
        if (!k || !kanji || seen.has(kanji)) continue;
        seen.add(kanji);
        items.push({ kanji, level: isLevel(k.level) ? k.level : null, strokeCount: intOrNull(k.strokeCount) });
    }
    const levels = list(rec.levels).filter(isLevel);
    return { radical: parseRadicalRef(rec.radical), levels: levels.length > 0 ? levels : null, items };
}

const isMnemonicSource = (v: unknown): v is MnemonicSource => v === "gemini" || v === "template";

/** POST /nlp/radicals/cards: thẻ theo thứ tự gửi lên + nhóm theo bộ (nhóm chỉ giữ chữ có thẻ). */
export function parseRadicalCards(raw: unknown): RadicalCardsResponse {
    const rec = asRecord(raw) ?? {};
    const items: RadicalCard[] = [];
    const seen = new Set<string>();
    for (const item of list(rec.items)) {
        const c = asRecord(item);
        const kanji = c ? strOrNull(c.kanji) : null;
        if (!c || !kanji || seen.has(kanji)) continue;
        seen.add(kanji);
        const mnemonicVi = strOrNull(c.mnemonicVi);
        items.push({
            kanji,
            hanViet: strOrNull(c.hanViet),
            meaningEn: strOrNull(c.meaningEn),
            strokeCount: intOrNull(c.strokeCount),
            radical: parseRadicalRef(c.radical),
            mnemonicVi,
            mnemonicSource: mnemonicVi && isMnemonicSource(c.mnemonicSource) ? c.mnemonicSource : null,
            examples: parseExamples(c.examples),
        });
    }
    const groups: RadicalGroup[] = [];
    for (const item of list(rec.groups)) {
        const g = asRecord(item);
        if (!g) continue;
        // Bỏ chữ lặp trong nhóm: lặp thì bộ thẻ có hai thẻ y hệt.
        const kanji = [...new Set(list(g.kanji).filter((k): k is string => typeof k === "string" && seen.has(k)))];
        if (kanji.length > 0) groups.push({ radical: parseRadicalRef(g.radical), kanji });
    }
    // Server cũ / hỏng không trả groups: gom tại chỗ theo bộ của từng thẻ để vẫn tạo được bộ thẻ.
    if (groups.length === 0 && items.length > 0) {
        const byNo = new Map<string, RadicalGroup>();
        for (const c of items) {
            const key = c.radical ? String(c.radical.no) : "none";
            const g = byNo.get(key) ?? { radical: c.radical, kanji: [] };
            g.kanji.push(c.kanji);
            byNo.set(key, g);
        }
        groups.push(...byNo.values());
    }
    return { items, groups, reason: strOrNull(rec.reason) };
}

// ---- Nhãn ---------------------------------------------------------------------------------------------------------

/** "HỌC – learning, scholarship"; thiếu cả hai -> "Chữ 学" (meaning là trường bắt buộc của thẻ). */
export const kanjiHeadline = (kanji: string, hanViet: string | null, meaningEn: string | null): string =>
    [hanViet, meaningEn].filter((s): s is string => !!s && !!s.trim()).join(" – ") || `Chữ ${kanji}`;

/** "学生 (がくせい): student [N5]" — bỏ phần thiếu; cách đọc trùng chữ thì không lặp. */
export const exampleLine = (ex: KanjiExample): string => {
    const reading = ex.reading && ex.reading !== ex.term ? ` (${ex.reading})` : "";
    const meaning = ex.meaning ? `: ${ex.meaning}` : "";
    const level = ex.level ? ` [${ex.level}]` : "";
    return `${ex.term}${reading}${meaning}${level}`;
};

/** "水 (THỦY – nước)"; thiếu âm / nghĩa thì bỏ phần đó. */
export const radicalLabel = (r: Pick<RadicalRef, "char" | "hanViet" | "meaningVi">): string => {
    const inner = [r.hanViet, r.meaningVi].filter((s) => s && s.trim()).join(" – ");
    return inner ? `${r.char} (${inner})` : r.char;
};

export const mnemonicSourceLabel = (source: MnemonicSource | null): string | null =>
    source === "template" ? "Mẹo gợi ý tự động" : source === "gemini" ? "Mẹo do AI viết" : null;

/** Âm Kun hiển thị: "まな.ぶ" khi có okurigana (dấu chấm như Unihan), không thì chỉ phần gốc. */
export const kunLabel = (r: Pick<KanjiKunReading, "reading" | "okurigana">): string =>
    r.okurigana ? `${r.reading}.${r.okurigana}` : r.reading;

// ---- Thẻ cho bộ thẻ -----------------------------------------------------------------------------------------------

const uniqueExamples = (examples: KanjiExample[]): KanjiExample[] => {
    const seen = new Set<string>();
    return examples.filter((ex) => {
        if (seen.has(ex.term)) return false;
        seen.add(ex.term);
        return true;
    });
};

const backSide = (head: string, extra: string[], examples: KanjiExample[]): string =>
    clip([head, ...extra, ...uniqueExamples(examples).slice(0, MAX_EXAMPLES_PER_CARD).map(exampleLine)].join("\n"), MEANING_MAX);

/** Cách đọc lưu vào thẻ Kun: gốc + okurigana liền nhau, không dấu chấm ("まなぶ") để đọc / chấm phát âm như một từ. */
const kunReading = (r: Pick<KanjiKunReading, "reading" | "okurigana">): string => `${r.reading}${r.okurigana}`;

/**
 * Bộ thẻ On/Kun: mỗi chữ hai thẻ (term = chữ). `reading` chỉ là kana thật của âm chính ("ガク" / "まなぶ") vì giọng đọc,
 * luyện phát âm (moraSplit) và furigana đều dùng nó như cách đọc; nhãn "Âm On / Âm Kun" và mọi cách đọc khác nằm ở dòng
 * thứ hai của mặt sau. Mặt sau: dòng đầu = Hán-Việt + nghĩa (Quiz lấy dòng đầu làm đáp án), dòng hai = "Âm On: ガク、
 * ショウ", các dòng sau = từ ví dụ của đúng nhóm âm đó; cấp = cấp dễ nhất trong ví dụ của thẻ (không có thì của cả chữ).
 * Chữ thiếu một nhóm âm chỉ có một thẻ; thiếu cả hai mà có nghĩa -> một thẻ không cách đọc.
 */
export function onKunDeckCards(cards: KanjiInfoCard[]): CardDto[] {
    const out: CardDto[] = [];
    for (const c of cards) {
        const head = kanjiHeadline(c.kanji, c.hanViet, c.meaningEn);
        const onEx = c.on.flatMap((r) => r.examples);
        const kunEx = c.kun.flatMap((r) => r.examples);
        const kanjiLevel = easiestLevel([...onEx, ...kunEx].map((e) => e.level));
        const base = {
            term: clip(c.kanji, TERM_MAX),
            hanViet: c.hanViet ? clip(c.hanViet, HAN_VIET_MAX) : null,
            kind: "vocab" as const,
        };
        if (c.on.length > 0) {
            out.push({
                ...base,
                reading: clip(c.on[0].reading, READING_MAX),
                meaning: backSide(head, [`Âm On: ${c.on.map((r) => r.reading).join("、")}`], onEx),
                level: easiestLevel(onEx.map((e) => e.level)) ?? kanjiLevel,
            });
        }
        if (c.kun.length > 0) {
            out.push({
                ...base,
                reading: clip(kunReading(c.kun[0]), READING_MAX),
                meaning: backSide(head, [`Âm Kun: ${c.kun.map(kunLabel).join("、")}`], kunEx),
                level: easiestLevel(kunEx.map((e) => e.level)) ?? kanjiLevel,
            });
        }
        if (c.on.length === 0 && c.kun.length === 0 && (c.hanViet || c.meaningEn)) {
            out.push({ ...base, reading: null, meaning: clip(head, MEANING_MAX), level: null });
        }
    }
    return out;
}

/** Tiêu đề bộ thẻ: "Chữ Hán On/Kun: 学・生" — tối đa 10 chữ rồi "…" (DeckRequest.title ≤ 200). */
export const onKunDeckTitle = (kanji: string[]): string =>
    clip(`Chữ Hán On/Kun: ${kanji.slice(0, 10).join("・")}${kanji.length > 10 ? "…" : ""}`, TITLE_MAX);

export interface RadicalDeckDraft {
    radical: RadicalRef | null;
    title: string;
    /** Cấp dễ nhất trong các thẻ; null = không rõ (nơi gọi dùng cấp người học). */
    level: Level | null;
    cards: CardDto[];
    /** Có ít nhất một thẻ mang mẹo nhớ (hiện backend luôn gọi withMnemonic=false nên là false). */
    hasMnemonic: boolean;
}

/**
 * Một bộ thẻ cho mỗi nhóm bộ thủ: thẻ = chữ; mặt sau = Hán-Việt + nghĩa, "Bộ thủ: 水 (THỦY – nước)", mẹo nhớ (nếu có),
 * từ ví dụ. Nhóm không còn thẻ nào bị bỏ.
 */
export function radicalDeckCards(resp: RadicalCardsResponse): RadicalDeckDraft[] {
    const byKanji = new Map(resp.items.map((c) => [c.kanji, c]));
    const out: RadicalDeckDraft[] = [];
    for (const g of resp.groups) {
        const cards: CardDto[] = [];
        let hasMnemonic = false;
        for (const k of g.kanji) {
            const c = byKanji.get(k);
            if (!c) continue;
            if (c.mnemonicVi) hasMnemonic = true;
            const rad = c.radical ?? g.radical;
            const extra = [
                ...(rad ? [`Bộ thủ: ${radicalLabel(rad)}`] : []),
                ...(c.mnemonicVi ? [`Mẹo nhớ: ${c.mnemonicVi}`] : []),
            ];
            cards.push({
                term: clip(c.kanji, TERM_MAX),
                reading: null,
                meaning: backSide(kanjiHeadline(c.kanji, c.hanViet, c.meaningEn), extra, c.examples),
                level: easiestLevel(c.examples.map((e) => e.level)),
                kind: "vocab",
                hanViet: c.hanViet ? clip(c.hanViet, HAN_VIET_MAX) : null,
            });
        }
        if (cards.length === 0) continue;
        const r = g.radical;
        const title = r
            ? `Bộ thủ ${r.char}${r.hanViet ? ` ${r.hanViet}` : ""}${r.meaningVi ? ` (${r.meaningVi})` : ""}: ${cards.map((c) => c.term).join("・")}`
            : `Chữ Hán chưa rõ bộ thủ: ${cards.map((c) => c.term).join("・")}`;
        out.push({ radical: r, title: clip(title, TITLE_MAX), level: easiestLevel(cards.map((c) => c.level)), cards, hasMnemonic });
    }
    return out;
}

/** Mô tả bộ thẻ bộ thủ: chỉ nhắc "mẹo nhớ" khi bộ thật sự có thẻ mang mẹo (DeckRequest.description ≤ 1000). */
export const radicalDeckDescription = (d: Pick<RadicalDeckDraft, "radical" | "hasMnemonic">): string => {
    const parts = d.hasMnemonic ? "Hán-Việt, nghĩa, mẹo nhớ và từ ví dụ JLPT" : "Hán-Việt, nghĩa và từ ví dụ JLPT";
    return d.radical
        ? clip(`Thẻ bộ thủ ${radicalLabel(d.radical)}: ${parts}.`, DESCRIPTION_MAX)
        : `Thẻ chữ Hán chưa tra được bộ thủ: ${parts}.`;
};

// ---- Bảng bộ thủ --------------------------------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt + chữ thường để tìm "thuy" ra "THỦY" / "thủy". */
export const foldVi = (s: string): string =>
    s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

/** Ô tìm bộ thủ: khớp số bộ (đúng số), chữ (bộ hoặc dạng thường), tên / nghĩa / âm Hán-Việt (bỏ dấu, chứa chuỗi). */
export const radicalMatches = (r: Radical, query: string): boolean => {
    const q = query.trim();
    if (!q) return true;
    if (/^\d+$/.test(q)) return r.no === Number(q);
    if (q === r.char || q === r.unified) return true;
    const fq = foldVi(q);
    return [r.nameVi, r.meaningVi, r.hanViet].some((s) => foldVi(s).includes(fq));
};

/** Các số nét có trong bảng, tăng dần (chip lọc). */
export const radicalStrokeOptions = (radicals: Pick<Radical, "strokes">[]): number[] =>
    [...new Set(radicals.map((r) => r.strokes).filter((n) => n > 0))].sort((a, b) => a - b);

/** ?r= trên URL -> số bộ 1..214; lạ / ngoài khoảng -> null (không gọi API với số hỏng). */
export const parseRadicalNo = (raw: string | null): number | null => {
    if (!raw || !/^\d{1,3}$/.test(raw.trim())) return null;
    const n = Number(raw.trim());
    return n >= 1 && n <= 214 ? n : null;
};

/** Lý do Gemini không viết được mẹo (reason của /radicals/cards) -> câu tiếng Việt; null / lạ -> null. */
export const mnemonicReasonLabel = (reason: string | null): string | null =>
    reason === "no_key" || reason === "no_api_key"
        ? "Máy chủ chưa cấu hình khoá AI nên mẹo nhớ là câu mẫu tự động."
        : reason === "quota"
          ? "AI đã hết hạn mức hôm nay nên mẹo nhớ là câu mẫu tự động."
          : reason === "error"
            ? "AI gặp lỗi khi viết mẹo nên mẹo nhớ là câu mẫu tự động."
            : null;

/**
 * Chữ cho "Thẻ bộ thủ": chữ đã chọn còn hiện trong danh sách (giữ thứ tự danh sách); không có chữ chọn nào đang hiện
 * (chưa chọn, hoặc chữ đã chọn bị bộ lọc cấp ẩn đi) -> các chữ đầu danh sách. Tối đa 30.
 */
export const radicalCardTargets = (items: Pick<RadicalKanjiItem, "kanji">[], selected: ReadonlySet<string>): string[] => {
    const all = items.map((i) => i.kanji);
    const picked = all.filter((k) => selected.has(k));
    return (picked.length > 0 ? picked : all).slice(0, MAX_RADICAL_CARD_KANJI);
};
