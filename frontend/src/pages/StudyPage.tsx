import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { fetchDeck } from "@/services/deckService";
import { fetchReviews } from "@/services/studyService";
import { completeClassroomLesson } from "@/services/classroomService";
import { useReviewQueue } from "@/features/study/reviewQueue";
import { fetchSession } from "@/services/learningPathService";
import { Ruby } from "@/lib/ja";
import { type FuriganaStyle, splitTermPos } from "@/lib/jaUtils";
import { canSpeak, speakSequence, stopSpeaking, type SpeechItem } from "@/lib/speech";
import { AUDIO_MODE_LABELS, cardSpeechItems, meaningSpeechItems, parseAudioMode, shouldHideTerm } from "@/lib/audioOnly";
import { useAuth } from "@/context/useAuth";
import { loadLearningSettings } from "@/features/dashboard/lib/dashboardUtils";
import { useAsync } from "@/lib/useAsync";
import { isDue, estimateNextInterval, type Grade, type Review } from "@/lib/srs";
import { extractKanji, hasCjkIdeograph } from "@/lib/textUtils";
import type { Card, Deck, SessionCardMode, SessionResponse } from "@/types/api.types";
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
import { GRADES } from "@/features/study/grades";
import {
    emptyStats,
    parseSavedSession,
    pushUndo,
    queueCounts,
    recordGrade,
    requeueAgain,
    savedSessionKey,
    serializeSession,
    studyKeyAction,
    summarize,
    swipeThreshold,
    type StudyStats,
} from "@/features/study/studyUtils";
import { useSwipe } from "@/features/study/useSwipe";
import { StudyProgress } from "@/features/study/components/StudyProgress";
import { StudySummary } from "@/features/study/components/StudySummary";
import { reviewOutcomeText, recallPct } from "@/lib/moderation";
import { ShortcutHelpModal } from "@/features/study/components/ShortcutHelpModal";
import { StudyDictButton } from "@/features/dictionary/components/StudyDictButton";

// Nhãn chế độ từng thẻ: Mới (chưa chấm lần nào) / Ôn (đến hạn) / Luyện (chỉ ghi log, không đổi lịch SRS).
const MODE_CLASS: Record<SessionCardMode, string> = {
    new: "bg-blue-50 text-blue-700 border border-blue-200/70",
    due: "bg-emerald-50 text-emerald-700 border border-emerald-200/70",
    cram: "bg-purple-50 text-purple-700 border border-purple-200/70",
};

type StudyFrontSide = "term" | "meaning" | "reading";

const FRONT_SIDE_LABELS: Record<StudyFrontSide, string> = {
    term: "Kanji",
    reading: "Cách đọc (Hira)",
    meaning: "Định nghĩa",
};

export type StudyFlipMode = "expand" | "flip";

const FLIP_MODE_LABELS: Record<StudyFlipMode, string> = {
    expand: "Hiện cả hai mặt",
    flip: "Lật thẻ (Quizlet)",
};

function shuffleIds(array: readonly string[]): string[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const iconButton =
    "p-2 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:hover:bg-transparent transition-colors";

interface StudyData {
    /** Thẻ dùng được trong phiên: cả bộ thẻ, hoặc thẻ server trả cho phiên lộ trình (nhiều bộ, đã đủ nội dung). */
    cards: Card[];
    /** null ở chế độ phiên lộ trình. */
    deck: Deck | null;
    /** Rỗng ở chế độ phiên lộ trình: server đã gán mode từng thẻ. */
    reviews: Record<string, Review>;
    session: SessionResponse | null;
}

/** Một bước hoàn tác: hàng đợi + kết quả ngay TRƯỚC lượt chấm (spec 25/10 §3.8). */
interface UndoEntry {
    cardId: string;
    term: string;
    ids: string[];
    stats: StudyStats;
}

interface QueueState {
    key: string;
    ids: string[];
    size: number;
    stats: StudyStats;
    undo: UndoEntry[];
    /** Khôi phục từ sessionStorage sau F5 (§3.7). */
    resumed: boolean;
    /** Phiên "Luyện lại" không lưu để học tiếp: chỉ là vòng phụ sau màn tổng kết. */
    persist: boolean;
}

type Practice = "speak" | "write" | null;

const readSaved = (key: string): string | null => {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null; // chế độ ẩn danh / chặn lưu trữ: học như không có bản lưu
    }
};

export const StudyPage: React.FC = () => {
    const { deckId = "" } = useParams(); // deckId từ URL: server kiểm quyền, sai thì 404
    const [params] = useSearchParams();
    const cram = params.get("cram") === "1"; // Học nhanh: ôn cả bộ, không đổi lịch dài hạn
    // Từ Lộ trình 1.0: ?range=a-b chỉ học đúng các thẻ ở vị trí a..b (bất kể đến hạn; thẻ chưa đến hạn chấm kiểu cram),
    // ?path=<id> để quay về.
    const range = parseRange(params.get("range"));
    const pathId = params.get("path");
    const classroomId = params.get("classroomId");
    const lessonId = params.get("lessonId");
    const returnTo = params.get("returnTo");
    // Lộ trình 2.0: /session?session=today|catchup|due|chapter&path=<id>[&chapter=<cid>] -> hàng đợi lấy từ
    // GET /{path}/session (thẻ của nhiều bộ, server đã xếp đến hạn -> nợ -> mới và gán mode từng thẻ).
    const sessionKind = parseSessionKind(params.get("session"));
    const chapterId = params.get("chapter");
    const sessionReq = sessionKind !== null && pathId ? { pathId, kind: sessionKind, chapterId: chapterId ?? undefined } : null;
    const baseKey = sessionReq
        ? `session|${sessionReq.pathId}|${sessionReq.kind}|${sessionReq.chapterId ?? ""}`
        : `${deckId}|${cram ? "cram" : ""}|${range ? `${range.from}-${range.to}` : ""}`;
    // "Luyện lại n thẻ này" ở màn tổng kết (§3.5): hàng đợi mới ngay trên trang, ép chế độ Luyện; đổi bộ/dải/phiên thì bỏ.
    const [retry, setRetry] = useState<{ base: string; n: number; ids: string[] } | null>(null);
    const activeRetry = retry?.base === baseKey ? retry : null;
    const forceCram = activeRetry !== null;
    const queueKey = activeRetry ? `${baseKey}|retry${activeRetry.n}` : baseKey;
    // Bộ thẻ chỉ tải lại khi đổi bộ (đổi dải dùng lại dữ liệu); phiên lộ trình tải lại theo đúng khoá phiên.
    const fetchKey = sessionReq ? baseKey : deckId;
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
    // openedAt: mốc kiểm hạn 12 giờ của phiên dở trong sessionStorage (lazy init, không gọi Date.now() mỗi lần render).
    const [openedAt] = useState(() => Date.now());
    const [queueState, setQueueState] = useState<QueueState | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [notice, setNotice] = useState("");
    const { enqueue, pendingCount, lastError, clearError, lastOutcome } = useReviewQueue();
    const saveError = lastError;
    const [lastGrade, setLastGrade] = useState<Grade | null>(null);
    // HLR (V38): "Ôn lại sau N ngày · trước khi ôn bạn được dự đoán nhớ x %" sau mỗi lượt chấm thật (không cram)
    const hlrNote = useMemo(() => {
        if (!lastOutcome) return "";
        if (lastGrade === "again") {
            const parts = ["Thẻ vừa rồi sẽ lặp lại sau 3 thẻ trong phiên này"];
            if (lastOutcome.recallBefore != null) parts.push(`trước khi ôn bạn được dự đoán nhớ ${recallPct(lastOutcome.recallBefore)}`);
            parts.push(`lịch ôn tiếp theo: sau ${lastOutcome.intervalDays} ngày`);
            return parts.join(" · ");
        }
        return reviewOutcomeText(lastOutcome) ?? "";
    }, [lastOutcome, lastGrade]);
    const [practice, setPractice] = useState<Practice>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    // Đo thời gian phản xạ: mốc lúc thẻ hiện ra (đặt trong effect bên dưới, lại mỗi thẻ, kể cả thẻ "Lại" quay vòng về).
    const shownAt = useRef(0);

    // Chế độ mặt trước thẻ: Kanji (mặc định) / Định nghĩa / Cách đọc
    const [frontSide, setFrontSide] = useState<StudyFrontSide>(() => {
        const queryFront = params.get("front");
        if (queryFront === "meaning" || queryFront === "reading" || queryFront === "term") {
            return queryFront;
        }
        try {
            const saved = localStorage.getItem("nihongen_study_front_side");
            if (saved === "meaning" || saved === "reading" || saved === "term") {
                return saved;
            }
        } catch {
            // Không đọc được storage
        }
        return "term";
    });

    const handleFrontSideChange = (side: StudyFrontSide) => {
        setFrontSide(side);
        try {
            localStorage.setItem("nihongen_study_front_side", side);
        } catch {
            // bỏ qua
        }
    };

    // Chế độ hiển thị khi lật: "expand" (mở rộng hiện cả 2 mặt) hoặc "flip" (lật mặt thẻ kiểu Quizlet)
    const [flipMode, setFlipMode] = useState<StudyFlipMode>(() => {
        try {
            const saved = localStorage.getItem("nihongen_study_flip_mode");
            if (saved === "expand" || saved === "flip") return saved;
        } catch {
            // Không đọc được storage
        }
        return "expand";
    });

    const handleFlipModeChange = (mode: StudyFlipMode) => {
        setFlipMode(mode);
        try {
            localStorage.setItem("nihongen_study_flip_mode", mode);
        } catch {
            // bỏ qua
        }
    };

    // Kiểu hiển thị cách đọc khi lật thẻ: "ruby" (trên đầu chữ) hoặc "stacked" (2 tầng như Mazii)
    const [furiganaStyle, setFuriganaStyle] = useState<FuriganaStyle>(() => {
        try {
            const saved = localStorage.getItem("nihongen_study_furigana_style");
            if (saved === "stacked" || saved === "ruby") return saved;
        } catch {
            // Không đọc được storage
        }
        return "ruby";
    });

    const handleFuriganaStyleChange = (style: FuriganaStyle) => {
        setFuriganaStyle(style);
        try {
            localStorage.setItem("nihongen_study_furigana_style", style);
        } catch {
            // bỏ qua
        }
    };

    // Tùy chọn giọng đọc: có đọc Furigana khi chưa lật thẻ không? (mặc định: bật)
    const [speakReading, setSpeakReading] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem("nihongen_study_speak_reading");
            if (saved !== null) return saved === "true";
        } catch {}
        return true;
    });

    // Tùy chọn giọng đọc: có đọc định nghĩa & ví dụ sau khi lật thẻ không? (mặc định: bật)
    const [speakMeaning, setSpeakMeaning] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem("nihongen_study_speak_meaning");
            if (saved !== null) return saved === "true";
        } catch {}
        return true;
    });

    // Trạng thái xáo thẻ: tick là trộn, bỏ tick là về ban đầu; nhấn S hoặc bấm nút đều đồng bộ
    const [isShuffled, setIsShuffled] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem("nihongen_study_shuffled") ?? localStorage.getItem("nihongen_study_auto_shuffle");
            return saved === "true";
        } catch {
            return false;
        }
    });
    const isShuffledRef = useRef(isShuffled);
    useEffect(() => {
        isShuffledRef.current = isShuffled;
    }, [isShuffled]);

    // Menu tùy chọn ba chấm (...)
    const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
    const optionsMenuRef = useRef<HTMLDivElement>(null);
    const optionsButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!optionsMenuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (optionsMenuRef.current && e.target instanceof Node && !optionsMenuRef.current.contains(e.target)) {
                setOptionsMenuOpen(false);
            }
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOptionsMenuOpen(false);
                optionsButtonRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onEsc);
        };
    }, [optionsMenuOpen]);

    const handleToggleSpeakReading = (val: boolean) => {
        setSpeakReading(val);
        try {
            localStorage.setItem("nihongen_study_speak_reading", String(val));
        } catch {}
    };

    const handleToggleSpeakMeaning = (val: boolean) => {
        setSpeakMeaning(val);
        try {
            localStorage.setItem("nihongen_study_speak_meaning", String(val));
        } catch {}
    };

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
        if (on) {
            setListening(true);
            if (frontSide !== "term") {
                handleFrontSideChange("term");
            }
        } else {
            stopAudio();
        }
    };

    const freshQueue = (d: StudyData): QueueState => {
        const now = new Date();
        let ids = d.session
            ? d.session.cards.map((c) => c.cardId)
            : range
              ? sliceRange(d.cards, range).map((c) => c.id)
              : d.cards.filter((c) => cram || isDue(d.reviews[c.id], now)).map((c) => c.id);
        if (isShuffled && ids.length > 1) {
            ids = shuffleIds(ids);
        }
        return { key: queueKey, ids, size: ids.length, stats: emptyStats(), undo: [], resumed: false, persist: true };
    };

    // Hàng đợi chốt 1 lần lúc dữ liệu về: chấm điểm không làm danh sách nhảy loạn. F5 giữa phiên: lấy lại hàng đợi dở
    // trong sessionStorage (thẻ "Lại" chưa xong vẫn còn, dù server đã dời lịch sang mai).
    if (data && queueState?.key !== queueKey) {
        if (activeRetry) {
            const ids = activeRetry.ids;
            setQueueState({ key: queueKey, ids, size: ids.length, stats: emptyStats(), undo: [], resumed: false, persist: false });
        } else {
            const saved = parseSavedSession(readSaved(savedSessionKey(queueKey)), new Set(data.cards.map((c) => c.id)), openedAt);
            setQueueState(
                saved
                    ? { key: queueKey, ids: saved.ids, size: saved.size, stats: saved.stats, undo: [], resumed: true, persist: true }
                    : freshQueue(data)
            );
        }
    }

    const live = queueState?.key === queueKey ? queueState : null;
    const queue = live?.ids ?? null;
    const current = data?.cards.find((c) => c.id === queue?.[0]);
    const sessionCard = current && data?.session ? data.session.cards.find((c) => c.cardId === current.id) : undefined;
    // Thẻ "Luyện" (đã học, chưa đến hạn) server không đếm vào counts — chỉ có ở kind=chapter; đếm từ chính danh sách thẻ
    // để nhãn "Ôn · Nợ · Mới · Luyện" cộng lại đúng bằng số thẻ của phiên.
    const cramCount = data?.session ? data.session.cards.filter((c) => c.mode === "cram").length : 0;
    const cardsById = useMemo(() => new Map((data?.cards ?? []).map((c) => [c.id, c])), [data]);
    const cardOrderMap = useMemo(() => {
        const map = new Map<string, number>();
        (data?.cards ?? []).forEach((c, idx) => map.set(c.id, idx));
        return map;
    }, [data?.cards]);

    // Nhãn chế độ thẻ: ?cram=1 / Luyện lại ép Luyện; phiên lộ trình theo server; còn lại suy từ lịch SRS của máy khách.
    const modeOf = (id: string): SessionCardMode => {
        if (cram || forceCram) return "cram";
        const sc = data?.session?.cards.find((c) => c.cardId === id);
        return sc?.mode ?? deckCardMode(data?.reviews[id], new Date());
    };

    useEffect(() => {
        shownAt.current = performance.now();
    }, [current?.id]);

    // Lưu hàng đợi dở sau mỗi lần chấm / hoàn tác để F5 học tiếp; xong phiên hoặc chưa chấm gì thì xoá bản lưu.
    useEffect(() => {
        if (!queueState?.persist) return;
        const key = savedSessionKey(queueState.key);
        const graded = Object.values(queueState.stats.grades).some((n) => n > 0);
        try {
            if (queueState.ids.length > 0 && graded) {
                sessionStorage.setItem(
                    key,
                    serializeSession({ ids: queueState.ids, size: queueState.size, stats: queueState.stats, savedAt: Date.now() })
                );
            } else {
                sessionStorage.removeItem(key);
            }
        } catch {
            // Không lưu được (ẩn danh, đầy bộ nhớ): F5 thì bắt đầu lại, tiến độ SRS vẫn đã lưu ở server
        }
    }, [queueState]);

    const reveal = () => setRevealed(true);

    const grade = (g: Grade) => {
        if (!current || !live) return;
        // Đo trước khi làm gì khác: từ lúc hiện thẻ tới cú bấm chấm (chỉ là tín hiệu phụ, không đổi SRS).
        const elapsed = performance.now() - shownAt.current;
        const reactionMs = clampReactionMs(elapsed);
        const gradedAt = Date.now();

        // Chế độ chấm từng thẻ: ?cram=1 / Luyện lại ép cram; phiên lộ trình theo server (mode=cram = đã ôn nhưng chưa đến hạn);
        // học dải 1.0: thẻ đã ôn chưa đến hạn chỉ ghi log, không đẩy lịch SRS (mở lại dải hôm nay không thổi phồng "đã thuộc").
        const cramThis =
            cram ||
            forceCram ||
            sessionCard?.mode === "cram" ||
            (range !== null && rangeCram(data?.reviews[current.id], new Date()));

        // 1. Phản hồi giao diện ngay lập tức (0ms - Optimistic UI)
        setNotice("");
        clearError();
        setRevealed(false);
        setLastGrade(g);
        const entry: UndoEntry = { cardId: current.id, term: current.term, ids: live.ids, stats: live.stats };
        setQueueState((s) =>
            s === null || s.key !== live.key
                ? s
                : {
                      ...s,
                      // "Lại": gặp lại sau 3 thẻ (§3.3) thay vì cuối hàng đợi
                      ids: g === "again" ? requeueAgain(s.ids) : s.ids.slice(1),
                      stats: recordGrade(s.stats, current.id, g, gradedAt - elapsed, gradedAt),
                      undo: pushUndo(s.undo, entry),
                  }
        );
        setTurn((t) => t + 1);
        shownAt.current = performance.now(); // hàng đợi 1 thẻ bấm "Lại": thẻ không đổi id nên effect trên không chạy

        // 2. Đưa vào hàng đợi ngầm tuần tự (Background Queue)
        enqueue({
            type: "review",
            cardId: current.id,
            grade: g,
            cramThis,
            reactionMs,
            pathId: pathId ?? undefined,
            term: current.term,
        });
    };

    // Hoàn tác lượt chấm cuối (§3.8): hoàn tác tức thì trên UI (0ms) và đưa tác vụ vào hàng đợi ngầm
    const undoLast = () => {
        const top = live?.undo[live.undo.length - 1];
        if (!top || !live) return;
        const dropTop = (s: QueueState | null) =>
            s && s.key === live.key && s.undo[s.undo.length - 1] === top ? { ...s, undo: s.undo.slice(0, -1) } : s;

        // 1. Trả lại trạng thái UI tức thì (0ms)
        setQueueState((s) => {
            const d = dropTop(s);
            return d && d !== s ? { ...d, ids: top.ids, stats: top.stats } : s;
        });
        setRevealed(false);
        clearError();
        setLastGrade(null);
        setNotice(`Đã hoàn tác: ${top.term}`);
        setTurn((t) => t + 1);
        shownAt.current = performance.now();

        // 2. Gửi lệnh hoàn tác qua hàng đợi ngầm
        enqueue({
            type: "undo",
            cardId: top.cardId,
            term: top.term,
        });
    };

    // Bật / tắt xáo trộn thứ tự thẻ: tick là trộn, bỏ tick là về lại thứ tự ban đầu; nhấn S hoặc bấm nút đều đồng bộ
    const handleToggleShuffle = (nextState?: boolean) => {
        const willShuffle = typeof nextState === "boolean" ? nextState : !isShuffledRef.current;
        setIsShuffled(willShuffle);
        try {
            localStorage.setItem("nihongen_study_shuffled", String(willShuffle));
            localStorage.setItem("nihongen_study_auto_shuffle", String(willShuffle));
        } catch {}

        if (!queue || queue.length <= 1) {
            setNotice("");
            return;
        }

        let newIds: string[];
        if (willShuffle) {
            newIds = shuffleIds(queue);
            // Đảm bảo thẻ đầu tiên khác thẻ hiện tại (nếu có thể) để người học thấy rõ sự thay đổi ngay lập tức
            if (newIds.length > 1 && newIds[0] === queue[0]) {
                [newIds[0], newIds[1]] = [newIds[1], newIds[0]];
            }
        } else {
            // Khôi phục về đúng thứ tự ban đầu của bộ thẻ
            newIds = [...queue].sort((a, b) => {
                const orderA = cardOrderMap.get(a) ?? 999999;
                const orderB = cardOrderMap.get(b) ?? 999999;
                return orderA - orderB;
            });
        }

        setNotice("");
        setQueueState((s) => (s ? { ...s, ids: newIds } : s));
        setRevealed(false);
        setTurn((t) => t + 1);
        shownAt.current = performance.now();
    };

    // Khi đang ở chế độ xáo thẻ, người dùng có thể bấm đổi sang một cách xáo ngẫu nhiên khác
    const handleReshuffle = () => {
        if (!queue || queue.length <= 1) return;
        const newIds = shuffleIds(queue);
        if (newIds.length > 1 && newIds[0] === queue[0]) {
            [newIds[0], newIds[1]] = [newIds[1], newIds[0]];
        }
        setNotice("");
        setQueueState((s) => (s ? { ...s, ids: newIds } : s));
        setRevealed(false);
        setTurn((t) => t + 1);
        shownAt.current = performance.now();
    };

    const restart = () => {
        try {
            sessionStorage.removeItem(savedSessionKey(queueKey));
        } catch {
            // bỏ qua: hàng đợi mới vẫn được dựng bên dưới
        }
        if (data) setQueueState(freshQueue(data));
        setRevealed(false);
        setNotice("");
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
            // Bảng phím tắt đang mở: chỉ "?" hoặc "/" (đóng lại); Esc do Modal xử lý.
            if (helpOpen && e.key !== "?" && e.key !== "/" && e.code !== "Slash") return;
            // Menu tùy chọn đang mở: tạm dừng phím tắt thẻ (Esc do menu xử lý)
            if (optionsMenuOpen) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            const action = studyKeyAction(e, { revealed, audioGate: audioOnly && !listening });
            if (!action) return;
            // Enter trên link điều hướng: để trình duyệt mở link đó
            if (e.key === "Enter" && el?.closest("a")) return;
            
            // Ngăn chặn cuộn trang của phím Space và tránh double-trigger
            e.preventDefault();
            if (el && el.tagName === "BUTTON") {
                el.blur();
            }

            switch (action.kind) {
                case "undo":
                    void undoLast();
                    break;
                case "shuffle":
                    handleToggleShuffle();
                    break;
                case "help":
                    setHelpOpen((o) => !o);
                    break;
                case "replay":
                    if (current) {
                        speakItems(
                            cardSpeechItems(current.term, current.reading, revealed && speakMeaning ? current.meaning : null, {
                                speakReading,
                                speakMeaning,
                                includeExamples: true,
                            })
                        );
                    }
                    break;
                case "openAudio":
                    // Cổng "Bắt đầu nghe" đang hiện: Space mở cổng (như bấm nút) thay vì lật thẻ chưa nghe.
                    setListening(true);
                    break;
                case "reveal":
                    if (current) reveal();
                    break;
                case "hide":
                    setRevealed(false);
                    break;
                case "grade":
                    if (current && revealed) void grade(action.grade);
                    break;
                case "none":
                    break;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    // Vuốt (§3.6): chỉ khi đã lật; trái = Lại, phải = Tốt.
    const swipe = useSwipe(revealed && practice === null, (g) => void grade(g));

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
            if (revealed && speakMeaning) {
                speakItems(meaningSpeechItems(current.meaning, true));
            }
            return;
        }
        termSpokenFor.current = key;
        // Nếu mặt trước là nghĩa và chưa lật, không tự đọc tiếng Nhật để tránh lộ đáp án
        if (frontSide === "meaning" && !revealed) {
            return;
        }
        speakItems(
            cardSpeechItems(current.term, current.reading, revealed && speakMeaning ? current.meaning : null, {
                speakReading,
                speakMeaning,
                includeExamples: true,
            })
        );
    }, [audioOnly, listening, revealed, current, turn, speakItems, frontSide, speakReading, speakMeaning]);

    // Rời trang (về lộ trình / bộ thẻ, đổi route): không để tiếng đọc dở tiếp tục ở trang sau.
    useEffect(() => () => stopAudio(), [stopAudio]);

    // Tự động đánh dấu hoàn thành buổi học trong lớp khi học xong hết thẻ
    const classroomCompletedRef = useRef(false);
    useEffect(() => {
        if (!current && live && live.size > 0 && classroomId && lessonId && !classroomCompletedRef.current) {
            classroomCompletedRef.current = true;
            void completeClassroomLesson(Number(classroomId), Number(lessonId))
                .then(() => {
                    setNotice("🎉 Chúc mừng bạn đã hoàn thành buổi học này trong lớp học!");
                })
                .catch((e) => console.warn("Lỗi lưu tiến độ buổi học:", e));
        }
    }, [current, live, classroomId, lessonId]);

    if (loading) {
        return (
            <section
                aria-busy="true"
                aria-label="Đang tải phiên học flashcard"
                className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center px-4 py-8"
            >
                <div className="max-w-xl w-full space-y-6">
                    {/* Header bar Skeleton */}
                    <div className="flex items-center justify-between gap-4 animate-pulse">
                        <div className="h-8 w-24 rounded-xl bg-slate-200" />
                        <div className="h-4 w-32 rounded bg-slate-200" />
                        <div className="h-8 w-8 rounded-full bg-slate-200" />
                    </div>

                    {/* Progress Bar Skeleton */}
                    <div className="w-full h-2 rounded-full bg-slate-200 animate-pulse" />

                    {/* Flashcard Skeleton */}
                    <div className="w-full h-80 rounded-3xl bg-white border border-slate-200/90 shadow-sm p-8 flex flex-col items-center justify-center gap-4 animate-pulse">
                        <div className="h-5 w-14 rounded-full bg-slate-100" />
                        <div className="h-16 w-40 rounded-2xl bg-slate-200" />
                        <div className="h-4 w-24 rounded bg-slate-100" />
                        <div className="mt-8 h-4 w-44 rounded bg-slate-100" />
                    </div>

                    {/* Action Bar Skeleton */}
                    <div className="w-full h-12 rounded-2xl bg-slate-200 animate-pulse" />
                </div>
            </section>
        );
    }

    if (error || !data) {
        return (
            <section
                aria-live="polite"
                className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center gap-space-md px-gutter text-center"
            >
                <p className="text-rose-700 font-semibold">{error || "Không tìm thấy dữ liệu bộ thẻ."}</p>
                {returnTo ? (
                    <Link to={returnTo} className="text-blue-600 hover:underline font-medium">
                        ← Quay lại
                    </Link>
                ) : classroomId ? (
                    <Link to={`/classrooms/${classroomId}`} className="text-blue-600 hover:underline font-medium">
                        ← Về lớp học
                    </Link>
                ) : pathId ? (
                    <Link to={`/roadmap/${encodeURIComponent(pathId)}`} className="text-blue-600 hover:underline font-medium">
                        ← Về lộ trình
                    </Link>
                ) : (
                    <Link to="/decks" className="text-blue-600 hover:underline font-medium">
                        ← Về danh sách bộ thẻ
                    </Link>
                )}
            </section>
        );
    }

    const deck = data.deck;
    const session = data.session;
    const exitTo = returnTo || (classroomId
        ? `/classrooms/${classroomId}`
        : pathId
            ? `/roadmap/${encodeURIComponent(pathId)}`
            : `/decks/${deck?.id ?? deckId}`);
    const canUndo = (live?.undo.length ?? 0) > 0;
    const undoButton = (
        <button
            type="button"
            onClick={() => void undoLast()}
            disabled={!canUndo}
            aria-label="Hoàn tác lượt chấm vừa rồi"
            title="Hoàn tác (Z)"
            className={iconButton}
        >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                undo
            </span>
        </button>
    );
    const messages = (
        <>
            {saveError && (
                <p role="alert" className="text-error text-label-md text-center">
                    {saveError}
                </p>
            )}
            <p aria-live="polite" className="text-on-surface-variant text-label-md text-center empty:hidden">
                {notice}
            </p>
            <p className="text-outline text-label-sm text-center empty:hidden" title="Theo mô hình trí nhớ HLR (chỉ tham khảo; lịch ôn vẫn do SM-2 quyết)">
                {hlrNote}
            </p>
        </>
    );

    if (!current) {
        const size = live?.size ?? 0;
        // Phiên lộ trình rỗng ngay từ đầu: nói rõ vì sao (ngày nghỉ / chưa bắt đầu / không còn gì) thay vì "Xong 🎉".
        const emptySession = session && sessionReq && size === 0;
        const summary = live ? summarize(live.stats) : null;
        return (
            <section className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center gap-space-md px-gutter py-space-lg text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shadow-xs mb-1">
                    <span className="material-symbols-outlined text-[36px]" aria-hidden="true">
                        {emptySession ? "event_busy" : "task_alt"}
                    </span>
                </div>
                <h1 className="font-headline-sm text-headline-sm font-bold text-slate-900">
                    {emptySession
                        ? "Không có thẻ nào trong phiên này"
                        : activeRetry
                          ? "Luyện lại xong"
                          : sessionDoneHeading(sessionReq?.kind ?? null)}
                </h1>
                <p className="text-slate-600 max-w-md">
                    {emptySession
                        ? sessionEmptyMessage(sessionReq.kind, session.state)
                        : activeRetry
                          ? `Bạn đã luyện lại ${size} thẻ (không đổi lịch ôn).`
                          : session
                            ? `Bạn đã học xong ${size} thẻ (${sessionCountsLabel(session.counts, cramCount)}).`
                            : range
                              ? `Bạn đã học xong phần hôm nay (${size} thẻ).`
                              : `Không còn thẻ nào đến hạn trong bộ «${deck?.title ?? ""}».`}
                </p>
                {summary && summary.total > 0 && (
                    <StudySummary
                        summary={summary}
                        cardsById={cardsById}
                        onRetry={(ids) => {
                            setRetry({ base: baseKey, n: (activeRetry?.n ?? 0) + 1, ids });
                            setRevealed(false);
                            setNotice("");
                        }}
                    />
                )}
                {canUndo && (
                    <button
                        type="button"
                        onClick={() => void undoLast()}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline text-label-md font-medium"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            undo
                        </span>
                        Hoàn tác lượt chấm cuối
                    </button>
                )}
                {messages}
                <Link to={exitTo} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-label-md font-semibold shadow-xs hover:shadow transition-all">
                    {classroomId ? "Về lớp học" : "Quay lại"}
                </Link>
                {/* Rà soát 27/10: bộ đã học xong vẫn ôn lại được ngay (cram không đổi lịch; học lại từ đầu ở trang bộ thẻ) */}
                {!pathId && !range && deck && !cram && (
                    <Link to={`/decks/${deck.id}/study?cram=1`} className="text-blue-600 hover:text-blue-800 hover:underline text-label-md font-medium">
                        Ôn lại cả bộ ngay (không đổi lịch ôn)
                    </Link>
                )}
                {pathId && deck && (
                    <Link to={`/decks/${deck.id}`} className="text-blue-600 hover:text-blue-800 hover:underline text-label-md font-medium">
                        Xem bộ thẻ
                    </Link>
                )}
                {emptySession && (
                    <Link to="/" className="text-blue-600 hover:text-blue-800 hover:underline text-label-md font-medium">
                        Về Tổng quan
                    </Link>
                )}
                <ShortcutHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
            </section>
        );
    }

    const mode = modeOf(current.id);
    // Nút "Viết": chỉ khi từ có chữ Hán; luyện chữ đầu tiên (nét mẫu / chấm điểm do lane sau nối).
    const kanji = hasCjkIdeograph(current.term) ? (extractKanji(current.term)[0] ?? null) : null;
    const counts = queueCounts(queue ?? [], modeOf, live?.stats ?? emptyStats());
    const audioGate = audioOnly && !listening;
    // Vuốt: thẻ nghiêng tối đa 8°, nhãn Lại / Tốt đậm dần tới ngưỡng
    const dx = swipe.dx;
    const swipeLabel = dx < 0 ? "Lại" : "Tốt";
    const swipeStrength = Math.min(1, Math.abs(dx) / swipeThreshold(320));

    return (
        // Toàn màn hình, không header/sidebar: tập trung khi học.
        <section className="min-h-screen bg-slate-50 text-slate-900 px-gutter py-space-lg overflow-x-hidden">
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <header className="flex flex-col gap-2 text-label-md text-on-surface-variant">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <Link to={exitTo} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium transition-colors">
                                {classroomId ? "← Về lớp học" : pathId ? "← Về lộ trình" : "← Thoát"}
                            </Link>

                            {/* Trạng thái lưu ngầm (Background Queue) */}
                            {pendingCount > 0 ? (
                                <span
                                    className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 shadow-2xs transition-all"
                                    title="Đang lưu tiến độ lên máy chủ..."
                                >
                                    <span className="material-symbols-outlined text-[13px] animate-spin text-amber-600" aria-hidden="true">
                                        sync
                                    </span>
                                    <span>Đang lưu{pendingCount > 1 ? ` (${pendingCount})` : ""}</span>
                                </span>
                            ) : (
                                <span
                                    className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium px-2 py-0.5 rounded-full bg-emerald-50/80 border border-emerald-200/60 transition-all"
                                    title="Đã lưu toàn bộ tiến độ lên máy chủ"
                                >
                                    <span className="material-symbols-outlined text-[13px] text-emerald-600" aria-hidden="true">
                                        cloud_done
                                    </span>
                                    <span>Đã lưu</span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {undoButton}

                            {/* Nút Bật/tắt Xáo thẻ (S) */}
                            <button
                                type="button"
                                onClick={() => handleToggleShuffle()}
                                disabled={(queue?.length ?? 0) <= 1}
                                aria-label={isShuffled ? "Tắt xáo trộn (về thứ tự ban đầu) (S)" : "Xáo trộn thứ tự thẻ (S)"}
                                title={isShuffled ? "Đang xáo thẻ · Nhấn S để về thứ tự ban đầu" : "Xáo thẻ (S)"}
                                className={`p-2 rounded-full transition-colors cursor-pointer ${
                                    isShuffled
                                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                            >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                    shuffle
                                </span>
                            </button>

                            {/* Menu tùy chọn ba chấm (...) */}
                            <div className="relative" ref={optionsMenuRef}>
                                <button
                                    ref={optionsButtonRef}
                                    type="button"
                                    onClick={() => setOptionsMenuOpen((v) => !v)}
                                    aria-expanded={optionsMenuOpen}
                                    aria-haspopup="true"
                                    aria-label="Tùy chọn học tập"
                                    title="Tùy chọn học tập (...)"
                                    className={`p-2 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors cursor-pointer ${
                                        optionsMenuOpen ? "bg-slate-200 text-slate-900" : ""
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                        more_horiz
                                    </span>
                                </button>

                                {optionsMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[90vw] p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xl z-30 text-slate-800 space-y-3.5 animate-reveal">
                                        {/* TẦNG 1: Chế độ học (Đọc / Nghe) */}
                                        {canSpeak && (
                                            <div>
                                                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                                    Chế độ học:
                                                </span>
                                                <div role="group" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs">
                                                    {(["read", "audio"] as const).map((m) => {
                                                        const active = m === "audio" ? audioOnly : !audioOnly;
                                                        return (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => setAudioMode(m === "audio")}
                                                                className={`py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                                                    active
                                                                        ? "bg-white text-blue-700 shadow-xs"
                                                                        : "text-slate-600 hover:text-slate-900"
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                                                    {m === "audio" ? "headphones" : "visibility"}
                                                                </span>
                                                                {AUDIO_MODE_LABELS[m]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* TẦNG 2: Mặt trước thẻ (Đọc: Kanji, Hira, Định nghĩa | Nghe: chỉ có Kanji) */}
                                        <div>
                                            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                                Mặt trước thẻ:
                                            </span>
                                            {audioOnly ? (
                                                <div className="p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs">
                                                    <div className="py-1.5 px-3 rounded-lg font-semibold text-center bg-white text-blue-700 shadow-xs flex items-center justify-center gap-1.5">
                                                        <span>Kanji</span>
                                                        <span className="text-[10px] text-slate-400 font-normal font-sans">(ẩn chữ, luyện nghe)</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div role="group" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs">
                                                    {(["term", "reading", "meaning"] as const).map((side) => {
                                                        const active = frontSide === side;
                                                        return (
                                                            <button
                                                                key={side}
                                                                type="button"
                                                                onClick={() => handleFrontSideChange(side)}
                                                                className={`py-1.5 px-1.5 rounded-lg font-semibold text-center transition-all cursor-pointer truncate ${
                                                                    active
                                                                        ? "bg-white text-blue-700 shadow-xs"
                                                                        : "text-slate-600 hover:text-slate-900"
                                                                }`}
                                                                title={FRONT_SIDE_LABELS[side]}
                                                            >
                                                                {side === "reading" ? "Hiragana" : FRONT_SIDE_LABELS[side]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* TẦNG 3: Cách hiển thị khi lật thẻ - CHỈ ÁP DỤNG VÀ HIỂN THỊ Ở CHẾ ĐỘ ĐỌC */}
                                        {!audioOnly && (
                                            <div className="animate-reveal">
                                                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                                    Cách hiển thị khi lật:
                                                </span>
                                                <div role="group" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs">
                                                    {(["expand", "flip"] as const).map((m) => {
                                                        const active = flipMode === m;
                                                        return (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => handleFlipModeChange(m)}
                                                                className={`py-1.5 px-2 rounded-lg font-semibold text-center transition-all cursor-pointer ${
                                                                    active
                                                                        ? "bg-white text-blue-700 shadow-xs"
                                                                        : "text-slate-600 hover:text-slate-900"
                                                                }`}
                                                            >
                                                                {FLIP_MODE_LABELS[m]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* TẦNG 4: Kiểu hiển thị cách đọc - CHỈ HIỆN KHI CHỌN KANJI VÀ Ở CHẾ ĐỘ ĐỌC + HIỆN CẢ 2 MẶT */}
                                        {!audioOnly && frontSide === "term" && flipMode === "expand" && (
                                            <div className="animate-reveal">
                                                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                                    Kiểu hiển thị cách đọc:
                                                </span>
                                                <div role="group" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60 text-xs">
                                                    {[
                                                        { id: "ruby", label: "Trên đầu chữ" },
                                                        { id: "stacked", label: "Cùng định nghĩa" },
                                                    ].map((item) => {
                                                        const active = furiganaStyle === item.id;
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() => handleFuriganaStyleChange(item.id as FuriganaStyle)}
                                                                className={`py-1.5 px-2 rounded-lg font-semibold text-center transition-all cursor-pointer ${
                                                                    active
                                                                        ? "bg-white text-blue-700 shadow-xs"
                                                                        : "text-slate-600 hover:text-slate-900"
                                                                }`}
                                                            >
                                                                {item.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Tùy chọn giọng đọc */}
                                        {canSpeak && (
                                            <div className="pt-2.5 border-t border-slate-100 space-y-2">
                                                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                    Cài đặt giọng đọc:
                                                </span>
                                                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs select-none hover:text-slate-900">
                                                    <span className="text-slate-700">Đọc Furigana trước khi lật</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={speakReading}
                                                        onChange={(e) => handleToggleSpeakReading(e.target.checked)}
                                                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs select-none hover:text-slate-900">
                                                    <span className="text-slate-700">Đọc nghĩa & ví dụ khi lật</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={speakMeaning}
                                                        onChange={(e) => handleToggleSpeakMeaning(e.target.checked)}
                                                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                                                    />
                                                </label>
                                            </div>
                                        )}

                                        {/* Tùy chọn xáo thẻ */}
                                        <div className="pt-2.5 border-t border-slate-100 space-y-2">
                                            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                Thứ tự học thẻ:
                                            </span>
                                            <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 cursor-pointer transition-colors text-xs select-none">
                                                <div className="flex items-center gap-2.5">
                                                    <span
                                                        className={`material-symbols-outlined text-[19px] ${
                                                            isShuffled ? "text-blue-600" : "text-slate-400"
                                                        }`}
                                                        aria-hidden="true"
                                                    >
                                                        shuffle
                                                    </span>
                                                    <div>
                                                        <span className="font-semibold text-slate-800 block">
                                                            Xáo trộn thứ tự thẻ
                                                        </span>
                                                        <span className="text-[11px] text-slate-500 block">
                                                            {isShuffled
                                                                ? "Bỏ tick để về thứ tự ban đầu (S)"
                                                                : "Tick để xáo ngẫu nhiên (S)"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={isShuffled}
                                                    onChange={(e) => handleToggleShuffle(e.target.checked)}
                                                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                                                />
                                            </label>

                                            {isShuffled && (queue?.length ?? 0) > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={handleReshuffle}
                                                    className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200/60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                                    title="Đổi sang một thứ tự ngẫu nhiên khác cho các thẻ còn lại"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                                                        autorenew
                                                    </span>
                                                    <span>Đổi sang thứ tự xáo khác</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* 4. Xem phím tắt */}
                                        <div className="pt-2 border-t border-slate-100">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOptionsMenuOpen(false);
                                                    setHelpOpen(true);
                                                }}
                                                className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                                        keyboard
                                                    </span>
                                                    <span>Phím tắt khi học</span>
                                                </span>
                                                <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">?</kbd>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <StudyProgress done={(live?.size ?? 0) - (queue?.length ?? 0)} size={live?.size ?? 0} counts={counts} />
                    {(session || activeRetry || live?.resumed) && (
                        <p className="flex flex-wrap gap-x-2 text-label-sm text-slate-500">
                            {/* Phiên lộ trình: "Ôn 5 · Nợ 3 · Mới 10 (· Luyện n)" của cả phiên */}
                            {session && sessionReq && (
                                <span>
                                    {SESSION_KIND_LABELS[sessionReq.kind]}
                                    {session.dayIndex > 0 && session.state !== "before" && ` · Ngày ${session.dayIndex}`} ·{" "}
                                    {sessionCountsLabel(session.counts, cramCount)}
                                </span>
                            )}
                            {activeRetry && <span>Luyện lại · không đổi lịch ôn</span>}
                            {live?.resumed && !activeRetry && (
                                <span>
                                    Đang tiếp tục phiên dở ·{" "}
                                    <button type="button" onClick={restart} className="text-blue-600 hover:underline font-medium">
                                        Bắt đầu lại
                                    </button>
                                </span>
                            )}
                        </p>
                    )}
                </header>

                <div
                    {...swipe.handlers}
                    // Chạm / bấm vào thẻ để lật qua lại hai mặt (§3.1); nút "Hiện đáp án" vẫn là điều khiển chính cho bàn phím /
                    // trình đọc màn hình. Bỏ qua click ngay sau khi vuốt và khi đang bôi đen chữ trên thẻ.
                    onClick={() => {
                        if (swipe.consumeDrag() || audioGate) return;
                        if (revealed && window.getSelection()?.toString()) return;
                        setRevealed((r) => !r);
                    }}
                    style={dx ? { transform: `translateX(${dx}px) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg)` } : undefined}
                    className={`relative p-6 md:p-8 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow text-center touch-pan-y min-h-[400px] md:min-h-[440px] flex flex-col ${
                        audioGate ? "" : "cursor-pointer"
                    } ${dx ? "" : "transition-transform duration-200 motion-reduce:transition-none"}`}
                >
                    {dx !== 0 && (
                        <span
                            aria-hidden="true"
                            style={{ opacity: swipeStrength }}
                            className={`absolute top-4 ${dx < 0 ? "right-4 bg-rose-600" : "left-4 bg-blue-600"} px-3.5 py-1.5 rounded-full text-white font-label-md font-bold shadow-md z-10`}
                        >
                            {swipeLabel}
                        </span>
                    )}

                    {/* Header của thẻ: Bên trái là Badge chế độ & Chương; Bên phải là Toolbar công cụ phụ */}
                    <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-label-sm">
                            <span className={`px-2.5 py-0.5 rounded-full font-semibold ${MODE_CLASS[mode]}`}>
                                {SESSION_MODE_LABELS[mode]}
                            </span>
                            {sessionCard?.chapterTitle && (
                                <span className="text-slate-500 truncate max-w-[180px] md:max-w-xs text-xs" title={sessionCard.chapterTitle}>
                                    {sessionCard.chapterTitle}
                                </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/70">
                                {!audioOnly && flipMode === "flip"
                                    ? revealed
                                        ? "Mặt sau · Đáp án"
                                        : `Mặt trước · ${FRONT_SIDE_LABELS[frontSide]}`
                                    : `${FRONT_SIDE_LABELS[frontSide]} ra trước`}
                            </span>
                        </div>

                        {/* Toolbar công cụ phụ (Loa, Từ điển, Mic, Viết): Đặt gọn gàng ở góc trên, click không lật thẻ */}
                        <div
                            className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-50 border border-slate-200/80 shadow-xs"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {canSpeak && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        speakItems(
                                            cardSpeechItems(current.term, current.reading, revealed && speakMeaning ? current.meaning : null, {
                                                speakReading,
                                                speakMeaning,
                                                includeExamples: true,
                                            })
                                        );
                                    }}
                                    aria-label={audioOnly ? "Nghe lại" : `Phát âm ${current.term}`}
                                    title={audioOnly ? "Nghe lại (R)" : "Nghe phát âm"}
                                    className={iconButton}
                                >
                                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                        volume_up
                                    </span>
                                </button>
                            )}
                            <StudyDictButton term={current.term} className={iconButton} />
                            <button
                                type="button"
                                onClick={() => setPractice("speak")}
                                aria-label={`Luyện phát âm ${current.term}`}
                                title="Luyện phát âm"
                                className={iconButton}
                            >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
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
                                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                        draw
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    {!audioOnly && flipMode === "flip" ? (
                        /* CHẾ ĐỘ LẬT THẺ (QUIZLET): Chỉ áp dụng cho chế độ Đọc - Một mặt duy nhất tại một thời điểm, lật 3D */
                        <div
                            key={revealed ? "quizlet-back" : "quizlet-front"}
                            className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full animate-cardFlip select-none min-h-[300px]"
                        >
                            {!revealed ? (
                                /* MẶT TRƯỚC (QUIZLET) */
                                <div className="flex flex-col items-center justify-center gap-3 w-full">
                                    {frontSide === "reading" ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                                Cách đọc (Hiragana)
                                            </span>
                                            <div lang="ja" className="text-4xl md:text-5xl font-bold font-japanese text-slate-800 leading-snug">
                                                {current.reading || current.term}
                                            </div>
                                        </div>
                                    ) : frontSide === "meaning" ? (
                                        <div className="flex flex-col items-center gap-2 max-w-lg">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                                Định nghĩa
                                            </span>
                                            <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line text-center">
                                                {current.meaning}
                                            </div>
                                        </div>
                                    ) : (
                                        <div lang="ja" className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-snug font-japanese inline-flex items-center justify-center flex-wrap gap-2">
                                            <span>{splitTermPos(current.term).cleanTerm}</span>
                                            {splitTermPos(current.term).tag && (
                                                <span className="text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle tracking-normal">
                                                    {splitTermPos(current.term).tag}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="mt-8 text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                                        <span className="material-symbols-outlined text-[16px]">touch_app</span>
                                        <span>Bấm vào thẻ hoặc nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200">Space</kbd> để lật mặt sau</span>
                                    </div>
                                </div>
                            ) : (
                                /* MẶT SAU (QUIZLET) - HOÀN TOÀN KHÔNG HIỂN THỊ MẶT TRƯỚC */
                                <div className="flex flex-col items-center justify-center gap-3 w-full">
                                    {frontSide === "reading" ? (
                                        <div className="flex flex-col items-center gap-2.5 w-full">
                                            <div lang="ja" className="text-3xl md:text-4xl font-japanese font-bold text-slate-900 inline-flex items-center justify-center flex-wrap gap-2">
                                                <span>{splitTermPos(current.term).cleanTerm}</span>
                                                {splitTermPos(current.term).tag && (
                                                    <span className="text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle tracking-normal">
                                                        {splitTermPos(current.term).tag}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line max-w-lg mx-auto text-center">
                                                {current.meaning}
                                            </div>
                                        </div>
                                    ) : frontSide === "meaning" ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <div lang="ja" className="text-3xl md:text-5xl font-japanese font-bold text-slate-900">
                                                <Ruby
                                                    term={current.term}
                                                    reading={current.reading ?? undefined}
                                                    segments={current.readingSegments}
                                                    style="ruby"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        /* Mặt trước là Kanji -> Mặt sau chỉ hiện Cách đọc + Định nghĩa (không hiện Kanji) */
                                        <div className="flex flex-col items-center gap-2.5 w-full">
                                            {current.reading && (
                                                <div lang="ja" className="text-2xl md:text-3xl font-japanese font-bold text-blue-700 tracking-wide">
                                                    {current.reading}
                                                </div>
                                            )}
                                            <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line max-w-lg mx-auto text-center">
                                                {current.meaning}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-6 text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                                        <span className="material-symbols-outlined text-[16px]">touch_app</span>
                                        <span>Bấm vào thẻ hoặc nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200">Space</kbd> để lật lại mặt trước</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* CHẾ ĐỘ HIỆN CẢ HAI MẶT (EXPAND) */
                        <>
                            {/* Nửa trên thẻ: Thuật ngữ / Chữ Kanji - Cố định không gian, không dùng my-auto để vị trí đứng yên tuyệt đối khi lật thẻ */}
                            <div className="flex-1 flex flex-col items-center justify-center py-4 min-h-[140px] md:min-h-[160px]">
                                {audioGate ? (
                                    <div className="flex flex-col items-center gap-3 py-4">
                                        <button
                                            type="button"
                                            autoFocus
                                            onClick={() => setListening(true)}
                                            className="inline-flex items-center gap-2 px-6 py-3 min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-label-md font-semibold shadow-sm hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                                headphones
                                            </span>
                                            Bắt đầu nghe
                                        </button>
                                        <p className="text-label-sm text-slate-500 max-w-sm">
                                            Chế độ chỉ nghe: chữ được ẩn, từ tự đọc khi hiện thẻ. Bấm để trình duyệt cho phép phát âm.
                                        </p>
                                    </div>
                                ) : shouldHideTerm(audioOnly, revealed) ? (
                                    <div className="flex flex-col items-center gap-2 text-slate-500 min-h-24 justify-center">
                                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 mb-1">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[32px]">
                                                headphones
                                            </span>
                                        </div>
                                        <span className="sr-only">Chữ đang ẩn, từ đang được đọc</span>
                                        <p className="text-label-md text-slate-600">
                                            Nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-xs">R</kbd> để nghe lại /{" "}
                                            <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-xs">Space</kbd> để lật
                                        </p>
                                    </div>
                                ) : revealed ? (
                                    frontSide === "reading" ? (
                                        <div lang="ja" className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-snug font-japanese inline-flex items-center justify-center flex-wrap gap-1.5">
                                            <span>{splitTermPos(current.term).cleanTerm}</span>
                                            {splitTermPos(current.term).tag && (
                                                <span className="text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle tracking-normal">
                                                    {splitTermPos(current.term).tag}
                                                </span>
                                            )}
                                        </div>
                                    ) : frontSide === "meaning" ? (
                                        <div lang="ja" className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-snug font-japanese">
                                            <Ruby
                                                term={current.term}
                                                reading={current.reading ?? undefined}
                                                segments={current.readingSegments}
                                                style="ruby"
                                            />
                                        </div>
                                    ) : furiganaStyle === "stacked" ? (
                                        <Ruby
                                            term={current.term}
                                            reading={current.reading ?? undefined}
                                            segments={current.readingSegments}
                                            style="stacked"
                                        />
                                    ) : (
                                        <div lang="ja" className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-snug font-japanese">
                                            <Ruby
                                                term={current.term}
                                                reading={current.reading ?? undefined}
                                                segments={current.readingSegments}
                                                style="ruby"
                                            />
                                        </div>
                                    )
                                ) : frontSide === "meaning" ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-2 px-4">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                            Định nghĩa / Nghĩa tiếng Việt
                                        </span>
                                        <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed max-w-lg mx-auto whitespace-pre-line">
                                            {current.meaning}
                                        </div>
                                    </div>
                                ) : frontSide === "reading" ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                            Cách đọc (Furigana / Hiragana)
                                        </span>
                                        <div lang="ja" className="text-3xl md:text-4xl font-bold font-japanese text-slate-800 leading-snug">
                                            {current.reading || current.term}
                                        </div>
                                        <p className="text-xs text-slate-400 italic">
                                            (Lật thẻ để xem chữ Kanji và định nghĩa)
                                        </p>
                                    </div>
                                ) : (
                                    <div lang="ja" className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-snug font-japanese inline-flex items-center justify-center flex-wrap gap-1.5">
                                        <span>{splitTermPos(current.term).cleanTerm}</span>
                                        {splitTermPos(current.term).tag && (
                                            <span className="text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle tracking-normal">
                                                {splitTermPos(current.term).tag}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Đường kẻ phân cách cố định giữa 2 nửa */}
                            <div className="w-full border-t border-slate-100 shrink-0" />

                            {/* Nửa dưới thẻ: Khi chưa lật thì hiện CTA 'Hiện đáp án'; khi lật thì hiện Nghĩa & Cách đọc - Vị trí cố định, animate-fadeIn êm ái */}
                            <div aria-live="polite" className="flex-1 flex flex-col items-center justify-center py-4 min-h-[160px] md:min-h-[190px] w-full">
                                {revealed ? (
                                    <div className="w-full text-center animate-fadeIn motion-reduce:animate-none px-4">
                                        {frontSide === "term" && furiganaStyle === "stacked" && current.reading ? (
                                            <div className="space-y-2">
                                                <div lang="ja" className="text-xl md:text-2xl font-japanese font-bold text-blue-700 tracking-wide select-none">
                                                    {current.reading}
                                                </div>
                                                <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line max-w-lg mx-auto">
                                                    {current.meaning}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-body-md md:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line max-w-lg mx-auto">
                                                {current.meaning}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            reveal();
                                        }}
                                        className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-label-md font-semibold border border-slate-200/80 shadow-xs hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-2 cursor-pointer"
                                    >
                                        <span>Hiện đáp án</span>
                                        <kbd className="text-xs px-1.5 py-0.5 rounded bg-white text-slate-700 font-mono shadow-2xs border border-slate-200">Space</kbd>
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {messages}

                {revealed && (
                    <div className="grid grid-cols-4 gap-2.5">
                        {GRADES.map((g) => {
                            const interval = current ? estimateNextInterval(data?.reviews[current.id], g.grade) : null;
                            return (
                                <button
                                    key={g.grade}
                                    type="button"
                                    onClick={() => void grade(g.grade)}
                                    className={`py-2.5 px-1.5 rounded-xl font-label-md font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all shadow-xs hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 flex flex-col items-center justify-center gap-1 min-h-[68px] ${g.buttonClassName}`}
                                >
                                    <span className="text-base font-bold leading-tight">{g.label}</span>
                                    {interval && (
                                        <span className="text-xs font-semibold opacity-90 leading-tight">
                                            {interval.text}
                                        </span>
                                    )}
                                    <kbd className={`text-[11px] px-1.5 py-0.2 rounded font-mono font-medium ${g.kbdClassName}`}>{g.key}</kbd>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Gợi ý phím tắt: chỉ máy có chuột (điện thoại xem trong bảng khi bấm nút bàn phím) */}
                <p className="hidden [@media(hover:hover)]:block text-center text-label-sm text-slate-500">
                    Nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs">?</kbd> để xem phím tắt
                </p>
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
            <ShortcutHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </section>
    );
};

export default StudyPage;
