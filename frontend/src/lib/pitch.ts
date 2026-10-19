// Luyện trọng âm cao thấp (E4): ước lượng cao độ (F0) ngay trong trình duyệt bằng WebAudio,
// lượng tử hoá thành H/L theo mora rồi so với mẫu trọng âm chuẩn. Âm thanh không rời trình duyệt.
//
// Phần THUẦN (estimateF0, quantizeHL, referenceHL, pitchScore...) không đụng DOM -> chạy được trong
// scripts/selfCheck.ts. Phần TRÌNH DUYỆT (recordPitchContour) chỉ chạm navigator / AudioContext khi
// được gọi, không bao giờ lúc import.

export interface PitchPoint {
    /** Giây kể từ lúc bắt đầu ghi. */
    t: number;
    /** Hz; null = khung không có giọng (im lặng / vô thanh). */
    f0: number | null;
}

export type PitchLevel = "H" | "L";

export interface F0Options {
    /** Dải F0 giọng người: mặc định 70–500 Hz. */
    minHz?: number;
    maxHz?: number;
    /** Ngưỡng RMS dưới đó coi là im lặng. Mặc định 0.01 (~ -40 dBFS). */
    rmsGate?: number;
    /** Tương quan chuẩn hoá tối thiểu để coi là có thanh. Mặc định 0.5. */
    minCorr?: number;
}

/** RMS của một khung tín hiệu (0–1 với float PCM). */
export const rmsOf = (frame: Float32Array): number => {
    if (frame.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    return Math.sqrt(sum / frame.length);
};

/**
 * F0 của một khung bằng tự tương quan chuẩn hoá: cổng RMS -> tìm đỉnh tương quan trong dải lag
 * [sr/maxHz, sr/minHz] -> chọn đỉnh cục bộ ĐẦU TIÊN gần bằng đỉnh toàn cục (tránh lỗi hạ một quãng
 * tám) -> nội suy parabol quanh đỉnh để ra lag lẻ. null = không có thanh.
 */
export const estimateF0 = (frame: Float32Array, sampleRate: number, opts: F0Options = {}): number | null => {
    const { minHz = 70, maxHz = 500, rmsGate = 0.01, minCorr = 0.5 } = opts;
    const n = frame.length;
    if (n < 64 || sampleRate <= 0 || minHz <= 0 || maxHz <= minHz) return null;
    if (rmsOf(frame) < rmsGate) return null;

    // Bỏ thành phần một chiều (offset micro) để tương quan không bị kéo lệch.
    let mean = 0;
    for (let i = 0; i < n; i++) mean += frame[i];
    mean /= n;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = frame[i] - mean;

    const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
    const maxLag = Math.min(Math.ceil(sampleRate / minHz), n - 2);
    if (minLag >= maxLag) return null;

    // Quét rộng thêm một lag ở mỗi biên: để biết đỉnh nằm đúng biên là đỉnh thật hay chỉ là sườn dốc
    // của một chu kỳ ngoài dải (ù điện 50/60 Hz tương quan cao ở lag nhỏ nhưng chưa phải cực đại).
    const loLag = minLag - 1;
    const corr = new Float32Array(maxLag + 2);
    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = loLag; lag <= maxLag + 1 && lag < n - 1; lag++) {
        let num = 0;
        let e1 = 0;
        let e2 = 0;
        for (let i = 0; i + lag < n; i++) {
            const a = x[i];
            const b = x[i + lag];
            num += a * b;
            e1 += a * a;
            e2 += b * b;
        }
        const c = num / Math.sqrt(e1 * e2 + 1e-12);
        corr[lag] = c;
        if (lag >= minLag && lag <= maxLag && c > bestCorr) {
            bestCorr = c;
            bestLag = lag;
        }
    }
    if (bestLag < 0 || bestCorr < minCorr) return null;
    // Đỉnh phải là cực đại cục bộ thật sự; nếu tương quan còn đang tăng khi chạm biên dải tìm kiếm thì
    // chu kỳ thật nằm ngoài [minHz, maxHz] (ù, rung nền) -> không phải giọng.
    if (corr[bestLag] < corr[bestLag - 1] || corr[bestLag] < corr[bestLag + 1]) return null;

    // Đỉnh cục bộ đầu tiên đạt >= 85% đỉnh toàn cục: giọng nói có hoạ âm nên lag gấp đôi cũng
    // tương quan cao; lấy đỉnh sớm nhất giữ đúng F0 thay vì rơi xuống một quãng tám.
    let lag = bestLag;
    const floor = bestCorr * 0.85;
    for (let l = minLag; l < bestLag; l++) {
        if (corr[l] >= floor && corr[l] >= corr[l - 1] && corr[l] >= corr[l + 1]) {
            lag = l;
            break;
        }
    }

    let refined = lag;
    if (lag > loLag && lag + 1 < corr.length) {
        const y0 = corr[lag - 1];
        const y1 = corr[lag];
        const y2 = corr[lag + 1];
        const denom = y0 - 2 * y1 + y2;
        if (denom !== 0) {
            const delta = (0.5 * (y0 - y2)) / denom;
            if (Number.isFinite(delta) && Math.abs(delta) <= 1) refined = lag + delta;
        }
    }
    return sampleRate / refined;
};

/** Hz -> nửa cung so với refHz (dương = cao hơn). */
export const toSemitones = (f0: number, refHz: number): number => 12 * Math.log2(f0 / refHz);

/** Trung vị; mảng rỗng -> null. */
export const medianOf = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Làm mượt đường F0: lọc trung vị trượt (cửa sổ `window` điểm, chỉ tính điểm có thanh) để bỏ
 * nhảy quãng tám / tiếng lách cách; điểm có thanh đứng một mình giữa hai điểm câm bị coi là nhiễu.
 */
export const smoothContour = (points: PitchPoint[], window = 5): PitchPoint[] => {
    const half = Math.max(1, Math.floor(window / 2));
    return points.map((p, i) => {
        if (p.f0 === null) return { t: p.t, f0: null };
        const prevVoiced = i > 0 && points[i - 1].f0 !== null;
        const nextVoiced = i + 1 < points.length && points[i + 1].f0 !== null;
        if (!prevVoiced && !nextVoiced && points.length > 1) return { t: p.t, f0: null };
        const neigh: number[] = [];
        for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
            const f = points[j].f0;
            if (f !== null) neigh.push(f);
        }
        return { t: p.t, f0: medianOf(neigh) ?? p.f0 };
    });
};

/** Mức của một mora; null = ô không có mẫu có thanh (っ, nguyên âm vô thanh hoá, ngắt hơi). */
export type MoraLevel = PitchLevel | null;

export interface QuantizeOptions {
    /**
     * Biến đổi nhỏ hơn ngưỡng này (nửa cung) không được coi là lên / xuống giọng. Mặc định 1 nửa cung:
     * đủ lớn để bỏ qua nhiễu ước lượng F0 và độ trôi xuống tự nhiên trong một mora, đủ nhỏ để bắt
     * được bước lên đầu từ của heiban (thường 2–4 nửa cung).
     */
    deadbandSt?: number;
}

const meanOf = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

/**
 * Chia các mẫu có thanh thành `moraCount` ô thời gian bằng nhau rồi gán H/L cho từng ô theo BIẾN ĐỔI
 * giữa các mora (không so với trung vị hay trung điểm toàn bài):
 *  - Mora đầu: "H" nếu biến đổi đáng kể đầu tiên so với nó là đi XUỐNG (atamadaka), ngược lại "L"
 *    (kể cả khi không có biến đổi nào: giọng đều -> toàn "L").
 *  - Các mora sau giữ mức cho tới khi lệch >= deadbandSt so với mora lúc đổi mức gần nhất: lên -> "H",
 *    xuống -> "L". So với mốc đổi mức (không phải mora liền trước) nên dốc thoải qua nhiều mora vẫn tính.
 * Vì sao không so với trung vị: bên nào nhiều mora hơn (LHH, HLL, LHLL...) nằm đúng trung vị và sụp
 * về mức của mora đầu. Vì sao không so với trung điểm min/max: nakadaka thường hạ sau hạt nhân sâu
 * hơn bước lên đầu từ (たまご ≈ 0 / +2.5 / -3 nửa cung) nên mora đầu bị đẩy lên trên trung điểm -> HHL.
 *
 * Ô không có mẫu có thanh -> null (không bịa mức): っ, す/し vô thanh hoá không thể có thanh, để
 * pitchScore bỏ qua thay vì chấm sai. Từ 1 mora không có mora khác để so nên dùng dốc trong mora:
 * nửa sau thấp hơn nửa đầu >= deadbandSt -> "H" (kiểu 1: 木, 目 hạ giọng), ngược lại "L" (kiểu 0: 日, 気).
 * Không có mẫu có thanh hoặc moraCount <= 0 -> [].
 */
export const quantizeHL = (contour: PitchPoint[], moraCount: number, opts: QuantizeOptions = {}): MoraLevel[] => {
    const { deadbandSt = 1 } = opts;
    const voiced = contour.filter((p): p is { t: number; f0: number } => p.f0 !== null && p.f0 > 0);
    if (voiced.length === 0 || moraCount <= 0) return [];
    const ref = medianOf(voiced.map((p) => p.f0))!;
    const st = voiced.map((p) => ({ t: p.t, st: toSemitones(p.f0, ref) }));

    if (moraCount === 1) {
        const half = st.length >> 1;
        if (half === 0) return ["L"];
        const fall = meanOf(st.slice(0, half).map((p) => p.st)) - meanOf(st.slice(st.length - half).map((p) => p.st));
        return [fall >= deadbandSt ? "H" : "L"];
    }

    const t0 = st[0].t;
    const span = st[st.length - 1].t - t0;
    const sums = new Array<number>(moraCount).fill(0);
    const counts = new Array<number>(moraCount).fill(0);
    for (const p of st) {
        const bin = span > 0 ? Math.min(moraCount - 1, Math.floor(((p.t - t0) / span) * moraCount)) : 0;
        sums[bin] += p.st;
        counts[bin] += 1;
    }
    // Nửa cung trung bình của từng ô có mẫu; ô trống bị bỏ qua (giữ null ở kết quả).
    const bins: Array<{ i: number; m: number }> = [];
    for (let i = 0; i < moraCount; i++) if (counts[i] > 0) bins.push({ i, m: sums[i] / counts[i] });

    const first = bins[0].m;
    let level: PitchLevel = "L";
    for (const b of bins) {
        const d = b.m - first;
        if (Math.abs(d) >= deadbandSt) {
            level = d < 0 ? "H" : "L";
            break;
        }
    }
    let anchor = first;
    const levels: MoraLevel[] = new Array<MoraLevel>(moraCount).fill(null);
    for (const b of bins) {
        if (level === "L" && b.m - anchor >= deadbandSt) {
            level = "H";
            anchor = b.m;
        } else if (level === "H" && anchor - b.m >= deadbandSt) {
            level = "L";
            anchor = b.m;
        }
        levels[b.i] = level;
    }
    return levels;
};

/**
 * Mẫu trọng âm chuẩn theo quy tắc tiếng Nhật chuẩn (Tokyo):
 *  - type 0 (heiban):   L H H H…            (hạ ở trợ từ: ngoài phạm vi từ)
 *  - type 1 (atamadaka): H L L L…
 *  - type n, 1 < n < số mora (nakadaka): L H…H (đến mora n) rồi L
 *  - type n == số mora (odaka): L H…H      (hạ ở trợ từ sau từ)
 * accentType ngoài [0, moraCount] được kẹp vào dải.
 */
export const referenceHL = (moraCount: number, accentType: number): PitchLevel[] => {
    if (moraCount <= 0) return [];
    const a = Math.max(0, Math.min(Math.floor(accentType), moraCount));
    const out: PitchLevel[] = [];
    for (let m = 1; m <= moraCount; m++) {
        if (a === 0) out.push(m === 1 ? "L" : "H");
        else if (a === 1) out.push(m === 1 ? "H" : "L");
        else out.push(m === 1 ? "L" : m <= a ? "H" : "L");
    }
    return out;
};

export interface PitchScore {
    /** % mora CÓ THANH trùng mức H/L với mẫu (mora null không có thanh không tính vào mẫu số). */
    pct: number;
    /** Chỉ số (0-based) các mora sai mức, hoặc thiếu khi người học nói ngắn hơn mẫu. */
    wrongMora: number[];
}

/**
 * Mora null (っ, nguyên âm vô thanh hoá...) bị loại khỏi cả tử lẫn mẫu số: người học không thể làm nó
 * có thanh nên không được chấm sai. Mora thiếu (undefined, nói ngắn hơn mẫu) vẫn tính là sai.
 */
export const pitchScore = (userHL: readonly MoraLevel[], refHL: readonly PitchLevel[]): PitchScore => {
    if (refHL.length === 0) return { pct: 0, wrongMora: [] };
    const wrongMora: number[] = [];
    let scored = 0;
    for (let i = 0; i < refHL.length; i++) {
        const u = userHL[i];
        if (u === null) continue;
        scored += 1;
        if (u !== refHL[i]) wrongMora.push(i);
    }
    if (scored === 0) return { pct: 0, wrongMora };
    return { pct: Math.round(((scored - wrongMora.length) / scored) * 100), wrongMora };
};

export interface SvgPoint {
    x: number;
    y: number;
}

/**
 * Đường F0 (nửa cung so với trung vị) -> toạ độ SVG trong hộp width x height có lề `pad`.
 * Trục dọc: ±rangeSt nửa cung quanh trung vị (mặc định 6 = nửa quãng tám mỗi chiều).
 * Điểm câm bị bỏ -> vẽ polyline sẽ nối hai bên qua chỗ ngắt.
 */
export const contourToSvgPoints = (
    contour: PitchPoint[],
    width: number,
    height: number,
    pad = 8,
    rangeSt = 6
): SvgPoint[] => {
    const voiced = contour.filter((p): p is { t: number; f0: number } => p.f0 !== null && p.f0 > 0);
    if (voiced.length === 0) return [];
    const ref = medianOf(voiced.map((p) => p.f0))!;
    const t0 = voiced[0].t;
    const span = voiced[voiced.length - 1].t - t0;
    const innerW = Math.max(1, width - 2 * pad);
    const innerH = Math.max(1, height - 2 * pad);
    return voiced.map((p) => {
        const st = Math.max(-rangeSt, Math.min(rangeSt, toSemitones(p.f0, ref)));
        return {
            x: pad + (span > 0 ? ((p.t - t0) / span) * innerW : innerW / 2),
            y: pad + ((rangeSt - st) / (2 * rangeSt)) * innerH,
        };
    });
};

/** Mẫu H/L -> đường bậc thang: mỗi mora một đoạn ngang ở mức cao (H) hoặc thấp (L). */
export const hlToSvgPoints = (levels: PitchLevel[], width: number, height: number, pad = 8): SvgPoint[] => {
    if (levels.length === 0) return [];
    const innerW = Math.max(1, width - 2 * pad);
    const innerH = Math.max(1, height - 2 * pad);
    const yFor = (l: PitchLevel) => pad + (l === "H" ? innerH * 0.25 : innerH * 0.75);
    const step = innerW / levels.length;
    const pts: SvgPoint[] = [];
    levels.forEach((l, i) => {
        pts.push({ x: pad + i * step, y: yFor(l) });
        pts.push({ x: pad + (i + 1) * step, y: yFor(l) });
    });
    return pts;
};

/** Chuỗi cho thuộc tính `points` của <polyline>. */
export const svgPointsAttr = (pts: SvgPoint[]): string => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

// ---------------------------------------------------------------------------------------------
// Phần TRÌNH DUYỆT
// ---------------------------------------------------------------------------------------------

export type PitchRecordErrorCode = "not-supported" | "not-allowed" | "audio-capture" | "aborted" | "unknown";

const RECORD_MESSAGES: Record<PitchRecordErrorCode, string> = {
    "not-supported": "Trình duyệt này không hỗ trợ ghi âm từ micro (cần Chrome, Edge, Firefox hoặc Safari mới).",
    "not-allowed": "Bạn chưa cho phép dùng micro. Hãy bật quyền micro cho trang này rồi thử lại.",
    "audio-capture": "Không tìm thấy hoặc không mở được micro. Hãy kiểm tra thiết bị thu âm.",
    aborted: "Đã dừng ghi âm.",
    unknown: "Không ghi âm được. Hãy thử lại.",
};

export class PitchRecordError extends Error {
    readonly code: PitchRecordErrorCode;

    constructor(code: PitchRecordErrorCode, message: string = RECORD_MESSAGES[code]) {
        super(message);
        this.name = "PitchRecordError";
        this.code = code;
    }
}

type AudioContextCtor = new () => AudioContext;

const getAudioContextCtor = (): AudioContextCtor | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
};

export const canRecordPitch: boolean =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    getAudioContextCtor() !== null;

const toRecordError = (err: unknown): PitchRecordError => {
    if (err instanceof PitchRecordError) return err;
    const name = err instanceof DOMException ? err.name : "";
    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
        case "PermissionDeniedError":
            return new PitchRecordError("not-allowed");
        case "NotFoundError":
        case "NotReadableError":
        case "OverconstrainedError":
        case "DevicesNotFoundError":
            return new PitchRecordError("audio-capture");
        case "AbortError":
            return new PitchRecordError("aborted");
        case "NotSupportedError":
            return new PitchRecordError("not-supported");
        default:
            return new PitchRecordError("unknown");
    }
};

/**
 * Chờ `p` nhưng bỏ cuộc ngay khi `signal` huỷ. Phải kiểm tra `aborted` trước vì addEventListener
 * trên một signal đã huỷ sẽ không bao giờ bắn.
 */
const raceAbort = <T>(p: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return p;
    if (signal.aborted) return Promise.reject(new PitchRecordError("aborted"));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new PitchRecordError("aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
};

export interface RecordPitchOptions {
    /** Thời lượng ghi. Mặc định 3 giây. */
    seconds?: number;
    /** Mức âm lượng tức thời 0–1 (RMS) để vẽ thanh mức. */
    onLevel?: (level: number) => void;
    /** Số giây đã ghi, để hiện đếm ngược. */
    onProgress?: (elapsedSec: number) => void;
    /** Huỷ từ bên ngoài (unmount, bấm Dừng) -> reject PitchRecordError("aborted"). */
    signal?: AbortSignal;
    /** Chu kỳ lấy mẫu F0. Mặc định 20 ms. */
    intervalMs?: number;
}

/**
 * Ghi `seconds` giây từ micro và trả về đường F0 theo thời gian (mỗi ~20 ms một điểm).
 * Luôn tắt track micro và đóng AudioContext khi xong / lỗi / huỷ.
 */
export const recordPitchContour = async ({
    seconds = 3,
    onLevel,
    onProgress,
    signal,
    intervalMs = 20,
}: RecordPitchOptions = {}): Promise<PitchPoint[]> => {
    const Ctx = getAudioContextCtor();
    if (!canRecordPitch || !Ctx) throw new PitchRecordError("not-supported");
    if (signal?.aborted) throw new PitchRecordError("aborted");

    // Mọi tài nguyên khai báo trước try để finally luôn dọn được dù lỗi xảy ra ở bước nào.
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    try {
        // Tạo AudioContext TRƯỚC await đầu tiên: vẫn còn trong cử chỉ bấm nút nên context ở trạng thái
        // "running", không cần resume() (iOS Safari coi cử chỉ đã hết hạn sau hộp thoại xin quyền micro
        // và resume() khi đó treo mãi). Constructor ném lỗi (giới hạn số context, iframe sandbox) cũng
        // được chuyển thành PitchRecordError tiếng Việt thay vì DOMException thô.
        ctx = new Ctx();
        // Tắt khử ồn / tự chỉnh gain: chúng bóp méo hoạ âm làm ước lượng F0 kém đi.
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        });
        if (signal?.aborted) throw new PitchRecordError("aborted");
        // Phòng khi trình duyệt vẫn khoá context: đua resume() với tín hiệu huỷ để Dừng / unmount
        // không bị kẹt chờ một promise có thể không bao giờ xong.
        if (ctx.state === "suspended") await raceAbort(ctx.resume(), signal);
        source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);

        const buf = new Float32Array(analyser.fftSize);
        const points: PitchPoint[] = [];
        const sampleRate = ctx.sampleRate;
        const t0 = performance.now();

        await new Promise<void>((resolve, reject) => {
            let done = false;
            const finish = (err?: PitchRecordError) => {
                if (done) return;
                done = true;
                clearInterval(id);
                signal?.removeEventListener("abort", onAbort);
                if (err) reject(err);
                else resolve();
            };
            const onAbort = () => finish(new PitchRecordError("aborted"));
            const tick = () => {
                analyser.getFloatTimeDomainData(buf);
                const t = (performance.now() - t0) / 1000;
                points.push({ t, f0: estimateF0(buf, sampleRate) });
                onLevel?.(Math.min(1, rmsOf(buf)));
                onProgress?.(Math.min(seconds, t));
                if (t >= seconds) finish();
            };
            const id = setInterval(tick, Math.max(5, intervalMs));
            signal?.addEventListener("abort", onAbort);
            // Huỷ có thể đã xảy ra trong lúc await resume(): listener gắn muộn sẽ không bắn.
            if (signal?.aborted) onAbort();
        });
        return points;
    } catch (err) {
        throw toRecordError(err);
    } finally {
        if (stream) for (const track of stream.getTracks()) track.stop();
        try {
            source?.disconnect();
        } catch {
            /* đã ngắt */
        }
        await ctx?.close().catch(() => {
            /* context đã đóng */
        });
    }
};
