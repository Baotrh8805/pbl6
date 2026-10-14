import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { extractErrorMessage } from "@/services/apiClient";
import { createExtraction } from "@/services/extractionService";
import { useAuth } from "@/context/useAuth";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import type { ExtractionOptions } from "@/types/api.types";
import {
  EXTRACT_MODE_LABELS,
  LEVEL_FILTER_LABELS,
  OCR_MODE_LABELS,
  TEXT_MAX_CHARS,
  UNKNOWN_POLICY_LABELS,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
  formatBytes,
  loadSavedOptions,
  needsOcr,
  saveOptions,
} from "@/features/extraction/extractionUtils";

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

type Source = "file" | "text";

const UploadForm: React.FC<{ formId: string; onSavingChange: (saving: boolean) => void }> = ({ formId, onSavingChange }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [source, setSource] = useState<Source>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<ExtractionOptions>(() => loadSavedOptions(userProfile?.jlptLevel));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileId = useId();
  const textId = useId();
  const ids = {
    userLevel: useId(),
    levelFilter: useId(),
    meaningLang: useId(),
    treatUnknownAs: useId(),
    ocrMode: useId(),
    extractMode: useId(),
  };

  const set = <K extends keyof ExtractionOptions>(key: K, value: ExtractionOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const handleFile = (f: File | null) => {
    setError(null);
    if (f && f.size > UPLOAD_MAX_BYTES) {
      setFile(null);
      setError(`Tệp ${formatBytes(f.size)} vượt giới hạn ${formatBytes(UPLOAD_MAX_BYTES)}.`);
      return;
    }
    setFile(f);
  };

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

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-label-md font-semibold transition-colors cursor-pointer ${
      active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      <div role="tablist" aria-label="Nguồn tài liệu" className="flex gap-1 p-1 rounded-lg bg-surface-container-low w-fit">
        <button type="button" role="tab" aria-selected={source === "file"} onClick={() => setSource("file")} className={tabClass(source === "file")}>
          Tải file
        </button>
        <button type="button" role="tab" aria-selected={source === "text"} onClick={() => setSource("text")} className={tabClass(source === "text")}>
          Dán văn bản
        </button>
      </div>

      {source === "file" ? (
        <div className="border-2 border-dashed border-outline-variant rounded-xl p-6 text-center space-y-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">
            cloud_upload
          </span>
          <label htmlFor={fileId} className="block font-label-md text-on-surface font-semibold">
            Ảnh chụp giáo trình, PDF, Word hoặc tệp văn bản
          </label>
          <input
            id={fileId}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="mx-auto text-xs"
          />
          <p className="text-xs text-outline">
            Hỗ trợ TXT, MD, DOCX, PDF, PNG, JPG, WEBP · tối đa {formatBytes(UPLOAD_MAX_BYTES)}
            {file && ` · đã chọn ${file.name} (${formatBytes(file.size)})`}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={textId} className={labelClass}>
            Văn bản tiếng Nhật
          </label>
          <textarea
            id={textId}
            lang="ja"
            rows={8}
            maxLength={TEXT_MAX_CHARS}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="日本語の文章をここに貼り付けてください…"
            className={`${fieldClass} font-japanese resize-y`}
          />
          <p className="text-xs text-outline text-right tabular-nums">
            {text.length.toLocaleString("vi-VN")} / {TEXT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
          </p>
        </div>
      )}

      <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/40 space-y-3">
        <div className={labelClass}>Tuỳ chọn bóc tách</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.userLevel} className="text-xs font-semibold text-on-surface">
              Trình độ của tôi
            </label>
            <select id={ids.userLevel} value={options.userLevel} onChange={(e) => set("userLevel", e.target.value)} className={fieldClass}>
              {JLPT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={ids.levelFilter} className="text-xs font-semibold text-on-surface">
              Lọc cấp độ
            </label>
            <select
              id={ids.levelFilter}
              value={options.levelFilter}
              onChange={(e) => set("levelFilter", e.target.value as ExtractionOptions["levelFilter"])}
              className={fieldClass}
            >
              {(Object.keys(LEVEL_FILTER_LABELS) as ExtractionOptions["levelFilter"][]).map((v) => (
                <option key={v} value={v}>
                  {LEVEL_FILTER_LABELS[v]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={ids.extractMode} className="text-xs font-semibold text-on-surface">
              Bố cục tài liệu
            </label>
            <select
              id={ids.extractMode}
              value={options.extractMode}
              onChange={(e) => set("extractMode", e.target.value as ExtractionOptions["extractMode"])}
              className={fieldClass}
            >
              {(Object.keys(EXTRACT_MODE_LABELS) as ExtractionOptions["extractMode"][]).map((v) => (
                <option key={v} value={v}>
                  {EXTRACT_MODE_LABELS[v]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={ids.meaningLang} className="text-xs font-semibold text-on-surface">
              Ngôn ngữ nghĩa
            </label>
            <select
              id={ids.meaningLang}
              value={options.meaningLang}
              onChange={(e) => set("meaningLang", e.target.value as ExtractionOptions["meaningLang"])}
              className={fieldClass}
            >
              <option value="vi">Tiếng Việt (cần AI dịch, dự phòng tiếng Anh)</option>
              <option value="en">Tiếng Anh (từ điển JMdict)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={ids.treatUnknownAs} className="text-xs font-semibold text-on-surface">
              Từ không rõ cấp JLPT
            </label>
            <select
              id={ids.treatUnknownAs}
              value={options.treatUnknownAs}
              onChange={(e) => set("treatUnknownAs", e.target.value as ExtractionOptions["treatUnknownAs"])}
              className={fieldClass}
            >
              {(Object.keys(UNKNOWN_POLICY_LABELS) as ExtractionOptions["treatUnknownAs"][]).map((v) => (
                <option key={v} value={v}>
                  {UNKNOWN_POLICY_LABELS[v]}
                </option>
              ))}
            </select>
          </div>

          {/* OCR chỉ áp dụng cho ảnh / PDF scan */}
          {source === "file" && needsOcr(file) && (
            <div className="space-y-1.5">
              <label htmlFor={ids.ocrMode} className="text-xs font-semibold text-on-surface">
                Hướng chữ (OCR)
              </label>
              <select
                id={ids.ocrMode}
                value={options.ocrMode}
                onChange={(e) => set("ocrMode", e.target.value as ExtractionOptions["ocrMode"])}
                className={fieldClass}
              >
                {(Object.keys(OCR_MODE_LABELS) as ExtractionOptions["ocrMode"][]).map((v) => (
                  <option key={v} value={v}>
                    {OCR_MODE_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input type="checkbox" checked={options.includeGrammar} onChange={(e) => set("includeGrammar", e.target.checked)} className="rounded accent-primary" />
            <span>Tách mẫu ngữ pháp</span>
          </label>
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input type="checkbox" checked={options.includeFurigana} onChange={(e) => set("includeFurigana", e.target.checked)} className="rounded accent-primary" />
            <span>Tự tạo Furigana</span>
          </label>
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input type="checkbox" checked={options.includeHanViet} onChange={(e) => set("includeHanViet", e.target.checked)} className="rounded accent-primary" />
            <span>Ánh xạ âm Hán-Việt</span>
          </label>
        </div>
      </div>
    </form>
  );
};
