import React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Deck, FolderNode } from "@/types/api.types";
import { Button } from "@/components/ui/Button";
import { deckSourceLabel } from "@/lib/deckUtils";

export interface FolderDeckListProps {
  folder: FolderNode;
  decks: Deck[];
  loading: boolean;
  onAddExistingDeck: (folder: FolderNode) => void;
  onRemoveFromFolder: (deck: Deck) => void;
  onDeleteDeck: (deck: Deck) => void;
}

const deckIconBtn =
  "p-1.5 rounded-lg text-outline hover:bg-surface-container transition-colors cursor-pointer";

// Một bộ thẻ trong thư mục: nhãn, tiêu đề, nút Học/Quiz và thao tác sửa/xoá.
const FolderDeckItem: React.FC<{
  deck: Deck;
  onRemoveFromFolder: (deck: Deck) => void;
  onDeleteDeck: (deck: Deck) => void;
}> = ({ deck, onRemoveFromFolder, onDeleteDeck }) => {
  const navigate = useNavigate();
  const deckPath = `/decks/${encodeURIComponent(deck.id)}`;
  const isOwned = deck.access === "owner";

  return (
    <div className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-lowest border border-surface-container-high hover:shadow-md transition-all group relative">
      <div>
        <div className="flex items-center justify-between">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary text-[11px] font-semibold">
            {deck.level}
          </span>
          {isOwned ? (
            <span className="px-2 py-0.5 rounded-full bg-secondary-container/40 text-secondary text-[11px] font-medium">
              Cá nhân
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-outline text-[11px] font-medium">
              {deckSourceLabel(deck)}
            </span>
          )}
        </div>

        <Link to={`/decks/${deck.id}`} className="block mt-2 group-hover:underline">
          <h3 className="font-semibold text-sm text-on-surface group-hover:text-primary transition-colors">
            {deck.title}
          </h3>
        </Link>
        <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">
          {deck.description || "Chưa có mô tả"}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-surface-container-high/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-outline font-medium">{deck.cards.length} thẻ</span>
          {deck.cards.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Ôn tập SRS"
                onClick={() => navigate(`${deckPath}/study`)}
                className="px-2 py-0.5 rounded bg-primary text-on-primary text-[11px] font-semibold flex items-center gap-0.5 hover:bg-primary-container cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  play_arrow
                </span>
                Học
              </button>
              <button
                type="button"
                title="Kiểm tra Quiz"
                onClick={() => navigate(`${deckPath}/quiz`)}
                className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-[11px] font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  quiz
                </span>
                Quiz
              </button>
            </div>
          )}
        </div>

        {isOwned && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Rút khỏi thư mục này"
              aria-label="Rút khỏi thư mục này"
              onClick={() => onRemoveFromFolder(deck)}
              className={`${deckIconBtn} hover:text-primary`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                folder_off
              </span>
            </button>
            <button
              type="button"
              title="Chỉnh sửa bộ thẻ"
              aria-label="Chỉnh sửa bộ thẻ"
              onClick={() => navigate(`${deckPath}/edit`)}
              className={`${deckIconBtn} hover:text-primary`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                edit
              </span>
            </button>
            <button
              type="button"
              title="Xoá bộ thẻ"
              aria-label="Xoá bộ thẻ"
              onClick={() => onDeleteDeck(deck)}
              className={`${deckIconBtn} hover:text-error`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                delete
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Khu vực "Bộ thẻ trong thư mục này": đang tải / trống / lưới bộ thẻ.
export const FolderDeckList: React.FC<FolderDeckListProps> = ({
  folder,
  decks,
  loading,
  onAddExistingDeck,
  onRemoveFromFolder,
  onDeleteDeck,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between border-t border-surface-container-high/60 pt-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-outline flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            style
          </span>
          Bộ thẻ trong thư mục này ({decks.length})
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAddExistingDeck(folder)}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              playlist_add
            </span>
            Thêm bộ thẻ có sẵn
          </button>
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          className="py-8 text-center text-sm text-on-surface-variant flex items-center justify-center gap-2"
        >
          <span aria-hidden="true" className="material-symbols-outlined animate-spin text-primary">
            progress_activity
          </span>
          Đang tải danh sách bộ thẻ...
        </div>
      ) : decks.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-outline">
            <span aria-hidden="true" className="material-symbols-outlined text-[30px]">
              library_books
            </span>
          </div>
          <div>
            <p className="font-semibold text-sm text-on-surface">
              Thư mục "{folder.title}" chưa có bộ thẻ nào.
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Thêm bộ thẻ đã có của bạn hoặc sao chép các bộ thẻ chất lượng cao từ Thư viện.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddExistingDeck(folder)}
              className="border-primary/40 text-primary cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                playlist_add
              </span>
              Thêm bộ thẻ có sẵn
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/decks/new?folderId=${encodeURIComponent(folder.id)}`)}
              className="cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                add
              </span>
              Tạo bộ thẻ tại đây
            </Button>
            <Link
              to="/library"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-primary transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                auto_stories
              </span>
              Khám phá Thư viện
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
          {decks.map((deck) => (
            <FolderDeckItem
              key={deck.id}
              deck={deck}
              onRemoveFromFolder={onRemoveFromFolder}
              onDeleteDeck={onDeleteDeck}
            />
          ))}
        </div>
      )}
    </div>
  );
};
