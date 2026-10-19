import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import { SourceFields, type UploadSource } from "@/features/extraction/components/SourceFields";
import type { KnowledgeKind, KnowledgeSourceDetail, KnowledgeUploadInput } from "@/types/adminModeration.types";
import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_LEVELS,
  KNOWLEDGE_TITLE_MAX,
  knowledgeUploadError,
} from "../moderationUtils.ts";
import { adminFieldClass, adminLabelClass } from "./AdminFilterBar.tsx";

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** create = nguồn mới (POST); update = phiên bản mới của nguồn đang có (PUT, version + 1). */
  mode: "create" | "update";
  /** Giá trị điền sẵn khi tải phiên bản mới (giữ tiêu đề / loại / cấp cũ). */
  initial?: { title: string; kind: KnowledgeKind; level: string | null };
  submit: (input: KnowledgeUploadInput) => Promise<KnowledgeSourceDetail>;
  onDone: (detail: KnowledgeSourceDetail) => void;
}

/**
 * Tải nguồn tri thức chuẩn: dùng lại SourceFields của trang bóc tách (tệp | dán văn bản) + tiêu đề / loại / cấp.
 * Server trích entries qua ai-service nên có thể mất vài chục giây: khoá đóng modal trong lúc gửi.
 */
export const KnowledgeUploadModal: React.FC<KnowledgeUploadModalProps> = ({ isOpen, onClose, mode, initial, submit, onDone }) => {
  const [source, setSource] = useState<UploadSource>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<KnowledgeKind>(initial?.kind ?? "VOCAB");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const kindId = useId();
  const levelId = useId();

  const handleSubmit = async () => {
    const invalid = knowledgeUploadError({ source, file, text, title, kind });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const detail = await submit({
        file: source === "file" ? file : null,
        text: source === "text" ? text : null,
        title: title.trim(),
        kind,
        level: level || null,
      });
      onDone(detail);
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Đổi gì cũng xoá lỗi cũ: lỗi chỉ nói về lần gửi gần nhất.
  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "Tải nguồn tri thức mới" : "Tải phiên bản mới"}
      subtitle={mode === "update" && initial ? initial.title : "Tài liệu chuẩn dùng để đối chiếu khi bóc tách"}
      icon="upload_file"
      size="2xl"
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="primary" size="sm" isLoading={busy} onClick={() => void handleSubmit()}>
            {mode === "create" ? "Tải lên" : "Tải phiên bản mới"}
          </Button>
        </>
      }
    >
      {/* noValidate: Enter ở ô Tiêu đề (ô văn bản duy nhất -> gửi ngầm form) phải chạy knowledgeUploadError (tiếng Việt),
          không phải "Please fill out this field." của `required`; required giữ lại chỉ để trình đọc màn hình báo bắt buộc. */}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <fieldset disabled={busy} className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1">
            <label htmlFor={titleId} className={adminLabelClass}>
              Tiêu đề <span className="text-error">*</span>
            </label>
            <input
              id={titleId}
              value={title}
              onChange={(e) => changed(setTitle)(e.target.value)}
              maxLength={KNOWLEDGE_TITLE_MAX}
              required
              placeholder="Ví dụ: Từ vựng Minna no Nihongo N5"
              className={`${adminFieldClass} w-full`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={kindId} className={adminLabelClass}>
                Loại nguồn
              </label>
              <select
                id={kindId}
                value={kind}
                onChange={(e) => changed(setKind)(e.target.value as KnowledgeKind)}
                className={adminFieldClass}
              >
                {KNOWLEDGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KNOWLEDGE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={levelId} className={adminLabelClass}>
                Cấp JLPT (tuỳ chọn)
              </label>
              <select
                id={levelId}
                value={level}
                onChange={(e) => changed(setLevel)(e.target.value)}
                className={adminFieldClass}
              >
                <option value="">Không gắn cấp</option>
                {KNOWLEDGE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SourceFields
            source={source}
            onSourceChange={changed(setSource)}
            file={file}
            onFileChange={changed(setFile)}
            text={text}
            onTextChange={changed(setText)}
            onError={setError}
          />
          <p className="text-label-sm text-outline">
            Nguồn chuẩn giới hạn 2 MB / 20 trang. Máy chủ trích danh sách mục (từ, cách đọc, nghĩa, cấp) theo bố cục danh sách.
            {mode === "update" && " Phiên bản mới thay toàn bộ nội dung cũ."}
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
