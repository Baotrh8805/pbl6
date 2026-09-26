import React, { useEffect, useId, useRef } from "react";

// <dialog> + showModal(): trình duyệt lo sẵn focus trap, phím Esc, aria-modal, nền inert
// và trả focus về nút đã mở modal khi đóng -> không cần tự viết.
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Tên icon Material Symbols ở đầu tiêu đề. */
  icon?: string;
  subtitle?: React.ReactNode;
  /** Chiều rộng tối đa của hộp thoại. */
  size?: "md" | "lg" | "xl" | "2xl" | "3xl";
  /** Vùng nút cuối modal (Hủy / Lưu...). */
  footer?: React.ReactNode;
  /** Bấm ra nền tối để đóng; tắt khi đang có thao tác dở (vd. đang lưu). */
  closeOnBackdrop?: boolean;
  /** Bỏ padding mặc định của thân modal (khi nội dung tự chia layout). */
  bare?: boolean;
  children: React.ReactNode;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  subtitle,
  size = "lg",
  footer,
  closeOnBackdrop = true,
  bare = false,
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: để React quyết định đóng (giữ isOpen là nguồn sự thật duy nhất).
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === dialogRef.current) onClose();
      }}
      className={`backdrop:bg-black/50 backdrop:backdrop-blur-xs p-0 rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-2xl ${SIZES[size]} w-[92vw] max-h-[90vh] text-on-surface m-auto`}
    >
      <div className="flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-surface-container-high/60 bg-surface-container-low/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span aria-hidden="true" className="material-symbols-outlined text-primary text-[22px] shrink-0">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-headline font-bold text-lg text-on-surface">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-on-surface-variant truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              close
            </span>
          </button>
        </div>

        <div className={`overflow-y-auto ${bare ? "" : "p-6"}`}>{children}</div>

        {footer && (
          <div className="px-6 py-3 border-t border-surface-container-high/60 bg-surface-container-low/50 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
};

/** Nhãn "Sắp ra mắt" cho tính năng chưa có backend: hiển thị nhưng không cho thao tác. */
export const ComingSoonBadge: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-fixed text-tertiary text-[11px] font-semibold whitespace-nowrap ${className}`}
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
      schedule
    </span>
    Sắp ra mắt
  </span>
);
