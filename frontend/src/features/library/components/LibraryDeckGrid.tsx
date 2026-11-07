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

const CATEGORY_ICONS: Record<string, string> = {
  dokkai: "auto_stories",
  goi: "translate",
  kanji: "draw",
  bunpou: "account_tree",
  kaiwa: "forum",
  it: "terminal",
  business: "work",
};

const saveButtonClass =
  "py-2 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs";

/** Chưa lưu → "Lưu Thẻ" (mở hộp chọn thư mục); đã lưu → "Đã lưu · Mở" tới bản của mình, không cho lưu trùng (A4). */
const SaveButton: React.FC<{ deck: LibraryDeck; onSave: (deck: LibraryDeck) => void }> = ({ deck, onSave }) => {
  const action = saveActionOf(deck);
  return action.kind === "open" ? (
    <Link
      to={action.href}
      onClick={(e) => e.stopPropagation()}
      className={saveButtonClass}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">bookmark_added</span>
      {action.label}
    </Link>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSave(deck);
      }}
      className={saveButtonClass}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">bookmark_add</span>
      Lưu Thẻ
    </button>
  );
};

// Một thẻ bộ thẻ trong lưới thư viện.
export const LibraryDeckCard: React.FC<LibraryDeckCardProps> = ({ deck, onPreview, onSave }) => {
  const categoryIcon = deck.category ? CATEGORY_ICONS[deck.category] ?? "folder" : null;
  const shortCategory = categoryShortLabel(deck.category);

  return (
    <div
      onClick={() => onPreview(deck)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(deck);
        }
      }}
      className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-space-md shadow-xs hover:shadow-md hover:-translate-y-0.5 border border-surface-container-high/60 transition-all duration-200 group text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 relative"
    >
      <div className="space-y-3">
        {/* Badge đầu thẻ */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded font-label-sm text-xs font-bold ${getLevelBadgeClass(deck.level)}`}>
              {deck.level}
            </span>
            {shortCategory && (
              <span
                title={categoryLabel(deck.category) ?? undefined}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-[10px] font-semibold bg-surface-container text-on-surface"
              >
                {categoryIcon && (
                  <span aria-hidden="true" className="material-symbols-outlined text-[12px] text-primary">
                    {categoryIcon}
                  </span>
                )}
                {shortCategory}
              </span>
            )}
            {deck.official && (
              <span
                title="Bộ thẻ chính thức chuẩn NihonGen"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-label-sm text-[10px] font-bold bg-primary/10 text-primary"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[11px]">verified</span>
                Chuẩn
              </span>
            )}
          </div>
          {deck.savedDeckId && (
            <span className="px-2 py-0.5 rounded-full font-label-sm text-[10px] font-bold bg-secondary-container text-on-secondary-container shrink-0">
              Đã lưu
            </span>
          )}
        </div>

        <h3 className="font-headline-sm text-headline-sm font-bold text-primary group-hover:text-tertiary transition-colors line-clamp-2 leading-snug">
          {deck.title}
        </h3>

        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 min-h-[2.5rem]">
          {deck.description || "Chưa có mô tả chi tiết cho bộ thẻ này."}
        </p>

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
            onClick={(e) => {
              e.stopPropagation();
              onPreview(deck);
            }}
            className="py-2 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs font-semibold transition-colors text-center cursor-pointer"
          >
            Chi Tiết
          </button>
          <SaveButton deck={deck} onSave={onSave} />
        </div>
      </div>
    </div>
  );
};

export const LibraryDeckSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-space-md" aria-busy="true">
    <span className="sr-only">Đang tải danh sách bộ thẻ...</span>
    {Array.from({ length: 8 }, (_, i) => (
      <div
        key={i}
        className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-space-md border border-surface-container-high/60 animate-pulse space-y-4"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-14 rounded bg-surface-container-high" />
            <div className="h-4 w-16 rounded bg-surface-container" />
          </div>
          <div className="h-6 w-3/4 rounded bg-surface-container-high" />
          <div className="h-4 w-full rounded bg-surface-container" />
          <div className="h-10 rounded-xl bg-surface-container-low" />
        </div>
        <div className="pt-3 border-t border-surface-container-high/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded bg-surface-container" />
            <div className="h-4 w-16 rounded bg-surface-container" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 rounded-lg bg-surface-container" />
            <div className="h-8 rounded-lg bg-surface-container" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

interface LibraryDeckGridProps {
  decks: LibraryDeck[];
  onPreview: (deck: LibraryDeck) => void;
  onSave: (deck: LibraryDeck) => void;
  onResetFilters: () => void;
  onQuickFilter?: (patch: { level?: string; category?: string; q?: string }) => void;
  total: number;
}

// Lưới bộ thẻ sau khi lọc (hoặc trạng thái rỗng).
export const LibraryDeckGrid: React.FC<LibraryDeckGridProps> = ({
  decks,
  onPreview,
  onSave,
  onResetFilters,
  onQuickFilter,
  total,
}) => (
  <div>
    <div className="flex items-center justify-between pb-3">
      <h2 className="font-headline-sm text-headline-sm font-bold text-primary flex items-center gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-primary text-[20px]">
          style
        </span>
        Danh sách bộ thẻ ({total})
      </h2>
      <span className="text-xs text-on-surface-variant hidden sm:inline">Hiển thị kết quả tinh tuyển</span>
    </div>

    {decks.length === 0 ? (
      <div className="p-8 sm:p-12 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-4 max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
          <span aria-hidden="true" className="material-symbols-outlined text-[36px]">
            search_off
          </span>
        </div>
        <div className="space-y-1">
          <p className="font-headline-sm text-headline-sm font-bold text-on-surface">Không tìm thấy bộ thẻ phù hợp</p>
          <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
            Không có bộ thẻ nào trùng khớp với từ khóa hoặc tiêu chí lọc hiện tại. Thử các gợi ý bên dưới hoặc xóa bộ lọc:
          </p>
        </div>

        {onQuickFilter && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <span className="text-xs text-on-surface-variant font-medium mr-1">Gợi ý tìm nhanh:</span>
            {["N5", "N3", "N2"].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onQuickFilter({ level: lvl })}
                className="px-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors cursor-pointer"
              >
                JLPT {lvl}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onQuickFilter({ category: "goi" })}
              className="px-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors cursor-pointer"
            >
              Từ vựng Goi
            </button>
            <button
              type="button"
              onClick={() => onQuickFilter({ category: "kanji" })}
              className="px-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors cursor-pointer"
            >
              Kanji Hán tự
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onResetFilters}
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-all cursor-pointer shadow-xs"
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
