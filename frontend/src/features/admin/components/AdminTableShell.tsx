import React from "react";

interface AdminTableShellProps {
  caption: string;
  loading: boolean;
  error?: string;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
  statusText?: string;
  children: React.ReactNode;
}

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
      <div className="overflow-x-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest">
        <table className="w-full text-body-sm [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:text-label-sm [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-outline [&_th]:font-bold [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    )}
  </div>
);
