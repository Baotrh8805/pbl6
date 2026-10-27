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

const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap";
const menuItem = "w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer font-medium";

/**
 * Thẻ bộ thẻ bản gọn (đề xuất 27/10): một hàng chip (cấp, số thẻ, lần cập nhật, nguồn) + menu ⋯, tiêu đề 2 dòng, mô tả 2 dòng.
 * Cả thẻ là link tới trang bộ thẻ; thao tác (Học, Quiz, Sửa, Xoá...) gom vào menu để lưới nhìn gọn. Có nợ ôn thì chip đỏ "N đến hạn".
 */
export const DeckCard: React.FC<DeckCardProps> = ({ deck, dueCount = 0, inFolder = false, onDelete, onRemoveFromFolder }) => {
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

  return (
    <li className="relative flex flex-col gap-2 p-4 rounded-2xl bg-surface-container-lowest border border-surface-container-high hover:border-primary/40 hover:shadow-md transition-all group">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className={`${chip} bg-primary text-on-primary`}>{deck.level}</span>
          <span className={`${chip} bg-surface-container text-on-surface-variant`}>{deck.cards.length} thẻ</span>
          {updated && (
            <span className={`${chip} bg-surface-container text-on-surface-variant`} title="Lần cập nhật gần nhất">
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">schedule</span>
              {updated}
            </span>
          )}
          {dueCount > 0 && (
            <span className={`${chip} bg-error/10 text-error`} title="Thẻ đã học đến hạn ôn">
              {dueCount} đến hạn
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {owner ? (
            <span className={`${chip} bg-secondary-container/40 text-secondary`}>Cá nhân</span>
          ) : (
            <span className={`${chip} bg-surface-container text-outline`}>{deckSourceLabel(deck)}</span>
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
              className="w-7 h-7 rounded-full inline-flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">more_horiz</span>
            </button>
            {open && (
              <div
                id={menuId}
                role="menu"
                className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-surface-container-lowest shadow-xl border border-surface-container-high py-1 z-30"
              >
                {hasCards && (
                  <>
                    <button type="button" role="menuitem" onClick={() => go(`/decks/${id}/study${dueCount === 0 ? "?cram=1" : ""}`)} className={`${menuItem} text-on-surface hover:bg-surface-container`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">play_arrow</span>
                      {dueCount > 0 ? `Ôn ${dueCount} thẻ đến hạn` : "Ôn lại cả bộ"}
                    </button>
                    <button type="button" role="menuitem" onClick={() => go(`/decks/${id}/quiz`)} className={`${menuItem} text-on-surface hover:bg-surface-container`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">quiz</span>
                      Kiểm tra
                    </button>
                  </>
                )}
                {canEditDeck(deck) && (
                  <button type="button" role="menuitem" onClick={() => go(`/decks/${id}/edit`)} className={`${menuItem} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">edit</span>
                    Chỉnh sửa
                  </button>
                )}
                {owner && (
                  <button type="button" role="menuitem" onClick={() => go(`/decks/${id}?share=1`)} className={`${menuItem} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">share</span>
                    Chia sẻ
                  </button>
                )}
                {inFolder && owner && onRemoveFromFolder && (
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); onRemoveFromFolder(deck); }} className={`${menuItem} text-on-surface hover:bg-surface-container`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">folder_off</span>
                    Đưa ra khỏi thư mục
                  </button>
                )}
                {owner && onDelete && (
                  <>
                    <div role="separator" className="my-1 border-t border-surface-container-high/60" />
                    <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(deck); }} className={`${menuItem} text-error hover:bg-error/10`}>
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

      <h2 className="font-title-md text-title-md font-semibold text-on-surface leading-snug line-clamp-2 group-hover:text-primary transition-colors">
        {/* Link "kéo giãn" phủ cả thẻ; menu ở trên (z-10) nên không lồng button trong <a> */}
        <Link to={`/decks/${id}`} className="focus:outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary">
          {deck.title}
        </Link>
      </h2>
      <p className="text-body-sm text-on-surface-variant line-clamp-2">{deck.description || "Chưa có mô tả"}</p>
    </li>
  );
};
