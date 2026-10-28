import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import { reportTranslation } from "@/services/dictionaryService";
import type { DictTranslateDirectionFixed } from "@/types/dictionary.types";
import { translateDirectionLabel } from "../dictUtils";

// Báo bản dịch sai ở tab Dịch (V40): bộ nhớ dịch dùng chung nên một bản sai được trả lại cho mọi người; quản trị viên áp bản sửa
// (Nhật → Việt) hoặc xoá khỏi bộ nhớ để lượt sau dịch lại. Câu gốc được gửi kèm báo cáo — nói rõ trước khi gửi.
export const ReportTranslationModal: React.FC<{
  text: string;
  direction: DictTranslateDirectionFixed;
  translation: string;
  onClose: () => void;
}> = ({ text, direction, translation, onClose }) => {
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const targetLang = direction === "ja-vi" ? "vi" : "ja";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!proposed.trim() && !note.trim()) {
      setError("Hãy nhập bản dịch đúng hoặc ghi rõ chỗ sai.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportTranslation({ text, direction, proposedValue: proposed.trim() || null, note: note.trim() || null });
      setDone(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Báo bản dịch sai"
      icon="flag"
      subtitle="Quản trị viên sẽ sửa bản dịch trong bộ nhớ dịch chung; bạn nhận thông báo khi xử lý xong."
      closeOnBackdrop={!busy}
      footer={
        done ? (
          <Button onClick={onClose}>Đóng</Button>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>Huỷ</Button>
            <Button type="submit" form="dict-translate-report-form" isLoading={busy}>Gửi báo lỗi</Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-body-sm">Cảm ơn bạn! Báo lỗi đã được gửi tới quản trị viên.</p>
      ) : (
        <form id="dict-translate-report-form" onSubmit={submit} noValidate className="flex flex-col gap-3 text-body-sm">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Câu gốc · {translateDirectionLabel(direction)}</span>
            <p lang={direction === "ja-vi" ? "ja" : "vi"} className="rounded-lg bg-surface-container-low px-3 py-2 whitespace-pre-line max-h-32 overflow-y-auto">
              {text}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Bản dịch hiện tại</span>
            <p lang={targetLang} className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface-variant whitespace-pre-line max-h-32 overflow-y-auto">
              {translation}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Bản dịch đúng (nếu bạn biết)</span>
            <textarea
              autoFocus
              lang={targetLang}
              value={proposed}
              maxLength={1000}
              rows={3}
              onChange={(e) => setProposed(e.target.value)}
              className="rounded-lg border border-outline-variant px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Ghi chú</span>
            <textarea
              value={note}
              maxLength={1000}
              rows={2}
              placeholder="Ví dụ: sai chủ ngữ, dịch sát chữ thành ngữ…"
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg border border-outline-variant px-3 py-2"
            />
          </label>
          <p className="text-xs text-on-surface-variant">
            Câu gốc và bản dịch được gửi cho quản trị viên cùng báo cáo của bạn (khác với bộ nhớ dịch, vốn không gắn tài khoản).
          </p>
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
        </form>
      )}
    </Modal>
  );
};
