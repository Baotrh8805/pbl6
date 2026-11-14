import React, { useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { fetchDeck, deleteDeck, addCard, updateCard, deleteCard, resetDeckProgress } from "@/services/deckService";
import { CARD_SORTS, sortCards, type CardSort } from "@/features/decks/deckListUtils";
import { withinDays } from "@/lib/timeLabel";
import { fetchReviews } from "@/services/studyService";
import type { Card, CardDto } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { isDue } from "@/lib/srs";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak } from "@/lib/speech";
import { Button } from "@/components/ui/Button";
import { CardModal } from "@/features/decks/components/DeckModals";
import { ShareDeckModal } from "@/features/decks/components/ShareDeckModal";
import { DeckExportMenu } from "@/features/decks/components/DeckExportMenu";
import { SaveToFolderModal } from "@/features/decks/components/SaveToFolderModal";
import { canEditDeck, deckSourceLabel } from "@/lib/deckUtils";
import { useDialog } from "@/components/ui/dialogContext";
import { CardContent } from "@/features/decks/components/CardContent";
import { DeckRatings } from "@/features/decks/components/DeckRatings";
import { DeckRecallChip } from "@/features/decks/components/DeckRecallChip";
import { ReportDeckModal } from "@/features/library/components/ReportDeckModal";
import { useReportedByMe } from "@/features/library/useReportedByMe";
import { Modal } from "@/components/ui/Modal";
import { PronunciationPanel } from "@/features/practice/components/PronunciationPanel";
import { KanjiWritePanel } from "@/features/practice/components/KanjiWritePanel";
import { extractKanji, hasCjkIdeograph } from "@/lib/textUtils";
import { HanVietBadge } from "@/features/hanviet/components/HanVietBadge";
import { useDeckLearningPath } from "@/features/roadmap/useDeckLearningPath";
import { DeckPathNotice } from "@/features/roadmap/components/DeckPathNotice";
import { deleteCardMessage, deleteDeckMessage } from "@/features/roadmap/roadmapUtils";

const LEVEL_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-900 border-blue-300",
  N4: "bg-emerald-100 text-emerald-900 border-emerald-300",
  N3: "bg-amber-100 text-amber-900 border-amber-300",
  N2: "bg-rose-100 text-rose-900 border-rose-300",
  N1: "bg-purple-100 text-purple-900 border-purple-300",
};

export const DeckDetailPage: React.FC = () => {
    const { deckId = "" } = useParams();
    const navigate = useNavigate();
    const dialog = useDialog();

    const [refreshIndex, setRefreshIndex] = useState(0);
    const { data, error, loading } = useAsync(
        async () => ({ deck: await fetchDeck(deckId), reviews: await fetchReviews() }),
        [deckId],
        refreshIndex // sửa / xoá thẻ xong tải lại ngầm, không nháy "Đang tải"
    );

    // Modal states
    const [isCardModalOpen, setIsCardModalOpen] = useState(false);
    const [editingCard, setEditingCard] = useState<Card | null>(null);
    // ?share=1 (từ menu thẻ / sau khi tạo bộ với ô "mở hộp Chia sẻ"): mở hộp Chia sẻ ngay khi vào trang
    const [searchParams, setSearchParams] = useSearchParams();
    const [isShareOpen, setIsShareOpen] = useState(searchParams.get("share") === "1");
    const [cardSort, setCardSort] = useState<CardSort>("position");
    const [cardPeriod, setCardPeriod] = useState<0 | 1 | 7 | 30>(0);
    const [isSaveCopyOpen, setIsSaveCopyOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reported, markReported] = useReportedByMe(
        deckId,
        !!data && data.deck.access !== "owner" && data.deck.visibility === "public"
    );
    // Thẻ đang mở hộp luyện phát âm (E3/E4); null = đóng.
    const [practiceCard, setPracticeCard] = useState<Card | null>(null);
    // Thẻ đang mở hộp luyện viết kanji (E2) + chữ đang chọn trong thẻ; null = đóng.
    const [writeCard, setWriteCard] = useState<Card | null>(null);
    const [writeKanji, setWriteKanji] = useState("");
    const writeKanjiList = writeCard ? extractKanji(writeCard.term) : [];
    // LP-15: thêm / sửa / xoá thẻ ngay tại trang này -> cùng lời nhắc lịch lộ trình như trang sửa bộ thẻ.
    const pathLink = useDeckLearningPath(data?.deck);

    if (loading) {
        return (
            <div className="flex flex-col gap-6 pb-12" aria-busy="true" aria-label="Đang tải thông tin bộ thẻ">
                {/* Breadcrumb Skeleton */}
                <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />

                {/* Hero Header Skeleton */}
                <div className="rounded-2xl border border-slate-200/90 p-6 md:p-8 bg-white shadow-xs space-y-6 animate-pulse">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="space-y-3 flex-1">
                            <div className="flex items-center gap-2">
                                <div className="h-6 w-14 rounded-lg bg-slate-200" />
                                <div className="h-4 w-28 rounded bg-slate-100" />
                            </div>
                            <div className="h-8 w-2/3 rounded-lg bg-slate-200" />
                            <div className="h-4 w-3/4 rounded bg-slate-100" />
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <div className="h-7 w-24 rounded-lg bg-slate-100" />
                                <div className="h-7 w-28 rounded-lg bg-slate-100" />
                                <div className="h-7 w-28 rounded-lg bg-slate-100" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="h-10 w-32 rounded-xl bg-slate-200" />
                            <div className="h-10 w-24 rounded-xl bg-slate-100" />
                        </div>
                    </div>
                </div>

                {/* Toolbar Skeleton */}
                <div className="h-12 w-full rounded-2xl bg-white border border-slate-200 animate-pulse" />

                {/* Flashcard Rows Skeleton */}
                <div className="space-y-3">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-4 animate-pulse">
                            <div className="space-y-2 flex-1">
                                <div className="h-5 w-28 rounded bg-slate-200" />
                                <div className="h-4 w-48 rounded bg-slate-100" />
                            </div>
                            <div className="h-8 w-16 rounded-lg bg-slate-100" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="py-8 flex flex-col items-start gap-3">
                <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm w-full">
                    {error || "Không tìm thấy bộ thẻ."}
                </div>
                <Link to="/decks" className="text-blue-600 hover:underline font-semibold text-sm inline-flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Quay về Bộ thẻ của tôi
                </Link>
            </div>
        );
    }

    const { deck, reviews } = data;
    const isOwner = deck.access === "owner";
    const isViewer = deck.access === "viewer";
    const canEdit = canEditDeck(deck);
    const now = new Date();
    const dueCount = deck.cards.filter((c) => !!reviews[c.id] && isDue(reviews[c.id], now)).length;
    const newCount = deck.cards.filter((c) => !reviews[c.id]).length;
    const learnedCount = deck.cards.filter((c) => !!reviews[c.id]).length;
    const mastered = deck.cards.filter((c) => (reviews[c.id]?.intervalDays ?? 0) >= 21).length;
    const masteryPct = deck.cards.length ? Math.round((mastered / deck.cards.length) * 100) : 0;
    const visibleCards = sortCards(
        cardPeriod ? deck.cards.filter((c) => withinDays(c.createdAt ?? null, cardPeriod, now)) : deck.cards,
        cardSort
    );
    const levelClass = LEVEL_BADGES[deck.level] ?? "bg-slate-100 text-slate-800 border-slate-200";

    const handleResetProgress = async () => {
        const ok = await dialog.confirm({
            title: "Học lại từ đầu?",
            message: `Lịch ôn của bạn với ${learnedCount} thẻ trong bộ "${deck.title}" sẽ được đặt lại: mọi thẻ thành thẻ mới, nhật ký ôn vẫn giữ cho thống kê.`,
            confirmLabel: "Đặt lại và học",
            tone: "warning",
            action: () => resetDeckProgress(deck.id),
        });
        if (ok) navigate(`/decks/${encodeURIComponent(deck.id)}/study`);
    };

    const handleDeleteDeck = async () => {
        const ok = await dialog.confirm({
            title: "Xoá bộ thẻ?",
            message: deleteDeckMessage(deck.title, pathLink),
            confirmLabel: "Xoá bộ thẻ",
            tone: "danger",
            action: () => deleteDeck(deck.id),
        });
        if (ok) navigate("/decks");
    };

    const handleSaveCard = async (dto: CardDto) => {
        if (editingCard) {
            await updateCard(deck.id, editingCard.id, dto);
        } else {
            await addCard(deck.id, dto);
        }
        setRefreshIndex((n) => n + 1);
    };

    const handleDeleteCard = async (card: Card) => {
        const ok = await dialog.confirm({
            title: "Xoá thẻ?",
            message: deleteCardMessage(card.term, pathLink),
            confirmLabel: "Xoá thẻ",
            tone: "danger",
            action: () => deleteCard(deck.id, card.id),
        });
        if (ok) setRefreshIndex((n) => n + 1);
    };

    const handleSavedCopy = async (folderId: string | null) => {
        await dialog.alert({
            title: "Đã lưu bản sao",
            message: `Bản sao của "${deck.title}" đã có trong tài khoản của bạn. Bạn có thể sửa thoải mái mà không ảnh hưởng bản gốc.`,
            okLabel: folderId ? "Mở thư mục" : "Xem bộ thẻ của tôi",
            tone: "success",
        });
        navigate(folderId ? `/decks?folderId=${encodeURIComponent(folderId)}` : "/decks");
    };

    return (
        <section className="flex flex-col gap-6 pb-12">
            {/* Breadcrumb Navigation */}
            <nav aria-label="Đường dẫn">
                <Link to="/decks" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Bộ thẻ của tôi</span>
                </Link>
            </nav>

            {/* Deck Hero Card */}
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${levelClass}`}>
                            {deck.level}
                        </span>
                        {isOwner ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-semibold">
                                Cá nhân
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 text-xs font-medium">
                                {deckSourceLabel(deck)}
                            </span>
                        )}
                    </div>

                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                        {deck.title}
                    </h1>

                    {deck.description && (
                        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                            {deck.description}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs font-semibold text-slate-700">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                            📚 {deck.cards.length} thẻ
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                            dueCount > 0
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : newCount > 0
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-100 text-slate-700 border-transparent"
                        }`}>
                            {dueCount > 0 ? `⏰ ${dueCount} thẻ đến hạn` : newCount > 0 ? `✨ ${newCount} thẻ mới` : "✅ Đã ôn xong"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🎯 Thành thạo {masteryPct}%
                        </span>
                        {learnedCount > 0 && <DeckRecallChip deckId={deck.id} />}
                    </div>
                </div>

                {/* Hero Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {deck.cards.length > 0 && (
                        <>
                            {dueCount > 0 ? (
                                <>
                                    <Link
                                        to={`/decks/${deck.id}/study`}
                                        title="Ôn các thẻ đến hạn hôm nay"
                                        className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-sm shadow-xs transition-all flex items-center gap-1.5"
                                    >
                                        <span>Ôn ngay ({dueCount})</span>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">play_arrow</span>
                                    </Link>
                                    <Link
                                        to={`/decks/${deck.id}/study?cram=1`}
                                        title="Ôn lại toàn bộ thẻ ngay, không đổi lịch ôn dài hạn"
                                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                                    >
                                        Học nhanh
                                    </Link>
                                </>
                            ) : newCount > 0 ? (
                                <>
                                    <Link
                                        to={`/decks/${deck.id}/study`}
                                        title="Bắt đầu học các thẻ mới trong bộ"
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition-all flex items-center gap-1.5"
                                    >
                                        <span>Học mới ({newCount})</span>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">play_arrow</span>
                                    </Link>
                                    <Link
                                        to={`/decks/${deck.id}/study?cram=1`}
                                        title="Ôn lại toàn bộ thẻ ngay, không đổi lịch ôn dài hạn"
                                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                                    >
                                        Học nhanh
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to={`/decks/${deck.id}/study?cram=1`}
                                        title="Ôn lại toàn bộ thẻ, không đổi lịch ôn dài hạn"
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition-all flex items-center gap-1.5"
                                    >
                                        <span>Ôn lại cả bộ</span>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">play_arrow</span>
                                    </Link>
                                    {learnedCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => void handleResetProgress()}
                                            title="Xoá lịch ôn để học lại từ đầu như thẻ mới"
                                            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                                        >
                                            Học lại từ đầu
                                        </button>
                                    )}
                                </>
                            )}

                            <Link
                                to={`/decks/${deck.id}/quiz`}
                                className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
                            >
                                Kiểm tra Quiz
                            </Link>
                        </>
                    )}

                    {isViewer && (
                        <button
                            type="button"
                            onClick={() => setIsSaveCopyOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Sao chép bộ thẻ này về thư mục của bạn để tự chỉnh sửa"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">bookmark_add</span>
                            <span>Lưu bản sao</span>
                        </button>
                    )}

                    {isOwner && (
                        <button
                            type="button"
                            onClick={() => setIsShareOpen(true)}
                            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Chia sẻ quyền hoặc đăng lên Thư viện cộng đồng"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">share</span>
                            <span>{deck.visibility === "public" ? "Chia sẻ · Công khai" : "Chia sẻ"}</span>
                        </button>
                    )}

                    <DeckExportMenu deckId={deck.id} />

                    {!isOwner && deck.visibility === "public" && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => setIsReportOpen(true)}
                            disabled={reported}
                            className="cursor-pointer text-xs"
                            title={reported ? "Bạn đã báo cáo bộ thẻ này" : "Báo cáo nội dung sai / vi phạm"}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">flag</span>
                            {reported ? "Đã báo cáo" : "Báo cáo"}
                        </Button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/edit`)}
                            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Chỉnh sửa bộ thẻ & danh sách từ vựng"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
                            <span>Sửa</span>
                        </button>
                    )}

                    {isOwner && (
                        <button
                            type="button"
                            onClick={handleDeleteDeck}
                            className="px-3 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Xoá bộ thẻ này"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
                            <span>Xoá</span>
                        </button>
                    )}
                </div>
            </header>

            {pathLink && canEdit && <DeckPathNotice link={pathLink} />}

            {/* Flashcards List Section */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-lg text-slate-900">
                            Danh sách thẻ ({visibleCards.length === deck.cards.length ? deck.cards.length : `${visibleCards.length}/${deck.cards.length}`})
                        </h2>
                        {deck.cards.length > 1 && (
                            <>
                                <label className="sr-only" htmlFor="card-sort">Sắp xếp thẻ</label>
                                <select
                                    id="card-sort"
                                    value={cardSort}
                                    onChange={(e) => setCardSort(e.target.value as CardSort)}
                                    className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {CARD_SORTS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <label className="sr-only" htmlFor="card-period">Lọc thẻ theo thời gian thêm</label>
                                <select
                                    id="card-period"
                                    value={cardPeriod}
                                    onChange={(e) => setCardPeriod(Number(e.target.value) as 0 | 1 | 7 | 30)}
                                    className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={0}>Mọi thời gian</option>
                                    <option value={1}>Thêm hôm nay</option>
                                    <option value={7}>Thêm 7 ngày qua</option>
                                    <option value={30}>Thêm 30 ngày qua</option>
                                </select>
                            </>
                        )}
                    </div>

                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/add-cards`)}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
                            <span>Thêm thẻ mới</span>
                        </button>
                    )}
                </div>

                {deck.cards.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white border border-dashed border-slate-300 flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">style</span>
                        </div>
                        <p className="text-sm text-slate-600">
                            Bộ thẻ này hiện chưa có thẻ từ vựng nào.
                        </p>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/add-cards`)}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px] mr-1 align-text-bottom">add</span>
                                Thêm thẻ đầu tiên
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="flex flex-col gap-2.5">
                        {visibleCards.map((card) => (
                            <li
                                key={card.id}
                                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-blue-300 transition-all"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-base font-bold flex items-baseline gap-2 flex-wrap text-slate-900">
                                        <Ruby term={card.term} reading={card.reading ?? undefined} segments={card.readingSegments} />
                                        {card.hanViet && <HanVietBadge hanViet={card.hanViet} />}
                                        {hasCjkIdeograph(card.term) && (
                                            <Link
                                                to={`/kanji?k=${encodeURIComponent(extractKanji(card.term).join(""))}`}
                                                className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                                                title={`Tra chữ Hán trong «${card.term}»`}
                                                aria-label={`Tra chữ Hán trong ${card.term}`}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                                                    translate
                                                </span>
                                                Chữ Hán
                                            </Link>
                                        )}
                                    </div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        <CardContent
                                            text={card.meaning}
                                            headClassName="text-slate-700 font-medium"
                                            restClassName="text-xs text-slate-400 mt-0.5"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {canSpeak && (
                                        <button
                                            type="button"
                                            onClick={() => speak(card.term)}
                                            aria-label={`Phát âm ${card.term}`}
                                            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                                            title="Nghe phát âm"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                                volume_up
                                            </span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setPracticeCard(card)}
                                        aria-label={`Luyện phát âm ${card.term}`}
                                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                        title="Luyện phát âm"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                            mic
                                        </span>
                                    </button>

                                    {hasCjkIdeograph(card.term) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setWriteCard(card);
                                                setWriteKanji(extractKanji(card.term)[0] ?? "");
                                            }}
                                            aria-label={`Luyện viết kanji trong ${card.term}`}
                                            className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                            title="Luyện viết kanji"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                                draw
                                            </span>
                                        </button>
                                    )}

                                    {canEdit && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingCard(card);
                                                    setIsCardModalOpen(true);
                                                }}
                                                className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                                title="Sửa thẻ này"
                                                aria-label={`Sửa thẻ ${card.term}`}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCard(card)}
                                                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                title="Xoá thẻ này"
                                                aria-label={`Xoá thẻ ${card.term}`}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Đánh giá: chỉ bộ thẻ public */}
            {deck.visibility === "public" && <DeckRatings deckId={deck.id} isOwner={isOwner} />}

            {/* Card Add/Edit Modal */}
            <CardModal
                isOpen={isCardModalOpen}
                onClose={() => setIsCardModalOpen(false)}
                initialCard={editingCard}
                onSave={handleSaveCard}
            />

            <ReportDeckModal deckId={deck.id} isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} onReported={markReported} />

            {/* Modal Luyện phát âm */}
            <Modal
                isOpen={practiceCard !== null}
                onClose={() => setPracticeCard(null)}
                title="Luyện phát âm"
                icon="mic"
                subtitle={practiceCard ? `${practiceCard.term}${practiceCard.reading ? ` · ${practiceCard.reading}` : ""}` : undefined}
                size="xl"
            >
                {practiceCard && (
                    <PronunciationPanel
                        key={practiceCard.id}
                        term={practiceCard.term}
                        reading={practiceCard.reading}
                        cardId={practiceCard.id}
                    />
                )}
            </Modal>

            {/* Modal Luyện viết kanji */}
            <Modal
                isOpen={writeCard !== null}
                onClose={() => setWriteCard(null)}
                title="Luyện viết kanji"
                icon="draw"
                subtitle={writeCard ? `${writeCard.term}${writeCard.reading ? ` · ${writeCard.reading}` : ""}` : undefined}
                size="xl"
            >
                {writeCard && writeKanji && (
                    <div className="flex flex-col gap-4">
                        {writeKanjiList.length > 1 && (
                            <div role="group" aria-label="Chọn chữ để luyện viết" className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-500 mr-1">Chữ:</span>
                                {writeKanjiList.map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        lang="ja"
                                        aria-pressed={k === writeKanji}
                                        onClick={() => setWriteKanji(k)}
                                        className={`w-10 h-10 rounded-xl border font-japanese text-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                            k === writeKanji
                                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                                : "bg-white text-slate-800 border-slate-200 hover:border-blue-400"
                                        }`}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        )}
                        <KanjiWritePanel key={writeKanji} kanji={writeKanji} cardId={writeCard.id} />
                    </div>
                )}
            </Modal>

            {/* Lưu bản sao */}
            {isViewer && (
                <SaveToFolderModal
                    isOpen={isSaveCopyOpen}
                    onClose={() => setIsSaveCopyOpen(false)}
                    deck={{
                        id: deck.id,
                        title: deck.title,
                        level: deck.level,
                        description: deck.description,
                        cardsCount: deck.cards.length,
                    }}
                    onSaved={(folderId) => void handleSavedCopy(folderId)}
                />
            )}

            {isShareOpen && isOwner && (
                <ShareDeckModal
                    deck={deck}
                    onClose={() => {
                        setIsShareOpen(false);
                        if (searchParams.get("share")) {
                            const next = new URLSearchParams(searchParams);
                            next.delete("share");
                            setSearchParams(next, { replace: true });
                        }
                        setRefreshIndex((n) => n + 1);
                    }}
                />
            )}
        </section>
    );
};

export default DeckDetailPage;
