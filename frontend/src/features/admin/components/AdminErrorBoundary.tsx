import React from "react";

interface AdminErrorBoundaryProps {
  children: React.ReactNode;
}

interface AdminErrorBoundaryState {
  failed: boolean;
}

/**
 * Chặn lỗi render của một trang / widget admin để không gỡ cả khung quản trị (header, thanh bên) thành trang trắng —
 * như lỗi TDZ trong useGsap từng làm /admin trống hoàn toàn. Nơi dùng đặt key theo đường dẫn: chuyển trang là dựng lại
 * từ đầu. React vẫn tự ghi lỗi ra console nên ở đây không log thêm.
 */
export class AdminErrorBoundary extends React.Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  state: AdminErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AdminErrorBoundaryState {
    return { failed: true };
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 p-space-md rounded-2xl border border-error/20 bg-error/5 text-body-sm text-on-surface"
      >
        <p className="flex items-center gap-2 font-semibold text-error">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            error
          </span>
          Trang này gặp lỗi khi hiển thị.
        </p>
        <p className="text-on-surface-variant">Các mục khác trong thanh bên vẫn dùng được. Bạn có thể thử hiển thị lại.</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="underline font-semibold cursor-pointer text-primary"
        >
          Thử lại
        </button>
      </div>
    );
  }
}
