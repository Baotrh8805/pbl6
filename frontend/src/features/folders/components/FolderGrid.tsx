import React from "react";
import type { FolderNode } from "@/types/api.types";
import { Button } from "@/components/ui/Button";
import { FolderCard } from "./FolderCard";
import type { FolderMetrics } from "./folderTree";

export interface FolderGridProps {
  folders: FolderNode[];
  metrics: FolderMetrics;
  /** Đang ở trong thư mục -> đổi tiêu đề thành "Thư mục con". */
  isNested: boolean;
  /** Ghi đè tiêu đề mặc định (vd. "Được chia sẻ với tôi"). */
  title?: string;
  /** Không truyền = không cho thêm (thư mục người khác chia sẻ). */
  onAddFolder?: () => void;
  onOpen: (folder: FolderNode) => void;
  onAddDeck?: (folder: FolderNode) => void;
  onShare?: (folder: FolderNode) => void;
  onEdit?: (folder: FolderNode) => void;
  onDelete?: (folder: FolderNode) => void;
}

// Lưới thẻ thư mục (thư mục gốc hoặc thư mục con).
export const FolderGrid: React.FC<FolderGridProps> = ({
  folders,
  metrics,
  isNested,
  title,
  onAddFolder,
  ...cardHandlers
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold uppercase tracking-wider text-outline flex items-center gap-1.5">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
          folder
        </span>
        {title ?? (isNested ? "Thư mục con" : "Thư mục của bạn")} ({folders.length})
      </h2>
      {onAddFolder && (
        <button
          type="button"
          onClick={onAddFolder}
          className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            add
          </span>
          Thêm thư mục
        </button>
      )}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
      {folders.map((f) => {
        const m = metrics[f.id] || { decks: 0, cards: 0 };
        return (
          <FolderCard
            key={f.id}
            folder={f}
            decksCount={m.decks}
            flashcardsCount={m.cards}
            {...cardHandlers}
          />
        );
      })}
    </div>
  </div>
);

// Trạng thái trống ở trang gốc (chưa có thư mục / lọc không ra kết quả).
export const FoldersEmptyState: React.FC<{ isFiltered: boolean; onCreate: () => void }> = ({
  isFiltered,
  onCreate,
}) => (
  <div className="p-12 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
    <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
      <span aria-hidden="true" className="material-symbols-outlined text-[36px]">
        create_new_folder
      </span>
    </div>
    <div>
      <h3 className="font-headline font-bold text-base text-primary">
        {isFiltered ? "Không tìm thấy thư mục phù hợp" : "Bạn chưa tạo thư mục nào"}
      </h3>
      <p className="text-xs text-on-surface-variant max-w-sm mt-1">
        Tạo thư mục đầu tiên để phân nhóm các bộ thẻ.
      </p>
    </div>
    <Button variant="primary" size="md" onClick={onCreate} className="cursor-pointer mt-2">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
        add
      </span>
      Tạo Thư Mục Đầu Tiên
    </Button>
  </div>
);
