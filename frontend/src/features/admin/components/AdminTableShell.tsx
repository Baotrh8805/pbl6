import React from "react";

interface AdminTableShellProps {
  caption: string;
  loading: boolean;
  error?: string;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
  statusText?: string;
  /**
   * Cột cuối là cột thao tác (nút "Chi tiết" / "Xử lý"): dính mép phải vùng cuộn ngang. Ở 1024 px bảng rộng hơn khung,
   * không có cờ này thì nút nằm ngoài màn hình tới khi cuộn ngang hết bảng.
   */
  stickyActions?: boolean;
  children: React.ReactNode;
}

const STICKY_LAST =
  "[&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-surface-container-lowest " +
  "[&_td:last-child]:sticky [&_td:last-child]:right-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-surface-container-lowest " +
  "[&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(4,21,52,0.18)] [&_th:last-child]:shadow-[-6px_0_8px_-6px_rgba(4,21,52,0.18)]";

/**
 * Khung chung cho bảng admin: lỗi (role="alert" + Thử lại), đang tải, rỗng, và vùng role="status" đọc số kết quả.
 * children = <thead> + <tbody>; bảng cuộn ngang bằng CSS khi màn hẹp.
 */
export const AdminTableShell: React.FC<AdminTableShellProps> = ({
  caption,
  loading,
  error,
  empty,
  emptyText,
  onRetry,
  statusText,
  stickyActions = false,
  children,
}) => (
  <div className="flex flex-col gap-2">
    {statusText && (
      <p role="status" className="text-body-sm text-on-surface-variant">
        {statusText}
      </p>
    )}
    {error && (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error}{" "}
        <button type="button" onClick={onRetry} className="underline font-semibold cursor-pointer">
          Thử lại
        </button>
      </p>
    )}
    {loading ? (
      <p className="text-on-surface-variant">Đang tải...</p>
    ) : empty && !error ? (
      <p className="p-6 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-md text-on-surface-variant">
        {emptyText}
      </p>
    ) : (
      // relative: phần tử sr-only (position:absolute) trong bảng, vd. tiêu đề "Thao tác" cột cuối, lấy vùng cuộn này làm
      // khối chứa; không có thì nó định vị theo <body> và nới rộng cả trang trên điện thoại.
      <div className="relative overflow-x-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest">
        <table className={`w-full text-body-sm ${stickyActions ? STICKY_LAST : ""} [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:text-label-sm [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-outline [&_th]:font-bold [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high`}>
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    )}
  </div>
);
