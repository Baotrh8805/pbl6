import React, { useId, useLayoutEffect, useRef } from "react";

// <dialog> + showModal(): trình duyệt lo sẵn focus trap, phím Esc, aria-modal, nền inert
// và trả focus về nút đã mở modal khi đóng -> không cần tự viết.
// Điều kiện để được trả focus: close() phải chạy khi <dialog> CÒN trong DOM (gỡ thẳng node đang mở thì
// focus rơi xuống <body>). Vì vậy <dialog> luôn được render, chỉ nội dung bên trong gỡ khi đóng (state
// của form con vẫn reset như trước), và việc đóng nằm trong cleanup của layout effect: chạy trước khi
// React gỡ node, cả khi isOpen đổi lẫn khi Modal bị unmount lúc đang mở.
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

  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el || !isOpen) return;
    if (!el.open) el.showModal();
    // Cleanup chạy khi isOpen -> false hoặc Modal unmount, lúc <dialog> còn gắn trong DOM -> trình duyệt
    // trả focus về nút đã mở. Đóng trong effect thường (sau khi node đã bị gỡ) thì không được.
    return () => {
      if (el.open) el.close();
    };
  }, [isOpen]);

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
      {/* Đóng thì gỡ nội dung (không gỡ <dialog>) để state của form con reset như trước. */}
      {isOpen && (
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
      )}
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
