import React from "react";
import { Link } from "react-router-dom";

// Tiêu đề trang Thư viện + 2 lối tắt (đóng góp bộ thẻ / bộ thẻ của tôi).
export const LibraryHeader: React.FC = () => (
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
    <div className="max-w-3xl space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-xs uppercase tracking-wider flex items-center gap-1 font-semibold">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          Kho Tri Thức Mở NihonGen
        </span>
        <span className="text-on-surface-variant font-label-sm text-xs">
          4,820+ Bộ Thẻ Đã Kiểm Định
        </span>
      </div>
      <h1 className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">
        Thư Viện Bộ Thẻ Cộng Đồng & Tinh Tuyển
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Khám phá hàng ngàn bộ thẻ flashcard chất lượng cao được biên soạn bởi giảng viên tiếng Nhật
        và cộng đồng học viên NihonGen AI.
      </p>
    </div>

    <div className="flex items-center gap-3 self-start lg:self-auto shrink-0">
      <Link
        to="/decks/new"
        className="flex items-center gap-2 px-space-md py-2.5 rounded-xl bg-surface-container-lowest text-primary font-label-md text-label-md shadow-xs hover:bg-surface-container-low border border-surface-container-high transition-all"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">publish</span>
        <span>Đóng Góp Bộ Thẻ Mới</span>
      </Link>
      <Link
        to="/decks"
        className="flex items-center gap-2 px-space-md py-2.5 rounded-xl bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container transition-all"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">folder_special</span>
        <span>Bộ Thẻ Của Tôi</span>
      </Link>
    </div>
  </div>
);

interface SaveSuccessToastProps {
  message: string;
  onOpenDecks: () => void;
}

// Toast báo lưu bộ thẻ thành công (trang cha lo hẹn giờ ẩn).
export const SaveSuccessToast: React.FC<SaveSuccessToastProps> = ({ message, onOpenDecks }) => (
  <div
    role="status"
    className="fixed top-20 right-6 z-50 flex items-center gap-3 p-4 rounded-xl bg-primary text-on-primary shadow-2xl border border-secondary/40 animate-in fade-in slide-in-from-top-4"
  >
    <span aria-hidden="true" className="material-symbols-outlined text-secondary-fixed text-[24px]">
      check_circle
    </span>
    <div className="text-sm">
      <p className="font-semibold">{message}</p>
      <p className="text-xs text-on-primary/80">Bạn có thể bắt đầu ôn luyện ngay bây giờ.</p>
    </div>
    <button
      type="button"
      onClick={onOpenDecks}
      className="px-3 py-1 rounded-lg bg-surface-container-lowest text-primary font-semibold text-xs hover:bg-surface-container-low transition-colors ml-2"
    >
      Mở bộ thẻ
    </button>
  </div>
);
