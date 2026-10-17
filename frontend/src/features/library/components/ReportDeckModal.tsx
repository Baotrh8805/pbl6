import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import { reportDeck } from "@/services/adminService";
import type { ReportReason } from "@/types/api.types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "WRONG_CONTENT", label: "Sai nội dung" },
  { value: "COPYRIGHT", label: "Vi phạm bản quyền" },
  { value: "OFFENSIVE", label: "Xúc phạm" },
  { value: "SPAM", label: "Spam" },
  { value: "OTHER", label: "Khác" },
];

interface ReportDeckModalProps {
  deckId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Đã gửi (hoặc server báo đã báo cáo rồi): trang đổi nút thành "Đã báo cáo". */
  onReported: () => void;
}

export const ReportDeckModal: React.FC<ReportDeckModalProps> = ({ deckId, isOpen, onClose, onReported }) => {
  const [reason, setReason] = useState<ReportReason>("WRONG_CONTENT");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reportDeck(deckId, { reason, detail: detail.trim() || undefined });
      onReported();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        onReported();
        onClose();
      } else {
        setError(extractErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Báo cáo bộ thẻ"
      icon="flag"
      size="md"
      closeOnBackdrop={!busy}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="report-deck-form" variant="accent" size="sm" isLoading={busy}>
            Gửi báo cáo
          </Button>
        </div>
      }
    >
      <form id="report-deck-form" onSubmit={submit} className="flex flex-col gap-3 text-body-sm">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold mb-1">Lý do</legend>
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2">
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          Mô tả thêm {reason === "OTHER" ? "(bắt buộc)" : "(không bắt buộc)"}
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            required={reason === "OTHER"}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5"
          />
          <span className="text-label-sm text-outline text-right">{detail.length}/500</span>
        </label>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
