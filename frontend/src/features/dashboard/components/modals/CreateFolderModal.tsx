import React, { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { createFolder } from "@/services/folderService";
import { extractErrorMessage } from "@/services/apiClient";
import type { FolderAccess } from "@/types/api.types";
import { JLPT_LEVELS } from "../../lib/dashboardUtils";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentLevel?: string;
}

const ACCESS_OPTIONS: { value: FolderAccess; label: string }[] = [
  { value: "private", label: "Riêng tư (Chỉ mình bạn)" },
  { value: "shared", label: "Chia sẻ nhóm" },
  { value: "public", label: "Công khai cộng đồng" },
];

const isAccess = (v: string): v is FolderAccess => ACCESS_OPTIONS.some((o) => o.value === v);

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  currentLevel = "N5",
}) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tạo thư mục học tập mới"
      icon="create_new_folder"
      size="lg"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang tạo..." : "Tạo thư mục"}
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> ô nhập luôn trống, không cần reset bằng tay. */}
      <CreateFolderForm
        formId={formId}
        currentLevel={currentLevel}
        onSavingChange={setSaving}
        onDone={() => {
          onCreated();
          onClose();
        }}
      />
    </Modal>
  );
};

interface CreateFolderFormProps {
  formId: string;
  currentLevel: string;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}

const CreateFolderForm: React.FC<CreateFolderFormProps> = ({ formId, currentLevel, onSavingChange, onDone }) => {
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [folderLevel, setFolderLevel] = useState(currentLevel);
  const [folderAccess, setFolderAccess] = useState<FolderAccess>("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const descId = useId();
  const levelId = useId();
  const accessId = useId();

  // Lưu thật qua POST /folders: thư mục phải có id thật thì mới thêm bộ thẻ vào được.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim() || saving) return;
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      await createFolder({
        title: folderName.trim(),
        description: folderDesc.trim() || undefined,
        // Backend chỉ nhận N1..N5; "Khác" = không gắn cấp độ.
        level: folderLevel || undefined,
        accessType: folderAccess,
      });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor={nameId} className={labelClass}>
          Tên thư mục <span className="text-error">*</span>
        </label>
        <input
          id={nameId}
          required
          maxLength={100}
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="VD: Mimikara Oboeru N2 Bunpou..."
          className={fieldClass}
          type="text"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={descId} className={labelClass}>
          Mô tả ngắn
        </label>
        <textarea
          id={descId}
          rows={2}
          maxLength={500}
          value={folderDesc}
          onChange={(e) => setFolderDesc(e.target.value)}
          placeholder="VD: Tổng hợp toàn bộ mẫu ngữ pháp nghe hiểu kèm file âm thanh..."
          className={fieldClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={levelId} className={labelClass}>
            Cấp độ phân loại
          </label>
          <select id={levelId} value={folderLevel} onChange={(e) => setFolderLevel(e.target.value)} className={fieldClass}>
            {[...JLPT_LEVELS].reverse().map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
            <option value="">Khác</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={accessId} className={labelClass}>
            Chế độ quyền riêng tư
          </label>
          <select
            id={accessId}
            value={folderAccess}
            onChange={(e) => {
              if (isAccess(e.target.value)) setFolderAccess(e.target.value);
            }}
            className={fieldClass}
          >
            {ACCESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
};
