import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { KanjiCanvas, type CanvasStroke } from "@/features/practice/components/KanjiCanvas";
import { MAX_SCORE_STROKES, strokeChipsFor } from "@/features/practice/practiceUtils";
import { useAsync } from "@/lib/useAsync";
import {
    normalizeGlyph,
    referenceToSvgPaths,
    resampleStroke,
    strokesToSvgPath,
    type StrokeChip,
    type StrokeScore,
    type StrokeStatus,
} from "@/lib/strokes";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchKanjiStrokes, scoreKanji } from "@/services/practiceService";

// Bảng luyện viết một chữ kanji (E2): chữ mẫu lớn, ô vẽ, kiểm tra nhanh số nét tại chỗ và chấm điểm.
// Mặc định tự nối máy chủ (hợp đồng API đợt 2 §2): bỏ trống `reference` -> tải nét mẫu KanjiVG, bỏ trống `scorer` ->
// chấm bằng POST /practice/kanji/score (máy chủ ghi luôn nhật ký luyện viết). Nơi dùng truyền prop thì prop thắng
// (vd. reference={null} = biết chắc chưa có nét mẫu, không tải). Chưa có nét mẫu thì vẫn vẽ, hoàn tác, đếm nét được;
// chỉ nút "Chấm điểm" bị khoá kèm lý do.

export interface StrokePayload {
    kanji: string;
    /** Mỗi nét 32 điểm, toạ độ chuẩn hoá 0..1 (cạnh dài = 1, cạnh ngắn căn giữa), t = ms từ lúc bắt đầu. */
    strokes: { x: number; y: number; t: number }[][];
}

export type StrokeScorer = (payload: StrokePayload) => Promise<StrokeScore | null>;

export interface KanjiWritePanelProps {
    kanji: string;
    /**
     * Nét mẫu (KanjiVG đã chuẩn hoá) [[ [x, y], ... ], ...]; null = chưa có (không tải);
     * bỏ trống = tự tải GET /practice/kanji/{ch}/strokes (404 -> như null).
     */
    reference?: number[][][] | null;
    /** Số nét chuẩn từ từ điển; null = chưa biết (sẽ lấy theo nét mẫu nếu có). */
    expectedStrokeCount?: number | null;
    /** Bỏ trống = chấm qua máy chủ (POST /practice/kanji/score). */
    scorer?: StrokeScorer;
    /** Thẻ đang luyện, gửi kèm khi chấm bằng máy chủ để nhật ký luyện tập gắn với thẻ. */
    cardId?: string | null;
    onResult?: (score: StrokeScore) => void;
}

const CANVAS_SIZE = 280;
const PREVIEW_SIZE = 96;

type Tone = "good" | "ok" | "poor";
// Cùng thang với luyện phát âm: ≥ 80 tốt, ≥ 60 tạm được.
const toneFor = (pct: number): Tone => (pct >= 80 ? "good" : pct >= 60 ? "ok" : "poor");
const TONE_BADGE: Record<Tone, string> = {
    good: "bg-secondary-fixed/60 text-on-secondary-fixed-variant",
    ok: "bg-primary-fixed text-on-primary-fixed",
    poor: "bg-error-container text-on-error-container",
};
const CHIP_CLASS: Record<StrokeStatus, string> = {
    correct: "bg-secondary-fixed/60 text-on-secondary-fixed-variant",
    inaccurate: "bg-primary-fixed text-on-primary-fixed",
    "wrong-direction": "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    "wrong-order": "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    missing: "bg-error-container text-on-error-container",
    extra: "bg-error-container text-on-error-container",
};
const CHIP_ICON: Record<StrokeStatus, string> = {
    correct: "check",
    inaccurate: "gesture",
    "wrong-direction": "swap_horiz",
    "wrong-order": "format_list_numbered",
    missing: "remove",
    extra: "add",
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = "text-[18px]" }) => (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
        {name}
    </span>
);

/** Chuẩn hoá nét người vẽ đúng như ai-service mong đợi (lấy mẫu 32 điểm rồi chuẩn hoá cả chữ). */
const toPayloadStrokes = (strokes: CanvasStroke[]): StrokePayload["strokes"] =>
    normalizeGlyph(strokes.map((s) => resampleStroke(s.points))).map((stroke) =>
        stroke.map((p) => ({ x: p.x, y: p.y, t: p.t ?? 0 }))
    );

export const KanjiWritePanel: React.FC<KanjiWritePanelProps> = ({
    kanji,
    reference,
    expectedStrokeCount = null,
    scorer,
    cardId = null,
    onResult,
}) => {
    const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
    const [showReference, setShowReference] = useState(true);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<StrokeScore | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Đổi key để dựng lại canvas (xoá nét) khi bấm "Vẽ lại".
    const [attempt, setAttempt] = useState(0);
    // Lượt chấm mới nhất: kết quả của lượt cũ về muộn (người dùng đã vẽ lại) thì bỏ.
    const scoreSeq = useRef(0);

    // Chỉ tự tải khi nơi dùng không truyền `reference` (undefined); dữ liệu gắn với chữ nên đổi chữ là tải lại.
    const autoReference = reference === undefined;
    const {
        data: fetched,
        loading: fetchingRef,
        error: fetchError,
    } = useAsync(() => (autoReference ? fetchKanjiStrokes(kanji) : Promise.resolve(null)), [kanji, autoReference]);
    const refLoading = autoReference && fetchingRef;
    const activeReference: number[][][] | null = autoReference ? (fetched?.strokes ?? null) : reference;

    // Scorer mặc định gọi máy chủ; giữ cùng tham chiếu giữa các lần render (chỉ đổi theo thẻ).
    const serverScorer = useCallback<StrokeScorer>((payload) => scoreKanji({ ...payload, cardId: cardId ?? undefined }), [cardId]);
    const activeScorer = scorer ?? serverScorer;

    const hasReference = activeReference !== null && activeReference.length > 0;
    const expected = expectedStrokeCount ?? fetched?.strokeCount ?? (hasReference ? activeReference.length : null);
    const drawn = strokes.length;

    const scoreHint = refLoading
        ? "Đang tải nét mẫu…"
        : !hasReference
          ? "Chưa có dữ liệu nét mẫu cho chữ này"
          : drawn === 0
            ? "Hãy vẽ ít nhất một nét"
            : drawn > MAX_SCORE_STROKES
              ? `Mỗi lần chấm tối đa ${MAX_SCORE_STROKES} nét, hãy vẽ lại`
              : null;

    const chips: StrokeChip[] = useMemo(() => (result ? strokeChipsFor(result, expected) : []), [result, expected]);
    const previewUser = useMemo(() => (result ? strokesToSvgPath(normalizeGlyph(strokes.map((s) => s.points)), PREVIEW_SIZE) : ""), [result, strokes]);
    const previewRef = useMemo(
        () => (activeReference && activeReference.length > 0 ? referenceToSvgPaths(activeReference, PREVIEW_SIZE) : []),
        [activeReference]
    );

    const handleStrokes = (next: CanvasStroke[]) => {
        setStrokes(next);
        // Nét đổi thì kết quả cũ không còn đúng với hình đang hiện.
        setResult(null);
        setError(null);
    };

    const handleScore = async () => {
        if (scoreHint !== null) return;
        const seq = ++scoreSeq.current;
        setBusy(true);
        setError(null);
        try {
            const score = await activeScorer({ kanji, strokes: toPayloadStrokes(strokes) });
            if (seq !== scoreSeq.current) return;
            if (!score) {
                setError("Máy chủ chưa chấm được chữ này. Hãy thử lại sau.");
                return;
            }
            setResult(score);
            onResult?.(score);
        } catch (err) {
            if (seq !== scoreSeq.current) return;
            // extractErrorMessage đọc cả body lỗi của máy chủ lẫn Error thường của scorer tự tiêm.
            setError(extractErrorMessage(err) || "Không chấm được, hãy thử lại.");
        } finally {
            if (seq === scoreSeq.current) setBusy(false);
        }
    };

    const handleRetry = () => {
        scoreSeq.current++;
        setBusy(false);
        setStrokes([]);
        setResult(null);
        setError(null);
        setAttempt((n) => n + 1);
    };

    // Kiểm tra nhanh tại chỗ: chỉ so số nét, không cần máy chủ.
    const precheck =
        drawn === 0
            ? null
            : expected === null
              ? { tone: "ok" as Tone, text: `Bạn vẽ ${drawn} nét (chưa có số nét chuẩn của chữ này để so).` }
              : drawn === expected
                ? { tone: "good" as Tone, text: `Bạn vẽ ${drawn} nét, chữ này có ${expected} nét: đủ số nét.` }
                : {
                      tone: "poor" as Tone,
                      text: `Bạn vẽ ${drawn} nét, chữ này có ${expected} nét: ${drawn < expected ? `thiếu ${expected - drawn}` : `thừa ${drawn - expected}`} nét.`,
                  };
    const PRECHECK_TEXT: Record<Tone, string> = {
        good: "text-on-secondary-fixed-variant",
        ok: "text-on-surface-variant",
        poor: "text-error",
    };

    const tone = result ? toneFor(result.totalScore) : null;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
                {/* Chữ mẫu */}
                <div className="flex sm:flex-col items-center sm:items-stretch gap-3 sm:w-40 shrink-0">
                    <div className="flex items-center justify-center w-28 h-28 sm:w-full sm:h-40 rounded-2xl bg-surface-container-low border border-surface-container-high">
                        <span lang="ja" className="font-japanese text-[72px] sm:text-[96px] leading-none text-on-surface select-text">
                            {kanji}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                        <p>
                            Số nét:{" "}
                            <span className="font-semibold text-on-surface">{expected ?? "chưa rõ"}</span>
                        </p>
                        {refLoading && (
                            <p role="status" className="flex items-center gap-1.5">
                                <span
                                    aria-hidden="true"
                                    className="inline-block w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
                                />
                                Đang tải nét mẫu…
                            </p>
                        )}
                        {autoReference && !refLoading && fetchError && (
                            <p className="text-label-sm text-outline">Không tải được nét mẫu: {fetchError}</p>
                        )}
                        {hasReference && (
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showReference}
                                    onChange={(e) => setShowReference(e.target.checked)}
                                    className="accent-primary"
                                />
                                Hiện nét mẫu
                            </label>
                        )}
                    </div>
                </div>

                {/* Ô vẽ: key theo lượt để "Vẽ lại" dựng canvas mới, bỏ nét cũ. Cột rộng đúng bằng canvas và dòng nhắc
                    giữ sẵn 2 dòng: chữ nhắc đổi sau nét đầu không làm cột co/giãn, canvas đứng yên khi đang vẽ. */}
                <div className="flex flex-col items-center gap-3 shrink-0 max-w-full self-center sm:self-auto" style={{ width: CANVAS_SIZE }}>
                    <KanjiCanvas
                        key={attempt}
                        size={CANVAS_SIZE}
                        reference={activeReference}
                        showReference={showReference}
                        disabled={busy}
                        onChange={handleStrokes}
                    />
                    <p aria-live="polite" className={`w-full text-body-sm min-h-10 text-center ${precheck ? PRECHECK_TEXT[precheck.tone] : "text-on-surface-variant"}`}>
                        {precheck?.text ?? "Vẽ từng nét theo đúng thứ tự và hướng (trái → phải, trên → dưới)."}
                    </p>
                </div>
            </div>

            {/* Hành động */}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => void handleScore()}
                    disabled={scoreHint !== null}
                    isLoading={busy}
                    title={scoreHint ?? "Gửi nét vẽ lên máy chủ để so với nét mẫu"}
                >
                    <Icon name="task_alt" />
                    Chấm điểm
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={handleRetry} disabled={drawn === 0 && !result}>
                    <Icon name="replay" />
                    Vẽ lại
                </Button>
                {/* Gợi ý "chưa có nét mẫu" hiện ngay từ đầu (không đợi nét đầu) để hàng nút không đổi cao khi bắt đầu vẽ. */}
                {scoreHint && (drawn > 0 || (!hasReference && !refLoading)) && (
                    <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                        <Icon name="info" className="text-[16px]" />
                        {scoreHint}
                    </p>
                )}
            </div>

            {/* Kết quả */}
            <div aria-live="polite" className="flex flex-col gap-3">
                {error && <p className="text-body-sm text-error">{error}</p>}
                {result && tone && (
                    <section aria-label="Kết quả chấm điểm" className="flex flex-col gap-3 p-4 rounded-xl bg-surface-container-low border border-surface-container-high">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center font-headline text-headline-sm font-bold ${TONE_BADGE[tone]}`}>
                                <span className="sr-only">Điểm: </span>
                                {Math.round(result.totalScore)}
                            </p>
                            <div className="min-w-0 flex flex-col gap-0.5">
                                <p className="text-body-md text-on-surface">{result.feedback}</p>
                                <p className={`text-body-sm ${result.isCorrectOrder ? "text-on-secondary-fixed-variant" : "text-error"}`}>
                                    {result.isCorrectOrder ? "Thứ tự nét đúng." : "Thứ tự nét chưa đúng."}
                                </p>
                            </div>
                            {/* So hình: nét mẫu xám, nét người vẽ màu chính, cùng hộp chuẩn hoá */}
                            <svg
                                role="img"
                                aria-label="Nét bạn vẽ (đậm) chồng lên nét mẫu (mờ)"
                                width={PREVIEW_SIZE}
                                height={PREVIEW_SIZE}
                                viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
                                className="shrink-0 sm:ml-auto rounded-lg bg-surface-container-lowest border border-surface-container-high"
                            >
                                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    {previewRef.map((d, i) => (
                                        <path key={i} d={d} stroke="#c5c6cf" strokeWidth={5} />
                                    ))}
                                    <path d={previewUser} stroke="#041534" strokeWidth={3} />
                                </g>
                            </svg>
                        </div>
                        {chips.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5" aria-label="Từng nét">
                                {chips.map((chip, i) => (
                                    <li
                                        key={`${chip.status}-${chip.strokeNo}-${i}`}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold ${CHIP_CLASS[chip.status]}`}
                                        title={chip.score !== undefined ? `Điểm nét: ${Math.round(chip.score)}` : undefined}
                                    >
                                        <Icon name={CHIP_ICON[chip.status]} className="text-[14px]" />
                                        Nét {chip.strokeNo}: {chip.label}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
};
