import React from "react";
import { Link } from "react-router-dom";
import type { LibraryDeck } from "@/types/api.types";
import { saveActionOf } from "@/features/library/librarySave";
import {
  categoryLabel,
  categoryShortLabel,
  formatCompactCount,
  getLevelBadgeClass,
  initials,
  ratingSummary,
} from "./libraryOptions";

interface LibraryDeckCardProps {
  deck: LibraryDeck;
  onPreview: (deck: LibraryDeck) => void;
  onSave: (deck: LibraryDeck) => void;
}

const saveButtonClass =
  "py-2 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs";

/** Chưa lưu → "Lưu Thẻ" (mở hộp chọn thư mục); đã lưu → "Đã lưu · Mở" tới bản của mình, không cho lưu trùng (A4). */
const SaveButton: React.FC<{ deck: LibraryDeck; onSave: (deck: LibraryDeck) => void }> = ({ deck, onSave }) => {
  const action = saveActionOf(deck);
  return action.kind === "open" ? (
    <Link to={action.href} className={saveButtonClass}>
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">bookmark_added</span>
      {action.label}
    </Link>
  ) : (
    <button type="button" onClick={() => onSave(deck)} className={saveButtonClass}>
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">bookmark_add</span>
      Lưu Thẻ
    </button>
  );
};

// Một thẻ bộ thẻ trong lưới thư viện.
export const LibraryDeckCard: React.FC<LibraryDeckCardProps> = ({ deck, onPreview, onSave }) => (
  <div className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md border border-surface-container-high/60 transition-all group">
    <div className="space-y-3">
      {/* Badge đầu thẻ */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-2 py-0.5 rounded font-label-sm text-xs font-bold ${getLevelBadgeClass(deck.level)}`}>
            {deck.level}
          </span>
          {categoryShortLabel(deck.category) && (
            <span
              title={categoryLabel(deck.category) ?? undefined}
              className="px-2 py-0.5 rounded font-label-sm text-[10px] font-semibold bg-surface-container text-on-surface"
            >
              {categoryShortLabel(deck.category)}
            </span>
          )}
        </div>
        {/* trước đây nhãn "MIỄN PHÍ" cố định trên mọi thẻ (không phân biệt gì); nay chỉ báo khi mình đã lưu bộ này */}
        {deck.savedDeckId && (
          <span className="px-2 py-0.5 rounded-full font-label-sm text-[10px] font-bold bg-secondary-container text-on-secondary-container">
            Đã lưu
          </span>
        )}
      </div>

      <h3 className="font-headline-sm text-headline-sm font-bold text-primary group-hover:text-tertiary transition-colors line-clamp-2 leading-snug">
        {deck.title}
      </h3>

      <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{deck.description || "Chưa có mô tả"}</p>

      {/* Số liệu */}
      <div className="grid grid-cols-2 gap-2 py-2 px-3 rounded-xl bg-surface-container-low text-on-surface font-body-sm text-xs">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-primary">
            style
          </span>
          <span>
            <strong>{deck.cardsCount}</strong> Thẻ học
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-secondary">
            quiz
          </span>
          <span>
            <strong>{deck.quizCount}</strong> Lượt Quiz
          </span>
        </div>
      </div>
    </div>

    {/* Tác giả & nút thao tác */}
    <div className="pt-4 mt-2 space-y-3 border-t border-surface-container-high/40">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-on-surface-variant">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            aria-hidden="true"
            className="w-5 h-5 rounded-full bg-primary-container text-on-primary text-[9px] font-bold flex items-center justify-center shrink-0"
          >
            {initials(deck.authorName)}
          </span>
          <span className="font-medium text-on-surface truncate max-w-[110px]">{deck.authorName}</span>
        </div>
        {/* NEW-02: đánh giá và lượt tải là hai mục riêng có chữ đi kèm (như banner nổi bật) — trước đây "★ 4 (0)" với số
            trong ngoặc là lượt tải nên người dùng đọc thành "0 lượt đánh giá". */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[14px] text-amber-500"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            <span className="font-label-sm font-semibold text-on-surface">
              {ratingSummary(deck.rating, deck.ratingsCount)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              cloud_download
            </span>
            <span>
              <strong className="text-on-surface">{formatCompactCount(deck.downloadsCount)}</strong> lượt tải
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => onPreview(deck)}
          className="py-2 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs font-semibold transition-colors text-center cursor-pointer"
        >
          Chi Tiết
        </button>
        <SaveButton deck={deck} onSave={onSave} />
      </div>
    </div>
  </div>
);

interface LibraryDeckGridProps {
  decks: LibraryDeck[];
  onPreview: (deck: LibraryDeck) => void;
  onSave: (deck: LibraryDeck) => void;
  onResetFilters: () => void;
  total: number;
}

// Lưới bộ thẻ sau khi lọc (hoặc trạng thái rỗng).
export const LibraryDeckGrid: React.FC<LibraryDeckGridProps> = ({ decks, onPreview, onSave, onResetFilters, total }) => (
  <div>
    <div className="flex items-center justify-between pb-3">
      <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Danh sách bộ thẻ ({total})</h2>
      <span className="text-xs text-on-surface-variant">Hiển thị kết quả tinh tuyển</span>
    </div>

    {decks.length === 0 ? (
      <div className="p-12 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
        <span aria-hidden="true" className="material-symbols-outlined text-[48px] text-outline">
          search_off
        </span>
        <p className="font-semibold text-on-surface">Không tìm thấy bộ thẻ nào phù hợp với bộ lọc hiện tại.</p>
        <button
          type="button"
          onClick={onResetFilters}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container"
        >
          Đặt lại tất cả bộ lọc
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-space-md">
        {decks.map((deck) => (
          <LibraryDeckCard key={deck.id} deck={deck} onPreview={onPreview} onSave={onSave} />
        ))}
      </div>
    )}
  </div>
);
