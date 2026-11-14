import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { createExtraction } from "@/services/extractionService";
import { useAuth } from "@/context/useAuth";
import type { ExtractionOptions } from "@/types/api.types";
import { loadSavedOptions, saveOptions } from "@/features/extraction/extractionUtils";
import { SourceFields, type UploadSource } from "@/features/extraction/components/SourceFields";
import { ExtractionOptionsFields } from "@/features/extraction/components/ExtractionOptionsFields";

interface QuickAiUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Tải tệp / dán văn bản + tuỳ chọn -> POST /extractions -> sang trang duyệt kết quả.
// Thư mục đích chọn sau (lúc tạo bộ thẻ) nên modal này không cần danh sách thư mục.
export const QuickAiUploadModal: React.FC<QuickAiUploadModalProps> = ({ isOpen, onClose }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon="upload_file"
      size="2xl"
      title="Tải tài liệu & bóc tách AI"
      subtitle="OCR tiếng Nhật (chữ dọc/ngang), tách từ vựng, Furigana, Hán-Việt, cấp JLPT và tạo Flashcard"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang gửi..." : "Bắt đầu bóc tách"}
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> state về mặc định, tuỳ chọn đọc lại từ localStorage. */}
      <UploadForm formId={formId} onSavingChange={setSaving} />
    </Modal>
  );
};

const UploadForm: React.FC<{ formId: string; onSavingChange: (saving: boolean) => void }> = ({ formId, onSavingChange }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [source, setSource] = useState<UploadSource>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<ExtractionOptions>(() => loadSavedOptions(userProfile?.jlptLevel));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ExtractionOptions>(key: K, value: ExtractionOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (source === "file" && !file) {
      setError("Hãy chọn tệp cần bóc tách.");
      return;
    }
    if (source === "text" && !text.trim()) {
      setError("Hãy dán văn bản tiếng Nhật.");
      return;
    }
    setError(null);
    setSaving(true);
    onSavingChange(true);
    try {
      saveOptions(options);
      const job = await createExtraction(
        source === "file" ? { file, options } : { text: text.trim(), options }
      );
      navigate(`/extractions/${encodeURIComponent(job.id)}`);
    } catch (err) {
      setError(extractErrorMessage(err));
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

      <SourceFields
        source={source}
        onSourceChange={setSource}
        file={file}
        onFileChange={(f) => {
          setError(null);
          setFile(f);
        }}
        text={text}
        onTextChange={setText}
        onError={setError}
      />

      <ExtractionOptionsFields options={options} onChange={set} file={source === "file" ? file : null} />
    </form>
  );
};
