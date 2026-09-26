import React, { useEffect, useId, useRef, useState } from "react";
import { Modal, ComingSoonBadge } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { labelClass, fieldClass } from "@/components/ui/formStyles";

export interface ShareFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: { id: string; title: string } | null;
}

// Thân modal: chỉ mount khi modal mở -> state (đã chép / lỗi) tự reset mỗi lần mở.
const ShareFolderBody: React.FC<{ folderId: string }> = ({ folderId }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const emailId = useId();
  const roleId = useId();
  const linkId = useId();
  const ankiId = useId();
  const translationId = useId();

  // Link thật tới trang thư mục (người nhận cần có quyền truy cập thư mục).
  const shareLink = `${window.location.origin}/folders?folderId=${encodeURIComponent(folderId)}`;

  // Huỷ timer "Đã chép!" khi unmount.
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyError(null);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Không thể sao chép tự động. Hãy chọn liên kết và sao chép thủ công.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Mời qua email: chưa có backend -> hiển thị nhưng khoá */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor={emailId} className={`${labelClass} text-xs`}>
            Mời cộng tác viên qua Email:
          </label>
          <ComingSoonBadge />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]"
            >
              mail
            </span>
            <input
              id={emailId}
              type="email"
              disabled
              placeholder="colleague@gmail.com, fpt.dev@fpt.com..."
              className={`${fieldClass} pl-9 text-xs`}
            />
          </div>
          <label htmlFor={roleId} className="sr-only">
            Quyền của người được mời
          </label>
          <select
            id={roleId}
            disabled
            defaultValue="view"
            className={`${fieldClass} sm:w-auto text-xs font-medium`}
          >
            <option value="view">Chỉ xem & Học</option>
            <option value="contribute">Được phép đóng góp thẻ</option>
            <option value="admin">Quản trị viên (Toàn quyền)</option>
          </select>
          <Button type="button" variant="primary" size="sm" disabled className="shrink-0">
            Gửi lời mời
          </Button>
        </div>
      </div>

      {/* Liên kết chia sẻ: sao chép hoạt động thật */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={linkId}
            className="text-xs font-semibold text-on-surface flex items-center gap-1.5"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-secondary text-[18px]">
              link
            </span>
            Liên kết tới thư mục
          </label>
          {/* Backend chưa có chia sẻ giữa tài khoản: link chỉ mở được bởi chủ thư mục. */}
          <span className="text-[10px] font-bold text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded">
            Chỉ tài khoản có quyền
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={linkId}
            type="text"
            readOnly
            value={shareLink}
            onFocus={(e) => e.currentTarget.select()}
            aria-describedby={copyError ? `${linkId}-error` : undefined}
            className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg text-xs font-mono text-on-surface-variant select-all border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={handleCopyLink}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 ${
              copied
                ? "bg-secondary text-on-secondary"
                : "bg-primary text-on-primary hover:bg-primary-container"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
              {copied ? "check" : "content_copy"}
            </span>
            <span>{copied ? "Đã chép!" : "Sao chép"}</span>
          </button>
        </div>
        {/* Vùng thông báo cho trình đọc màn hình */}
        <p aria-live="polite" className="sr-only">
          {copied ? "Đã sao chép liên kết" : ""}
        </p>
        {copyError && (
          <p
            id={`${linkId}-error`}
            role="alert"
            className="text-xs text-error font-medium flex items-center gap-1"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              error
            </span>
            {copyError}
          </p>
        )}

        {/* Tuỳ chọn nâng cao: chưa có backend */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-on-surface-variant text-xs">
          <ComingSoonBadge />
          <label htmlFor={ankiId} className="flex items-center gap-2 select-none opacity-60">
            <input
              id={ankiId}
              type="checkbox"
              disabled
              defaultChecked
              className="rounded accent-primary h-3.5 w-3.5"
            />
            <span>Cho phép tải bộ thẻ về Anki (.apkg)</span>
          </label>
          <label htmlFor={translationId} className="flex items-center gap-2 select-none opacity-60">
            <input
              id={translationId}
              type="checkbox"
              disabled
              defaultChecked
              className="rounded accent-primary h-3.5 w-3.5"
            />
            <span>Hiển thị lời dịch tiếng Việt đầy đủ</span>
          </label>
        </div>
      </div>

      {/* Mã QR: chưa có backend */}
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-container/60 border border-surface-container-high/40">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-surface-container-lowest p-1.5 rounded-lg flex items-center justify-center shrink-0 shadow-xs border border-surface-container-high/60 opacity-60">
            <svg aria-hidden="true" className="w-11 h-11 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v4h-4v-4zm-4 4h4v2h-4v-2zm0-4h2v2h-2v-2zm4-4h2v2h-2v-2zm-2 2h2v2h-2v-2z" />
            </svg>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs text-on-surface">Mã QR tham gia học nhóm</span>
              <ComingSoonBadge />
            </div>
            <p className="text-[11px] text-outline font-body leading-tight">
              Quét bằng camera điện thoại hoặc Zalo để cùng ôn tập trên ứng dụng di động.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-primary font-semibold text-xs border border-surface-container-high shrink-0 opacity-50 cursor-not-allowed"
        >
          Lưu liên kết
        </button>
      </div>
    </div>
  );
};

// Modal chia sẻ thư mục duy nhất của app (trang Thư mục + Dashboard dùng chung).
export const ShareFolderModal: React.FC<ShareFolderModalProps> = ({ isOpen, onClose, folder }) => (
  <Modal
    isOpen={isOpen && !!folder}
    onClose={onClose}
    title="Chia sẻ thư mục"
    icon="folder_shared"
    subtitle={folder?.title}
    size="xl"
    footer={
      <>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Đóng
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled
          title="Sắp ra mắt"
        >
          Lưu cài đặt chia sẻ
        </Button>
      </>
    }
  >
    {folder && <ShareFolderBody key={folder.id} folderId={folder.id} />}
  </Modal>
);

export default ShareFolderModal;
