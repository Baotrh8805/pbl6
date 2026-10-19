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

/**
 * Các đoạn cần đọc cho một thẻ, theo thứ tự: thuật ngữ (giọng Nhật), cách đọc khi khác thuật ngữ (chậm hơn),
 * rồi dòng đầu của nghĩa bằng tiếng Việt khi đã lật thẻ (`meaning` khác null). Không kiểm tra máy có giọng Việt:
 * speakSequence tự bỏ đoạn tiếng Việt khi thiếu giọng.
 */
export function cardSpeechItems(term: string, reading: string | null | undefined, meaning: string | null): SpeechItem[] {
    const items: SpeechItem[] = [{ text: term.trim(), lang: "ja-JP" }];
    if (readingDiffers(term, reading)) items.push({ text: (reading ?? "").trim(), lang: "ja-JP", rate: READING_RATE });
    if (meaning !== null) items.push(...meaningSpeechItems(meaning));
    return items.filter((it) => it.text.length > 0);
}

/** Đoạn đọc nghĩa sau khi lật thẻ: chỉ dòng đầu (định nghĩa chính), tiếng Việt. Nghĩa rỗng -> []. */
export const meaningSpeechItems = (meaning: string): SpeechItem[] => {
    const head = splitContent(meaning).head;
    return head ? [{ text: head, lang: "vi-VN" }] : [];
};
