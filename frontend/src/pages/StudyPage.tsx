import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { fetchDeck } from "@/services/deckService";
import { fetchReviews, submitReview } from "@/services/studyService";
import { fetchSession } from "@/services/learningPathService";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak, speakSequence, stopSpeaking, type SpeechItem } from "@/lib/speech";
import { AUDIO_MODE_LABELS, cardSpeechItems, meaningSpeechItems, parseAudioMode, shouldHideTerm } from "@/lib/audioOnly";
import { useAuth } from "@/context/useAuth";
import { loadLearningSettings } from "@/features/dashboard/lib/dashboardUtils";
import { useAsync } from "@/lib/useAsync";
import { isDue, type Grade, type Review } from "@/lib/srs";
import { extractKanji, hasCjkIdeograph } from "@/lib/textUtils";
import { extractErrorMessage } from "@/services/apiClient";
import type { Card, Deck, SessionCardMode, SessionResponse } from "@/types/api.types";
import { CardContent } from "@/features/decks/components/CardContent";
import { PronunciationPanel } from "@/features/practice/components/PronunciationPanel";
import { KanjiWritePanel } from "@/features/practice/components/KanjiWritePanel";
import {
    SESSION_KIND_LABELS,
    SESSION_MODE_LABELS,
    clampReactionMs,
    deckCardMode,
    parseRange,
    parseSessionKind,
    rangeCram,
    sessionCardToCard,
    sessionCountsLabel,
    sessionDoneHeading,
    sessionEmptyMessage,
    sliceRange,
} from "@/features/roadmap/roadmapUtils";

const GRADES: { grade: Grade; label: string; key: string; className: string }[] = [
    { grade: "again", label: "Lại", key: "1", className: "bg-error text-on-primary" },
    { grade: "hard", label: "Khó", key: "2", className: "bg-surface-container-high text-on-surface" },
    { grade: "good", label: "Tốt", key: "3", className: "bg-primary text-on-primary" },
    { grade: "easy", label: "Dễ", key: "4", className: "bg-secondary text-on-primary" },
];

// Nhãn chế độ từng thẻ: Mới (chưa chấm lần nào) / Ôn (đến hạn) / Luyện (chỉ ghi log, không đổi lịch SRS).
const MODE_CLASS: Record<SessionCardMode, string> = {
    new: "bg-primary-fixed text-on-primary-fixed",
    due: "bg-secondary-fixed/60 text-on-secondary-fixed-variant",
    cram: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
};

const iconButton =
    "p-2 rounded-full hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface StudyData {
    /** Thẻ dùng được trong phiên: cả bộ thẻ, hoặc thẻ server trả cho phiên lộ trình (nhiều bộ, đã đủ nội dung). */
    cards: Card[];
    /** null ở chế độ phiên lộ trình. */
    deck: Deck | null;
    /** Rỗng ở chế độ phiên lộ trình: server đã gán mode từng thẻ. */
    reviews: Record<string, Review>;
    session: SessionResponse | null;
}

type Practice = "speak" | "write" | null;

export const StudyPage: React.FC = () => {
    const { deckId = "" } = useParams(); // deckId từ URL: server kiểm quyền, sai thì 404
    const [params] = useSearchParams();
    const cram = params.get("cram") === "1"; // Học nhanh: ôn cả bộ, không đổi lịch dài hạn
    // Từ Lộ trình 1.0: ?range=a-b chỉ học đúng các thẻ ở vị trí a..b (bất kể đến hạn; thẻ chưa đến hạn chấm kiểu cram),
    // ?path=<id> để quay về.
    const range = parseRange(params.get("range"));
    const pathId = params.get("path");
    // Lộ trình 2.0: /session?session=today|catchup|due|chapter&path=<id>[&chapter=<cid>] -> hàng đợi lấy từ
    // GET /{path}/session (thẻ của nhiều bộ, server đã xếp đến hạn -> nợ -> mới và gán mode từng thẻ).
    const sessionKind = parseSessionKind(params.get("session"));
    const chapterId = params.get("chapter");
    const sessionReq = sessionKind !== null && pathId ? { pathId, kind: sessionKind, chapterId: chapterId ?? undefined } : null;
    const queueKey = sessionReq
        ? `session|${sessionReq.pathId}|${sessionReq.kind}|${sessionReq.chapterId ?? ""}`
        : `${deckId}|${range ? `${range.from}-${range.to}` : ""}`;
    // Bộ thẻ chỉ tải lại khi đổi bộ (đổi dải dùng lại dữ liệu); phiên lộ trình tải lại theo đúng khoá phiên.
    const fetchKey = sessionReq ? queueKey : deckId;
    const { data, error, loading } = useAsync<StudyData>(async () => {
        if (sessionReq) {
            const session = await fetchSession(sessionReq.pathId, sessionReq.kind, sessionReq.chapterId);
            return { cards: session.cards.map(sessionCardToCard), deck: null, reviews: {}, session };
        }
        if (!deckId) throw new Error("Thiếu bộ thẻ hoặc phiên học.");
        const deck = await fetchDeck(deckId);
        return { cards: deck.cards, deck, reviews: await fetchReviews(), session: null };
    }, [fetchKey]);

    // Hàng đợi gắn với deckId + dải thẻ (hoặc khoá phiên): sang bộ/dải/phiên khác thì chốt lại hàng đợi mới.
    const [queueState, setQueueState] = useState<{ key: string; ids: string[]; size: number } | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);
    const [practice, setPractice] = useState<Practice>(null);
    // Đo thời gian phản xạ: mốc lúc thẻ hiện ra (đặt trong effect bên dưới, lại mỗi thẻ, kể cả thẻ "Lại" quay vòng về).
    const shownAt = useRef(0);

    // E5 – chế độ chỉ nghe: ?mode=audio|read ghi đè cài đặt người dùng; trình duyệt không đọc được thì luôn là chế độ đọc.
    const { userEmail } = useAuth();
    const [audioPref, setAudioPref] = useState(() => parseAudioMode(params.get("mode")) ?? loadLearningSettings(userEmail).audioOnly);
    const audioOnly = canSpeak && audioPref;
    // Trình duyệt chỉ phát âm sau một cử chỉ của người dùng (autoplay policy) -> cần nút "Bắt đầu nghe" trước thẻ đầu;
    // đổi sang "Nghe" giữa phiên cũng là một cú bấm nên tính luôn.
    const [listening, setListening] = useState(false);
    const speechAbort = useRef<AbortController | null>(null);
    // Tăng sau mỗi lần chấm để đọc lại cả khi thẻ kế có cùng id (hàng đợi 1 thẻ bấm "Lại").
    const [turn, setTurn] = useState(0);

    const speakItems = useCallback((items: SpeechItem[]) => {
        speechAbort.current?.abort();
        const ctrl = new AbortController();
        speechAbort.current = ctrl;
        void speakSequence(items, ctrl.signal);
    }, []);
    const stopAudio = useCallback(() => {
        speechAbort.current?.abort();
        speechAbort.current = null;
        stopSpeaking();
    }, []);
    const setAudioMode = (on: boolean) => {
        setAudioPref(on);
        if (on) setListening(true);
        else stopAudio();
    };

    // Hàng đợi chốt 1 lần lúc dữ liệu về: chấm điểm không làm danh sách nhảy loạn.
    if (data && queueState?.key !== queueKey) {
        const now = new Date();
        const ids = data.session
            ? data.session.cards.map((c) => c.cardId)
            : range
              ? sliceRange(data.cards, range).map((c) => c.id)
              : data.cards.filter((c) => cram || isDue(data.reviews[c.id], now)).map((c) => c.id);
        setQueueState({ key: queueKey, ids, size: ids.length });
    }

    const queue = queueState?.key === queueKey ? queueState.ids : null;
    const current = data?.cards.find((c) => c.id === queue?.[0]);
    const sessionCard = current && data?.session ? data.session.cards.find((c) => c.cardId === current.id) : undefined;
    // Thẻ "Luyện" (đã học, chưa đến hạn) server không đếm vào counts — chỉ có ở kind=chapter; đếm từ chính danh sách thẻ
    // để nhãn "Ôn · Nợ · Mới · Luyện" cộng lại đúng bằng số thẻ của phiên.
    const cramCount = data?.session ? data.session.cards.filter((c) => c.mode === "cram").length : 0;

    useEffect(() => {
        shownAt.current = performance.now();
    }, [current?.id]);

    const grade = async (g: Grade) => {
        if (!current || saving) return;
        // Đo trước khi làm gì khác: từ lúc hiện thẻ tới cú bấm chấm (chỉ là tín hiệu phụ, không đổi SRS).
        const reactionMs = clampReactionMs(performance.now() - shownAt.current);
        setSaving(true);
        try {
            // Chế độ chấm từng thẻ: ?cram=1 ép cram; phiên lộ trình theo server (mode=cram = đã ôn nhưng chưa đến hạn);
            // học dải 1.0: thẻ đã ôn chưa đến hạn chỉ ghi log, không đẩy lịch SRS (mở lại dải hôm nay không thổi phồng "đã thuộc").
            const cramThis =
                cram ||
                sessionCard?.mode === "cram" ||
                (range !== null && rangeCram(data?.reviews[current.id], new Date()));
            // Lưu từng thẻ: thoát giữa chừng không mất tiến độ. pathId để review_logs gắn lượt ôn với lộ trình.
            await submitReview(current.id, g, { cram: cramThis, reactionMs, pathId: pathId ?? undefined });
            setSaveError("");
            setRevealed(false);
            setQueueState((s) =>
                s === null ? s : { ...s, ids: g === "again" ? [...s.ids.slice(1), s.ids[0]] : s.ids.slice(1) }
            );
            setTurn((t) => t + 1);
            shownAt.current = performance.now(); // hàng đợi 1 thẻ bấm "Lại": thẻ không đổi id nên effect trên không chạy
        } catch (e) {
            // Lỗi mạng -> bấm lại; lỗi từ server (mất quyền, thẻ bị xoá...) -> hiện đúng lý do
            setSaveError(`Chưa lưu được kết quả: ${extractErrorMessage(e)}`);
        } finally {
            setSaving(false);
        }
    };

    const closePractice = () => {
        setPractice(null);
        // Vừa luyện xong quay lại thẻ: đo phản xạ từ lúc này, không tính thời gian ở trong modal.
        shownAt.current = performance.now();
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Modal luyện tập đang mở: Space / 1–4 là của nút, ô vẽ trong modal — không lật thẻ, không chấm.
            if (practice !== null) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            // E5: R = nghe lại (từ + cách đọc, kèm nghĩa nếu đã lật). Không bắt Ctrl/Cmd+R (tải lại trang).
            if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (audioOnly && listening && current) {
                    e.preventDefault();
                    speakItems(cardSpeechItems(current.term, current.reading, revealed ? current.meaning : null));
                }
                return;
            }
            if (e.code === "Space") {
                e.preventDefault();
                // Cổng "Bắt đầu nghe" đang hiện: Space mở cổng (như bấm nút) thay vì lật thẻ chưa nghe.
                if (audioOnly && !listening) setListening(true);
                else setRevealed(true);
                return;
            }
            const hit = GRADES.find((g) => g.key === e.key);
            if (hit && revealed) void grade(hit.grade);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    // E5: thẻ mới hiện ra (hoặc quay vòng về) ở chế độ chỉ nghe -> đọc thuật ngữ + cách đọc; lật thẻ -> đọc thêm dòng đầu
    // của nghĩa bằng tiếng Việt (speakSequence tự bỏ qua khi máy không có giọng Việt). MỘT effect + nhớ lượt (thẻ + turn)
    // đã đọc thuật ngữ: tách hai effect thì bật "Nghe" lúc thẻ ĐÃ lật chạy cả hai trong cùng commit, effect nghĩa huỷ chuỗi
    // thuật ngữ vừa bắt đầu -> chỉ nghe được nghĩa. Lượt chưa đọc thuật ngữ thì đọc cả chuỗi (từ, cách đọc, nghĩa nếu đã lật).
    const termSpokenFor = useRef<string | null>(null);
    useEffect(() => {
        if (!audioOnly || !listening || !current) {
            termSpokenFor.current = null; // chuyển "Đọc" rồi "Nghe" lại: đọc lại thẻ đang xem từ đầu
            return;
        }
        const key = `${current.id}|${turn}`;
        if (termSpokenFor.current === key) {
            if (revealed) speakItems(meaningSpeechItems(current.meaning));
            return;
        }
        termSpokenFor.current = key;
        speakItems(cardSpeechItems(current.term, current.reading, revealed ? current.meaning : null));
    }, [audioOnly, listening, revealed, current, turn, speakItems]);

    // Rời trang (về lộ trình / bộ thẻ, đổi route): không để tiếng đọc dở tiếp tục ở trang sau.
    useEffect(() => () => stopAudio(), [stopAudio]);

    if (loading || error || !data) {
        return (
            <section
                aria-live="polite"
                className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center gap-space-md px-gutter text-center"
            >
                <p>{loading ? (sessionReq ? "Đang tải phiên học…" : "Đang tải bộ thẻ…") : error}</p>
                {!loading &&
                    (pathId ? (
                        <Link to={`/roadmap/${encodeURIComponent(pathId)}`} className="text-primary hover:underline">
                            ← Về lộ trình
                        </Link>
                    ) : (
                        <Link to="/decks" className="text-primary hover:underline">
                            ← Về danh sách bộ thẻ
                        </Link>
                    ))}
            </section>
        );
    }

    const deck = data.deck;
    const session = data.session;
    const exitTo = pathId ? `/roadmap/${encodeURIComponent(pathId)}` : `/decks/${deck?.id ?? deckId}`;

    if (!current) {
        const size = queueState?.size ?? 0;
        // Phiên lộ trình rỗng ngay từ đầu: nói rõ vì sao (ngày nghỉ / chưa bắt đầu / không còn gì) thay vì "Xong 🎉".
        const emptySession = session && sessionReq && size === 0;
        return (
            <section className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center gap-space-md px-gutter text-center">
                <h1 className="font-headline-sm text-headline-sm font-bold">
                    {emptySession ? "Không có thẻ nào trong phiên này" : sessionDoneHeading(sessionReq?.kind ?? null)}
                </h1>
                <p className="text-on-surface-variant">
                    {emptySession
                        ? sessionEmptyMessage(sessionReq.kind, session.state)
                        : session
                          ? `Bạn đã học xong ${size} thẻ (${sessionCountsLabel(session.counts, cramCount)}).`
                          : range
                            ? `Bạn đã học xong phần hôm nay (${size} thẻ).`
                            : `Không còn thẻ nào đến hạn trong bộ «${deck?.title ?? ""}».`}
                </p>
                <Link to={exitTo} className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold">
                    {pathId ? "Về lộ trình" : "Về chi tiết bộ thẻ"}
                </Link>
                {pathId && deck && (
                    <Link to={`/decks/${deck.id}`} className="text-primary hover:underline text-label-md">
                        Xem bộ thẻ
                    </Link>
                )}
                {emptySession && (
                    <Link to="/" className="text-primary hover:underline text-label-md">
                        Về Tổng quan
                    </Link>
                )}
            </section>
        );
    }

    // Nhãn chế độ thẻ: ?cram=1 ép Luyện; phiên lộ trình theo server; còn lại suy từ lịch SRS của máy khách.
    const mode: SessionCardMode = cram ? "cram" : (sessionCard?.mode ?? deckCardMode(data.reviews[current.id], new Date()));
    // Nút "Viết": chỉ khi từ có chữ Hán; luyện chữ đầu tiên (nét mẫu / chấm điểm do lane sau nối).
    const kanji = hasCjkIdeograph(current.term) ? (extractKanji(current.term)[0] ?? null) : null;

    return (
        // Toàn màn hình, không header/sidebar: tập trung khi học.
        <section className="min-h-screen bg-surface text-on-surface px-gutter py-space-lg">
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <header className="flex flex-col gap-1 text-label-md text-on-surface-variant">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <Link to={exitTo} className="text-primary hover:underline">
                            {pathId ? "← Về lộ trình" : "← Thoát"}
                        </Link>
                        {/* E5: đổi Nghe / Đọc giữa phiên; chỉ khi trình duyệt đọc được văn bản */}
                        {canSpeak && (
                            <div role="group" aria-label="Chế độ học" className="inline-flex rounded-lg bg-surface-container p-0.5">
                                {(["audio", "read"] as const).map((m) => {
                                    const active = m === "audio" ? audioOnly : !audioOnly;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setAudioMode(m === "audio")}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                                active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                                            }`}
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                                                {m === "audio" ? "headphones" : "visibility"}
                                            </span>
                                            {AUDIO_MODE_LABELS[m]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {/* Phiên lộ trình: "Ôn 5 · Nợ 3 · Mới 10 (· Luyện n)" của cả phiên + số thẻ còn lại trong hàng đợi */}
                        <span aria-live="polite" className="text-right">
                            {session && <span className="font-semibold text-on-surface">{sessionCountsLabel(session.counts, cramCount)} · </span>}
                            Còn {queue?.length ?? 0} thẻ
                        </span>
                    </div>
                    {session && sessionReq && (
                        <p className="text-label-sm text-outline">
                            {SESSION_KIND_LABELS[sessionReq.kind]}
                            {session.dayIndex > 0 && session.state !== "before" && ` · Ngày ${session.dayIndex}`}
                        </p>
                    )}
                </header>

                <div className="p-space-xl rounded-2xl bg-surface-container-lowest border border-surface-container-high text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-2 text-label-sm">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${MODE_CLASS[mode]}`}>{SESSION_MODE_LABELS[mode]}</span>
                        {sessionCard?.chapterTitle && (
                            <span className="text-on-surface-variant truncate max-w-full">{sessionCard.chapterTitle}</span>
                        )}
                    </div>

                    {audioOnly && !listening ? (
                        // Cổng cử chỉ: trình duyệt chặn phát âm tự động cho tới khi người dùng bấm gì đó trên trang.
                        <div className="flex flex-col items-center gap-2 py-2">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setListening(true)}
                                className="inline-flex items-center gap-2 px-5 py-3 min-h-11 rounded-lg bg-primary text-on-primary font-label-md font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                    headphones
                                </span>
                                Bắt đầu nghe
                            </button>
                            <p className="text-label-sm text-on-surface-variant max-w-sm">
                                Chế độ chỉ nghe: chữ được ẩn, từ tự đọc khi hiện thẻ. Bấm để trình duyệt cho phép phát âm.
                            </p>
                        </div>
                    ) : shouldHideTerm(audioOnly, revealed) ? (
                        <div className="flex flex-col items-center gap-1 text-on-surface-variant min-h-16 justify-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-[48px]">
                                headphones
                            </span>
                            <span className="sr-only">Chữ đang ẩn, từ đang được đọc</span>
                            <p className="text-label-md">
                                Nhấn <kbd className="px-1 rounded bg-surface-container-high text-on-surface">R</kbd> để nghe lại /{" "}
                                <kbd className="px-1 rounded bg-surface-container-high text-on-surface">Space</kbd> để lật
                            </p>
                        </div>
                    ) : (
                        <div lang="ja" className="text-display-sm font-bold">
                            {revealed ? (
                                <Ruby term={current.term} reading={current.reading ?? undefined} segments={current.readingSegments} />
                            ) : (
                                current.term
                            )}
                        </div>
                    )}

                    <div className="mt-2 flex items-center justify-center gap-1">
                        {canSpeak && (
                            <button
                                type="button"
                                // Chế độ chỉ nghe: nút loa = nghe lại cả chuỗi (từ, cách đọc, nghĩa nếu đã lật) — thay phím R trên điện thoại
                                onClick={() =>
                                    audioOnly && listening
                                        ? speakItems(cardSpeechItems(current.term, current.reading, revealed ? current.meaning : null))
                                        : speak(current.term)
                                }
                                aria-label={audioOnly ? "Nghe lại" : `Phát âm ${current.term}`}
                                title={audioOnly ? "Nghe lại (R)" : "Nghe phát âm"}
                                className={iconButton}
                            >
                                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                                    volume_up
                                </span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setPractice("speak")}
                            aria-label={`Luyện phát âm ${current.term}`}
                            title="Luyện phát âm"
                            className={iconButton}
                        >
                            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                                mic
                            </span>
                        </button>
                        {kanji && (
                            <button
                                type="button"
                                onClick={() => setPractice("write")}
                                aria-label={`Viết chữ ${kanji}`}
                                title="Viết"
                                className={iconButton}
                            >
                                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                                    draw
                                </span>
                            </button>
                        )}
                    </div>

                    <div aria-live="polite" className="mt-space-md min-h-16">
                        {revealed ? (
                            <>
                                <p>
                                    <CardContent text={current.meaning} headClassName="text-title-md font-semibold" restClassName="text-body-md font-normal text-on-surface-variant mt-1" />
                                </p>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setRevealed(true)}
                                className="px-4 py-2.5 rounded-lg bg-surface-container-high font-label-md font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                Hiện đáp án <kbd className="text-label-sm text-outline">Space</kbd>
                            </button>
                        )}
                    </div>
                </div>

                {saveError && (
                    <p role="alert" className="text-error text-label-md text-center">
                        {saveError}
                    </p>
                )}

                {revealed && (
                    <div className="grid grid-cols-4 gap-2">
                        {GRADES.map((g) => (
                            <button
                                key={g.grade}
                                type="button"
                                disabled={saving}
                                onClick={() => void grade(g.grade)}
                                className={`py-3 rounded-lg font-label-md font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${g.className}`}
                            >
                                {g.label} <kbd className="text-label-sm opacity-70">{g.key}</kbd>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Luyện tập ngay trên thẻ: modal tự khoá nền + Esc; phím tắt của trang bị tắt khi modal mở (xem onKey). */}
            <Modal isOpen={practice === "speak"} onClose={closePractice} icon="mic" title="Luyện phát âm" subtitle={current.term} size="xl">
                <PronunciationPanel key={current.id} term={current.term} reading={current.reading} cardId={current.id} />
            </Modal>
            <Modal
                isOpen={practice === "write" && kanji !== null}
                onClose={closePractice}
                icon="draw"
                title={`Viết chữ ${kanji ?? ""}`}
                subtitle={current.term}
                size="lg"
            >
                {/* Bỏ trống reference / scorer: panel tự tải nét mẫu KanjiVG và chấm điểm qua máy chủ (hợp đồng đợt 2 §2) */}
                {kanji && <KanjiWritePanel key={`${current.id}-${kanji}`} kanji={kanji} cardId={current.id} />}
            </Modal>
        </section>
    );
};

export default StudyPage;
