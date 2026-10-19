import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { canSpeak, hasJaVoice, speakJa, stopSpeaking, waitForVoices } from "@/lib/speech";
import { ASR_MESSAGES, AsrError, canRecognize, recognizeOnce } from "@/lib/asr";
import { moraSplit, pronunciationScore } from "@/lib/kana";
import {
    PitchRecordError,
    canRecordPitch,
    contourToSvgPoints,
    hlToSvgPoints,
    pitchScore,
    quantizeHL,
    recordPitchContour,
    referenceHL,
    smoothContour,
    svgPointsAttr,
    type MoraLevel,
    type PitchLevel,
    type PitchPoint,
    type PitchScore,
} from "@/lib/pitch";
import { SERVER_PENDING_MESSAGE, httpStatusOf } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchPitchReference, logPronunciation, scorePitch } from "@/services/practiceService";
import type { ServerPitchScore } from "@/types/practice.types";

// Luyện phát âm (E3) + luyện trọng âm cao thấp (E4): TTS / nhận dạng giọng nói = Web Speech API, cao độ = WebAudio,
// chấm ngay trong trình duyệt. Âm thanh không bao giờ gửi lên server — chỉ gửi điểm + bản nhận dạng (phát âm) hoặc
// đường cao độ đã tách (trọng âm) để máy chủ chấm lại / ghi nhật ký luyện tập (hợp đồng API đợt 2 §2). Máy chủ lỗi
// thì điểm của trình duyệt vẫn giữ nguyên. Kết quả chấm vẫn đẩy ra qua onResult như trước.

export interface PracticeResult {
    kind: "speak" | "pitch";
    /** 0–100. */
    score: number;
    /** Dữ liệu kèm theo để lưu / phân tích (transcripts, H/L từng mora, ...). */
    detail: Record<string, unknown>;
}

export interface PronunciationPanelProps {
    term: string;
    reading?: string | null;
    /**
     * Kiểu trọng âm Tokyo: 0 = heiban, 1 = atamadaka, n = hạ sau mora n. null = chưa có dữ liệu (không tải);
     * bỏ trống = tự tra GET /practice/pitch/reference (404 -> như null).
     */
    accentType?: number | null;
    /** Thẻ đang luyện, gửi kèm nhật ký luyện tập. */
    cardId?: string | null;
    onResult?: (r: PracticeResult) => void;
}

/** Trạng thái gửi kết quả lên máy chủ: luôn là phụ — lỗi chỉ báo nhẹ, không xoá điểm của trình duyệt. */
type ServerSync =
    | { state: "saving" }
    | { state: "saved" }
    | { state: "pending" }
    | { state: "error"; text: string };

type ServerPitch = ServerSync | { state: "scored"; result: ServerPitchScore };

const syncFromError = (err: unknown): ServerSync => {
    const text = extractErrorMessage(err);
    return text === SERVER_PENDING_MESSAGE ? { state: "pending" } : { state: "error", text };
};

interface AsrOutcome {
    best: string;
    pct: number;
    transcripts: string[];
}

interface PitchOutcome {
    contour: PitchPoint[];
    /** null = mora không có thanh (っ, vô thanh hoá): không chấm. */
    userHL: MoraLevel[];
    refHL: PitchLevel[] | null;
    score: PitchScore | null;
}

const RECORD_SECONDS = 3;
const SVG_W = 320;
const SVG_H = 120;

type Tone = "good" | "ok" | "poor";
// Ngưỡng ≥ 80 tốt, ≥ 60 tạm được: cùng thang với scoreTone của trang cá nhân.
const toneFor = (pct: number): Tone => (pct >= 80 ? "good" : pct >= 60 ? "ok" : "poor");
const TONE_BADGE: Record<Tone, string> = {
    good: "bg-secondary-fixed/60 text-on-secondary-fixed-variant",
    ok: "bg-primary-fixed text-on-primary-fixed",
    poor: "bg-error-container text-on-error-container",
};
const TONE_TEXT: Record<Tone, string> = {
    good: "text-on-secondary-fixed-variant",
    ok: "text-on-primary-fixed-variant",
    poor: "text-error",
};
const SPEAK_HINT: Record<Tone, string> = {
    good: "Phát âm rất tốt!",
    ok: "Khá ổn. Nghe lại mẫu rồi đọc chậm, rõ từng âm.",
    poor: "Chưa khớp. Hãy nghe mẫu vài lần rồi thử lại, chú ý âm dài và âm ngắt (っ).",
};
const PITCH_HINT: Record<Tone, string> = {
    good: "Trọng âm đúng mẫu!",
    ok: "Gần đúng. Chú ý các mora được đánh dấu đỏ.",
    poor: "Trọng âm chưa khớp. Nghe mẫu và bắt chước chỗ lên / xuống giọng.",
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = "text-[18px]" }) => (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
        {name}
    </span>
);

/** Dòng nhỏ báo đã lưu / chưa lưu kết quả lên máy chủ (màu trung tính: điểm trên màn hình vẫn đúng dù lưu lỗi). */
const SyncNote: React.FC<{ sync: ServerSync | null }> = ({ sync }) => {
    if (!sync) return null;
    const { icon, text } =
        sync.state === "saving"
            ? { icon: "cloud_upload", text: "Đang lưu kết quả…" }
            : sync.state === "saved"
              ? { icon: "cloud_done", text: "Đã lưu vào thống kê luyện tập." }
              : sync.state === "pending"
                ? { icon: "info", text: `${SERVER_PENDING_MESSAGE} Kết quả lần này chưa được lưu.` }
                : { icon: "cloud_off", text: `Chưa lưu được kết quả: ${sync.text}` };
    return (
        <p className="flex items-start gap-1.5 text-label-sm text-on-surface-variant">
            <Icon name={icon} className="text-[16px] shrink-0" />
            <span>{text}</span>
        </p>
    );
};

/** Kết quả máy chủ chấm trọng âm, đặt cạnh phần trình duyệt tự chấm. */
const ServerPitchNote: React.FC<{ sync: ServerPitch; moras: string[] }> = ({ sync, moras }) => {
    if (sync.state !== "scored") return <SyncNote sync={sync} />;
    const { result } = sync;
    const tone = toneFor(result.pct);
    return (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
            <p className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-headline text-title-md font-bold ${TONE_BADGE[tone]}`}>
                <span className="sr-only">Điểm máy chủ chấm: </span>
                {result.pct}%
            </p>
            <div className="min-w-0 flex flex-col gap-1">
                <p className="flex items-center gap-1.5 text-label-md font-semibold text-on-surface">
                    <Icon name="cloud_done" className="text-[16px]" />
                    Máy chủ chấm
                    {result.refHL.length > 0 && (
                        <span className="font-mono font-normal text-on-surface-variant">· mẫu {result.refHL.join("")}</span>
                    )}
                </p>
                {result.feedback && <p className="text-body-sm text-on-surface-variant break-words">{result.feedback}</p>}
                {result.wrongMora.length > 0 && (
                    <p className="text-body-sm text-on-surface-variant">
                        Mora chưa khớp:{" "}
                        <span lang="ja" className="font-japanese text-on-surface">
                            {result.wrongMora.map((i) => `${moras[i] ?? "?"} (${i + 1})`).join(" · ")}
                        </span>
                    </p>
                )}
                <p className="text-label-sm text-outline">Đã lưu vào thống kê luyện tập.</p>
            </div>
        </div>
    );
};

const SectionTitle: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
    <h3 id={id} className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wide">
        {children}
    </h3>
);

export const PronunciationPanel: React.FC<PronunciationPanelProps> = ({ term, reading, accentType, cardId = null, onResult }) => {
    // --- Nghe mẫu ---
    const [voiceReady, setVoiceReady] = useState<boolean | null>(null); // null = đang tải danh sách giọng
    const [speaking, setSpeaking] = useState(false);
    const [speakError, setSpeakError] = useState<string | null>(null);

    // --- Nhận dạng ---
    const [asrBusy, setAsrBusy] = useState(false);
    const [interim, setInterim] = useState("");
    const [asrResult, setAsrResult] = useState<AsrOutcome | null>(null);
    const [asrError, setAsrError] = useState<string | null>(null);
    const asrAbort = useRef<AbortController | null>(null);
    const [speakSync, setSpeakSync] = useState<ServerSync | null>(null);
    // Lượt gửi mới nhất: phản hồi của lượt cũ về muộn (đã ghi âm lại) thì bỏ.
    const speakSeq = useRef(0);

    // --- Trọng âm ---
    const [recBusy, setRecBusy] = useState(false);
    const [level, setLevel] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [pitchResult, setPitchResult] = useState<PitchOutcome | null>(null);
    const [pitchError, setPitchError] = useState<string | null>(null);
    const recAbort = useRef<AbortController | null>(null);
    const [serverPitch, setServerPitch] = useState<ServerPitch | null>(null);
    const pitchSeq = useRef(0);

    const mounted = useRef(true);

    const moras = useMemo(() => (reading ? moraSplit(reading) : []), [reading]);
    const moraCount = moras.length;

    // Mẫu trọng âm: prop thắng; bỏ trống thì tra máy chủ (cần cách đọc — không có thì cũng không chia được mora).
    // Kết quả gắn với khoá (từ, cách đọc) nên đổi thẻ không hiện nhầm mẫu của thẻ trước.
    const autoAccent = accentType === undefined && moraCount > 0;
    const accentKey = `${term}|${reading ?? ""}`;
    const [fetchedAccent, setFetchedAccent] = useState<{ key: string; accentType: number | null } | null>(null);
    useEffect(() => {
        if (!autoAccent || !reading) return;
        const ac = new AbortController();
        fetchPitchReference(term, reading, ac.signal)
            .then((ref) => {
                if (!ac.signal.aborted) setFetchedAccent({ key: accentKey, accentType: ref?.accentType ?? null });
            })
            .catch(() => {
                // Lỗi mạng / máy chủ: coi như chưa có mẫu, giao diện tự so đường cao độ vẫn dùng được.
                if (!ac.signal.aborted) setFetchedAccent({ key: accentKey, accentType: null });
            });
        return () => ac.abort();
    }, [autoAccent, term, reading, accentKey]);
    const accentLoading = autoAccent && fetchedAccent?.key !== accentKey;
    const effectiveAccent: number | null =
        accentType !== undefined ? accentType : fetchedAccent?.key === accentKey ? fetchedAccent.accentType : null;

    const refHL = useMemo(
        () => (effectiveAccent != null && moraCount > 0 ? referenceHL(moraCount, effectiveAccent) : null),
        [effectiveAccent, moraCount]
    );
    // Chấm theo cả cách đọc lẫn thuật ngữ: Chrome hay trả kanji ("学校") thay vì kana ("がっこう").
    const targets = useMemo(() => {
        const list = [reading ?? "", term].map((s) => s.trim()).filter(Boolean);
        return list.filter((s, i) => list.indexOf(s) === i);
    }, [term, reading]);

    useEffect(() => {
        mounted.current = true;
        void waitForVoices().then(() => {
            if (mounted.current) setVoiceReady(canSpeak && hasJaVoice());
        });
        return () => {
            mounted.current = false;
            asrAbort.current?.abort();
            recAbort.current?.abort();
            stopSpeaking();
        };
    }, []);

    const handleSpeak = async (rate: number) => {
        setSpeakError(null);
        setSpeaking(true);
        try {
            await speakJa(term, { rate });
        } catch (err) {
            if (mounted.current) setSpeakError(err instanceof Error ? err.message : "Không đọc được từ này.");
        } finally {
            if (mounted.current) setSpeaking(false);
        }
    };

    /** Ghi nhật ký phát âm (điểm do trình duyệt chấm); chạy nền, không chặn giao diện. */
    const syncSpeak = async (target: string, transcript: string, score: number) => {
        const seq = ++speakSeq.current;
        setSpeakSync({ state: "saving" });
        try {
            await logPronunciation({ cardId: cardId ?? undefined, term, target, transcript, score });
            if (mounted.current && seq === speakSeq.current) setSpeakSync({ state: "saved" });
        } catch (err) {
            if (mounted.current && seq === speakSeq.current) setSpeakSync(syncFromError(err));
        }
    };

    const handleRecognize = async () => {
        asrAbort.current?.abort();
        const ac = new AbortController();
        asrAbort.current = ac;
        speakSeq.current++;
        setAsrBusy(true);
        setAsrError(null);
        setInterim("");
        setAsrResult(null);
        setSpeakSync(null);
        try {
            const r = await recognizeOnce({
                lang: "ja-JP",
                timeoutMs: 8000,
                maxAlternatives: 3,
                signal: ac.signal,
                onInterim: (text) => {
                    if (mounted.current) setInterim(text);
                },
            });
            if (!mounted.current || ac.signal.aborted) return;
            let best = { best: "", pct: -1 };
            let target = targets[0] ?? term;
            for (const tg of targets) {
                const s = pronunciationScore(tg, r.transcripts);
                if (s.pct > best.pct) {
                    best = s;
                    target = tg;
                }
            }
            const pct = Math.max(0, best.pct);
            setAsrResult({ best: best.best, pct, transcripts: r.transcripts });
            onResult?.({
                kind: "speak",
                score: pct,
                detail: {
                    term,
                    reading: reading ?? null,
                    target,
                    best: best.best,
                    transcripts: r.transcripts,
                    confidence: r.confidence,
                },
            });
            void syncSpeak(target, best.best, pct);
        } catch (err) {
            if (!mounted.current || ac.signal.aborted) return;
            if (err instanceof AsrError && err.code === "aborted") return;
            setAsrError(err instanceof Error ? err.message : ASR_MESSAGES.unknown);
        } finally {
            if (mounted.current && asrAbort.current === ac) {
                asrAbort.current = null;
                setAsrBusy(false);
                setInterim("");
            }
        }
    };

    /**
     * Máy chủ chấm lại cùng đường cao độ (đã làm mượt, như bản trình duyệt dùng) + ghi nhật ký `pitch`. Trình duyệt chưa
     * có mẫu mà máy chủ chấm được thì điểm máy chủ là điểm duy nhất -> đẩy ra onResult thay cho điểm trình duyệt.
     */
    const syncPitch = async (contour: PitchPoint[], clientScored: boolean, voicedRatio: number) => {
        const seq = ++pitchSeq.current;
        setServerPitch({ state: "saving" });
        try {
            const result = await scorePitch({
                cardId: cardId ?? undefined,
                word: term,
                reading: reading ?? undefined,
                accentType: effectiveAccent ?? undefined,
                contour,
            });
            if (!mounted.current || seq !== pitchSeq.current) return;
            if (!result) {
                setServerPitch({ state: "error", text: "Máy chủ trả kết quả không đọc được." });
                return;
            }
            setServerPitch({ state: "scored", result });
            if (!clientScored) {
                onResult?.({
                    kind: "pitch",
                    score: result.pct,
                    detail: {
                        term,
                        reading: reading ?? null,
                        accentType: null,
                        moraCount,
                        userHL: result.userHL,
                        refHL: result.refHL,
                        wrongMora: result.wrongMora,
                        voicedRatio: result.voicedRatio ?? voicedRatio,
                        source: "server",
                    },
                });
            }
        } catch (err) {
            if (!mounted.current || seq !== pitchSeq.current) return;
            // Trình duyệt lẫn máy chủ đều không có mẫu (404 / 400 nghiệp vụ; route chưa có đã thành SERVER_PENDING_MESSAGE
            // trong practiceService): không có điểm nào để lưu, câu "chưa có dữ liệu trọng âm" phía trên là đủ.
            const status = httpStatusOf(err);
            if (!clientScored && (status === 404 || status === 400)) setServerPitch(null);
            else setServerPitch(syncFromError(err));
        }
    };

    const handleRecordPitch = async () => {
        if (moraCount === 0) return;
        recAbort.current?.abort();
        const ac = new AbortController();
        recAbort.current = ac;
        pitchSeq.current++;
        setRecBusy(true);
        setLevel(0);
        setElapsed(0);
        setPitchError(null);
        setPitchResult(null);
        setServerPitch(null);
        try {
            const raw = await recordPitchContour({
                seconds: RECORD_SECONDS,
                signal: ac.signal,
                onLevel: (l) => {
                    if (mounted.current) setLevel(l);
                },
                onProgress: (s) => {
                    if (mounted.current) setElapsed(s);
                },
            });
            if (!mounted.current || ac.signal.aborted) return;
            const contour = smoothContour(raw, 5);
            const voiced = contour.filter((p) => p.f0 !== null).length;
            // Dưới ~0.1 s có thanh thì không đủ để chia mora: thường là chưa nói hoặc micro quá nhỏ.
            if (voiced < 5) {
                setPitchError("Không bắt được cao độ giọng nói. Hãy nói to, rõ hơn, sát micro và thử lại.");
                return;
            }
            const userHL = quantizeHL(contour, moraCount);
            const score = refHL ? pitchScore(userHL, refHL) : null;
            setPitchResult({ contour, userHL, refHL, score });
            const voicedRatio = contour.length > 0 ? voiced / contour.length : 0;
            // Không có mẫu chuẩn thì trình duyệt không có điểm; máy chủ có thể vẫn chấm được (xem syncPitch).
            if (score) {
                onResult?.({
                    kind: "pitch",
                    score: score.pct,
                    detail: {
                        term,
                        reading: reading ?? null,
                        accentType: effectiveAccent,
                        moraCount,
                        userHL,
                        refHL,
                        wrongMora: score.wrongMora,
                        voicedRatio,
                    },
                });
            }
            void syncPitch(contour, score !== null, voicedRatio);
        } catch (err) {
            if (!mounted.current || ac.signal.aborted) return;
            if (err instanceof PitchRecordError && err.code === "aborted") return;
            setPitchError(err instanceof Error ? err.message : "Không ghi âm được. Hãy thử lại.");
        } finally {
            if (mounted.current && recAbort.current === ac) {
                recAbort.current = null;
                setRecBusy(false);
                setLevel(0);
            }
        }
    };

    const voiceHint = !canSpeak
        ? "Trình duyệt này không hỗ trợ đọc văn bản."
        : voiceReady === null
          ? "Đang tải giọng đọc…"
          : voiceReady === false
            ? "Thiết bị chưa có giọng đọc tiếng Nhật. Hãy cài gói giọng Nhật trong hệ điều hành hoặc dùng Chrome / Edge."
            : null;
    const speakDisabled = voiceReady !== true;

    const asrTone = asrResult ? toneFor(asrResult.pct) : null;
    const pitchTone = pitchResult?.score ? toneFor(pitchResult.score.pct) : null;
    const levelPct = Math.min(100, Math.round(level * 300)); // RMS ~0.33 đã là nói to -> đầy thanh
    const remaining = Math.max(0, Math.ceil(RECORD_SECONDS - elapsed));

    const userPts = pitchResult ? contourToSvgPoints(pitchResult.contour, SVG_W, SVG_H) : [];
    const refPts = pitchResult?.refHL ? hlToSvgPoints(pitchResult.refHL, SVG_W, SVG_H) : [];

    return (
        <div className="flex flex-col gap-6">
            {/* (a) Nghe mẫu */}
            <section aria-labelledby="pp-listen" className="flex flex-col gap-2">
                <SectionTitle id="pp-listen">1. Nghe mẫu</SectionTitle>
                <div className="flex flex-wrap items-center gap-3">
                    <span lang="ja" className="font-japanese text-headline-md text-on-surface">
                        <Ruby term={term} reading={reading ?? undefined} />
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="md"
                            onClick={() => void handleSpeak(1)}
                            disabled={speakDisabled}
                            isLoading={speaking}
                            title={voiceHint ?? "Đọc mẫu bằng giọng tiếng Nhật của máy"}
                        >
                            <Icon name="volume_up" />
                            Nghe mẫu
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            onClick={() => void handleSpeak(0.7)}
                            disabled={speakDisabled || speaking}
                            title={voiceHint ?? "Đọc chậm để nghe rõ từng âm"}
                        >
                            <Icon name="slow_motion_video" />
                            Nghe chậm
                        </Button>
                    </div>
                </div>
                <p aria-live="polite" className={`text-body-sm ${speakError ? "text-error" : "text-on-surface-variant"}`}>
                    {speakError ?? voiceHint ?? ""}
                </p>
            </section>

            {/* (b) Ghi âm & chấm phát âm */}
            <section aria-labelledby="pp-asr" className="flex flex-col gap-2">
                <SectionTitle id="pp-asr">2. Ghi âm &amp; chấm phát âm</SectionTitle>
                {!canRecognize ? (
                    <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                        <Icon name="info" className="text-[18px] mt-0.5 shrink-0" />
                        Trình duyệt này không hỗ trợ nhận dạng giọng nói, hãy dùng Chrome hoặc Edge.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Một nút duy nhất đổi nhãn Ghi âm <-> Dừng (không phải hai nút thay nhau): phần tử giữ
                                nguyên nên tiêu điểm bàn phím / trình đọc màn hình không rơi khỏi nút khi bắt đầu hay kết thúc ghi. */}
                            <Button
                                type="button"
                                variant={asrBusy ? "danger" : "primary"}
                                size="md"
                                onClick={() => {
                                    if (asrBusy) asrAbort.current?.abort();
                                    else void handleRecognize();
                                }}
                                disabled={!asrBusy && recBusy}
                            >
                                <Icon name={asrBusy ? "stop_circle" : "mic"} />
                                {asrBusy ? "Dừng" : "Ghi âm"}
                            </Button>
                            <span className="text-body-sm text-on-surface-variant">
                                {asrBusy ? "Đang nghe… hãy đọc to: " : "Bấm rồi đọc to: "}
                                <span lang="ja" className="font-japanese font-semibold text-on-surface">
                                    {reading || term}
                                </span>
                            </span>
                        </div>
                        <div aria-live="polite" className="flex flex-col gap-2 min-h-6">
                            {asrBusy && (
                                <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                                    <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-error animate-pulse" />
                                    {interim ? (
                                        <>
                                            Đang nghe thấy:{" "}
                                            <span lang="ja" className="font-japanese text-on-surface">
                                                {interim}
                                            </span>
                                        </>
                                    ) : (
                                        "Đang nghe…"
                                    )}
                                </p>
                            )}
                            {asrError && <p className="text-body-sm text-error">{asrError}</p>}
                            {asrResult && asrTone && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
                                    {/* Nhãn ẩn thay cho aria-label: div không có vai trò nên trình đọc màn hình bỏ qua aria-label,
                                        còn chữ sr-only được đọc cả trong vùng aria-live. */}
                                    <p
                                        className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center font-headline text-headline-sm font-bold ${TONE_BADGE[asrTone]}`}
                                    >
                                        <span className="sr-only">Điểm phát âm: </span>
                                        {asrResult.pct}%
                                    </p>
                                    <div className="min-w-0 flex flex-col gap-0.5">
                                        <p className="text-body-md text-on-surface">
                                            Bạn đọc:{" "}
                                            <span lang="ja" className="font-japanese font-semibold">
                                                {asrResult.best || "—"}
                                            </span>
                                        </p>
                                        <p className="text-body-sm text-on-surface-variant">
                                            Chuẩn: <Ruby term={term} reading={reading ?? undefined} className="font-japanese" />
                                        </p>
                                        <p className={`text-body-sm ${TONE_TEXT[asrTone]}`}>{SPEAK_HINT[asrTone]}</p>
                                        {asrResult.transcripts.length > 1 && (
                                            <p className="text-label-sm text-outline">
                                                Phương án khác:{" "}
                                                <span lang="ja" className="font-japanese">
                                                    {asrResult.transcripts.filter((t) => t !== asrResult.best).join(" · ")}
                                                </span>
                                            </p>
                                        )}
                                        <SyncNote sync={speakSync} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </section>

            {/* (c) So trọng âm: cần cách đọc để biết số mora */}
            {moraCount > 0 && (
                <section aria-labelledby="pp-pitch" className="flex flex-col gap-2">
                    <SectionTitle id="pp-pitch">3. So trọng âm cao thấp</SectionTitle>
                    {!canRecordPitch ? (
                        <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                            <Icon name="info" className="text-[18px] mt-0.5 shrink-0" />
                            Trình duyệt này không hỗ trợ ghi âm từ micro, hãy dùng Chrome, Edge, Firefox hoặc Safari mới.
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Một nút duy nhất đổi nhãn (xem nút Ghi âm ở mục 2) để giữ tiêu điểm khi bắt đầu / dừng ghi. */}
                                <Button
                                    type="button"
                                    variant={recBusy ? "danger" : "primary"}
                                    size="md"
                                    onClick={() => {
                                        if (recBusy) recAbort.current?.abort();
                                        else void handleRecordPitch();
                                    }}
                                    disabled={!recBusy && asrBusy}
                                >
                                    <Icon name={recBusy ? "stop_circle" : "graphic_eq"} />
                                    {recBusy ? "Dừng" : `Ghi ${RECORD_SECONDS} giây`}
                                </Button>
                                <span className="text-body-sm text-on-surface-variant" aria-live="polite">
                                    {recBusy ? (
                                        `Đang ghi… còn ${remaining} giây`
                                    ) : (
                                        <>
                                            Bấm rồi đọc{" "}
                                            <span lang="ja" className="font-japanese font-semibold text-on-surface">
                                                {reading}
                                            </span>{" "}
                                            một lần, giọng tự nhiên.
                                        </>
                                    )}
                                </span>
                            </div>
                            <div
                                role="progressbar"
                                aria-label="Mức âm lượng micro"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={levelPct}
                                className="h-2 rounded-full bg-surface-container-high overflow-hidden"
                            >
                                <div className="h-full bg-secondary transition-[width] duration-75" style={{ width: `${levelPct}%` }} />
                            </div>

                            <div aria-live="polite" className="flex flex-col gap-3">
                                {pitchError && <p className="text-body-sm text-error">{pitchError}</p>}
                                {pitchResult && (
                                    <>
                                        <svg
                                            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                                            role="img"
                                            aria-label={
                                                pitchResult.refHL
                                                    ? "Biểu đồ cao độ: đường liền là giọng của bạn, đường đứt là mẫu chuẩn"
                                                    : "Biểu đồ cao độ giọng của bạn"
                                            }
                                            className="w-full h-auto rounded-xl bg-surface-container-low border border-surface-container-high"
                                        >
                                            {moras.map((_, i) =>
                                                i === 0 ? null : (
                                                    <line
                                                        key={i}
                                                        x1={8 + ((SVG_W - 16) / moraCount) * i}
                                                        x2={8 + ((SVG_W - 16) / moraCount) * i}
                                                        y1={8}
                                                        y2={SVG_H - 8}
                                                        stroke="currentColor"
                                                        strokeWidth={1}
                                                        className="text-outline-variant"
                                                    />
                                                )
                                            )}
                                            {refPts.length > 0 && (
                                                <polyline
                                                    points={svgPointsAttr(refPts)}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                    strokeDasharray="6 4"
                                                    className="text-outline"
                                                />
                                            )}
                                            {userPts.length > 0 && (
                                                <polyline
                                                    points={svgPointsAttr(userPts)}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth={2.5}
                                                    strokeLinejoin="round"
                                                    strokeLinecap="round"
                                                    className="text-primary"
                                                />
                                            )}
                                        </svg>
                                        <p className="flex flex-wrap items-center gap-4 text-label-sm text-on-surface-variant">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span aria-hidden="true" className="inline-block w-5 h-0.5 bg-primary rounded" />
                                                Giọng của bạn
                                            </span>
                                            {pitchResult.refHL && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-outline" />
                                                    Mẫu chuẩn (kiểu {effectiveAccent})
                                                </span>
                                            )}
                                        </p>

                                        {pitchResult.score && pitchTone ? (
                                            <div className="flex items-center gap-3">
                                                <p
                                                    className={`shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-headline text-title-md font-bold ${TONE_BADGE[pitchTone]}`}
                                                >
                                                    <span className="sr-only">Điểm trọng âm: </span>
                                                    {pitchResult.score.pct}%
                                                </p>
                                                <p className={`text-body-sm ${TONE_TEXT[pitchTone]}`}>{PITCH_HINT[pitchTone]}</p>
                                            </div>
                                        ) : (
                                            serverPitch?.state !== "scored" && (
                                                <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                                                    <Icon name="info" className="text-[18px] mt-0.5 shrink-0" />
                                                    Chưa có dữ liệu trọng âm chuẩn cho từ này. Hãy nghe mẫu rồi tự so với đường cao độ của bạn.
                                                </p>
                                            )
                                        )}

                                        {/* Điểm máy chủ đặt ngay dưới điểm trình duyệt: hai cách chấm cùng một đường cao độ. */}
                                        {serverPitch && <ServerPitchNote sync={serverPitch} moras={moras} />}
                                    </>
                                )}

                                <ol className="flex flex-wrap gap-1.5" aria-label="Mức cao (H) / thấp (L) từng mora">
                                    {moras.map((m, i) => {
                                        const u = pitchResult?.userHL[i];
                                        const r = refHL?.[i];
                                        // null = mora không có thanh (っ, vô thanh hoá): không chấm nên không tô đỏ.
                                        const wrong = r !== undefined && u != null && u !== r;
                                        const userLabel = u === undefined ? "chưa ghi" : u === null ? "không có thanh" : u;
                                        return (
                                            <li
                                                key={i}
                                                aria-label={`Mora ${i + 1} ${m}: bạn ${userLabel}${r ? `, mẫu ${r}` : ""}${wrong ? ", chưa khớp" : ""}`}
                                                className={`flex flex-col items-center min-w-[2.75rem] px-2 py-1 rounded-lg border text-center ${
                                                    wrong
                                                        ? "border-error bg-error-container/40"
                                                        : "border-surface-container-high bg-surface-container-lowest"
                                                }`}
                                            >
                                                <span lang="ja" className="font-japanese text-body-md text-on-surface">
                                                    {m}
                                                </span>
                                                <span className="font-mono text-label-sm text-on-surface" aria-hidden="true">
                                                    <span className={u ? "font-bold text-primary" : "text-outline"}>{u ?? "–"}</span>
                                                    {r && <span className="text-outline">/{r}</span>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                                <p className="text-label-sm text-outline">
                                    Mỗi ô: mức của bạn / mức chuẩn. H = cao, L = thấp, – = không bắt được thanh (ví dụ っ) nên không chấm.
                                    {accentLoading && " Đang tải mẫu trọng âm chuẩn…"}
                                </p>
                            </div>
                        </>
                    )}
                </section>
            )}
        </div>
    );
};

export default PronunciationPanel;
