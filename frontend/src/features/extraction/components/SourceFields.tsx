import React, { useId } from "react";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { TEXT_MAX_CHARS, UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, formatBytes } from "../extractionUtils";

export type UploadSource = "file" | "text";

interface SourceFieldsProps {
  source: UploadSource;
  onSourceChange: (source: UploadSource) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  text: string;
  onTextChange: (text: string) => void;
  /** Báo lỗi (vd. tệp quá lớn); nơi gọi tự xoá lỗi ở lần đổi kế tiếp. */
  onError: (message: string) => void;
}

const tabClass = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-label-md font-semibold transition-colors cursor-pointer ${
    active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
  }`;

// Tab "Tải file" / "Dán văn bản" + dropzone / textarea. Không giữ state: nơi gọi giữ source/file/text.
export const SourceFields: React.FC<SourceFieldsProps> = ({
  source,
  onSourceChange,
  file,
  onFileChange,
  text,
  onTextChange,
  onError,
}) => {
  const fileId = useId();
  const textId = useId();

  const handleFile = (f: File | null) => {
    if (f && f.size > UPLOAD_MAX_BYTES) {
      onFileChange(null);
      onError(`Tệp ${formatBytes(f.size)} vượt giới hạn ${formatBytes(UPLOAD_MAX_BYTES)}.`);
      return;
    }
    onFileChange(f);
  };

  return (
    <>
      <div role="tablist" aria-label="Nguồn tài liệu" className="flex gap-1 p-1 rounded-lg bg-surface-container-low w-fit">
        <button type="button" role="tab" aria-selected={source === "file"} onClick={() => onSourceChange("file")} className={tabClass(source === "file")}>
          Tải file
        </button>
        <button type="button" role="tab" aria-selected={source === "text"} onClick={() => onSourceChange("text")} className={tabClass(source === "text")}>
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
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="日本語の文章をここに貼り付けてください…"
            className={`${fieldClass} font-japanese resize-y`}
          />
          <p className="text-xs text-outline text-right tabular-nums">
            {text.length.toLocaleString("vi-VN")} / {TEXT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
          </p>
        </div>
      )}
    </>
  );
};
