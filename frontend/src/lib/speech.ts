// Đọc tiếng Nhật bằng Web Speech API có sẵn của trình duyệt (không cần thư viện TTS).
// Không được ném lỗi lúc import: file này được import ở cả trang không dùng TTS.
export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

const synth = (): SpeechSynthesis => window.speechSynthesis;

// Giọng tiếng Nhật: lang "ja-JP" / "ja_JP" (Chrome, Edge, Safari) hoặc chỉ "ja" (một số Android).
const isJaVoice = (v: SpeechSynthesisVoice): boolean => /^ja([-_]JP)?$/i.test(v.lang.trim());

// Điểm ưu tiên khi có nhiều giọng: giọng online của Google / Microsoft tự nhiên hơn hẳn giọng
// hệ điều hành cũ; cùng hãng thì ưu tiên lang đầy đủ "ja-JP" rồi giọng mặc định của máy.
const voiceScore = (v: SpeechSynthesisVoice): number =>
    (/google/i.test(v.name) ? 40 : 0) +
    (/microsoft/i.test(v.name) ? 30 : 0) +
    (/^ja[-_]JP$/i.test(v.lang.trim()) ? 4 : 0) +
    (v.default ? 1 : 0);

/**
 * Chờ danh sách giọng sẵn sàng. Chrome trả [] ở lần getVoices() đầu tiên rồi mới bắn
 * "voiceschanged"; Safari/Firefox có thể không bao giờ bắn -> luôn có timeout.
 */
export const waitForVoices = (timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> => {
    if (!canSpeak) return Promise.resolve([]);
    const now = synth().getVoices();
    if (now.length > 0) return Promise.resolve(now);
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            synth().removeEventListener("voiceschanged", finish);
            resolve(synth().getVoices());
        };
        const timer = setTimeout(finish, timeoutMs);
        synth().addEventListener("voiceschanged", finish);
    });
};

/** Giọng tiếng Nhật tốt nhất đang có, null nếu máy chưa cài giọng Nhật nào. */
export const getJaVoice = (
    voices: SpeechSynthesisVoice[] = canSpeak ? synth().getVoices() : []
): SpeechSynthesisVoice | null => {
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const v of voices) {
        if (!isJaVoice(v)) continue;
        const s = voiceScore(v);
        if (s > bestScore) {
            best = v;
            bestScore = s;
        }
    }
    return best;
};

/** Đồng bộ; gọi sau waitForVoices() để chắc danh sách đã tải. */
export const hasJaVoice = (): boolean => getJaVoice() !== null;

// Giọng tiếng Việt (đọc nghĩa ở chế độ chỉ nghe – E5): "vi-VN" / "vi_VN" hoặc chỉ "vi". Cùng cách chấm điểm
// với giọng Nhật (Google / Microsoft > giọng hệ điều hành; lang đầy đủ > lang cụt).
const isViVoice = (v: SpeechSynthesisVoice): boolean => /^vi([-_]VN)?$/i.test(v.lang.trim());

/** Giọng tiếng Việt tốt nhất đang có, null nếu máy chưa cài giọng Việt nào. */
export const getViVoice = (
    voices: SpeechSynthesisVoice[] = canSpeak ? synth().getVoices() : []
): SpeechSynthesisVoice | null => {
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const v of voices) {
        if (!isViVoice(v)) continue;
        // voiceScore thưởng "ja-JP" đầy đủ; với giọng Việt thưởng tương đương cho "vi-VN".
        const s = voiceScore(v) + (/^vi[-_]VN$/i.test(v.lang.trim()) ? 4 : 0);
        if (s > bestScore) {
            best = v;
            bestScore = s;
        }
    }
    return best;
};

/** Đồng bộ; gọi sau waitForVoices(). Không có giọng Việt thì chế độ chỉ nghe bỏ qua phần đọc nghĩa. */
export const hasViVoice = (): boolean => getViVoice() !== null;

// "Thế hệ" lượt đọc: tăng ở MỌI lần huỷ (stopSpeaking, speakJa, speakSequence bắt đầu). cancel() chỉ ngắt utterance
// đang đọc; chuỗi speakSequence đang chạy so thế hệ của mình để biết đã bị chen ngang bởi code không giữ AbortController
// của nó (vd. "Nghe mẫu" trong PronunciationPanel) và dừng hẳn, thay vì đọc tiếp các đoạn còn lại nối sau tiếng mới.
let generation = 0;

/** Huỷ mọi thứ đang đọc / xếp hàng và mở lượt mới; trả về thế hệ của lượt đó. */
const cancelAll = (): number => {
    synth().cancel();
    return ++generation;
};

export const stopSpeaking = (): void => {
    if (canSpeak) cancelAll();
};

// Giữ tham chiếu utterance đang đọc: Chrome có thể GC utterance giữa chừng làm sự kiện "end"
// không bao giờ bắn (bug lâu năm của Chromium).
let current: SpeechSynthesisUtterance | null = null;

export interface SpeakJaOptions {
    /** Tốc độ đọc 0.5–2 (1 = bình thường; 0.7 hợp để nghe rõ từng âm). */
    rate?: number;
}

const SPEAK_ERROR = "Không đọc được từ này. Hãy thử lại hoặc kiểm tra loa.";

/**
 * Đọc MỘT đoạn với giọng / lang cho trước, KHÔNG huỷ đoạn đang đọc (để xếp nối tiếp trong speakSequence).
 * Resolve khi đọc xong hoặc bị huỷ (lượt đọc mới / stopSpeaking), reject khi trình duyệt không đọc được.
 */
const speakOne = (text: string, lang: string, rate: number, voice: SpeechSynthesisVoice | null): Promise<void> =>
    new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = Math.min(2, Math.max(0.5, rate));
        if (voice) utterance.voice = voice;

        let settled = false;
        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            if (current === utterance) current = null;
            if (err) reject(err);
            else resolve();
        };
        // Lưới an toàn: nếu "end" không bao giờ bắn (bug Chromium) thì vẫn trả về sau một khoảng
        // ước lượng theo độ dài câu, để nút "Nghe mẫu" không kẹt ở trạng thái đang đọc.
        const guard = setTimeout(finish, 4000 + (text.length * 400) / utterance.rate);

        utterance.onend = () => finish();
        utterance.onerror = (e) => {
            // Bị huỷ bởi lượt đọc mới / stopSpeaking(): không phải lỗi với người dùng.
            if (e.error === "interrupted" || e.error === "canceled") finish();
            else finish(new Error(SPEAK_ERROR));
        };
        current = utterance;
        synth().speak(utterance);
    });

/**
 * Đọc một đoạn tiếng Nhật, huỷ đoạn đang đọc dở. Resolve khi đọc xong (hoặc bị huỷ bởi lượt
 * đọc mới), reject (thông báo tiếng Việt) khi trình duyệt không đọc được.
 */
export const speakJa = (text: string, { rate = 1 }: SpeakJaOptions = {}): Promise<void> => {
    if (!canSpeak) return Promise.reject(new Error("Trình duyệt này không hỗ trợ đọc văn bản."));
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    cancelAll();
    return speakOne(trimmed, "ja-JP", rate, getJaVoice());
};

/** Một đoạn trong chuỗi đọc (E5): thuật ngữ / cách đọc tiếng Nhật, nghĩa tiếng Việt. */
export interface SpeechItem {
    text: string;
    /** "ja-JP" (mặc định) hoặc "vi-VN"; lang khác để trình duyệt tự chọn giọng theo lang. */
    lang?: string;
    /** 0.5–2, mặc định 1. */
    rate?: number;
}

const isJaLang = (lang: string): boolean => /^ja\b/i.test(lang);
const isViLang = (lang: string): boolean => /^vi\b/i.test(lang);

/** Giọng cho một lang: Nhật / Việt lấy giọng tốt nhất đã cài; lang khác -> null (trình duyệt tự chọn). */
const voiceFor = (lang: string): SpeechSynthesisVoice | null =>
    isJaLang(lang) ? getJaVoice() : isViLang(lang) ? getViVoice() : null;

/**
 * Đọc lần lượt nhiều đoạn (từ -> cách đọc -> nghĩa), huỷ đoạn đang đọc dở của lượt trước. Giọng chọn theo lang:
 * tiếng Nhật dùng giọng Nhật tốt nhất; tiếng Việt dùng giọng Việt nếu máy có, KHÔNG có thì bỏ qua đoạn đó
 * (giọng Nhật đọc tiếng Việt chỉ gây khó hiểu). Resolve khi đọc hết, khi `signal` huỷ, hoặc khi lượt đọc khác chen
 * ngang (speakJa / stopSpeaking / chuỗi mới) — không reject vì huỷ; một đoạn đọc lỗi thì bỏ qua và đọc tiếp đoạn sau.
 * Trình duyệt không hỗ trợ -> resolve ngay.
 */
export const speakSequence = async (items: SpeechItem[], signal?: AbortSignal): Promise<void> => {
    if (!canSpeak || signal?.aborted) return;
    // Nhận lượt ngay (trước khi chờ giọng): chuỗi cũ còn đang chờ giọng thấy thế hệ đổi và bỏ cuộc.
    const gen = cancelAll();
    // Lượt khác đã chen vào (chuỗi mới, speakJa, stopSpeaking) -> dừng, và không cancel() tiếng của lượt đó.
    const superseded = (): boolean => signal?.aborted === true || generation !== gen;
    await waitForVoices();
    if (superseded()) return;
    // cancel() làm utterance đang đọc bắn "interrupted"/"canceled" -> speakOne resolve -> vòng lặp thấy superseded và dừng.
    const onAbort = () => {
        if (generation === gen) cancelAll();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
        for (const item of items) {
            if (superseded()) return;
            const text = item.text.trim();
            if (!text) continue;
            const lang = item.lang ?? "ja-JP";
            const voice = voiceFor(lang);
            if (isViLang(lang) && !voice) continue;
            try {
                await speakOne(text, lang, item.rate ?? 1, voice);
            } catch {
                // Một đoạn lỗi (vd. giọng online mất mạng): đoạn sau vẫn đáng nghe.
            }
        }
    } finally {
        signal?.removeEventListener("abort", onAbort);
    }
};

/** Đọc nhanh không cần chờ (nút loa ở danh sách thẻ / trang học). */
export const speak = (text: string): void => {
    if (!canSpeak) return;
    void speakJa(text).catch(() => {
        /* nút loa không có chỗ hiện lỗi; im lặng là đủ */
    });
};
