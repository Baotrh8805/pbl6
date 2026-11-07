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
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap border";

const LEVEL_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-900 border-blue-300",
  N4: "bg-emerald-100 text-emerald-900 border-emerald-300",
  N3: "bg-amber-100 text-amber-900 border-amber-300",
  N2: "bg-rose-100 text-rose-900 border-rose-300",
  N1: "bg-purple-100 text-purple-900 border-purple-300",
};

/**
 * Thẻ thư mục bản hiện đại (chuẩn COLOR_GUIDELINES.md):
 * Một hàng chip (cấp, số bộ thẻ, số thẻ, lần cập nhật, nguồn) + menu ⋯ (Thêm bộ thẻ, Chia sẻ, Đổi tên, Xoá)
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

  const readOnly = folder.access === "viewer";
  const subfoldersCount = folder.children?.length ?? 0;
  const updated = relativeDayLabel(folder.updatedAt ?? folder.createdAt ?? null);
  const levelClass = folder.level ? (LEVEL_BADGES[folder.level] ?? "bg-slate-100 text-slate-800 border-slate-200") : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Mở thư mục ${folder.title}`}
      onClick={() => onOpen(folder)}
      onKeyDown={handleKeyDown}
      className={`bg-white rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md border border-slate-200/90 hover:border-blue-400 transition-all flex flex-col justify-between gap-3 relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${menuOpen ? "z-30" : ""}`}
    >
      <div>
        {/* Hàng chip + icon + menu */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[22px] text-blue-600 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              folder
            </span>
            {levelClass && <span className={`${chip} ${levelClass}`}>{folder.level}</span>}
            <span className={`${chip} bg-slate-50 text-slate-700 border-slate-200/80`}>{decksCount} bộ thẻ</span>
            <span className={`${chip} bg-slate-50 text-slate-700 border-slate-200/80`}>{flashcardsCount} thẻ</span>
            {subfoldersCount > 0 && (
              <span className={`${chip} bg-slate-50 text-slate-700 border-slate-200/80`}>
                {subfoldersCount} thư mục con
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {readOnly ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200" title="Thư mục người khác chia sẻ">
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">visibility</span>
                Chỉ xem
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                Cá nhân
              </span>
            )}

            {!readOnly && (
              <div className={`relative ${menuOpen ? "z-40" : ""}`} ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="w-7 h-7 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
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
                    className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95"
                  >
                    <button type="button" role="menuitem" onClick={() => runMenuAction(onAddDeck)} className={`${menuItemClass} text-slate-800 hover:bg-slate-50`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-blue-600">playlist_add</span>
                      Thêm bộ thẻ
                    </button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(onShare)} className={`${menuItemClass} text-slate-800 hover:bg-slate-50`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-emerald-600">share</span>
                      Chia sẻ thư mục
                    </button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(onEdit)} className={`${menuItemClass} text-slate-800 hover:bg-slate-50`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-600">edit</span>
                      Đổi tên / Di chuyển
                    </button>
                    <div role="separator" className="my-1 border-t border-slate-100" />
                    <button type="button" role="menuitem" onClick={() => runMenuAction(onDelete)} className={`${menuItemClass} text-rose-600 hover:bg-rose-50`}>
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
          <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2 text-base">
            {folder.title}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-2 mt-1">
            {folder.description || "Thư mục tổ chức tài liệu và bộ thẻ học tập."}
          </p>
          {folder.ownerName && (
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">person</span>
              Chia sẻ bởi {folder.ownerName}
            </p>
          )}
        </div>
      </div>

      {updated && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[13px]">schedule</span>
            {updated}
          </span>
          <span className="text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
            Mở →
          </span>
        </div>
      )}
    </div>
  );
};

export default FolderCard;

export const FolderCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between gap-3 animate-pulse" aria-hidden="true">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-100/70 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-10 rounded-full bg-slate-200" />
          <div className="h-4 w-14 rounded-full bg-slate-100" />
        </div>
        <div className="h-5 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-full rounded bg-slate-100" />
      </div>
    </div>
    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
      <div className="h-3 w-20 rounded bg-slate-100" />
      <div className="h-3 w-8 rounded bg-slate-100" />
    </div>
  </div>
);
