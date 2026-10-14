import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/services/apiClient";
import { createLearningPath } from "@/services/learningPathService";
import { useAuth } from "@/context/useAuth";
import type { ExtractionOptions } from "@/types/api.types";
import { loadSavedOptions, saveOptions } from "@/features/extraction/extractionUtils";
import { SourceFields, type UploadSource } from "@/features/extraction/components/SourceFields";
import { ExtractionOptionsFields } from "@/features/extraction/components/ExtractionOptionsFields";
import { DEFAULT_DAYS, MAX_DAYS, MIN_DAYS, isValidDays } from "../roadmapUtils";

interface CreateLearningPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: { days?: number; title?: string };
}

const DAYS_ERROR = `Số ngày học phải từ ${MIN_DAYS} đến ${MAX_DAYS}.`;

// Tải tệp / dán văn bản + số ngày học -> POST /learning-paths -> sang trang lộ trình (bản nháp chương).
export const CreateLearningPathModal: React.FC<CreateLearningPathModalProps> = ({ isOpen, onClose, initial }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon="alt_route"
      size="2xl"
      title="Tạo lộ trình học tập"
      subtitle="Bóc tách tài liệu, chia thành các chương và lên lịch học theo số ngày bạn chọn"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang gửi..." : "Tạo lộ trình"}
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> state về mặc định, tuỳ chọn đọc lại từ localStorage. */}
      <PathForm formId={formId} initial={initial} onSavingChange={setSaving} onDone={onClose} />
    </Modal>
  );
};

const PathForm: React.FC<{
  formId: string;
  initial?: { days?: number; title?: string };
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}> = ({ formId, initial, onSavingChange, onDone }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [source, setSource] = useState<UploadSource>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState(String(initial?.days ?? DEFAULT_DAYS));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [options, setOptions] = useState<ExtractionOptions>(() => loadSavedOptions(userProfile?.jlptLevel));
  const [error, setError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const daysId = useId();
  const titleId = useId();

  const set = <K extends keyof ExtractionOptions>(key: K, value: ExtractionOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const daysNum = days.trim() === "" ? NaN : Number(days);
    if (!isValidDays(daysNum)) {
      setDaysError(DAYS_ERROR);
      return;
    }
    setDaysError(null);
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
      const trimmedTitle = title.trim();
      const path = await createLearningPath({
        ...(source === "file" ? { file: file ?? undefined } : { text: text.trim() }),
        days: daysNum,
        title: trimmedTitle || undefined,
        options,
      });
      // Đóng modal trước khi chuyển trang: mở từ /roadmap/:id (Thử lại) thì trang không unmount, modal sẽ còn mở.
      onSavingChange(false);
      onDone();
      navigate(`/roadmap/${encodeURIComponent(path.id)}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          id={daysId}
          label="Số ngày học"
          type="number"
          inputMode="numeric"
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setDaysError(null);
          }}
          error={daysError ?? undefined}
          helperText="Hệ thống chia khối lượng học theo số ngày này."
        />
        <Input
          id={titleId}
          label="Tên lộ trình (tuỳ chọn)"
          type="text"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mặc định: tên tệp hoặc ngày tạo"
        />
      </div>

      <details className="group">
        <summary className="cursor-pointer select-none text-label-md font-semibold text-primary">Tuỳ chọn nâng cao</summary>
        <div className="mt-3">
          <ExtractionOptionsFields options={options} onChange={set} file={source === "file" ? file : null} />
        </div>
      </details>
    </form>
  );
};
