import React, { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchDeck, deleteDeck, addCard, updateCard, deleteCard } from "@/services/deckService";
import { fetchReviews } from "@/services/studyService";
import type { Card, CardDto } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { isDue } from "@/lib/srs";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak } from "@/lib/speech";
import { Button } from "@/components/ui/Button";
import { CardModal } from "@/features/decks/components/DeckModals";
import { ShareDeckModal } from "@/features/decks/components/ShareDeckModal";
import { canEditDeck, deckSourceLabel } from "@/lib/deckUtils";
import { useDialog } from "@/components/ui/dialogContext";

export const DeckDetailPage: React.FC = () => {
    const { deckId = "" } = useParams();
    const navigate = useNavigate();
    const dialog = useDialog();

    const [refreshIndex, setRefreshIndex] = useState(0);
    const { data, error, loading } = useAsync(
        async () => ({ deck: await fetchDeck(deckId), reviews: await fetchReviews() }),
        [deckId, refreshIndex]
    );

    // Modal states
    const [isCardModalOpen, setIsCardModalOpen] = useState(false);
    const [editingCard, setEditingCard] = useState<Card | null>(null);
    const [isShareOpen, setIsShareOpen] = useState(false);

    if (loading) return <p className="text-on-surface-variant py-space-lg">Đang tải bộ thẻ...</p>;
    if (error || !data)
        return (
            <div className="py-space-lg flex flex-col items-start gap-space-sm">
                <p className="text-error">{error}</p>
                <Link to="/decks" className="text-primary hover:underline">
                    ← Bộ thẻ của tôi
                </Link>
            </div>
        );

    const { deck, reviews } = data;
    const isOwner = deck.access === "owner";
    const canEdit = canEditDeck(deck);
    const now = new Date();
    const dueCount = deck.cards.filter((c) => isDue(reviews[c.id], now)).length;
    const mastered = deck.cards.filter((c) => (reviews[c.id]?.intervalDays ?? 0) >= 21).length;
    const masteryPct = deck.cards.length ? Math.round((mastered / deck.cards.length) * 100) : 0;

    const handleDeleteDeck = async () => {
        const ok = await dialog.confirm({
            title: "Xoá bộ thẻ?",
            message: `Bộ thẻ "${deck.title}" và toàn bộ thẻ từ vựng bên trong sẽ bị xoá vĩnh viễn.`,
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
            message: `Thẻ "${card.term}" sẽ bị xoá khỏi bộ thẻ, kèm lịch sử ôn tập của thẻ này.`,
            confirmLabel: "Xoá thẻ",
            tone: "danger",
            action: () => deleteCard(deck.id, card.id),
        });
        if (ok) setRefreshIndex((n) => n + 1);
    };

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl">
            <nav aria-label="Đường dẫn">
                <Link to="/decks" className="text-label-md text-primary hover:underline inline-flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Bộ thẻ của tôi
                </Link>
            </nav>

            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-space-md p-space-md bg-surface-container-lowest border border-surface-container-high rounded-2xl shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary text-label-sm font-semibold">
                            {deck.level}
                        </span>
                        {isOwner ? (
                            <span className="px-2 py-0.5 rounded-full bg-secondary-container/40 text-secondary text-label-sm font-medium">
                                Cá nhân
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-surface-container text-outline text-label-sm font-medium">
                                {deckSourceLabel(deck)}
                            </span>
                        )}
                    </div>
                    <h1 className="mt-2 font-headline-sm text-headline-sm font-bold text-on-surface">
                        {deck.title}
                    </h1>
                    {deck.description && (
                        <p className="mt-1 text-body-sm text-on-surface-variant max-w-2xl">
                            {deck.description}
                        </p>
                    )}
                    <p className="mt-2 text-label-sm text-outline font-medium">
                        {deck.cards.length} thẻ · {dueCount} thẻ đến hạn · thành thạo {masteryPct}%
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Study & Quiz Actions */}
                    {deck.cards.length > 0 && (
                        <>
                            <Link
                                to={`/decks/${deck.id}/study`}
                                className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs transition-opacity"
                            >
                                Học {dueCount > 0 ? `(${dueCount})` : "lại"}
                            </Link>
                            <Link
                                to={`/decks/${deck.id}/quiz`}
                                className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label-md font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-opacity"
                            >
                                Kiểm tra
                            </Link>
                        </>
                    )}

                    {isOwner && (
                        <Button
                            variant="outline"
                            size="md"
                            onClick={() => setIsShareOpen(true)}
                            className="cursor-pointer"
                            title="Chia sẻ quyền hoặc đăng lên Thư viện cộng đồng"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">share</span>
                            {deck.visibility === "public" ? "Chia sẻ · Công khai" : "Chia sẻ"}
                        </Button>
                    )}

                    {/* Sửa: chủ + người được chia sẻ quyền sửa; xoá bộ thẻ: chỉ chủ */}
                    {canEdit && (
                        <Button
                            variant="outline"
                            size="md"
                            onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/edit`)}
                            className="cursor-pointer"
                            title="Chỉnh sửa bộ thẻ & danh sách từ vựng"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
                            Sửa
                        </Button>
                    )}
                    {isOwner && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={handleDeleteDeck}
                            className="text-error hover:bg-error/10 hover:text-error cursor-pointer"
                            title="Xoá bộ thẻ này"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                            Xoá
                        </Button>
                    )}
                </div>
            </header>

            {/* Flashcards List Section */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-title-md text-title-md font-bold text-on-surface">
                        Danh sách thẻ ({deck.cards.length})
                    </h2>
                    {canEdit && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/add-cards`)}
                            className="cursor-pointer shadow-xs"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                            Thêm thẻ
                        </Button>
                    )}
                </div>

                {deck.cards.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
                        <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">style</span>
                        <p className="text-body-md text-on-surface-variant">
                            Bộ thẻ này hiện chưa có thẻ từ vựng nào.
                        </p>
                        {canEdit && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}/add-cards`)}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
                                Thêm thẻ đầu tiên
                            </Button>
                        )}
                    </div>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {deck.cards.map((card) => (
                            <li
                                key={card.id}
                                className="flex items-center justify-between gap-space-md p-space-sm sm:p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high hover:border-outline-variant transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-title-md font-semibold">
                                        <Ruby term={card.term} reading={card.reading ?? undefined} />
                                    </div>
                                    <div className="text-body-sm text-on-surface-variant mt-0.5">
                                        {card.meaning}
                                    </div>
                                    {card.example && (
                                        <div lang="ja" className="text-body-sm text-outline mt-1 italic">
                                            {card.example}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {canSpeak && (
                                        <button
                                            type="button"
                                            onClick={() => speak(card.term)}
                                            aria-label={`Phát âm ${card.term}`}
                                            className="p-2 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                                            title="Nghe phát âm"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                                volume_up
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
                                                className="p-2 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                                                title="Sửa thẻ này"
                                                aria-label={`Sửa thẻ ${card.term}`}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCard(card)}
                                                className="p-2 rounded-lg text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                                                title="Xoá thẻ này"
                                                aria-label={`Xoá thẻ ${card.term}`}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Card Add/Edit Modal */}
            <CardModal
                isOpen={isCardModalOpen}
                onClose={() => setIsCardModalOpen(false)}
                initialCard={editingCard}
                onSave={handleSaveCard}
            />

            {isShareOpen && (
                <ShareDeckModal
                    deck={deck}
                    // Tải lại khi đóng (không phải ngay khi lưu): tải lại giữa chừng sẽ unmount modal
                    onClose={() => {
                        setIsShareOpen(false);
                        setRefreshIndex((n) => n + 1);
                    }}
                />
            )}
        </section>
    );
};

export default DeckDetailPage;
