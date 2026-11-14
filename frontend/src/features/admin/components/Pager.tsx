import React from "react";

interface PagerProps {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}

/** Phân trang server-side: ‹ Trước · Trang x/y · Sau ›. Ẩn khi chỉ có một trang. */
export const Pager: React.FC<PagerProps> = ({ page, size, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const btn =
    "px-3 py-1.5 rounded-lg text-body-sm font-semibold border border-outline-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  return (
    <nav className="flex items-center justify-end gap-2" aria-label="Phân trang">
      <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Trang trước">
        ‹ Trước
      </button>
      <span className="text-body-sm text-on-surface-variant" aria-current="page">
        Trang {page + 1}/{pages}
      </span>
      <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Trang sau">
        Sau ›
      </button>
    </nav>
  );
};
