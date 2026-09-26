import React, { useState, useEffect, useId } from "react";
import { fetchDecks, moveDeckToFolder, cloneDeck, createDeck } from "@/services/deckService";
import { fetchLibrary } from "@/services/libraryService";
import type { Deck, LibraryDeck } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { categoryLabel } from "@/features/library/components/libraryOptions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";

export interface AddExistingDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetFolder: { id: string; title: string };
  onSuccess: () => void;
}

type Tab = "personal" | "library" | "new";

const LEVEL_OPTIONS = ["N5", "N4", "N3", "N2", "N1"];

const tabClass = (active: boolean) =>
  `pb-3 px-4 font-label-md text-sm transition-all border-b-2 font-medium flex items-center gap-2 cursor-pointer ${
    active ? "border-primary text-primary font-bold" : "border-transparent text-on-surface-variant hover:text-on-surface"
  }`;

// Footer cần đọc state của từng tab nên cả modal nằm trong component con,
// chỉ mount khi mở -> state tự về mặc định mỗi lần mở, không cần effect reset.
export const AddExistingDeckModal: React.FC<AddExistingDeckModalProps> = (props) =>
  props.isOpen ? <AddExistingDeckDialog {...props} /> : null;

const AddExistingDeckDialog: React.FC<AddExistingDeckModalProps> = ({
  isOpen,
  onClose,
  targetFolder,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [newTitle, setNewTitle] = useState("");
  const [newLevel, setNewLevel] = useState("N5");
  const [newDescription, setNewDescription] = useState("");
  const [personalDecks, setPersonalDecks] = useState<Deck[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newDeckFormId = useId();

  // Tải bộ thẻ của người dùng khi mở modal
  useEffect(() => {
    let isMounted = true;
    fetchDecks(null)
      .then((allDecks) => {
        if (!isMounted) return;
        // Bỏ các bộ thẻ đã nằm trong thư mục này
        setPersonalDecks(allDecks.filter((d) => d.folderId !== targetFolder.id));
      })
      .catch((err) => {
        if (isMounted) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (isMounted) setLoadingDecks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [targetFolder.id]);

  const toggleSelectDeck = (deckId: string) => {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  const search = searchTerm.toLowerCase();

  // Filter personal decks
  const filteredPersonalDecks = personalDecks.filter((deck) => {
    const matchesSearch =
      deck.title.toLowerCase().includes(search) ||
      (deck.description ?? "").toLowerCase().includes(search);
    const matchesLevel = !levelFilter || deck.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  // Bộ thẻ Thư viện: tìm/lọc ở backend (tối đa 50 kết quả đầu, sắp theo lượt tải), chờ ngừng gõ mới gọi
  const librarySearch = useDebouncedValue(searchTerm.trim(), 300);
  const library = useAsync(
    () => fetchLibrary({ q: librarySearch, level: levelFilter, size: 50 }),
    [librarySearch, levelFilter]
  );
  const filteredLibraryDecks = library.data?.items ?? [];

  // Handle adding personal decks to folder
  const handleAddPersonalDecks = async () => {
    if (selectedDeckIds.size === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const decksToMove = personalDecks.filter((d) => selectedDeckIds.has(d.id));
      for (const deck of decksToMove) {
        if (deck.access === "owner") {
          await moveDeckToFolder(deck, targetFolder.id);
        } else {
          // Bộ thẻ Thư viện / được chia sẻ: thư mục là của chủ bộ thẻ -> nhân bản vào thư mục
          await cloneDeck(deck.id, targetFolder.id);
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cloning a library deck into folder
  const handleImportLibraryDeck = async (libraryDeck: LibraryDeck) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await cloneDeck(libraryDeck.id, targetFolder.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tạo bộ thẻ rỗng ngay trong thư mục đích; thêm thẻ sau ở trang soạn bộ thẻ.
  const handleCreateNewDeck = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createDeck({
        title: newTitle.trim(),
        level: newLevel,
        description: newDescription.trim() || undefined,
        folderId: targetFolder.id,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      bare
      closeOnBackdrop={!isSubmitting}
      icon="playlist_add"
      title="Thêm bộ thẻ vào thư mục"
      subtitle={
        <>
          Đích:{" "}
          <span className="font-semibold text-primary inline-flex items-center gap-0.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              folder
            </span>
            {targetFolder.title}
          </span>
        </>
      }
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} className="mr-auto">
            Đóng
          </Button>

          {activeTab === "personal" && (
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={selectedDeckIds.size === 0 || isSubmitting}
              isLoading={isSubmitting}
              onClick={handleAddPersonalDecks}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add
              </span>
              Thêm {selectedDeckIds.size > 0 ? `${selectedDeckIds.size} bộ thẻ` : ""} vào thư mục
            </Button>
          )}

          {activeTab === "new" && (
            <Button
              type="submit"
              form={newDeckFormId}
              variant="primary"
              size="md"
              disabled={!newTitle.trim() || isSubmitting}
              isLoading={isSubmitting}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add_circle
              </span>
              Tạo bộ thẻ trong thư mục
            </Button>
          )}
        </>
      }
    >
      {/* Thanh tab + bộ lọc dính trên cùng khi cuộn danh sách */}
      <div className="sticky top-0 z-10 bg-surface-container-lowest">
        <div className="flex border-b border-surface-container-high/60 px-6 pt-2">
          <button
            type="button"
            aria-pressed={activeTab === "personal"}
            onClick={() => setActiveTab("personal")}
            className={tabClass(activeTab === "personal")}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              folder_shared
            </span>
            Bộ thẻ của bạn ({personalDecks.length})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "library"}
            onClick={() => setActiveTab("library")}
            className={tabClass(activeTab === "library")}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              auto_stories
            </span>
            Từ Thư viện tinh tuyển ({library.data?.allCount ?? "…"})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "new"}
            onClick={() => setActiveTab("new")}
            className={tabClass(activeTab === "new")}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              add_circle
            </span>
            Tạo bộ thẻ mới
          </button>
        </div>

        {/* Search & Filters - tab "tạo mới" không cần lọc */}
        {activeTab !== "new" && (
          <div className="px-6 py-3 border-b border-surface-container-high/40 bg-surface-container-low/20 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <span
                aria-hidden="true"
                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]"
              >
                search
              </span>
              <input
                type="text"
                aria-label="Tìm bộ thẻ"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên bộ thẻ, mô tả..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              aria-label="Lọc theo trình độ"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="py-1.5 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Tất cả trình độ</option>
              {LEVEL_OPTIONS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  JLPT {lvl}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content Body */}
      <div className="p-6 space-y-3">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        {activeTab === "personal" ? (
          /* TAB 1: PERSONAL DECKS */
          loadingDecks ? (
            <div className="py-12 text-center text-on-surface-variant flex flex-col items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined animate-spin text-primary text-[28px]">
                progress_activity
              </span>
              <span className="text-sm">Đang tải danh sách bộ thẻ...</span>
            </div>
          ) : filteredPersonalDecks.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant flex flex-col items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">
                style
              </span>
              <p className="text-sm">
                {personalDecks.length === 0
                  ? "Tất cả bộ thẻ hiện có đều đã nằm trong thư mục này."
                  : "Không tìm thấy bộ thẻ phù hợp tiêu chí tìm kiếm."}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("library")}
                className="text-xs text-primary font-semibold hover:underline mt-1 cursor-pointer"
              >
                Khám phá thêm từ Thư viện tinh tuyển →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-on-surface-variant pb-1">
                <span>
                  Chọn bộ thẻ để chuyển vào <strong>{targetFolder.title}</strong>:
                </span>
                <span>Đã chọn: {selectedDeckIds.size} bộ thẻ</span>
              </div>
              {filteredPersonalDecks.map((deck) => {
                const isChecked = selectedDeckIds.has(deck.id);
                return (
                  // Cả ô là <label> bọc checkbox thật -> bấm đâu cũng chọn, dùng được bằng bàn phím.
                  <label
                    key={deck.id}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
                      isChecked
                        ? "bg-primary-container/10 border-primary shadow-xs"
                        : "bg-surface-container-lowest border-surface-container-high hover:border-outline hover:bg-surface-container-low/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectDeck(deck.id)}
                      className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-label-sm text-[10px] font-bold bg-[#EFF6FF] text-[#1D4ED8]">
                          {deck.level}
                        </span>
                        <span className="font-semibold text-sm text-on-surface truncate">{deck.title}</span>
                        {deck.access !== "owner" && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-surface-container text-on-surface-variant">
                            {deck.visibility === "public" ? "Thư viện" : "Được chia sẻ"}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-on-surface-variant line-clamp-1 mt-1">
                        {deck.description || "Chưa có mô tả"}
                      </span>
                      <span className="flex items-center gap-3 mt-1.5 text-[11px] text-outline">
                        <span className="flex items-center gap-1">
                          <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                            style
                          </span>
                          {deck.cards.length} thẻ
                        </span>
                        {deck.folderId ? (
                          <span className="text-secondary font-medium">(Đang ở thư mục khác)</span>
                        ) : (
                          <span>(Chưa phân loại)</span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )
        ) : activeTab === "library" ? (
          /* TAB 2: CURATED LIBRARY DECKS */
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              Các bộ thẻ chuẩn hóa đã kiểm định. Nhấn{" "}
              <strong>"Nhập vào thư mục"</strong> để tự động nhân bản trọn bộ thẻ và học ngay:
            </p>
            {library.error && (
              <p role="alert" className="text-sm text-error">
                Không tải được Thư viện: {library.error}
              </p>
            )}
            {library.loading && <p className="text-xs text-outline py-4 text-center">Đang tải Thư viện...</p>}
            {!library.loading && !library.error && filteredLibraryDecks.length === 0 && (
              <p className="text-xs text-outline py-4 text-center">Không có bộ thẻ nào phù hợp.</p>
            )}
            <div className="grid grid-cols-1 gap-2.5">
              {filteredLibraryDecks.map((curated) => (
                <div
                  key={curated.id}
                  className="p-3.5 rounded-xl border border-surface-container-high bg-surface-container-lowest hover:border-primary/50 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded font-label-sm text-[10px] font-bold bg-[#FFF7ED] text-[#C2410C]">
                        {curated.level}
                      </span>
                      <span className="text-xs font-semibold text-primary">{categoryLabel(curated.category)}</span>
                      {curated.official && (
                        <span className="text-[10px] text-secondary font-semibold flex items-center gap-0.5">
                          <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
                            verified
                          </span>
                          Chính thức
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-on-surface mt-1">{curated.title}</h4>
                    <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">{curated.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-outline">
                      <span className="flex items-center gap-1 font-medium text-on-surface">
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[14px] text-amber-500"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                        {curated.rating ?? "–"} ({curated.ratingsCount})
                      </span>
                      <span className="flex items-center gap-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                          style
                        </span>
                        {curated.cardsCount} thẻ
                      </span>
                      <span className="flex items-center gap-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                          person
                        </span>
                        {curated.authorName}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={isSubmitting}
                    onClick={() => handleImportLibraryDeck(curated)}
                    className="shrink-0 cursor-pointer self-end sm:self-center"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      download
                    </span>
                    Nhập vào thư mục
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* TAB 3: TẠO BỘ THẺ MỚI NGAY TRONG THƯ MỤC */
          <form id={newDeckFormId} onSubmit={handleCreateNewDeck} className="space-y-4">
            <p className="text-xs text-on-surface-variant">
              Bộ thẻ mới sẽ nằm sẵn trong <strong>{targetFolder.title}</strong>. Thêm thẻ ở trang soạn
              bộ thẻ sau khi tạo.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-on-surface">
                Tên bộ thẻ <span className="text-error">*</span>
              </span>
              <input
                required
                maxLength={150}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="VD: Từ vựng Mimikara N3 - Chương 1"
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-on-surface">Trình độ</span>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm focus:outline-none focus:border-primary"
              >
                {LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    JLPT {lvl}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-on-surface">Mô tả ngắn</span>
              <textarea
                rows={2}
                maxLength={500}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="VD: 120 từ vựng chương 1, ôn theo lịch SRS..."
                className="w-full px-3.5 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm focus:outline-none focus:border-primary"
              />
            </label>
          </form>
        )}
      </div>
    </Modal>
  );
};
