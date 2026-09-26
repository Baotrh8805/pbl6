import React from "react";
import {
  CATEGORIES,
  LEVELS,
  SORT_OPTIONS,
  getLevelBadgeClass,
  isSortOption,
  type LibraryTab,
  type SortOption,
} from "./libraryOptions";

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
  `px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
    active
      ? "bg-primary text-on-primary font-bold shadow-xs"
      : "bg-surface-container text-on-surface hover:bg-surface-container-high"
  }`;

// Ô tìm kiếm + tab + lọc trình độ / chủ đề + sắp xếp.
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
}) => (
  <div className="flex flex-col gap-space-md bg-surface-container-lowest p-space-md rounded-2xl shadow-xs border border-surface-container-high/60">
    {/* Ô tìm kiếm */}
    <div className="relative w-full">
      <label htmlFor="library-search" className="sr-only">
        Tìm kiếm bộ thẻ
      </label>
      <span
        aria-hidden="true"
        className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[22px]"
      >
        search
      </span>
      <input
        id="library-search"
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Tìm kiếm bộ thẻ theo tên giáo trình, từ khóa Kanji, chủ đề (kinh tế, IT, hội thoại)..."
        className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container transition-all"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        <kbd className="hidden sm:inline-block px-2 py-1 rounded bg-surface-container text-on-surface-variant font-label-sm text-[11px]">
          ⌘K
        </kbd>
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Xóa nội dung tìm kiếm"
            className="px-2 py-1 rounded-lg text-xs text-outline hover:text-on-surface"
          >
            Xóa
          </button>
        )}
      </div>
    </div>

    {/* Tab phân đoạn */}
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
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
        className={`flex items-center gap-1 ${tabClass(selectedTab === "popular")}`}
      >
        <span>Phổ biến nhất</span>
        <span aria-hidden="true">🔥</span>
      </button>
      <button
        type="button"
        aria-pressed={selectedTab === "official"}
        onClick={() => onTabChange("official")}
        className={`flex items-center gap-1 ${tabClass(selectedTab === "official")}`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified</span>
        Chính thức NihonGen
      </button>
      <button
        type="button"
        aria-pressed={selectedTab === "community"}
        onClick={() => onTabChange("community")}
        className={tabClass(selectedTab === "community")}
      >
        Cộng đồng đóng góp
      </button>
    </div>

    {/* Trình độ JLPT & sắp xếp */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pt-1 border-t border-surface-container-high/40">
      <div role="group" aria-labelledby="library-level-label" className="flex items-center gap-2 flex-wrap">
        <span
          id="library-level-label"
          className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider mr-1 font-semibold"
        >
          Trình độ:
        </span>
        <button
          type="button"
          aria-pressed={!selectedLevel}
          onClick={() => onLevelChange("")}
          className={`px-2.5 py-1 rounded-full font-label-sm text-xs font-bold transition-all cursor-pointer ${
            !selectedLevel
              ? "bg-primary-container text-on-primary"
              : "bg-surface-container text-on-surface hover:bg-surface-container-high"
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
            className={`px-2.5 py-1 rounded-full font-label-sm text-xs font-bold transition-all cursor-pointer ${
              selectedLevel === lvl
                ? "ring-2 ring-primary " + getLevelBadgeClass(lvl)
                : getLevelBadgeClass(lvl) + " hover:brightness-95 opacity-80"
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 self-end md:self-auto">
        <label htmlFor="library-sort" className="font-body-sm text-xs text-on-surface-variant">
          Sắp xếp:
        </label>
        <select
          id="library-sort"
          value={sortOption}
          onChange={(e) => {
            if (isSortOption(e.target.value)) onSortChange(e.target.value);
          }}
          className="bg-surface-container-low px-2.5 py-1 rounded-lg text-on-surface font-label-md text-xs cursor-pointer hover:bg-surface-container border-none outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>

    {/* Chủ đề */}
    <div role="group" aria-labelledby="library-category-label" className="flex items-center gap-2 flex-wrap pt-1">
      <span
        id="library-category-label"
        className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider mr-1 font-semibold"
      >
        Chủ đề:
      </span>
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          aria-pressed={selectedCategory === cat.id}
          onClick={() => onCategoryChange(cat.id)}
          className={`px-2.5 py-1 rounded-lg font-label-md text-xs transition-colors cursor-pointer ${
            selectedCategory === cat.id
              ? "bg-surface-container-high text-primary font-bold border border-primary/30"
              : "bg-surface-container-low text-on-surface hover:bg-surface-container"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  </div>
);
