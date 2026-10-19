import React, { useState, useEffect, useId } from "react";
import { cloneDeck } from "@/services/deckService";
import { fetchFolders, createFolder } from "@/services/folderService";
import type { FolderNode, LibraryDeck } from "@/types/api.types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import { flattenFolders } from "@/features/folders/components/folderTree";

/**
 * Dữ liệu tối thiểu để lưu bản sao: bộ thẻ Thư viện có đủ số liệu; bộ thẻ mở từ trang chi tiết
 * (người xem theo liên kết chia sẻ) không có số lượt quiz nên để tuỳ chọn.
 */
export type SaveToFolderDeck = Pick<LibraryDeck, "id" | "title" | "level" | "description" | "cardsCount"> &
  Partial<Pick<LibraryDeck, "quizCount">>;

export interface SaveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: SaveToFolderDeck | null;
  onSaved?: (folderId: string | null) => void;
}

// Ô chọn là radio thật (ẩn) bọc trong label -> bàn phím/đọc màn hình dùng được.
const optionClass = (selected: boolean) =>
  `flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
    selected
      ? "bg-primary-container/10 border-primary text-primary font-semibold"
      : "bg-surface-container-lowest border-surface-container-high text-on-surface hover:bg-surface-container-low"
  }`;

export const SaveToFolderModal: React.FC<SaveToFolderModalProps> = ({
  isOpen,
  onClose,
  deck,
  onSaved,
}) => {
  const formId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!deck) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lưu về thư viện cá nhân"
      subtitle={deck.title}
      icon="bookmark_add"
      closeOnBackdrop={!isSubmitting}
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="primary" size="md" isLoading={isSubmitting}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              save
            </span>
            Lưu và học ngay
          </Button>
        </>
      }
    >
      <SaveToFolderForm
        formId={formId}
        deck={deck}
        onSaved={onSaved}
        onClose={onClose}
        onSavingChange={setIsSubmitting}
      />
    </Modal>
  );
};

interface SaveToFolderFormProps {
  formId: string;
  deck: SaveToFolderDeck;
  onSaved?: (folderId: string | null) => void;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
}

// Mount mới mỗi lần mở modal -> state tự về mặc định, không cần effect reset.
const SaveToFolderForm: React.FC<SaveToFolderFormProps> = ({
  formId,
  deck,
  onSaved,
  onClose,
  onSavingChange,
}) => {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick create folder inside modal
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const newFolderInputId = useId();
  const radioName = useId();

  useEffect(() => {
    let isMounted = true;
    fetchFolders()
      .then((data) => {
        if (isMounted) setFolders(data);
      })
      .catch((err) => {
        if (isMounted) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const folderOptions = flattenFolders(folders);

  const handleCreateQuickFolder = async () => {
    if (!newFolderTitle.trim() || isCreatingFolder) return;
    setIsCreatingFolder(true);
    setError(null);
    try {
      const created = await createFolder({
        title: newFolderTitle.trim(),
        level: deck.level,
      });
      setFolders((prev) => [...prev, created]);
      setSelectedFolderId(created.id);
      setShowCreateFolder(false);
      setNewFolderTitle("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleSaveDeck = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSavingChange(true);
    setError(null);
    try {
      await cloneDeck(deck.id, selectedFolderId || null);
      if (onSaved) onSaved(selectedFolderId || null);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSaveDeck} className="space-y-4">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          {error}
        </div>
      )}

      <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high/50 text-xs text-on-surface-variant space-y-1">
        <div className="flex items-center justify-between text-on-surface font-semibold">
          <span>{deck.title}</span>
          <span className="px-2 py-0.5 rounded font-label-sm text-[10px] font-bold bg-[#FFF7ED] text-[#C2410C]">
            {deck.level}
          </span>
        </div>
        <p className="line-clamp-2">{deck.description}</p>
        <div className="flex items-center gap-3 pt-1 text-outline">
          <span>{deck.cardsCount} flashcards kèm audio & ví dụ</span>
          {deck.quizCount != null && (
            <>
              <span aria-hidden="true">•</span>
              <span>{deck.quizCount} lượt quiz</span>
            </>
          )}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold font-headline text-on-surface tracking-wide block mb-2">
          Chọn thư mục lưu trữ:
        </legend>

        {isLoading ? (
          <div className="py-4 text-center text-xs text-outline">
            Đang tải thư mục của bạn...
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {/* Option 1: Root */}
            <label className={optionClass(selectedFolderId === "")}>
              <input
                type="radio"
                name={radioName}
                value=""
                checked={selectedFolderId === ""}
                onChange={() => setSelectedFolderId("")}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  folder_special
                </span>
                Thư mục gốc (Tất cả bộ thẻ)
              </span>
              {selectedFolderId === "" && (
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  check
                </span>
              )}
            </label>

            {/* Option 2: Existing Folders */}
            {folderOptions.map((f) => {
              const isSelected = selectedFolderId === f.id;
              return (
                <label
                  key={f.id}
                  style={{ paddingLeft: `${f.depth * 16 + 10}px` }}
                  className={optionClass(isSelected)}
                >
                  <input
                    type="radio"
                    name={radioName}
                    value={f.id}
                    checked={isSelected}
                    onChange={() => setSelectedFolderId(f.id)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 truncate">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
                      folder
                    </span>
                    {f.title}
                  </span>
                  {isSelected && (
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      check
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* Quick Create Folder Section */}
      {!showCreateFolder ? (
        <button
          type="button"
          onClick={() => setShowCreateFolder(true)}
          className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            create_new_folder
          </span>
          Tạo thư mục mới cho bộ thẻ này
        </button>
      ) : (
        <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high/60 space-y-2">
          <label htmlFor={newFolderInputId} className="block text-[11px] font-semibold text-on-surface">
            Tên thư mục mới:
          </label>
          <div className="flex gap-2">
            <input
              id={newFolderInputId}
              type="text"
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              onKeyDown={(e) => {
                // Enter ở ô này tạo thư mục, không submit form lưu bộ thẻ.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateQuickFolder();
                }
              }}
              placeholder="VD: JLPT N2 Ôn Tập, Từ vựng..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-xs focus:outline-none focus:border-primary"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isCreatingFolder}
              disabled={!newFolderTitle.trim()}
              onClick={handleCreateQuickFolder}
            >
              Tạo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateFolder(false)}
            >
              Hủy
            </Button>
          </div>
        </div>
      )}
    </form>
  );
};
