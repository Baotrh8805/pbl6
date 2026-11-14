import React, { useEffect } from "react";
import {
  CATEGORIES,
  LEVELS,
  SORT_OPTIONS,
  categoryShortLabel,
  getLevelBadgeClass,
  isSearchShortcut,
  isSortOption,
  searchShortcutLabel,
  type LibraryTab,
  type SortOption,
} from "./libraryOptions";

const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** Gợi ý phím tắt + bắt Ctrl+K (⌘K trên máy Apple) ở cả trang để focus ô tìm kiếm. */
const SearchShortcut: React.FC<{ targetId: string }> = ({ targetId }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isSearchShortcut(e)) return;
      const input = document.getElementById(targetId);
      if (!(input instanceof HTMLInputElement)) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targetId]);

  return (
    <kbd
      title="Phím tắt: focus ô tìm kiếm"
      className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-[10px]"
    >
      {searchShortcutLabel(IS_APPLE)}
    </kbd>
  );
};

interface LibraryFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  totalCount: number;
  selectedLevel: string;
  onLevelChange: (level: string) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const tabClass = (active: boolean) =>
  `px-3 py-1.5 rounded-xl font-label-md text-xs whitespace-nowrap transition-all duration-150 cursor-pointer ${
    active
      ? "bg-primary text-on-primary font-bold shadow-xs"
      : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
  }`;

// Thanh tìm kiếm + lọc phân tầng gọn gàng.
export const LibraryFilterBar: React.FC<LibraryFilterBarProps> = ({
  searchTerm,
  onSearchChange,
  selectedTab,
  onTabChange,
  totalCount,
  selectedLevel,
  onLevelChange,
  sortOption,
  onSortChange,
  selectedCategory,
  onCategoryChange,
}) => {
  const hasActiveFilters = !!selectedLevel || (!!selectedCategory && selectedCategory !== "all") || !!searchTerm.trim();

  const clearAllFilters = () => {
    onSearchChange("");
    onLevelChange("");
    onCategoryChange("all");
  };

  return (
    <div className="flex flex-col gap-3 bg-surface-container-lowest p-3.5 sm:p-4 rounded-2xl shadow-xs border border-surface-container-high/60">
      {/* Hàng 1: Ô tìm kiếm kết hợp tab phân đoạn */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <label htmlFor="library-search" className="sr-only">
            Tìm kiếm bộ thẻ
          </label>
          <span
            aria-hidden="true"
            className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]"
          >
            search
          </span>
          <input
            id="library-search"
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên bộ thẻ, mô tả hoặc tác giả..."
            className="w-full pl-10 pr-24 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-sm placeholder:text-outline focus:outline-none focus:bg-surface-container focus:ring-2 focus:ring-primary/10 transition-all"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <SearchShortcut targetId="library-search" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Xóa nội dung tìm kiếm"
                className="w-6 h-6 inline-flex items-center justify-center rounded-full text-xs text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab phân đoạn */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none shrink-0">
          <button
            type="button"
            aria-pressed={selectedTab === "all"}
            onClick={() => onTabChange("all")}
            className={tabClass(selectedTab === "all")}
          >
            Tất cả ({totalCount})
          </button>
          <button
            type="button"
            aria-pressed={selectedTab === "popular"}
            onClick={() => onTabChange("popular")}
            title="Điểm trung bình từ 4,5 sao và có ít nhất 3 lượt đánh giá"
            className={`inline-flex items-center gap-1 ${tabClass(selectedTab === "popular")}`}
          >
            <span>Phổ biến</span>
            <span aria-hidden="true">🔥</span>
          </button>
          <button
            type="button"
            aria-pressed={selectedTab === "official"}
            onClick={() => onTabChange("official")}
            className={`inline-flex items-center gap-1 ${tabClass(selectedTab === "official")}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">verified</span>
            Chính thức
          </button>
          <button
            type="button"
            aria-pressed={selectedTab === "community"}
            onClick={() => onTabChange("community")}
            className={tabClass(selectedTab === "community")}
          >
            Cộng đồng
          </button>
        </div>
      </div>

      {/* Hàng 2: Trình độ JLPT + Chủ đề + Sắp xếp */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-surface-container-high/40">
        <div className="flex flex-wrap items-center gap-2">
          {/* Lọc Trình độ JLPT */}
          <div role="group" aria-labelledby="library-level-label" className="flex items-center gap-1 flex-wrap">
            <span
              id="library-level-label"
              className="text-[11px] text-on-surface-variant uppercase tracking-wider mr-1 font-semibold"
            >
              JLPT:
            </span>
            <button
              type="button"
              aria-pressed={!selectedLevel}
              onClick={() => onLevelChange("")}
              className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                !selectedLevel
                  ? "bg-primary text-on-primary shadow-xs"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              Tất cả
            </button>
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={selectedLevel === lvl}
                onClick={() => onLevelChange(selectedLevel === lvl ? "" : lvl)}
                className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedLevel === lvl
                    ? "ring-2 ring-primary " + getLevelBadgeClass(lvl)
                    : getLevelBadgeClass(lvl) + " opacity-75 hover:opacity-100 hover:brightness-95"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-3.5 w-[1px] bg-surface-container-high mx-1" />

          {/* Lọc Chủ đề dropdown */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="library-category-select" className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
              Chủ đề:
            </label>
            <select
              id="library-category-select"
              value={selectedCategory || "all"}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="bg-surface-container-low px-2.5 py-1 rounded-lg text-on-surface font-label-md text-xs cursor-pointer hover:bg-surface-container border border-surface-container-high/40 outline-none transition-colors"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lọc Sắp xếp */}
        <div className="flex items-center gap-1.5 self-end md:self-auto">
          <label htmlFor="library-sort" className="text-xs text-on-surface-variant">
            Sắp xếp:
          </label>
          <select
            id="library-sort"
            value={sortOption}
            onChange={(e) => {
              if (isSortOption(e.target.value)) onSortChange(e.target.value);
            }}
            className="bg-surface-container-low px-2.5 py-1 rounded-lg text-on-surface font-label-md text-xs cursor-pointer hover:bg-surface-container border border-surface-container-high/40 outline-none transition-colors"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hàng 3: Tóm tắt bộ lọc đang áp dụng (chỉ hiện khi có lọc) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-on-surface-variant">
          <span className="font-semibold text-outline text-[11px]">Đang lọc:</span>
          {searchTerm.trim() && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Từ khóa: "{searchTerm.trim()}"
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="hover:text-error cursor-pointer"
                aria-label="Bỏ lọc từ khóa"
              >
                ×
              </button>
            </span>
          )}
          {selectedLevel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              JLPT: {selectedLevel}
              <button
                type="button"
                onClick={() => onLevelChange("")}
                className="hover:text-error cursor-pointer"
                aria-label="Bỏ lọc trình độ"
              >
                ×
              </button>
            </span>
          )}
          {selectedCategory && selectedCategory !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Chủ đề: {categoryShortLabel(selectedCategory) ?? selectedCategory}
              <button
                type="button"
                onClick={() => onCategoryChange("all")}
                className="hover:text-error cursor-pointer"
                aria-label="Bỏ lọc chủ đề"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-1 text-primary hover:underline font-semibold cursor-pointer text-xs"
          >
            Xóa tất cả
          </button>
        </div>
      )}
    </div>
  );
};
