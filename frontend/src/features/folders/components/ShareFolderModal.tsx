import React, { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { labelClass, fieldClass } from "@/components/ui/formStyles";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import {
  fetchFolderMembers,
  setFolderLinkAccess,
  shareFolder,
  unshareFolder,
} from "@/services/folderService";
import type { FolderMember } from "@/types/api.types";

export interface ShareFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: { id: string; title: string; accessType?: string | null } | null;
  /** Gọi sau khi quyền truy cập đổi (để trang cha tải lại nhãn chia sẻ). */
  onChanged?: () => void;
}

// Người được mời / người có link: XEM & HỌC mọi bộ thẻ trong thư mục và thư mục con.
// Muốn chỉnh sửa thì họ "Lưu bản sao" từng bộ thẻ. Quyền sửa chia sẻ riêng ở từng bộ thẻ.

// Thân modal: chỉ mount khi modal mở -> state tự reset mỗi lần mở.
const ShareFolderBody: React.FC<{ folderId: string; initialPublic: boolean; onChanged?: () => void }> = ({
  folderId,
  initialPublic,
  onChanged,
}) => (
  <div className="space-y-6">
    <p className="text-xs text-on-surface-variant">
      Người được chia sẻ có quyền <strong>xem &amp; học</strong> mọi bộ thẻ trong thư mục này và các thư mục con.
      Muốn chỉnh sửa, họ có thể lưu bản sao về tài khoản của mình.
    </p>
    <MembersSection folderId={folderId} onChanged={onChanged} />
    <LinkSection folderId={folderId} initialPublic={initialPublic} onChanged={onChanged} />
  </div>
);

const MembersSection: React.FC<{ folderId: string; onChanged?: () => void }> = ({ folderId, onChanged }) => {
  const loaded = useAsync(() => fetchFolderMembers(folderId), [folderId]);
  // Sau mỗi lần thêm/xoá, danh sách mới thay cho bản tải ban đầu
  const [members, setMembers] = useState<FolderMember[] | null>(null);
  const list = members ?? loaded.data ?? [];

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();

  const run = async (action: () => Promise<FolderMember[]>) => {
    setBusy(true);
    setError(null);
    try {
      setMembers(await action());
      onChanged?.();
      return true;
    } catch (err) {
      setError(extractErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => shareFolder(folderId, email.trim()))) setEmail("");
  };

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Mời qua email</h3>
      <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label htmlFor={emailId} className={`${labelClass} text-xs mb-1`}>
            Email người nhận (quyền: chỉ xem &amp; học)
          </label>
          <input
            id={emailId}
            type="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@example.com"
            className={fieldClass}
          />
        </div>
        <Button type="submit" variant="primary" size="md" isLoading={busy}>
          Mời
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {members === null && loaded.loading ? (
        <p className="text-xs text-outline">Đang tải danh sách...</p>
      ) : members === null && loaded.error ? (
        <p role="alert" className="text-sm text-error">
          {loaded.error}
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-outline">Chưa mời ai.</p>
      ) : (
        <ul className="divide-y divide-surface-container-high rounded-lg border border-surface-container-high">
          {list.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium truncate">{m.fullName || m.email}</span>
                <span className="block text-xs text-outline truncate">{m.email}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label={`Bỏ chia sẻ với ${m.email}`}
                title="Bỏ chia sẻ"
                onClick={() =>
                  run(async () => {
                    await unshareFolder(folderId, m.userId);
                    return list.filter((x) => x.userId !== m.userId);
                  })
                }
                className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-surface-container cursor-pointer shrink-0"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  person_remove
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const LinkSection: React.FC<{ folderId: string; initialPublic: boolean; onChanged?: () => void }> = ({
  folderId,
  initialPublic,
  onChanged,
}) => {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const publicId = useId();
  const linkId = useId();

  // Link thật tới trang thư mục; người mở cần đăng nhập và có quyền (được mời hoặc link công khai).
  const shareLink = `${window.location.origin}/folders?folderId=${encodeURIComponent(folderId)}`;

  // Huỷ timer "Đã chép!" khi unmount.
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await setFolderLinkAccess(folderId, next);
      setIsPublic(next);
      onChanged?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setError(null);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("Không thể sao chép tự động. Hãy chọn liên kết và sao chép thủ công.");
    }
  };

  return (
    <section className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 space-y-3">
      <label htmlFor={publicId} className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          id={publicId}
          type="checkbox"
          checked={isPublic}
          disabled={saving}
          onChange={(e) => void toggle(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Ai đăng nhập và có liên kết đều xem &amp; học được
      </label>

      <div className="flex items-center gap-2">
        <label htmlFor={linkId} className="sr-only">
          Liên kết tới thư mục
        </label>
        <input
          id={linkId}
          type="text"
          readOnly
          value={shareLink}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg text-xs font-mono text-on-surface-variant select-all border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={handleCopyLink}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 ${
            copied ? "bg-secondary text-on-secondary" : "bg-primary text-on-primary hover:bg-primary-container"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            {copied ? "check" : "content_copy"}
          </span>
          <span>{copied ? "Đã chép!" : "Sao chép"}</span>
        </button>
      </div>
      <p className="text-[11px] text-outline">
        {isPublic
          ? "Bất kỳ ai đăng nhập và có liên kết này đều xem được thư mục."
          : "Chỉ những người được mời ở trên mới mở được liên kết này."}
      </p>
      {/* Vùng thông báo cho trình đọc màn hình */}
      <p aria-live="polite" className="sr-only">
        {copied ? "Đã sao chép liên kết" : ""}
      </p>
      {error && (
        <p role="alert" className="text-xs text-error font-medium">
          {error}
        </p>
      )}
    </section>
  );
};

// Modal chia sẻ thư mục duy nhất của app (trang Thư mục + Dashboard dùng chung).
export const ShareFolderModal: React.FC<ShareFolderModalProps> = ({ isOpen, onClose, folder, onChanged }) => (
  <Modal
    isOpen={isOpen && !!folder}
    onClose={onClose}
    title="Chia sẻ thư mục"
    icon="folder_shared"
    subtitle={folder?.title}
    size="xl"
    footer={
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        Đóng
      </Button>
    }
  >
    {folder && (
      <ShareFolderBody
        key={folder.id}
        folderId={folder.id}
        initialPublic={folder.accessType === "public"}
        onChanged={onChanged}
      />
    )}
  </Modal>
);
