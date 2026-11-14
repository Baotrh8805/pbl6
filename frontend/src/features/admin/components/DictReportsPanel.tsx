import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { applyDictReport, dismissDictReport, fetchDictReports, resolveDictReport } from "@/services/adminDictionaryService";
import type { DictReport } from "@/types/dictionary.types";
import { REPORT_FIELD_LABELS } from "@/features/dictionary/dictUtils";
import { DictEntryEditor } from "./DictEntryEditor";
import { Pager } from "./Pager";
import { useAdminQuery } from "../useAdminQuery";

const STATUSES = [
  { key: "OPEN", label: "Đang mở" },
  { key: "RESOLVED", label: "Đã xử lý" },
  { key: "DISMISSED", label: "Đã bỏ qua" },
] as const;
const REASONS: Record<string, string> = { SPAM: "Spam", OFFENSIVE: "Xúc phạm", WRONG: "Sai thông tin", OTHER: "Khác" };
const ACTIONS: Record<string, string> = {
  APPLIED: "Đã áp dụng đề xuất",
  EDITED: "Đã sửa tay",
  COMMENT_HIDDEN: "Đã ẩn bình luận",
  COMMENT_DELETED: "Đã xoá bình luận",
  DISMISSED: "Từ chối",
};
const PAGE_SIZE = 20;
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "");

// Báo cáo từ điển trong trang Báo cáo (K5): báo lỗi mục từ (trường + đề xuất) và báo cáo bình luận. Xử lý nhanh tại hàng, hoặc
// mở ngăn sửa để xem bản hiện tại cạnh đề xuất.
export const DictReportsPanel: React.FC = () => {
  const dialog = useDialog();
  const q = useAdminQuery({ status: "OPEN" });
  const status = (STATUSES.some((s) => s.key === q.get("status")) ? q.get("status") : "OPEN") as (typeof STATUSES)[number]["key"];
  const kind = q.get("kind") as "ENTRY" | "COMMENT" | "";
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<DictReport | null>(null);
  const { data, loading, error } = useAsync(
    () => fetchDictReports({ kind, status, page: q.page, size: PAGE_SIZE }),
    [q.key],
    reload
  );

  const run = async (task: () => Promise<unknown>) => {
    try {
      await task();
      setReload((n) => n + 1);
    } catch (e) {
      void dialog.alert({ title: "Không thực hiện được", message: extractErrorMessage(e), tone: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <nav className="flex gap-1 p-1 bg-surface-container-low rounded-xl" aria-label="Trạng thái báo cáo từ điển">
          {STATUSES.map((s) => (
            <Link
              key={s.key}
              to={`/admin/reports?source=dict&status=${s.key}${kind ? `&kind=${kind}` : ""}`}
              aria-current={status === s.key ? "page" : undefined}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-semibold ${status === s.key ? "bg-surface-container-lowest text-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {s.label}{status === s.key && data ? ` (${data.total})` : ""}
            </Link>
          ))}
        </nav>
        <select
          aria-label="Loại báo cáo"
          value={kind}
          onChange={(e) => q.set({ kind: e.target.value || undefined })}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-sm"
        >
          <option value="">Mục từ + bình luận</option>
          <option value="ENTRY">Báo lỗi mục từ</option>
          <option value="COMMENT">Báo cáo bình luận</option>
        </select>
      </div>
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      {loading && !data && <p className="text-body-sm text-on-surface-variant">Đang tải…</p>}
      {data && data.items.length === 0 && <p className="text-body-sm text-on-surface-variant">Không có báo cáo.</p>}
      <ul className="flex flex-col gap-2">
        {(data?.items ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-3 flex flex-col gap-1.5 text-body-sm">
            <p className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpen(r.entryKey)} lang="ja" className="font-semibold text-primary hover:underline">
                {r.term || r.entryKey}
              </button>
              <span className="text-xs px-1.5 py-0.5 rounded bg-surface-container">
                {r.kind === "COMMENT" ? `Bình luận · ${REASONS[r.reason ?? ""] ?? r.reason}` : REPORT_FIELD_LABELS[r.field ?? "other"]}
                {r.subKey ? ` · ${r.subKey}` : ""}
              </span>
              <span className="text-xs text-on-surface-variant">{r.reporterEmail} · {time(r.createdAt)}</span>
            </p>
            {r.kind === "ENTRY" ? (
              r.field !== "other" && (
                <p>
                  <span className="text-on-surface-variant line-through">{r.currentValue || "(trống)"}</span> → <strong>{r.proposedValue || "(không đề xuất)"}</strong>
                </p>
              )
            ) : (
              <blockquote className="border-l-4 border-outline-variant pl-2 whitespace-pre-line">{r.commentContent ?? "(bình luận đã bị xoá)"}</blockquote>
            )}
            {r.note && <p className="text-xs">Ghi chú: {r.note}</p>}
            {r.status !== "OPEN" ? (
              <p className="text-xs text-on-surface-variant">{ACTIONS[r.action ?? ""] ?? r.action} · {time(r.resolvedAt)}{r.resolutionNote ? ` · ${r.resolutionNote}` : ""}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {r.kind === "ENTRY" && r.proposedValue && r.field !== "other" && (
                  <Button size="sm" onClick={() => void run(() => applyDictReport(r.id))}>Áp dụng đề xuất</Button>
                )}
                {r.kind === "ENTRY" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setOpen(r.entryKey)}>Mở ngăn sửa</Button>
                    <Button size="sm" variant="ghost" onClick={() => void run(() => resolveDictReport(r.id))}>Đã sửa tay</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void run(() => resolveDictReport(r.id, "Vi phạm quy tắc cộng đồng", "hide"))}>Ẩn bình luận</Button>
                    <Button size="sm" variant="danger" onClick={() => void run(() => resolveDictReport(r.id, "Vi phạm quy tắc cộng đồng", "delete"))}>Xoá bình luận</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDismissing(r)}>Từ chối</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data && <Pager page={q.page} size={PAGE_SIZE} total={data.total} onPage={q.setPage} />}
      {open && <DictEntryEditor entryKey={open} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} />}
      {dismissing && (
        <DismissModal
          report={dismissing}
          onClose={() => setDismissing(null)}
          onDone={() => {
            setDismissing(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
};

const DismissModal: React.FC<{ report: DictReport; onClose: () => void; onDone: () => void }> = ({ report, onClose, onDone }) => {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!note.trim()) {
      setErr("Hãy nhập lý do từ chối (người báo sẽ thấy).");
      return;
    }
    setBusy(true);
    try {
      await dismissDictReport(report.id, note.trim());
      onDone();
    } catch (e) {
      setErr(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Từ chối báo cáo #${report.id}`}
      icon="cancel"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button onClick={() => void submit()} isLoading={busy}>Từ chối</Button>
        </>
      }
    >
      <label className="flex flex-col gap-1 text-body-sm">
        <span className="font-semibold">Lý do</span>
        <textarea autoFocus value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" />
      </label>
      {err && <p role="alert" className="text-xs text-error mt-1">{err}</p>}
    </Modal>
  );
};
