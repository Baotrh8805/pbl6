import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchDeck } from "@/services/deckService";
import { fetchReviews, submitReview } from "@/services/studyService";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak } from "@/lib/speech";
import { useAsync } from "@/lib/useAsync";
import { isDue, type Grade } from "@/lib/srs";
import { extractErrorMessage } from "@/services/apiClient";
import { CardContent } from "@/features/decks/components/CardContent";

const GRADES: { grade: Grade; label: string; key: string; className: string }[] = [
    { grade: "again", label: "Lại", key: "1", className: "bg-error text-on-primary" },
    { grade: "hard", label: "Khó", key: "2", className: "bg-surface-container-high text-on-surface" },
    { grade: "good", label: "Tốt", key: "3", className: "bg-primary text-on-primary" },
    { grade: "easy", label: "Dễ", key: "4", className: "bg-secondary text-on-primary" },
];

export const StudyPage: React.FC = () => {
    const { deckId = "" } = useParams(); // deckId từ URL: server kiểm quyền, sai thì 404
    const cram = useSearchParams()[0].get("cram") === "1"; // Học nhanh: ôn cả bộ, không đổi lịch dài hạn
    const { data, error, loading } = useAsync(
        async () => ({ deck: await fetchDeck(deckId), reviews: await fetchReviews() }),
        [deckId]
    );

    // Hàng đợi gắn với deckId: sang bộ thẻ khác thì chốt lại hàng đợi mới.
    const [queueState, setQueueState] = useState<{ deckId: string; ids: string[] } | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);

    // Hàng đợi chốt 1 lần lúc dữ liệu về: chấm điểm không làm danh sách nhảy loạn.
    if (data && queueState?.deckId !== deckId) {
        const now = new Date();
        setQueueState({
            deckId,
            ids: data.deck.cards.filter((c) => cram || isDue(data.reviews[c.id], now)).map((c) => c.id),
        });
    }

    const queue = queueState?.deckId === deckId ? queueState.ids : null;
    const current = data?.deck.cards.find((c) => c.id === queue?.[0]);

    const grade = async (g: Grade) => {
        if (!current || saving) return;
        setSaving(true);
        try {
            await submitReview(current.id, g, cram); // lưu từng thẻ: thoát giữa chừng không mất tiến độ
            setSaveError("");
            setRevealed(false);
            setQueueState((s) =>
                s === null ? s : { ...s, ids: g === "again" ? [...s.ids.slice(1), s.ids[0]] : s.ids.slice(1) }
            );
        } catch (e) {
            // Lỗi mạng -> bấm lại; lỗi từ server (mất quyền, thẻ bị xoá...) -> hiện đúng lý do
            setSaveError(`Chưa lưu được kết quả: ${extractErrorMessage(e)}`);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            if (e.code === "Space") {
                e.preventDefault();
                setRevealed(true);
                return;
            }
            const hit = GRADES.find((g) => g.key === e.key);
            if (hit && revealed) void grade(hit.grade);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (loading || error || !data) {
        return (
            <section
                aria-live="polite"
                className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center gap-space-md px-gutter text-center"
            >
                <p>{loading ? "Đang tải bộ thẻ…" : error}</p>
                {!loading && (
                    <Link to="/decks" className="text-primary hover:underline">
                        ← Về danh sách bộ thẻ
                    </Link>
                )}
            </section>
        );
    }

    const deck = data.deck;

    if (!current) {
        return (
            <section className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center gap-space-md px-gutter text-center">
                <h1 className="font-headline-sm text-headline-sm font-bold">Xong phiên hôm nay 🎉</h1>
                <p className="text-on-surface-variant">Không còn thẻ nào đến hạn trong bộ «{deck.title}».</p>
                <Link
                    to={`/decks/${deck.id}`}
                    className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold"
                >
                    Về chi tiết bộ thẻ
                </Link>
            </section>
        );
    }

    return (
        // Toàn màn hình, không header/sidebar: tập trung khi học.
        <section className="min-h-screen bg-surface text-on-surface px-gutter py-space-lg">
            <div className="max-w-2xl mx-auto flex flex-col gap-space-lg">
                <div className="flex items-center justify-between text-label-md text-on-surface-variant">
                    <Link to={`/decks/${deck.id}`} className="text-primary hover:underline">
                        ← Thoát
                    </Link>
                    <span aria-live="polite">Còn {queue?.length ?? 0} thẻ</span>
                </div>

                <div className="p-space-xl rounded-2xl bg-surface-container-lowest border border-surface-container-high text-center">
                    <div lang="ja" className="text-display-sm font-bold">
                        {revealed ? (
                            <Ruby term={current.term} reading={current.reading ?? undefined} segments={current.readingSegments} />
                        ) : (
                            current.term
                        )}
                    </div>

                    {canSpeak && (
                        <button
                            type="button"
                            onClick={() => speak(current.term)}
                            aria-label={`Phát âm ${current.term}`}
                            className="mt-2 p-2 rounded-full hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                                volume_up
                            </span>
                        </button>
                    )}

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
        </section>
    );
};

export default StudyPage;
