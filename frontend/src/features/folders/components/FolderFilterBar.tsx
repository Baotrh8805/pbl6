import React, { useId } from "react";
import { JLPT_LEVELS as LEVELS } from "@/lib/deckUtils";

export interface FolderFilterBarProps {
  query: string;
  level: string;
  placeholder: string;
  onQueryChange: (q: string) => void;
  onLevelChange: (level: string) => void;
}

const pillClass = (active: boolean) =>
  active
    ? "bg-primary text-on-primary shadow-2xs"
    : "bg-surface-container text-on-surface-variant hover:text-on-surface";

// Thanh tìm kiếm + lọc trình độ (giá trị lưu trên URL, trang cha quản lý).
export const FolderFilterBar: React.FC<FolderFilterBarProps> = ({
  query,
  level,
  placeholder,
  onQueryChange,
  onLevelChange,
}) => {
  const searchId = useId();
  const levelLabelId = useId();

  return (
    <div className="bg-surface-container-lowest rounded-xl p-3 shadow-xs border border-surface-container-high/60 flex flex-col md:flex-row items-stretch md:items-center gap-3">
      <div className="relative flex-1">
        <label htmlFor={searchId} className="sr-only">
          Tìm kiếm
        </label>
        <span
          aria-hidden="true"
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]"
        >
          search
        </span>
        <input
          id={searchId}
          type="text"
          enterKeyHint="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 bg-surface-container-low rounded-lg text-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container border border-transparent focus:border-outline-variant"
        />
      </div>

      <div
        role="group"
        aria-labelledby={levelLabelId}
        className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none"
      >
        <span
          id={levelLabelId}
          className="font-label-sm text-xs text-outline px-1 shrink-0 font-semibold"
        >
          Trình độ:
        </span>
        <button
          type="button"
          aria-pressed={!level}
          onClick={() => onLevelChange("")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${pillClass(!level)}`}
        >
          Tất cả
        </button>
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            aria-pressed={level === lvl}
            onClick={() => onLevelChange(level === lvl ? "" : lvl)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${pillClass(level === lvl)}`}
          >
            {lvl}
          </button>
        ))}
      </div>
    </div>
  );
};
