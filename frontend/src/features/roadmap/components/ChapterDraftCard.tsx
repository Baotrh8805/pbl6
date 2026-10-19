import React, { useState } from "react";
import type { LearningPathChapter } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchChapterItems, patchPathItems } from "@/services/learningPathService";
import { formatDayRange } from "@/features/roadmap/roadmapUtils";
import { ChapterItemsList } from "./ChapterItemsList";

const inlineInput =
  "w-full min-w-0 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary focus:outline-none font-title-md text-title-md text-on-surface px-0.5 py-0.5 transition-colors disabled:cursor-not-allowed";

interface ChapterDraftCardProps {
  pathId: string;
  chapter: LearningPathChapter;
  index: number;
  canMergeUp: boolean;
  /** Đang kích hoạt lộ trình: khoá gộp chương / chọn thẻ. */
  activating: boolean;
  /** Đang "Dịch lại nghĩa": server trả 409 cho mọi thay đổi chương nên khoá cả tên chương, gộp và chọn thẻ (vẫn xem được). */
  locked?: boolean;
  onRename: (cid: string, title: string) => void;
  onMergeUp: (cid: string) => Promise<void>;
  onItemsPatched: () => void;
  /** Đổi giá trị -> tải lại danh sách đang mở (vd. "Dịch lại nghĩa" xong: nghĩa tiếng Việt mới của item). */
  reloadKey?: string;
  /**
   * Bố cục chương của cả bản nháp (chapterLayoutKey): đổi -> tải lại NGẦM danh sách đang mở. Server chia lại chương "Ngày N" sau
   * mỗi lần chọn thẻ ở BẤT KỲ chương nào, nên chương này có thể nhận / mất mục dù số thẻ của chính nó không đổi.
   */
  layoutKey?: string;
}

export const ChapterDraftCard: React.FC<ChapterDraftCardProps> = ({
  pathId,
  chapter,
  index,
  canMergeUp,
  activating,
  locked = false,
  onRename,
  onMergeUp,
  onItemsPatched,
  reloadKey = "",
  layoutKey,
}) => {
  const [title, setTitle] = useState({ src: chapter.title, value: chapter.title });
  if (title.src !== chapter.title) setTitle({ src: chapter.title, value: chapter.title });
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Tải lại ngầm khi bố cục chương đổi (bỏ tick ở đây hay chương khác, gộp chương) để danh sách khớp server; không có khoá bố
  // cục thì theo số thẻ của chính chương.
  const items = useAsync(
    () => (open ? fetchChapterItems(pathId, chapter.id) : Promise.resolve([])),
    [pathId, chapter.id, open, version, reloadKey],
    layoutKey ?? chapter.cardCount
  );
  const busy = activating || locked;

  const commitTitle = () => {
    const next = title.value.trim();
    if (!next) setTitle({ src: chapter.title, value: chapter.title });
    else if (next !== chapter.title) onRename(chapter.id, next);
  };

  const toggle = async (id: string, selected: boolean) => {
    try {
      await patchPathItems(pathId, [{ id, selected }]);
      setToggleError(null);
    } catch (e) {
      setToggleError(extractErrorMessage(e));
      throw e;
    }
    onItemsPatched();
  };

  const mergeUp = async () => {
    setMerging(true);
    try {
      await onMergeUp(chapter.id);
    } finally {
      setMerging(false);
    }
  };

  const toggleOpen = () => {
    if (!open) setVersion((v) => v + 1); // mở lại -> lấy danh sách mới
    setOpen((o) => !o);
  };

  return (
    <li className="p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-space-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 shrink-0 w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-bold flex items-center justify-center"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <label className="flex flex-col">
            <span className="sr-only">Tên chương {index + 1}</span>
            <input
              value={title.value}
              maxLength={100}
              disabled={locked}
              onChange={(e) => setTitle({ src: chapter.title, value: e.target.value })}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={inlineInput}
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-on-surface-variant">
            <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-semibold">
              {formatDayRange(chapter.dayFrom, chapter.dayTo)}
            </span>
            <span>{chapter.cardCount} thẻ</span>
            <span aria-hidden="true">·</span>
            <span>{chapter.perDay}/ngày</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label-md text-primary hover:bg-primary/10 transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            {open ? "expand_less" : "expand_more"}
          </span>
          {open ? "Ẩn danh sách" : "Xem danh sách"}
        </button>
        {canMergeUp && index > 0 && (
          <button
            type="button"
            disabled={busy || merging}
            onClick={() => void mergeUp()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">vertical_align_top</span>
            Gộp vào chương trước
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2">
          {toggleError && (
            <p role="alert" className="text-label-sm text-error">
              Chưa lưu được: {toggleError}
            </p>
          )}
          {items.loading ? (
            <p className="text-body-sm text-on-surface-variant">Đang tải...</p>
          ) : items.error ? (
            <p className="text-body-sm text-error">{items.error}</p>
          ) : (
            <ChapterItemsList items={items.data ?? []} busy={busy} onToggle={toggle} />
          )}
        </div>
      )}
    </li>
  );
};
