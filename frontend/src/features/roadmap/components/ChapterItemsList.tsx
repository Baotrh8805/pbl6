import React, { useState } from "react";
import type { ExtractionItem } from "@/types/api.types";
import { Ruby } from "@/lib/ja";
import { itemMeaning } from "@/features/extraction/extractionUtils";
import { LevelBadge } from "@/features/extraction/components/LevelBadge";
import { ConflictBadge } from "@/features/extraction/components/ConflictBadge";
import { hasConflicts, itemConflicts } from "@/features/extraction/conflictUtils";

interface ChapterItemsListProps {
  items: ExtractionItem[];
  busy: boolean;
  /** Ném lỗi khi lưu thất bại -> danh sách tự trả lại trạng thái cũ. */
  onToggle: (id: string, selected: boolean) => Promise<void>;
}

// Danh sách mục của một chương bản nháp: tick chọn, furigana, nghĩa, cấp, cảnh báo mâu thuẫn với nguồn chuẩn (F2) và lọc
// "Chỉ mục mâu thuẫn" để rà nhanh trước khi kích hoạt lộ trình.
export const ChapterItemsList: React.FC<ChapterItemsListProps> = ({ items, busy, onToggle }) => {
  // Bản sao cục bộ để lật checkbox ngay; đồng bộ lại khi danh sách từ server đổi.
  const [state, setState] = useState({ src: items, list: items });
  if (state.src !== items) setState({ src: items, list: items });
  const list = state.src === items ? state.list : items;
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const conflictCount = list.filter(hasConflicts).length;
  // Kiểm tra lại xong hết mâu thuẫn -> tự bỏ lọc để danh sách không trống.
  const filterOn = onlyConflicts && conflictCount > 0;
  const shown = filterOn ? list.filter(hasConflicts) : list;

  const setSelected = (id: string, selected: boolean) =>
    setState((s) => ({ ...s, list: s.list.map((it) => (it.id === id ? { ...it, selected } : it)) }));

  const toggle = async (id: string, selected: boolean) => {
    setSelected(id, selected);
    try {
      await onToggle(id, selected);
    } catch {
      setSelected(id, !selected);
    }
  };

  if (list.length === 0)
    return <p className="text-body-sm text-on-surface-variant py-2">Chương này chưa có mục nào.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {conflictCount > 0 && (
        <button
          type="button"
          aria-pressed={filterOn}
          onClick={() => setOnlyConflicts((v) => !v)}
          title="Chỉ hiện mục mà tài liệu ghi khác nguồn tri thức chuẩn"
          className={`self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm font-semibold border transition-colors cursor-pointer ${
            filterOn
              ? "bg-amber-700 text-white border-amber-700"
              : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">warning</span>
          Chỉ mục mâu thuẫn ({conflictCount})
        </button>
      )}
      <ul className="flex flex-col gap-1.5">
        {shown.map((it) => (
          <li
            key={it.id}
            className={`grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 items-start p-2 rounded-lg border transition-colors ${
              it.selected
                ? "bg-surface-container-lowest border-surface-container-high"
                : "bg-surface-container-low/60 border-transparent opacity-70"
            }`}
          >
            <input
              type="checkbox"
              checked={it.selected}
              disabled={busy}
              onChange={(e) => void toggle(it.id, e.target.checked)}
              className="mt-1.5 rounded accent-primary cursor-pointer disabled:cursor-not-allowed"
              aria-label={`Chọn ${it.term}`}
            />
            <div className="min-w-0 flex flex-col">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-title-md font-semibold font-japanese text-on-surface break-words">
                  <Ruby term={it.term} reading={it.reading ?? undefined} segments={it.readingSegments} />
                </span>
                {it.reading && (
                  <span lang="ja" className="text-label-sm text-outline">
                    {it.reading}
                  </span>
                )}
                <ConflictBadge conflicts={itemConflicts(it)} term={it.term} />
              </div>
              <p className="text-body-sm text-on-surface-variant break-words">{itemMeaning(it) || "—"}</p>
            </div>
            <LevelBadge item={it} />
          </li>
        ))}
      </ul>
    </div>
  );
};
