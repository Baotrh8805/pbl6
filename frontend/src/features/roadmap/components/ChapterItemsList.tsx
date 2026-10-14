import React, { useState } from "react";
import type { ExtractionItem } from "@/types/api.types";
import { Ruby } from "@/lib/ja";
import { itemMeaning } from "@/features/extraction/extractionUtils";
import { LevelBadge } from "@/features/extraction/components/LevelBadge";

interface ChapterItemsListProps {
  items: ExtractionItem[];
  busy: boolean;
  /** Ném lỗi khi lưu thất bại -> danh sách tự trả lại trạng thái cũ. */
  onToggle: (id: string, selected: boolean) => Promise<void>;
}

export const ChapterItemsList: React.FC<ChapterItemsListProps> = ({ items, busy, onToggle }) => {
  // Bản sao cục bộ để lật checkbox ngay; đồng bộ lại khi danh sách từ server đổi.
  const [state, setState] = useState({ src: items, list: items });
  if (state.src !== items) setState({ src: items, list: items });
  const list = state.src === items ? state.list : items;

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
    <ul className="flex flex-col gap-1.5">
      {list.map((it) => (
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
            </div>
            <p className="text-body-sm text-on-surface-variant break-words">{itemMeaning(it) || "—"}</p>
          </div>
          <LevelBadge item={it} />
        </li>
      ))}
    </ul>
  );
};
