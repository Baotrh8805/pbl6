import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Deck } from "@/types/api.types";
import { canEditDeck, deckSourceLabel } from "@/lib/deckUtils";
import { relativeDayLabel } from "@/lib/timeLabel";
import { deckUpdatedAt } from "../deckListUtils";

export interface DeckCardProps {
  deck: Deck;
  /** Thẻ đã học đến hạn trong bộ (0 = không có nợ ôn). */
  dueCount?: number;
  /** Đang xem trong một thư mục: menu có "Đưa ra khỏi thư mục". */
  inFolder?: boolean;
  onDelete?: (deck: Deck) => void;
  onRemoveFromFolder?: (deck: Deck) => void;
}

const chip = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";
const menuItem = "w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer font-medium";

const LEVEL_BADGES: Record<string, string> = {
  N5: "bg-blue-100 text-blue-900 border-blue-300",
  N4: "bg-emerald-100 text-emerald-900 border-emerald-300",
  N3: "bg-amber-100 text-amber-900 border-amber-300",
  N2: "bg-rose-100 text-rose-900 border-rose-300",
  N1: "bg-purple-100 text-purple-900 border-purple-300",
};

/**
 * Thẻ bộ thẻ hiện đại (chuẩn COLOR_GUIDELINES.md):
 * - Badge cấp độ JLPT chuẩn màu (N5 xanh, N4 ngọc, N3 cam, N2 đỏ, N1 tím)
 * - Nút 1-click CTA trực tiếp ("Ôn ngay" cam AAA hoặc "Học tiếp" xanh dịu)
 * - Menu thao tác phụ ⋯ gọn gàng
 */
export const DeckCard: React.FC<DeckCardProps> = ({
  deck,
  dueCount = 0,
  inFolder = false,
  onDelete,
  onRemoveFromFolder,
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const id = encodeURIComponent(deck.id);
  const updated = relativeDayLabel(deckUpdatedAt(deck));
  const owner = deck.access === "owner";
  const hasCards = deck.cards.length > 0;
  const levelClass = LEVEL_BADGES[deck.level] ?? "bg-slate-100 text-slate-800 border-slate-200";

  return (
    <li className="relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-400 hover:shadow-md transition-all shadow-xs group">
      <div>
        {/* Header row: JLPT Level, Card count, Due indicator, Source badge, Actions */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className={`${chip} ${levelClass}`}>
              {deck.level}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
              {deck.cards.length} thẻ
            </span>
            {dueCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {dueCount} đến hạn
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {owner ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                Cá nhân
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                {deckSourceLabel(deck)}
              </span>
            )}

            <div className="relative z-10" ref={menuRef}>
              <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={`Thao tác với bộ thẻ "${deck.title}"`}
                title="Thao tác"
                className="w-7 h-7 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">more_horiz</span>
              </button>

              {open && (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95"
                >
                  {hasCards && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => go(`/decks/${id}/study${dueCount === 0 ? "?cram=1" : ""}`)}
                        className={`${menuItem} text-slate-800 hover:bg-slate-50`}
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-blue-600">play_arrow</span>
                        {dueCount > 0 ? `Ôn ${dueCount} thẻ đến hạn` : "Ôn lại cả bộ"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => go(`/decks/${id}/quiz`)}
                        className={`${menuItem} text-slate-800 hover:bg-slate-50`}
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-indigo-600">quiz</span>
                        Kiểm tra
                      </button>
                    </>
                  )}
                  {canEditDeck(deck) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => go(`/decks/${id}/edit`)}
                      className={`${menuItem} text-slate-800 hover:bg-slate-50`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-600">edit</span>
                      Chỉnh sửa
                    </button>
                  )}
                  {owner && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => go(`/decks/${id}?share=1`)}
                      className={`${menuItem} text-slate-800 hover:bg-slate-50`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-emerald-600">share</span>
                      Chia sẻ
                    </button>
                  )}
                  {inFolder && owner && onRemoveFromFolder && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpen(false); onRemoveFromFolder(deck); }}
                      className={`${menuItem} text-slate-800 hover:bg-slate-50`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-amber-600">folder_off</span>
                      Đưa ra khỏi thư mục
                    </button>
                  )}
                  {owner && onDelete && (
                    <>
                      <div role="separator" className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setOpen(false); onDelete(deck); }}
                        className={`${menuItem} text-rose-600 hover:bg-rose-50`}
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
                        Xoá bộ thẻ
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
          <Link
            to={`/decks/${id}`}
            className="focus:outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-blue-500"
          >
            {deck.title}
          </Link>
        </h2>
        <p className="text-xs text-slate-500 line-clamp-2 mt-1">
          {deck.description || "Chưa có mô tả"}
        </p>
      </div>

      {/* 1-Click Action Footer (relative z-10 so clicks don't hit link) */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 relative z-10">
        <span className="text-[11px] text-slate-400 font-medium">
          {updated ? `Cập nhật ${updated}` : `${deck.cards.length} thẻ`}
        </span>

        {hasCards && (
          dueCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/decks/${id}/study`);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Ôn các thẻ đến hạn hôm nay"
            >
              <span>Ôn ngay ({dueCount})</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/decks/${id}/study?cram=1`);
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Ôn lại toàn bộ thẻ trong bộ"
            >
              <span>Ôn tập</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          )
        )}
      </div>
    </li>
  );
};

export default DeckCard;

export const DeckCardSkeleton: React.FC = () => (
  <li className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between gap-3 animate-pulse" aria-hidden="true">
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-5 w-10 rounded bg-slate-200" />
        <div className="h-4 w-16 rounded bg-slate-100" />
      </div>
      <div className="space-y-1.5">
        <div className="h-4 w-4/5 rounded bg-slate-200" />
        <div className="h-3 w-3/5 rounded bg-slate-100" />
      </div>
      <div className="h-3 w-full rounded bg-slate-100" />
    </div>
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-slate-100" />
        <div className="h-3 w-8 rounded bg-slate-100" />
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-100" />
      <div className="w-full h-8 rounded-xl bg-slate-200" />
    </div>
  </li>
);
