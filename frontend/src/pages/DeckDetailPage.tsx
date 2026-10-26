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
import { SaveToFolderModal } from "@/features/decks/components/SaveToFolderModal";
import { canEditDeck, deckSourceLabel } from "@/lib/deckUtils";
import { useDialog } from "@/components/ui/dialogContext";
import { CardContent } from "@/features/decks/components/CardContent";
import { DeckRatings } from "@/features/decks/components/DeckRatings";
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
    const [isShareOpen, setIsShareOpen] = useState(false);
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
    // Người xem (mở từ liên kết chia sẻ / Thư viện / được mời chỉ xem): không sửa được bản gốc,
    // nên hành động chính là lưu bản sao về tài khoản mình (D2).
    const isViewer = deck.access === "viewer";
    const canEdit = canEditDeck(deck);
    const now = new Date();
    const dueCount = deck.cards.filter((c) => isDue(reviews[c.id], now)).length;
    const mastered = deck.cards.filter((c) => (reviews[c.id]?.intervalDays ?? 0) >= 21).length;
    const masteryPct = deck.cards.length ? Math.round((mastered / deck.cards.length) * 100) : 0;

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

    // Bản sao đã nằm ở tài khoản người dùng: báo rồi đưa tới đúng chỗ (thư mục đã chọn / Bộ thẻ của tôi),
    // cùng đích với toast ở trang Thư viện.
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
                                to={`/decks/${deck.id}/study?cram=1`}
                                title="Ôn lại toàn bộ thẻ ngay, không đổi lịch ôn dài hạn"
                                className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label-md font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-opacity"
                            >
                                Học nhanh
                            </Link>
                            <Link
                                to={`/decks/${deck.id}/quiz`}
                                className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label-md font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-opacity"
                            >
                                Kiểm tra
                            </Link>
                        </>
                    )}

                    {isViewer && (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => setIsSaveCopyOpen(true)}
                            className="cursor-pointer"
                            title="Sao chép bộ thẻ này về thư mục của bạn để tự chỉnh sửa"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">bookmark_add</span>
                            Lưu bản sao
                        </Button>
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

                    {/* Báo cáo vi phạm: bộ thẻ public của người khác (UC-41) */}
                    {!isOwner && deck.visibility === "public" && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => setIsReportOpen(true)}
                            disabled={reported}
                            className="cursor-pointer"
                            title={reported ? "Bạn đã báo cáo bộ thẻ này" : "Báo cáo nội dung sai / vi phạm"}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">flag</span>
                            {reported ? "Đã báo cáo" : "Báo cáo"}
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

            {pathLink && canEdit && <DeckPathNotice link={pathLink} />}

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
                                    <div className="text-title-md font-semibold flex items-baseline gap-2 flex-wrap">
                                        <Ruby term={card.term} reading={card.reading ?? undefined} segments={card.readingSegments} />
                                        {/* Thẻ sinh từ bóc tách AI có âm Hán-Việt -> badge + link sang bản đồ Hán–Việt (F1) */}
                                        {card.hanViet && <HanVietBadge hanViet={card.hanViet} />}
                                        {/* C5: tra các chữ Hán của thẻ (âm On/Kun, bộ thủ, ví dụ) */}
                                        {hasCjkIdeograph(card.term) && (
                                            <Link
                                                to={`/kanji?k=${encodeURIComponent(extractKanji(card.term).join(""))}`}
                                                className="inline-flex items-center gap-0.5 text-label-sm font-medium text-primary hover:underline whitespace-nowrap"
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
                                    <div className="text-body-sm text-on-surface-variant mt-0.5">
                                        <CardContent
                                            text={card.meaning}
                                            headClassName=""
                                            restClassName="text-label-md text-outline mt-1"
                                        />
                                    </div>
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

                                    {/* Luyện phát âm / trọng âm ngay trong trình duyệt; panel tự báo khi trình duyệt không hỗ trợ */}
                                    <button
                                        type="button"
                                        onClick={() => setPracticeCard(card)}
                                        aria-label={`Luyện phát âm ${card.term}`}
                                        className="p-2 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                                        title="Luyện phát âm"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                            mic
                                        </span>
                                    </button>

                                    {/* Luyện viết: chỉ thẻ có chữ Hán; mở với chữ đầu tiên của từ */}
                                    {hasCjkIdeograph(card.term) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setWriteCard(card);
                                                setWriteKanji(extractKanji(card.term)[0] ?? "");
                                            }}
                                            aria-label={`Luyện viết kanji trong ${card.term}`}
                                            className="p-2 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                                            title="Luyện viết kanji"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
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

            {/* Đánh giá: chỉ bộ thẻ public (chủ chỉ xem, không tự chấm) */}
            {deck.visibility === "public" && <DeckRatings deckId={deck.id} isOwner={isOwner} />}

            {/* Card Add/Edit Modal */}
            <CardModal
                isOpen={isCardModalOpen}
                onClose={() => setIsCardModalOpen(false)}
                initialCard={editingCard}
                onSave={handleSaveCard}
            />

            <ReportDeckModal deckId={deck.id} isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} onReported={markReported} />

            {/* Luyện phát âm: key theo thẻ để đổi thẻ là panel dựng lại từ đầu (bỏ kết quả cũ, dừng ghi âm) */}
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

            {/* Luyện viết kanji: key theo chữ để đổi chữ là panel dựng lại (bỏ nét vẽ / kết quả cũ).
                Panel tự tải nét mẫu KanjiVG + chấm điểm qua máy chủ; chưa có nét mẫu thì vẫn vẽ, hoàn tác, đếm nét được. */}
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
                                <span className="text-label-md text-on-surface-variant mr-1">Chữ:</span>
                                {writeKanjiList.map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        lang="ja"
                                        aria-pressed={k === writeKanji}
                                        onClick={() => setWriteKanji(k)}
                                        className={`w-10 h-10 rounded-lg border font-japanese text-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                                            k === writeKanji
                                                ? "bg-primary text-on-primary border-primary"
                                                : "bg-surface-container-lowest text-on-surface border-outline-variant hover:border-primary"
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

            {/* Lưu bản sao: dùng chung modal với Thư viện; chỉ có số thẻ, không có số lượt quiz */}
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
