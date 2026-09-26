import React, { useId } from "react";
import { ComingSoonBadge, Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import type { FolderItem } from "../../types/dashboard.types";

interface QuickAiUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderItem[];
}

const AI_OPTIONS = ["Tự tạo Furigana (Hiragana)", "Ánh xạ âm Hán-Việt", "Tự tạo câu hỏi Quiz"];

// ponytail: chưa có dịch vụ OCR/AI ở backend -> chỉ giới thiệu giao diện, mọi điều khiển bị khóa.
// Nâng cấp khi có endpoint upload: bỏ `disabled` ở fieldset và gọi API thật, không mô phỏng kết quả.
export const QuickAiUploadModal: React.FC<QuickAiUploadModalProps> = ({ isOpen, onClose, folders }) => {
  const fileId = useId();
  const folderId = useId();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon="upload_file"
      size="2xl"
      title={
        <span className="flex items-center gap-2">
          Tải tài liệu &amp; bóc tách AI <ComingSoonBadge />
        </span>
      }
      subtitle="OCR tiếng Nhật (chữ dọc/ngang), sinh Furigana và tạo Flashcard tự động"
      footer={
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <p className="mb-4 p-3 rounded-lg bg-tertiary-fixed/40 text-on-surface text-body-sm">
        Tính năng đang được phát triển. Trong lúc chờ, bạn có thể tạo bộ thẻ thủ công hoặc nhập thẻ từ văn bản
        trong trình soạn bộ thẻ.
      </p>

      <fieldset disabled className="space-y-4 opacity-70">
        <legend className="sr-only">Tùy chọn tải tài liệu (chưa khả dụng)</legend>

        <div className="border-2 border-dashed border-outline-variant rounded-xl p-6 text-center space-y-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">
            cloud_upload
          </span>
          <label htmlFor={fileId} className="block font-label-md text-on-surface font-semibold">
            Ảnh giáo trình tiếng Nhật hoặc file PDF
          </label>
          <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="mx-auto text-xs" />
          <p className="text-xs text-outline">Hỗ trợ JPG, PNG, WEBP, PDF</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={folderId} className={labelClass}>
            Lưu vào thư mục
          </label>
          <select id={folderId} className={fieldClass}>
            {folders.length === 0 ? (
              <option value="">Chưa có thư mục</option>
            ) : (
              folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} ({f.level})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/40">
          <div className={`${labelClass} mb-2`}>Xử lý AI tự động</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
            {AI_OPTIONS.map((label) => (
              <label key={label} className="flex items-center gap-2 select-none">
                <input type="checkbox" defaultChecked className="rounded accent-primary" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
    </Modal>
  );
};
