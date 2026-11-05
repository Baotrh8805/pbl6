// Chế độ chỉ nghe (E5): hàm thuần, không chạm DOM / Web Speech -> kiểm được bằng scripts/selfCheck.ts.
// Import tương đối + đuôi .ts để node chạy selfCheck không cần alias "@/".
import { splitContent } from "./cardContent.ts";
import type { SpeechItem } from "./speech.ts";

/** Ẩn chữ khi đang ở chế độ chỉ nghe và thẻ chưa lật; lật rồi thì luôn hiện (Ruby + nghĩa). */
export const shouldHideTerm = (audioOnly: boolean, revealed: boolean): boolean => audioOnly && !revealed;

/**
 * ?mode=audio ép bật, ?mode=read ép tắt (link từ nơi khác / chia sẻ); thiếu hoặc giá trị lạ -> null = theo cài đặt
 * của người dùng (LearningSettings.audioOnly).
 */
export const parseAudioMode = (raw: string | null): boolean | null =>
    raw === "audio" ? true : raw === "read" ? false : null;

export const AUDIO_MODE_LABELS = { audio: "Nghe", read: "Đọc" } as const;

const compactJa = (s: string): string => s.replace(/\s+/g, "");

/** Cách đọc có khác thuật ngữ không: thẻ kana thuần (reading trùng term) thì không đọc hai lần. */
export const readingDiffers = (term: string, reading: string | null | undefined): boolean => {
    const r = (reading ?? "").trim();
    return r.length > 0 && compactJa(r) !== compactJa(term);
};

/** Tốc độ đọc lại cách đọc: chậm hơn thuật ngữ để nghe rõ từng âm. */
export const READING_RATE = 0.85;

const HAS_KANA_REGEX = /[\u3040-\u309f\u30a0-\u30ff]/;
const VIETNAMESE_ACCENT_REGEX = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

/** Làm sạch các dấu phân cách thừa ở cuối chuỗi (; , . khoảng trắng). */
function cleanPunctuation(str: string): string {
    return str.replace(/[;,\s]+$/, "").trim();
}

/** Kiểm tra xem một đoạn text có phải là tiếng Nhật thuần (không lẫn tiếng Việt) hay không. */
function isPureJapanese(text: string): boolean {
    if (!text || !text.trim()) return false;
    // Nếu có chữ cái tiếng Việt có dấu -> chắc chắn là tiếng Việt
    if (VIETNAMESE_ACCENT_REGEX.test(text)) return false;
    // Phải có chữ Kana (Hiragana/Katakana) hoặc Kanji
    return HAS_KANA_REGEX.test(text) || /[\u4e00-\u9faf]/.test(text);
}

/** Đẩy đoạn speech item vào danh sách với ngôn ngữ chuẩn xác nhất. */
function pushSpeechItem(items: SpeechItem[], text: string, preferredLang?: "ja-JP" | "vi-VN"): void {
    const clean = cleanPunctuation(text).replace(/^[（(]\s*/, "").replace(/\s*[）)]$/, "").trim();
    if (!clean) return;

    if (VIETNAMESE_ACCENT_REGEX.test(clean)) {
        // Có dấu tiếng Việt thì TUYỆT ĐỐI đọc bằng giọng tiếng Việt
        items.push({ text: clean, lang: "vi-VN" });
    } else if (isPureJapanese(clean)) {
        // Thuần tiếng Nhật -> đọc bằng giọng Nhật
        items.push({ text: clean, lang: "ja-JP" });
    } else {
        // Các trường hợp khác (không dấu): theo ngôn ngữ ưu tiên hoặc mặc định tiếng Việt
        items.push({ text: clean, lang: preferredLang ?? "vi-VN" });
    }
}

/**
 * Bóc tách nội dung định nghĩa: nhận diện câu ví dụ tiếng Nhật để đọc bằng giọng Nhật (ja-JP),
 * còn giải nghĩa và dịch nghĩa bằng tiếng Việt (vi-VN).
 */
export function parseMeaningSpeechSegments(meaning: string): SpeechItem[] {
    if (!meaning || !meaning.trim()) return [];

    const items: SpeechItem[] = [];
    const cleanMeaning = cleanPunctuation(meaning);
    const lines = cleanMeaning.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const rawLine of lines) {
        const line = cleanPunctuation(rawLine);
        if (!line) continue;

        if (!HAS_KANA_REGEX.test(line)) {
            // Dòng thuần tiếng Việt (không chứa kana tiếng Nhật)
            pushSpeechItem(items, line, "vi-VN");
            continue;
        }

        // Dòng có chứa tiếng Nhật (có thể có tiền tố tiếng Việt, câu ví dụ tiếng Nhật, và dịch nghĩa)
        const exampleMatch = /(.*?)(?:ví dụ|vd|vd\.|ex|example|例)\s*[:：]\s*(.*)/i.exec(line);

        if (exampleMatch) {
            const defPart = cleanPunctuation(exampleMatch[1]);
            const exampleContent = cleanPunctuation(exampleMatch[2]);

            if (defPart) {
                pushSpeechItem(items, defPart, "vi-VN");
            }

            extractJaAndVi(exampleContent, items);
        } else {
            extractJaAndVi(line, items);
        }
    }

    return items.filter((it) => it.text.trim().length > 0);
}

function extractJaAndVi(text: string, items: SpeechItem[]): void {
    const cleanText = cleanPunctuation(text);
    if (!cleanText) return;

    // Dạng 1: [Câu tiếng Nhật] ([Dịch tiếng Việt]);
    // Cho phép có dấu chấm phẩy, dấu chấm ở cuối ngoặc
    const parenRegex = /^(.*?)\s*[（(]\s*([^（)）]+?)\s*[）)]\s*[;.,]*$/u;
    const parenMatch = parenRegex.exec(cleanText);

    if (parenMatch) {
        const part1 = cleanPunctuation(parenMatch[1]);
        const part2 = cleanPunctuation(parenMatch[2]);

        if (part1) {
            if (isPureJapanese(part1)) {
                pushSpeechItem(items, part1, "ja-JP");
            } else {
                splitBeforeJapanese(part1, items);
            }
        }

        if (part2) {
            pushSpeechItem(items, part2, "vi-VN");
        }
        return;
    }

    // Dạng 2: [Câu tiếng Nhật] - [Dịch tiếng Việt]
    const dashMatch = /(.*?)\s*[-–—:]\s*(.*)/.exec(cleanText);
    if (dashMatch) {
        const p1 = cleanPunctuation(dashMatch[1]);
        const p2 = cleanPunctuation(dashMatch[2]);
        if (isPureJapanese(p1) && !isPureJapanese(p2)) {
            pushSpeechItem(items, p1, "ja-JP");
            pushSpeechItem(items, p2, "vi-VN");
            return;
        }
    }

    // Dạng 3: Bóc tách bằng ranh giới giữa cụm tiếng Nhật và tiếng Việt
    splitBeforeJapanese(cleanText, items);
}

function splitBeforeJapanese(text: string, items: SpeechItem[]): void {
    // Tìm khối ký tự tiếng Nhật liên tục (có chứa Kana)
    const match = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー〜、。！？\s0-9a-zA-Z]*[\p{Script=Hiragana}\p{Script=Katakana}][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー〜、。！？\s]*)/u.exec(text);

    if (match) {
        const jaStart = match.index;
        const jaText = cleanPunctuation(match[0]);
        const beforeJa = cleanPunctuation(text.slice(0, jaStart));
        const afterJa = cleanPunctuation(text.slice(jaStart + match[0].length));

        if (beforeJa) pushSpeechItem(items, beforeJa, "vi-VN");
        if (jaText) pushSpeechItem(items, jaText, "ja-JP");
        if (afterJa) {
            pushSpeechItem(items, afterJa, isPureJapanese(afterJa) ? "ja-JP" : "vi-VN");
        }
        return;
    }

    if (isPureJapanese(text)) {
        pushSpeechItem(items, text, "ja-JP");
    } else {
        pushSpeechItem(items, text, "vi-VN");
    }
}

export interface CardSpeechOptions {
    /** Có đọc cách đọc (Furigana) khi chưa lật thẻ không (mặc định: true). */
    speakReading?: boolean;
    /** Có đọc định nghĩa sau khi lật thẻ không (mặc định: true). */
    speakMeaning?: boolean;
    /** Có bóc tách và đọc cả câu ví dụ tiếng Nhật trong định nghĩa không (mặc định: false khi gọi nội bộ, true khi học). */
    includeExamples?: boolean;
}

/**
 * Các đoạn cần đọc cho một thẻ, theo thứ tự: thuật ngữ (giọng Nhật), cách đọc khi khác thuật ngữ (chậm hơn),
 * rồi nghĩa khi đã lật thẻ (`meaning` khác null).
 */
export function cardSpeechItems(
    term: string,
    reading: string | null | undefined,
    meaning: string | null,
    options?: CardSpeechOptions
): SpeechItem[] {
    const speakReading = options?.speakReading !== false;
    const cleanTerm = term.replace(/\s*([[（(【][^\]）)】]+[\]）)】])\s*$/, "").trim();
    const items: SpeechItem[] = [{ text: cleanTerm, lang: "ja-JP" }];
    if (speakReading && readingDiffers(cleanTerm, reading)) {
        items.push({ text: (reading ?? "").trim(), lang: "ja-JP", rate: READING_RATE });
    }
    if (meaning !== null && options?.speakMeaning !== false) {
        items.push(...meaningSpeechItems(meaning, options?.includeExamples ?? false));
    }
    return items.filter((it) => it.text.length > 0);
}

/** Đoạn đọc nghĩa sau khi lật thẻ: tiếng Việt + câu ví dụ tiếng Nhật (nếu có). */
export const meaningSpeechItems = (meaning: string, includeExamples: boolean = false): SpeechItem[] => {
    if (!meaning || !meaning.trim()) return [];
    if (includeExamples) {
        return parseMeaningSpeechSegments(meaning);
    }
    const head = splitContent(meaning).head;
    return head ? [{ text: head, lang: "vi-VN" }] : [];
};
