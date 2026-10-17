import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { dismissReport, fetchAdminRatings, resolveReport } from "@/services/adminService";
import type { ContentReport, ReportAction } from "@/types/api.types";
import { REPORT_REASON_LABELS } from "../adminUtils";

interface ResolveReportModalProps {
  report: ContentReport | null;
  onClose: () => void;
  onDone: () => void;
}

/** Xử lý một báo cáo: chọn hành động (NONE / gỡ bộ thẻ / xoá một bình luận) hoặc bỏ qua. */
export const ResolveReportModal: React.FC<ResolveReportModalProps> = ({ report, onClose, onDone }) => {
  const [action, setAction] = useState<ReportAction>("NONE");
  const [ratingId, setRatingId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ratings = useAsync(
    () => (report ? fetchAdminRatings({ deckId: report.deckId, size: 100 }) : Promise.resolve(null)),
    [report?.id ?? null]
  );
  const comments = ratings.data?.items ?? [];
  const deckPrivate = report?.deckVisibility === "private";

  const submit = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!report) return null;
  const canConfirm = action !== "CLEAR_COMMENT" || ratingId !== "";

  return (
    <Modal
      isOpen={!!report}
      onClose={onClose}
      title={`Xử lý báo cáo #${report.id}`}
      icon="flag"
      size="lg"
      closeOnBackdrop={!busy}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => submit(() => dismissReport(report.id, { note: note.trim() || undefined }))}
          >
            Bỏ qua báo cáo
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            disabled={!canConfirm}
            onClick={() =>
              submit(() =>
                resolveReport(report.id, {
                  action,
                  note: note.trim() || undefined,
                  ratingId: action === "CLEAR_COMMENT" ? Number(ratingId) : undefined,
                })
              )
            }
          >
            Xác nhận
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm">
        <p>
          Bộ thẻ: <strong>{report.deckTitle ?? report.deckId}</strong> · {report.deckVisibility}{" "}
          <Link to={`/admin/decks/${encodeURIComponent(report.deckId)}`} className="underline text-primary" target="_blank" rel="noreferrer">
            Mở bộ thẻ ↗
          </Link>
        </p>
        <p>
          Lý do: <strong>{REPORT_REASON_LABELS[report.reason] ?? report.reason}</strong>
          {report.detail && <> — “{report.detail}”</>}
        </p>
        <p className="text-on-surface-variant">
          Người báo cáo: {report.reporterEmail}
          {report.sameDeckOpen > 1 && ` · ${report.sameDeckOpen} báo cáo đang mở cho bộ thẻ này`}
        </p>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold mb-1">Hành động</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="action" checked={action === "NONE"} onChange={() => setAction("NONE")} />
            Không làm gì (chỉ đánh dấu đã xử lý)
          </label>
          <label className={`flex items-center gap-2 ${deckPrivate ? "opacity-50" : ""}`}>
            <input
              type="radio"
              name="action"
              disabled={deckPrivate}
              checked={action === "UNPUBLISH_DECK"}
              onChange={() => setAction("UNPUBLISH_DECK")}
            />
            Gỡ khỏi Thư viện{deckPrivate && " (bộ thẻ đã riêng tư)"}
          </label>
          <label className={`flex items-center gap-2 ${comments.length === 0 ? "opacity-50" : ""}`}>
            <input
              type="radio"
              name="action"
              disabled={comments.length === 0}
              checked={action === "CLEAR_COMMENT"}
              onChange={() => setAction("CLEAR_COMMENT")}
            />
            Xoá bình luận{comments.length === 0 && !ratings.loading && " (bộ thẻ không có bình luận)"}
          </label>
          {action === "CLEAR_COMMENT" && (
            <label className="flex flex-col gap-1 pl-6">
              Bình luận
              <select
                value={ratingId}
                onChange={(e) => setRatingId(e.target.value)}
                required
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5"
              >
                <option value="">— chọn —</option>
                {comments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.userEmail} ★{c.stars} “{(c.comment ?? "").slice(0, 60)}”
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <label className="flex flex-col gap-1">
          Ghi chú (≤ 500)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5"
          />
        </label>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
