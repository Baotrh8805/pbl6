import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { fetchDeck, createDeck, updateDeck, addCardsBatch, suggestDeckLevel, type SuggestLevelResult } from "@/services/deckService";
import { fetchFolders } from "@/services/folderService";
import type { CardDto, Deck, DeckVisibility } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { Button } from "@/components/ui/Button";
import { ImportCardsModal } from "@/features/decks/components/ImportCardsModal";
import { CardRowsEditor } from "@/features/decks/editor/CardRowsEditor";
import { DeckInfoFields } from "@/features/decks/editor/DeckInfoFields";
import {
  createEmptyCard,
  createEmptyCards,
  toEditorCard,
  toValidCardDtos,
  type EditorCard,
} from "@/features/decks/editor/editorCards";
import { flattenFolders } from "@/features/folders/components/folderTree";
import { useDeckLearningPath } from "@/features/roadmap/useDeckLearningPath";
import { DeckPathNotice } from "@/features/roadmap/components/DeckPathNotice";
import { extractErrorMessage } from "@/services/apiClient";
import { useDialog } from "@/components/ui/dialogContext";

interface DeckEditorPageProps {
  mode?: "create" | "edit" | "add-cards";
}

export const DeckEditorPage: React.FC<DeckEditorPageProps> = ({ mode }) => {
  const { deckId } = useParams();
  const [searchParams] = useSearchParams();

  const isAddCardsMode = mode === "add-cards";
  const isEditing = mode === "edit" || (!isAddCardsMode && Boolean(deckId));

  // Tải bộ thẻ (nếu sửa / thêm thẻ) và cây thư mục; lỗi tải thư mục thì bỏ qua
  const deckState = useAsync<Deck | null>(
    () => (deckId ? fetchDeck(deckId) : Promise.resolve(null)),
    [deckId]
  );
  const { data: folderTree } = useAsync(fetchFolders, []);
  const folders = useMemo(
    () => flattenFolders(folderTree ?? []).map((f) => ({ id: f.id, title: f.path })),
    [folderTree]
  );

  if (deckId && deckState.loading) {
    return (
      <div className="py-16 text-center text-on-surface-variant flex flex-col items-center gap-3">
        <span aria-hidden="true" className="material-symbols-outlined text-[36px] animate-spin text-primary">
          progress_activity
        </span>
        <p>Đang tải thông tin bộ thẻ...</p>
      </div>
    );
  }

  // Không mở form khi chưa tải được bộ thẻ: form trống + "Lưu" sẽ gửi danh sách thẻ mới
  // và server xoá toàn bộ thẻ cũ cùng lịch sử ôn tập.
  if (deckId && !deckState.data) {
    return (
      <div role="alert" className="py-16 text-center flex flex-col items-center gap-3">
        <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-error">error</span>
        <p className="text-on-surface">{deckState.error || "Không tìm thấy bộ thẻ."}</p>
        <Link to="/decks" className="text-primary font-semibold hover:underline">
          Quay lại danh sách bộ thẻ
        </Link>
      </div>
    );
  }

  // Form khởi tạo state từ dữ liệu đã tải; đổi bộ thẻ / chế độ thì key đổi -> form mount lại
  return (
    <DeckEditorForm
      key={`${deckId ?? "new"}:${isAddCardsMode ? "add" : "edit"}`}
      deckId={deckId}
      deck={deckState.data ?? null}
      initialFolderId={searchParams.get("folderId") || ""}
      folders={folders}
      isAddCardsMode={isAddCardsMode}
      isEditing={isEditing}
    />
  );
};

interface DeckEditorFormProps {
  deckId?: string;
  deck: Deck | null;
  initialFolderId: string;
  folders: Array<{ id: string; title: string }>;
  isAddCardsMode: boolean;
  isEditing: boolean;
}

function initialCards(deck: Deck | null, isAddCardsMode: boolean): EditorCard[] {
  // Chế độ "Thêm thẻ": chỉ hiện ô trống mới, không hiện thẻ cũ
  if (!deck) return createEmptyCards(isAddCardsMode ? 3 : 5);
  if (isAddCardsMode || deck.cards.length === 0) return createEmptyCards(3);
  return deck.cards.map(toEditorCard);
}

function infoChanged(
  deck: Deck,
  info: { title: string; level: string; description?: string; folderId: string | null; visibility?: DeckVisibility }
): boolean {
  return (
    deck.title !== info.title ||
    (info.visibility !== undefined && deck.visibility !== info.visibility) ||
    deck.level !== info.level ||
    (deck.description || undefined) !== info.description ||
    // Người không phải chủ không thấy thư mục (folderId luôn null) và cũng không đổi được
    (deck.access === "owner" && (deck.folderId || null) !== info.folderId)
  );
}

const DeckEditorForm: React.FC<DeckEditorFormProps> = ({
  deckId,
  deck,
  initialFolderId,
  folders,
  isAddCardsMode,
  isEditing,
}) => {
  const navigate = useNavigate();
  const dialog = useDialog();

  const [title, setTitle] = useState(deck?.title ?? "");
  const [level, setLevel] = useState(deck?.level || "N5");
  const [userTouchedLevel, setUserTouchedLevel] = useState(Boolean(deck?.level));
  const [levelSuggestion, setLevelSuggestion] = useState<SuggestLevelResult | null>(null);
  const [isAnalyzingLevel, setIsAnalyzingLevel] = useState(false);
  const [description, setDescription] = useState(deck?.description || "");
  const [folderId, setFolderId] = useState(deck ? deck.folderId || "" : initialFolderId);
  // Quyền truy cập (27/10): chỉ chủ bộ thẻ đổi; người được chia sẻ quyền sửa không thấy khối này
  const ownsAccess = !deck || deck.access === "owner";
  const [visibility, setVisibility] = useState<DeckVisibility>(deck?.visibility ?? "private");
  const [openShareAfter, setOpenShareAfter] = useState(false);
  const [cards, setCards] = useState<EditorCard[]>(() => initialCards(deck, isAddCardsMode));

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // LP-15: bộ của một chương lộ trình -> nhắc thêm / xoá thẻ đổi lịch của lộ trình (theo thư mục đã lưu, không theo ô đang chọn).
  const pathLink = useDeckLearningPath(deck);

  // Phân tích cấp độ dựa trên tiêu đề, từ vựng và cách đọc
  const runLevelAnalysis = useCallback(
    async (currentTitle: string, currentCards: EditorCard[], autoApply: boolean) => {
      // Làm sạch thuật ngữ: loại bỏ các ghi chú loại từ như (V), [n], (adj)...
      const cleanTerm = (raw: string) =>
        raw.replace(/\s*[[（(【][a-zA-Z0-9ぁ-ゖァ-ヺ一-龯\s_\-./]+[\]）)】]/g, "").trim();

      const terms = currentCards.map((c) => cleanTerm(c.term || "")).filter(Boolean);
      const readings = currentCards.map((c) => (c.reading || "").trim()).filter(Boolean);
      if (!currentTitle.trim() && terms.length < 2 && readings.length < 2) return;

      setIsAnalyzingLevel(true);
      try {
        const res = await suggestDeckLevel(currentTitle, terms, readings);
        setLevelSuggestion(res);
        if (autoApply && !userTouchedLevel && (res.matchedTerms > 0 || currentTitle.trim())) {
          setLevel(res.suggestedLevel);
        }
      } catch (err) {
        console.warn("Failed to suggest deck level", err);
      } finally {
        setIsAnalyzingLevel(false);
      }
    },
    [userTouchedLevel]
  );

  // Khi tiêu đề thay đổi: regex nhận diện cấp độ ngay lập tức (0ms)
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!userTouchedLevel) {
      const match = newTitle.match(/(?:jlpt[\s_\-:]*)?\b(n[1-5])\b/i);
      if (match) {
        const matchedLevel = match[1].toUpperCase();
        setLevel(matchedLevel);
        setLevelSuggestion((prev) => ({
          suggestedLevel: matchedLevel,
          reason: `Nhận diện cấp độ ${matchedLevel} từ tiêu đề bộ thẻ.`,
          breakdown: prev?.breakdown ?? {},
          totalTerms: prev?.totalTerms ?? 0,
          matchedTerms: prev?.matchedTerms ?? 0,
        }));
      }
    }
  };

  const handleLevelChange = (newLevel: string) => {
    setLevel(newLevel);
    setUserTouchedLevel(true);
  };

  const handleApplySuggestion = (sugLevel: string) => {
    setLevel(sugLevel);
  };

  // Debounce 1.5s khi gõ từ vựng nếu có từ 3 thẻ trở lên
  useEffect(() => {
    const terms = cards.map((c) => c.term.trim()).filter(Boolean);
    if (terms.length < 3) return;

    const timer = setTimeout(() => {
      void runLevelAnalysis(title, cards, !userTouchedLevel);
    }, 1500);

    return () => clearTimeout(timer);
  }, [cards, title, userTouchedLevel, runLevelAnalysis]);

  // Thao tác trên hàng thẻ
  const handleCardChange = (index: number, field: "term" | "reading" | "meaning", value: string) => {
    setCards((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddCard = () => {
    setCards((prev) => [...prev, createEmptyCard()]);
  };

  const handleInsertCardAfter = (index: number) => {
    setCards((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, createEmptyCard());
      return next;
    });
  };

  const handleRemoveCard = (index: number) => {
    if (cards.length <= 1) {
      // Chỉ còn 1 thẻ: làm trống thay vì xoá
      setCards([createEmptyCard()]);
      return;
    }
    setCards((prev) => prev.filter((_, i) => i !== index));
  };


  const handleClearAllCards = async () => {
    const ok = await dialog.confirm({
      title: "Xoá toàn bộ thẻ?",
      message: "Mọi thẻ đang soạn sẽ bị xoá để bắt đầu lại. Thao tác này không thể hoàn tác.",
      confirmLabel: "Xoá tất cả",
      tone: "danger",
    });
    if (!ok) return;
    setCards(createEmptyCards(3));
  };

  const handleBatchImport = (importedCards: CardDto[]) => {
    if (importedCards.length === 0) return;
    setCards((prev) => {
      // Bỏ các hàng trống trước khi nối thẻ nhập vào
      const nonEmpty = prev.filter((c) => c.term.trim() || c.meaning.trim());
      const updated = [...nonEmpty, ...importedCards.map(toEditorCard)];
      void runLevelAnalysis(title, updated, !userTouchedLevel);
      return updated;
    });
  };

  const handleSave = async (shouldStudyImmediately = false) => {
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Vui lòng nhập tiêu đề cho bộ thẻ.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Chỉ gửi thẻ có Thuật ngữ + Định nghĩa (đã bỏ _key)
    const validCards = toValidCardDtos(cards);

    if (validCards.length === 0) {
      setErrorMessage("Bộ thẻ cần có ít nhất 1 thẻ hoàn chỉnh (có Thuật ngữ và Định nghĩa).");
      return;
    }

    const info = {
      title: title.trim(),
      level,
      description: description.trim() || undefined,
      folderId: folderId || null,
      ...(ownsAccess ? { visibility } : {}),
    };

    setIsSaving(true);
    try {
      let savedDeckId = deckId;
      if (isAddCardsMode && deckId) {
        // Thêm thẻ trước (thao tác chính); thông tin chung chỉ ghi khi thật sự đổi và không gửi cards
        // để không đè thẻ cũ. Hai request tách rời -> giảm tối đa request thứ hai.
        await addCardsBatch(deckId, validCards);
        if (deck && infoChanged(deck, info)) {
          await updateDeck(deckId, info);
        }
        savedDeckId = deckId;
      } else if (isEditing && deckId) {
        const res = await updateDeck(deckId, { ...info, cards: validCards });
        savedDeckId = res.id;
      } else {
        const res = await createDeck({ ...info, cards: validCards });
        savedDeckId = res.id;
      }

      if (shouldStudyImmediately && savedDeckId) {
        navigate(`/decks/${encodeURIComponent(savedDeckId)}/study`);
      } else if (savedDeckId) {
        navigate(`/decks/${encodeURIComponent(savedDeckId)}${openShareAfter && ownsAccess ? "?share=1" : ""}`);
      } else {
        navigate("/decks");
      }
    } catch (err) {
      setErrorMessage(extractErrorMessage(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSaving(false);
    }
  };

  const isUpdate = isAddCardsMode || isEditing;

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-6">
      {/* Thanh trên: quay lại + nút lưu */}
      <div className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md py-3 border-b border-surface-container-high/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            to={deckId ? `/decks/${deckId}` : "/decks"}
            className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors inline-flex items-center"
            title="Quay lại"
            aria-label="Quay lại"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-lg md:text-xl font-headline font-bold text-on-surface">
              {isAddCardsMode
                ? "Thêm thẻ vào bộ thẻ"
                : isEditing
                ? "Chỉnh sửa bộ thẻ"
                : "Tạo một học phần mới"}
            </h1>
            <p className="text-xs text-on-surface-variant hidden sm:block">
              {isAddCardsMode
                ? `${title ? `Bộ thẻ: ${title} · ` : ""}${cards.length} thẻ mới · Hỗ trợ tiếng Nhật Furigana & Ví dụ`
                : `${cards.length} thẻ · Hỗ trợ tiếng Nhật Furigana & Ví dụ`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="md"
            isLoading={isSaving}
            disabled={isSaving}
            onClick={() => handleSave(false)}
            className="cursor-pointer"
          >
            {isUpdate ? "Lưu thay đổi" : "Tạo"}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            isLoading={isSaving}
            disabled={isSaving}
            onClick={() => handleSave(true)}
            className="cursor-pointer shadow-xs"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">school</span>
            <span className="hidden sm:inline">Tạo &</span> Ôn luyện
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-start gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] shrink-0">error</span>
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {pathLink && <DeckPathNotice link={pathLink} />}

      {/* Thông tin chung */}
      <DeckInfoFields
        title={title}
        onTitleChange={handleTitleChange}
        description={description}
        onDescriptionChange={setDescription}
        level={level}
        onLevelChange={handleLevelChange}
        folderId={folderId}
        {...(ownsAccess && !isAddCardsMode
          ? { visibility, onVisibilityChange: setVisibility, openShareAfter, onOpenShareAfterChange: setOpenShareAfter }
          : {})}
        onFolderIdChange={setFolderId}
        folders={folders}
        suggestion={levelSuggestion}
        onApplySuggestion={handleApplySuggestion}
        isAnalyzing={isAnalyzingLevel}
        onManualAnalyze={() => void runLevelAnalysis(title, cards, false)}
      />

      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low/40 border border-surface-container-high/60">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="cursor-pointer bg-surface-container-lowest"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">table_rows</span>
            + Nhập
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAllCards}
            className="text-outline hover:text-error cursor-pointer"
            title="Xóa tất cả các thẻ"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete_sweep</span>
            Xóa hết
          </Button>
        </div>

        <div className="text-xs font-semibold text-outline tracking-wider uppercase">
          Tổng cộng: {cards.length} thẻ
        </div>
      </div>

      <CardRowsEditor
        cards={cards}
        onChange={handleCardChange}
        onInsertAfter={handleInsertCardAfter}
        onRemove={handleRemoveCard}
        onAdd={handleAddCard}
      />

      {/* Thanh lưu cuối trang */}
      <div className="flex items-center justify-end gap-3 pt-6 border-t border-surface-container-high/80">
        <Button
          type="button"
          variant="outline"
          size="lg"
          isLoading={isSaving}
          disabled={isSaving}
          onClick={() => handleSave(false)}
          className="cursor-pointer"
        >
          {isUpdate ? "Lưu thay đổi" : "Tạo"}
        </Button>

        <Button
          type="button"
          variant="primary"
          size="lg"
          isLoading={isSaving}
          disabled={isSaving}
          onClick={() => handleSave(true)}
          className="cursor-pointer shadow-md"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">school</span>
          {isUpdate ? "Lưu và ôn luyện" : "Tạo và ôn luyện"}
        </Button>
      </div>

      <ImportCardsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleBatchImport}
      />
    </div>
  );
};
