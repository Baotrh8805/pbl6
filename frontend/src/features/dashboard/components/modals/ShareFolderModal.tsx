import React, { useState } from "react";
import type { FolderItem } from "../../types/dashboard.types";

interface ShareFolderModalProps {
  isOpen: boolean;
  folder: FolderItem | null;
  onClose: () => void;
}

export const ShareFolderModal: React.FC<ShareFolderModalProps> = ({
  isOpen,
  folder,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Chỉ xem & Học");
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [allowAnki, setAllowAnki] = useState(true);
  const [showVietnamese, setShowVietnamese] = useState(true);

  if (!isOpen || !folder) return null;

  const handleCopyLink = () => {
    if (folder.link) {
      navigator.clipboard.writeText(folder.link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteFeedback(`Đã gửi lời mời cộng tác tới ${inviteEmail} với quyền "${inviteRole}"!`);
    setInviteEmail("");
    setTimeout(() => setInviteFeedback(""), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 border border-surface-container-high">
        {/* Modal Header */}
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-space-sm">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">folder_shared</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                Chia sẻ thư mục
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate max-w-sm">
                {folder.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-space-lg space-y-space-md">
          {/* Email Invite Form */}
          <form onSubmit={handleSendInvite} className="space-y-1.5">
            <label className="font-label-md text-label-md text-on-surface font-semibold block">
              Mời cộng tác viên qua Email:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                  mail
                </span>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-surface-container-low rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container border border-surface-container-high/40"
                  placeholder="Nhập email người muốn mời..."
                  type="email"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="bg-surface-container-low text-on-surface font-label-md text-label-md px-3 py-2 rounded-lg focus:outline-none cursor-pointer border border-surface-container-high/40"
              >
                <option value="Chỉ xem & Học">Chỉ xem &amp; Học</option>
                <option value="Được phép đóng góp thẻ">Được phép đóng góp thẻ</option>
                <option value="Quản trị viên (Toàn quyền)">Quản trị viên (Toàn quyền)</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors shrink-0 font-semibold cursor-pointer"
              >
                Gửi lời mời
              </button>
            </div>
            {inviteFeedback && (
              <p className="text-xs text-secondary font-medium pt-1 animate-in fade-in">
                ✓ {inviteFeedback}
              </p>
            )}
          </form>

          {/* Public Share Link */}
          <div className="p-space-md rounded-xl bg-surface-container-low space-y-space-sm border border-surface-container-high/40">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[18px]">link</span>
                Liên kết chia sẻ công khai
              </span>
              <span className="font-label-sm text-label-sm text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded font-bold">
                Bất kỳ ai có liên kết
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg text-label-sm font-label-sm text-on-surface-variant font-mono select-all focus:outline-none border border-surface-container-high/40"
                type="text"
                value={folder.link}
              />
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 bg-secondary text-on-secondary rounded-lg font-label-md text-label-md hover:bg-on-secondary-container transition-all shrink-0 flex items-center gap-1 active:scale-95 font-semibold cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedLink ? "check" : "content_copy"}
                </span>
                <span>{copiedLink ? "Đã chép!" : "Sao chép"}</span>
              </button>
            </div>

            {/* Advanced Checkbox Options */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-on-surface-variant text-body-sm font-body-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  checked={allowAnki}
                  onChange={(e) => setAllowAnki(e.target.checked)}
                  className="rounded accent-primary"
                  type="checkbox"
                />
                <span>Cho phép tải bộ thẻ về Anki (.apkg)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  checked={showVietnamese}
                  onChange={(e) => setShowVietnamese(e.target.checked)}
                  className="rounded accent-primary"
                  type="checkbox"
                />
                <span>Hiển thị lời dịch tiếng Việt đầy đủ</span>
              </label>
            </div>
          </div>

          {/* Quick QR Code Row */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-surface-container-high/50">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-surface-container-lowest p-1 rounded-lg flex items-center justify-center shrink-0 shadow-xs">
                <svg className="w-12 h-12 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v4h-4v-4zm-4 4h4v2h-4v-2zm0-4h2v2h-2v-2zm4-4h2v2h-2v-2zm-2 2h2v2h-2v-2z"></path>
                </svg>
              </div>
              <div className="space-y-0.5">
                <div className="font-label-md text-label-md text-on-surface font-semibold">
                  Mã QR tham gia nhóm nhanh
                </div>
                <p className="text-xs text-outline font-body-sm">
                  Quét bằng camera điện thoại hoặc Zalo để tham gia ôn tập trên Mobile.
                </p>
              </div>
            </div>
            <button
              onClick={() => alert("Đang tải xuống ảnh mã QR.")}
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-surface-container-high font-label-md text-label-md transition-colors text-xs font-semibold cursor-pointer border border-surface-container-high/30"
            >
              Tải ảnh QR
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-space-lg py-3 bg-surface-container-low flex items-center justify-end gap-2 border-t border-surface-container">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
          >
            Đóng
          </button>
          <button
            onClick={() => {
              alert("Đã lưu cài đặt chia sẻ thành công!");
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm font-semibold cursor-pointer"
          >
            Lưu cài đặt chia sẻ
          </button>
        </div>
      </div>
    </div>
  );
};
