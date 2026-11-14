import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { httpStatusOf } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { resolveQuestionFlag } from "@/services/adminQuestionService";
import type { AdminQuestionFlag } from "@/types/quiz.types";
import { FLAG_DETAIL_MAX, FLAG_REASON_LABELS, FLAG_STATUS_LABELS } from "@/features/quiz/quizUtils";
import { formatShort } from "../adminUtils.ts";
import { AdminStatusBadge } from "./AdminStatusBadge.tsx";
import { adminFieldClass } from "./AdminFilterBar.tsx";

/** Một báo lỗi của người học trong chi tiết câu hỏi: lý do, mô tả, ghi chú xử lý và nút "Đánh dấu đã xử lý" (ADMIN+). */
export const QuestionFlagRow: React.FC<{ flag: AdminQuestionFlag; canAct: boolean; onResolved: (flag: AdminQuestionFlag) => void }> = ({
  flag,
  canAct,
  onResolved,
}) => {
  const noteId = useId();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = flag.status === "OPEN";

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await resolveQuestionFlag(flag.id, note.trim() || undefined);
      onResolved({ ...flag, ...res, resolutionNote: res?.resolutionNote ?? (note.trim() || flag.resolutionNote) });
    } catch (err) {
      if (httpStatusOf(err) === 409) {
        // Admin khác đã xử lý trước: cập nhật tại chỗ thay vì báo lỗi.
        onResolved({ ...flag, status: "RESOLVED" });
        return;
      }
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-xl border p-space-sm flex flex-col gap-1.5 ${
        isOpen ? "border-error/30 bg-error/5" : "border-surface-container-high bg-surface-container-lowest"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusBadge label={FLAG_REASON_LABELS[flag.reason] ?? flag.reason} tone={isOpen ? "warn" : "neutral"} icon="report" />
        <AdminStatusBadge label={FLAG_STATUS_LABELS[flag.status] ?? flag.status} tone={isOpen ? "error" : "success"} />
        <span className="text-on-surface font-semibold break-all">{flag.userEmail}</span>
        <span className="text-label-sm text-outline">{formatShort(flag.createdAt)}</span>
      </div>
      {flag.detail && <p className="italic text-on-surface-variant break-words">“{flag.detail}”</p>}
      {flag.resolutionNote && (
        <p className="text-label-sm text-on-surface-variant">
          Ghi chú xử lý: <span className="italic">“{flag.resolutionNote}”</span>
        </p>
      )}
      {isOpen && canAct && !resolving && (
        <div>
          <Button type="button" variant="primary" size="sm" onClick={() => setResolving(true)}>
            Đánh dấu đã xử lý
          </Button>
        </div>
      )}
      {isOpen && canAct && resolving && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-label-sm font-semibold text-outline">
            Ghi chú (không bắt buộc, ≤ {FLAG_DETAIL_MAX})
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={FLAG_DETAIL_MAX}
            rows={2}
            disabled={busy}
            placeholder="Vd. đã sửa đáp án đúng"
            className={adminFieldClass}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setResolving(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button type="button" size="sm" isLoading={busy} onClick={() => void resolve()}>
              Xác nhận đã xử lý
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </li>
  );
};
