import React, { useState, useRef, useEffect, useId } from "react";
import type { FolderNode } from "@/types/api.types";

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

const menuItemClass =
  "w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer font-medium";

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

  // Menu mở: bấm ra ngoài hoặc nhấn Esc thì đóng (Esc trả focus về nút ⋮).
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Mở thư mục ${folder.title}`}
      onClick={() => onOpen(folder)}
      onKeyDown={handleKeyDown}
      className="bg-surface-container-lowest rounded-2xl p-space-md shadow-xs hover:shadow-md border border-surface-container-high/70 hover:border-primary/40 transition-all flex flex-col justify-between relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="space-y-3">
        {/* Hàng trên: icon, nhãn trình độ, menu */}
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[28px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              folder
            </span>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {folder.level ? (
              <span className="font-label-sm text-[11px] px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C] font-bold">
                {folder.level}
              </span>
            ) : (
              <span className="font-label-sm text-[11px] px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  lock
                </span>
                Cá nhân
              </span>
            )}

            {/* Menu tuỳ chọn */}
            {!readOnly && (
            <div className="relative" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Tùy chọn thư mục"
                aria-label={`Tùy chọn thư mục ${folder.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                  more_vert
                </span>
              </button>

              {menuOpen && (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-surface-container-lowest shadow-xl border border-surface-container-high py-1 z-30 animate-in fade-in zoom-in-95"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onEdit)}
                    className={`${menuItemClass} text-on-surface hover:bg-surface-container`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">
                      edit
                    </span>
                    Đổi tên / Di chuyển
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onShare)}
                    className={`${menuItemClass} text-on-surface hover:bg-surface-container`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">
                      share
                    </span>
                    Chia sẻ thư mục
                  </button>
                  <div role="separator" className="my-1 border-t border-surface-container-high/60" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onDelete)}
                    className={`${menuItemClass} text-error hover:bg-error/10`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      delete
                    </span>
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
          <h3 className="font-headline-sm text-base font-bold text-primary group-hover:text-primary transition-colors leading-snug line-clamp-1">
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

        {/* 3 ô số liệu */}
        <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-surface-container-low text-center font-label-sm border border-surface-container-high/40">
          <div>
            <div className="text-primary font-bold text-[14px]">{decksCount}</div>
            <div className="text-outline text-[10px]">Bộ thẻ</div>
          </div>
          <div>
            <div className="text-primary font-bold text-[14px]">{flashcardsCount}</div>
            <div className="text-outline text-[10px]">Flashcards</div>
          </div>
          <div>
            <div className="text-secondary font-bold text-[14px]">
              {subfoldersCount > 0 ? `${subfoldersCount} con` : "Sẵn sàng"}
            </div>
            <div className="text-outline text-[10px]">Thư mục</div>
          </div>
        </div>
      </div>

      {/* Chân thẻ: thao tác nhanh */}
      <div
        className="pt-3 mt-3 border-t border-surface-container-high/50 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {readOnly ? (
          <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">visibility</span>
            Chỉ xem & học
          </span>
        ) : (
        <button
          type="button"
          onClick={() => onShare?.(folder)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-semibold text-xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            share
          </span>
          <span>Chia sẻ</span>
        </button>
        )}

        <div className="flex items-center gap-1.5">
          {!readOnly && (
          <button
            type="button"
            onClick={() => onAddDeck?.(folder)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-semibold text-xs hover:brightness-110 transition-all cursor-pointer shadow-2xs"
            title="Thêm bộ thẻ có sẵn hoặc từ thư viện vào thư mục này"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              playlist_add
            </span>
            <span>+ Thêm thẻ</span>
          </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(folder)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container transition-colors cursor-pointer"
          >
            <span>Mở</span>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderCard;
