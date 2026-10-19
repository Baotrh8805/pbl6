import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAsync } from "@/lib/useAsync";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { dismissAppeal, fetchAdminUser, resolveAppeal } from "@/services/adminService";
import type { AccountAppeal, AppealAction } from "@/types/adminModeration.types";
import { REVIEW_NOTE_MAX, appealActionState } from "../moderationUtils.ts";
import { formatShort } from "../adminUtils.ts";
import { adminFieldClass } from "./AdminFilterBar.tsx";

interface ResolveAppealModalProps {
  appeal: AccountAppeal | null;
  viewerRole: string | null | undefined;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Xử lý khiếu nại bị khoá tài khoản: Mở khoá / Giữ khoá (+ ghi chú) hoặc Bỏ qua.
 * Hợp đồng không trả vai trò người bị khoá nên tra chi tiết người dùng để áp quy tắc bậc trên UI (ADMIN chỉ mở khoá
 * USER); backend vẫn là nơi chặn cuối.
 */
export const ResolveAppealModal: React.FC<ResolveAppealModalProps> = ({ appeal, viewerRole, onClose, onDone }) => {
  const [choice, setChoice] = useState<AppealAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"resolve" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const hintId = useId();

  const needLookup = !!appeal && appeal.userRole === undefined && appeal.userId != null;
  const target = useAsync(
    () => (needLookup && appeal?.userId != null ? fetchAdminUser(appeal.userId) : Promise.resolve(null)),
    [needLookup ? appeal?.userId : null]
  );

  if (!appeal) return null;

  // undefined = đang tra; null = tra không được (lỗi / không có tài khoản) -> appealActionState xử lý thận trọng.
  const targetRole: string | null | undefined =
    appeal.userRole !== undefined ? appeal.userRole : !needLookup ? null : target.loading ? undefined : (target.data?.role ?? null);
  const state = appealActionState(appeal, targetRole, viewerRole);
  // Không chọn sẵn: mở khoá hay giữ khoá đều phải là quyết định có chủ ý của admin (như nút xác nhận ghi rõ hành động).
  const effective: AppealAction | null = choice === "UNLOCK" && !state.canUnlock ? null : choice;
  const lockedReason = target.data?.lockedReason ?? appeal.lockedReason;

  const run = async (kind: "resolve" | "dismiss") => {
    setBusy(kind);
    setError(null);
    try {
      const trimmed = note.trim() || undefined;
      if (kind === "resolve") {
        if (!effective) return;
        await resolveAppeal(appeal.id, { action: effective, note: trimmed });
        onDone(effective === "UNLOCK" ? `Đã mở khoá ${appeal.email}.` : `Đã giữ khoá ${appeal.email} và đóng khiếu nại.`);
      } else {
        await dismissAppeal(appeal.id, { note: trimmed });
        onDone(`Đã bỏ qua khiếu nại của ${appeal.email}.`);
      }
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const roleLabel = targetRole && targetRole in ROLE_LABELS ? ROLE_LABELS[targetRole as Role] : null;

  return (
    <Modal
      isOpen={!!appeal}
      onClose={onClose}
      title={`Khiếu nại #${appeal.id}`}
      subtitle={appeal.email}
      icon="gavel"
      size="lg"
      closeOnBackdrop={!busy}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={!!busy} isLoading={busy === "dismiss"} onClick={() => void run("dismiss")}>
            Bỏ qua khiếu nại
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!busy}>
            Huỷ
          </Button>
          <Button
            variant={effective === "UNLOCK" ? "secondary" : "primary"}
            size="sm"
            disabled={!!busy || !effective}
            isLoading={busy === "resolve"}
            onClick={() => void run("resolve")}
          >
            {effective === "UNLOCK" ? "Mở khoá & đóng" : effective === "NONE" ? "Giữ khoá & đóng" : "Chọn kết quả"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-outline font-semibold">Tài khoản</dt>
          <dd className="min-w-0 break-all">
            {appeal.userId != null ? (
              <Link to={`/admin/users/${appeal.userId}`} className="text-primary underline" target="_blank" rel="noreferrer">
                {appeal.email} ↗
              </Link>
            ) : (
              <>
                {appeal.email} <span className="text-outline">(không còn tài khoản)</span>
              </>
            )}
            {roleLabel && <span className="ml-1.5 text-outline">· {roleLabel}</span>}
          </dd>
          <dt className="text-outline font-semibold">Lý do khoá</dt>
          <dd className="break-words">{lockedReason || <span className="italic text-outline">Không ghi lý do</span>}</dd>
          <dt className="text-outline font-semibold">Gửi lúc</dt>
          <dd>{formatShort(appeal.createdAt)}</dd>
        </dl>

        <blockquote className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high whitespace-pre-line break-words">
          {appeal.message}
        </blockquote>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold mb-1">Kết quả</legend>
          <label className={`flex items-start gap-2 ${state.canUnlock ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="radio"
              name="appeal-action"
              className="mt-1"
              disabled={!state.canUnlock || !!busy}
              checked={effective === "UNLOCK"}
              onChange={() => setChoice("UNLOCK")}
              aria-describedby={state.unlockHint ? hintId : undefined}
            />
            <span>
              Mở khoá tài khoản
              {state.unlockHint && (
                <span id={hintId} className="block text-label-sm text-on-surface-variant">
                  {state.unlockHint}
                </span>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="appeal-action"
              className="mt-1"
              disabled={!!busy}
              checked={effective === "NONE"}
              onChange={() => setChoice("NONE")}
            />
            <span>Giữ khoá (đã xem xét, không mở)</span>
          </label>
        </fieldset>

        <label htmlFor={noteId} className="font-semibold">
          Ghi chú (≤ {REVIEW_NOTE_MAX})
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={REVIEW_NOTE_MAX}
          rows={3}
          disabled={!!busy}
          className={`${adminFieldClass} w-full`}
        />
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
