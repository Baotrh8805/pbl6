// Nhận dạng giọng nói tiếng Nhật bằng Web Speech API (SpeechRecognition) của trình duyệt.
// Âm thanh không rời khỏi trình duyệt về phía server của mình (Chrome tự gửi lên dịch vụ của
// Google để nhận dạng — đó là việc của trình duyệt, không phải của app).
// Không được ném lỗi lúc import; chỉ Chrome / Edge / Safari mới có API này.

export type AsrErrorCode =
    | "not-supported"
    | "not-allowed"
    | "no-speech"
    | "audio-capture"
    | "network"
    | "aborted"
    | "timeout"
    | "unknown";

export const ASR_MESSAGES: Record<AsrErrorCode, string> = {
    "not-supported": "Trình duyệt này không hỗ trợ nhận dạng giọng nói, hãy dùng Chrome hoặc Edge.",
    "not-allowed": "Bạn chưa cho phép dùng micro. Hãy bật quyền micro cho trang này rồi thử lại.",
    "no-speech": "Không nghe thấy giọng nói. Hãy nói to, rõ và gần micro hơn.",
    "audio-capture": "Không tìm thấy micro. Hãy kiểm tra thiết bị thu âm rồi thử lại.",
    network: "Nhận dạng giọng nói cần kết nối mạng. Hãy kiểm tra Internet rồi thử lại.",
    aborted: "Đã dừng ghi âm.",
    timeout: "Hết thời gian chờ mà chưa nhận được giọng nói. Hãy thử lại.",
    unknown: "Không nhận dạng được giọng nói. Hãy thử lại.",
};

export class AsrError extends Error {
    readonly code: AsrErrorCode;

    constructor(code: AsrErrorCode, message: string = ASR_MESSAGES[code]) {
        super(message);
        this.name = "AsrError";
        this.code = code;
    }
}

/** Mã lỗi của trình duyệt (SpeechRecognitionErrorEvent.error) -> AsrError có thông báo tiếng Việt. */
export const toAsrError = (browserCode: string): AsrError => {
    switch (browserCode) {
        case "not-allowed":
        case "service-not-allowed":
            return new AsrError("not-allowed");
        case "no-speech":
            return new AsrError("no-speech");
        case "audio-capture":
            return new AsrError("audio-capture");
        case "network":
            return new AsrError("network");
        case "aborted":
            return new AsrError("aborted");
        case "language-not-supported":
            return new AsrError("not-supported", "Trình duyệt này chưa hỗ trợ nhận dạng tiếng Nhật.");
        default:
            return new AsrError("unknown");
    }
}

// lib.dom của TypeScript có SpeechRecognitionEvent / ErrorEvent nhưng chưa có interface
// SpeechRecognition lẫn webkitSpeechRecognition -> tự khai báo phần tối thiểu đang dùng.
interface Recognizer {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: SpeechRecognitionEvent) => void) | null;
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const getCtor = (): RecognizerCtor | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canRecognize: boolean = getCtor() !== null;

export interface RecognizeOptions {
    /** Mặc định "ja-JP". */
    lang?: string;
    /** Quá hạn mà chưa có kết quả cuối -> dừng nhận dạng, reject AsrError("timeout"). Mặc định 8000. */
    timeoutMs?: number;
    /** Số phương án trình duyệt trả về cho một lượt nói. Mặc định 3. */
    maxAlternatives?: number;
    /** Nhận văn bản tạm (chưa chốt) để hiện "đang nghe thấy...". */
    onInterim?: (text: string) => void;
    /** Huỷ từ bên ngoài (unmount, bấm Dừng) -> reject AsrError("aborted"). */
    signal?: AbortSignal;
}

export interface RecognizeResult {
    /** Các phương án theo thứ tự tin cậy giảm dần, đã cắt khoảng trắng, bỏ trùng. */
    transcripts: string[];
    /** Độ tin cậy của phương án đầu (0–1), null khi trình duyệt không báo. */
    confidence: number | null;
}

/**
 * Nghe một lượt nói rồi trả về các phương án. Promise luôn settle đúng một lần: kết quả cuối,
 * lỗi của trình duyệt, timeout (tự dừng recognizer) hoặc huỷ qua signal.
 */
export const recognizeOnce = ({
    lang = "ja-JP",
    timeoutMs = 8000,
    maxAlternatives = 3,
    onInterim,
    signal,
}: RecognizeOptions = {}): Promise<RecognizeResult> =>
    new Promise((resolve, reject) => {
        const Ctor = getCtor();
        if (!Ctor) {
            reject(new AsrError("not-supported"));
            return;
        }
        if (signal?.aborted) {
            reject(new AsrError("aborted"));
            return;
        }
        let rec: Recognizer;
        try {
            rec = new Ctor();
        } catch {
            reject(new AsrError("not-supported"));
            return;
        }
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = Boolean(onInterim);
        rec.maxAlternatives = Math.max(1, maxAlternatives);

        let settled = false;
        let timedOut = false;
        let result: RecognizeResult | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let killTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (killTimer) clearTimeout(killTimer);
            timer = null;
            killTimer = null;
            signal?.removeEventListener("abort", onAbort);
            rec.onresult = null;
            rec.onerror = null;
            rec.onend = null;
        };
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };
        const fail = (err: AsrError) => settle(() => reject(err));
        const safeAbort = () => {
            try {
                rec.abort();
            } catch {
                /* recognizer đã dừng rồi */
            }
        };
        const onAbort = () => {
            fail(new AsrError("aborted"));
            safeAbort();
        };

        rec.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                const alts: string[] = [];
                for (let j = 0; j < r.length; j++) {
                    const text = r[j].transcript.trim();
                    if (text && !alts.includes(text)) alts.push(text);
                }
                if (r.isFinal) {
                    const conf = r.length > 0 ? r[0].confidence : NaN;
                    result = { transcripts: alts, confidence: Number.isFinite(conf) && conf > 0 ? conf : null };
                } else if (onInterim && alts.length > 0) {
                    onInterim(alts[0]);
                }
            }
        };
        rec.onerror = (e) => fail(toAsrError(e.error));
        rec.onend = () => {
            // Trình duyệt luôn bắn "end" sau result/error. Tới đây mà không có kết quả cuối
            // (vd. Safari dừng im lặng) thì coi như không nghe thấy gì / hết giờ.
            if (result && result.transcripts.length > 0) {
                const done = result;
                settle(() => resolve(done));
            } else {
                fail(new AsrError(timedOut ? "timeout" : "no-speech"));
            }
        };

        timer = setTimeout(() => {
            timedOut = true;
            // stop() cho trình duyệt cơ hội chốt câu đang nói dở; nếu vẫn không "end" thì ép abort.
            try {
                rec.stop();
            } catch {
                safeAbort();
            }
            killTimer = setTimeout(() => {
                fail(new AsrError("timeout"));
                safeAbort();
            }, 1500);
        }, timeoutMs);
        signal?.addEventListener("abort", onAbort);

        try {
            rec.start();
        } catch {
            // start() ném khi một recognizer khác đang chạy trong cùng tab.
            fail(new AsrError("unknown", "Đang có một lượt ghi âm khác. Hãy đợi xong rồi thử lại."));
        }
    });
