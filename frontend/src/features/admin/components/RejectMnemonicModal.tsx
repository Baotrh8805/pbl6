import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { AdminMnemonic } from "@/types/adminModeration.types";
import { REVIEW_NOTE_MAX, rejectNoteError } from "../moderationUtils.ts";
import { adminFieldClass } from "./AdminFilterBar.tsx";

interface RejectMnemonicModalProps {
  mnemonic: AdminMnemonic | null;
  onClose: () => void;
  /** Gửi từ chối; trả null khi thành công (modal tự đóng), hoặc câu lỗi để hiện ngay trong modal. */
  onConfirm: (note: string) => Promise<string | null>;
}

/** Từ chối mẹo nhớ: ghi chú bắt buộc vì tác giả nhận thông báo kèm lý do để sửa lại. */
export const RejectMnemonicModal: React.FC<RejectMnemonicModalProps> = ({ mnemonic, onClose, onConfirm }) => {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const hintId = useId();

  if (!mnemonic) return null;
  const noteError = rejectNoteError(note);

  const submit = async () => {
    setTouched(true);
    if (noteError) return;
    setBusy(true);
    setError(null);
    const failure = await onConfirm(note.trim());
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Modal
      isOpen={!!mnemonic}
      onClose={onClose}
      title={`Từ chối mẹo nhớ chữ ${mnemonic.kanji}`}
      icon="block"
      size="lg"
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="danger" size="sm" isLoading={busy} onClick={submit}>
            Từ chối mẹo
          </Button>
        </>
      }
    >
      {/* noValidate: lỗi ghi chú do rejectNoteError báo tiếng Việt dưới ô; `required` chỉ để trình đọc màn hình báo bắt buộc,
          không để trình duyệt chặn bằng bong bóng tiếng Anh nếu form được gửi (requestSubmit / nút submit sau này). */}
      <form
        noValidate
        className="flex flex-col gap-3 text-body-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <blockquote className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high">
          <span lang="ja" className="font-japanese text-headline-sm mr-2 align-middle">
            {mnemonic.kanji}
          </span>
          <span className="whitespace-pre-line">{mnemonic.mnemonicVi}</span>
        </blockquote>
        <label htmlFor={noteId} className="font-semibold">
          Lý do từ chối <span className="text-error">*</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={REVIEW_NOTE_MAX}
          rows={4}
          required
          aria-invalid={touched && !!noteError}
          aria-describedby={hintId}
          placeholder="Ví dụ: mẹo sai bộ thủ, liên tưởng khó hiểu…"
          className={`${adminFieldClass} w-full`}
        />
        <p id={hintId} className={`text-label-sm ${touched && noteError ? "text-error" : "text-outline"}`}>
          {touched && noteError ? noteError : `Tác giả sẽ thấy ghi chú này · ${note.length}/${REVIEW_NOTE_MAX}`}
        </p>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
