import React, { useState, useRef, useEffect, useId } from "react";
import type { FolderNode } from "@/types/api.types";
import { relativeDayLabel } from "@/lib/timeLabel";

export interface FolderCardProps {
  folder: FolderNode;
  decksCount?: number;
  flashcardsCount?: number;
  onOpen: (folder: FolderNode) => void;
  // Không cần với thư mục người khác chia sẻ (access = viewer): thẻ chỉ cho mở
  onAddDeck?: (folder: FolderNode) => void;
  onShare?: (folder: FolderNode) => void;
  onEdit?: (folder: FolderNode) => void;
  onDelete?: (folder: FolderNode) => void;
}

const menuItemClass = "w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer font-medium";
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap";

/**
 * Thẻ thư mục bản gọn (đề xuất 27/10, cùng dáng với DeckCard): một hàng chip (cấp, số bộ thẻ, số thẻ, lần cập nhật, nguồn) +
 * menu ⋯ (Thêm bộ thẻ, Chia sẻ, Đổi tên, Xoá), tên 2 dòng, mô tả 2 dòng. Cả thẻ bấm được để mở.
 */
export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  decksCount = 0,
  flashcardsCount = 0,
  onOpen,
  onAddDeck,
  onShare,
  onEdit,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Menu mở: bấm ra ngoài hoặc nhấn Esc thì đóng (Esc trả focus về nút ⋯).
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  // Chỉ xử lý phím khi focus đang ở chính thẻ, bỏ qua phím từ menu/nút bên trong.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(folder);
    }
  };

  const runMenuAction = (action?: (folder: FolderNode) => void) => {
    setMenuOpen(false);
    action?.(folder);
  };

  // Thư mục người khác chia sẻ: chỉ xem, không sửa / chia sẻ / thêm bộ thẻ
  const readOnly = folder.access === "viewer";
  const subfoldersCount = folder.children?.length ?? 0;
  const updated = relativeDayLabel(folder.updatedAt ?? folder.createdAt ?? null);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Mở thư mục ${folder.title}`}
      onClick={() => onOpen(folder)}
      onKeyDown={handleKeyDown}
      className="bg-surface-container-lowest rounded-2xl p-4 shadow-xs hover:shadow-md border border-surface-container-high/70 hover:border-primary/40 transition-all flex flex-col gap-2 relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Hàng chip + menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            folder
          </span>
          {folder.level && <span className={`${chip} bg-[#FFF7ED] text-[#C2410C]`}>{folder.level}</span>}
          <span className={`${chip} bg-surface-container text-on-surface-variant`}>{decksCount} bộ thẻ</span>
          <span className={`${chip} bg-surface-container text-on-surface-variant`}>{flashcardsCount} thẻ</span>
          {subfoldersCount > 0 && <span className={`${chip} bg-surface-container text-on-surface-variant`}>{subfoldersCount} thư mục con</span>}
          {updated && (
            <span className={`${chip} bg-surface-container text-on-surface-variant`} title="Lần cập nhật gần nhất">
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">schedule</span>
              {updated}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {readOnly ? (
            <span className={`${chip} bg-secondary-container/40 text-secondary`} title="Thư mục người khác chia sẻ">
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">visibility</span>
              Chỉ xem
            </span>
          ) : (
            <span className={`${chip} bg-secondary-container/40 text-secondary`}>Cá nhân</span>
          )}
          {!readOnly && (
            <div className="relative" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="w-7 h-7 rounded-full inline-flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Tùy chọn thư mục"
                aria-label={`Tùy chọn thư mục ${folder.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">more_horiz</span>
              </button>

              {menuOpen && (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-surface-container-lowest shadow-xl border border-surface-container-high py-1 z-30 animate-in fade-in zoom-in-95"
                >
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onAddDeck)} className={`${menuItemClass} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">playlist_add</span>
                    Thêm bộ thẻ
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onShare)} className={`${menuItemClass} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">share</span>
                    Chia sẻ thư mục
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onEdit)} className={`${menuItemClass} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">edit</span>
                    Đổi tên / Di chuyển
                  </button>
                  <div role="separator" className="my-1 border-t border-surface-container-high/60" />
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onDelete)} className={`${menuItemClass} text-error hover:bg-error/10`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
                    Xóa thư mục
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tên & mô tả */}
      <div>
        <h3 className="font-headline-sm text-base font-bold text-on-surface group-hover:text-primary transition-colors leading-snug line-clamp-2">
          {folder.title}
        </h3>
        <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2 mt-1">
          {folder.description || "Thư mục tổ chức tài liệu và bộ thẻ học tập."}
        </p>
        {folder.ownerName && (
          <p className="text-[11px] text-outline mt-1 flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[13px]">person</span>
            Chia sẻ bởi {folder.ownerName}
          </p>
        )}
      </div>
    </div>
  );
};
