import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { deleteModerationItem, fetchModerationQueue, moderationAction, rescanModeration } from "@/services/moderationService";
import { formatShort } from "@/features/admin/adminUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminStatusTabs } from "@/features/admin/components/AdminStatusTabs";
import { AdminFlash, type AdminFlashMessage } from "@/features/admin/components/AdminFlash";
import { BreakableEmail } from "@/features/admin/components/BreakableEmail";
import { ModerationText } from "@/features/admin/components/ModerationText";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { useAdminQueues } from "@/features/admin/useAdminQueues";
import { MODERATION_STATUS_LABELS, aiLabelText, moderationTone, parseModerationStatus } from "@/lib/moderation";
import type { ModerationQueueItem } from "@/types/moderation.types";

const PAGE_SIZE = 20;
type TabKey = "OPEN" | "BLOCKED" | "FLAGGED" | "PENDING" | "REVIEWED";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "OPEN", label: "Chờ xem", icon: "pending_actions" },
  { key: "BLOCKED", label: "AI chặn", icon: "block" },
  { key: "FLAGGED", label: "AI gắn cờ", icon: "flag" },
  { key: "PENDING", label: "Chưa kiểm", icon: "hourglass_empty" },
  { key: "REVIEWED", label: "Đã xử lý", icon: "check_circle" },
];
const BADGE_TONE: Record<ReturnType<typeof moderationTone>, "error" | "warn" | "success" | "neutral" | "info"> = {
  error: "error",
  warning: "warn",
  success: "success",
  neutral: "neutral",
  info: "info",
};

/**
 * Admin › Kiểm duyệt AI (spec 2026-10-27 đêm §6.3, §7): hàng chờ bình luận từ điển + bình luận đánh giá bộ thẻ bị model gắn cờ /
 * chặn; Bỏ qua (hiện nguyên văn) · Khôi phục (BLOCKED → công khai) · Ẩn (ghi chú) · Xoá; quét lại bình luận chưa kiểm.
 */
export const AdminModerationPage: React.FC = () => {
  const q = useAdminQuery({ status: "OPEN" });
  const parsed = parseModerationStatus(q.get("status"));
  const status: TabKey = parsed === "OPEN" || parsed === "BLOCKED" || parsed === "FLAGGED" || parsed === "PENDING" || parsed === "REVIEWED" ? parsed : "OPEN";
  const kind = q.get("kind") || "";
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const dialog = useDialog();
  const [retry, setRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<AdminFlashMessage | null>(null);
  const [notePrompt, setNotePrompt] = useState<{ title: string; resolve: (v: string | null) => void } | null>(null);
  const { queues } = useAdminQueues();

  const { data, loading, error } = useAsync(
    () => fetchModerationQueue({ status, kind: kind || undefined, q: q.get("q") || undefined, page: q.page, size: PAGE_SIZE }),
    [q.key, retry],
    reload
  );
  const rows = data?.items ?? [];
  const openCount = status === "OPEN" ? (data?.total ?? null) : (queues?.openModeration ?? null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) setFlash({ ok: true, text: done });
      setReload((n) => n + 1);
    } catch (err) {
      setFlash({ ok: false, text: extractErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const hide = async (it: ModerationQueueItem) => {
    const note = await new Promise<string | null>((resolve) =>
      setNotePrompt({ title: it.kind === "comment" ? "Ẩn bình luận — ghi chú gửi tác giả" : "Xoá bình luận đánh giá (giữ sao) — ghi chú", resolve })
    );
    if (note === null) return;
    await run(`hide:${it.kind}:${it.id}`, () => moderationAction(it.kind, it.id, "hide", note || undefined), "Đã ẩn bình luận.");
  };

  const remove = async (it: ModerationQueueItem) => {
    const ok = await dialog.confirm({ title: "Xoá hẳn bình luận?", message: it.content, confirmLabel: "Xoá", tone: "danger" });
    if (!ok) return;
    await run(`del:${it.kind}:${it.id}`, () => deleteModerationItem(it.kind, it.id), "Đã xoá bình luận.");
  };

  const rescan = () =>
    run("rescan", async () => {
      const r = await rescanModeration();
      setFlash({ ok: true, text: `Đã chấm lại ${r.scanned} bình luận; còn ${r.pending} chưa kiểm.` });
    }, "");

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Kiểm duyệt AI"
        description="Bình luận từ điển và bình luận đánh giá bộ thẻ được hai model tự huấn luyện chấm lúc gửi: phân lớp sạch / xúc phạm / thù ghét và đánh dấu từ vi phạm. Chặn chỉ khi cả hai cùng đồng ý; mọi ca đều chờ bạn xem lại ở đây."
        actions={
          canAct ? (
            <Button variant="outline" size="sm" onClick={() => void rescan()} isLoading={busy === "rescan"}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">refresh</span>
              Quét lại bình luận chưa kiểm
            </Button>
          ) : undefined
        }
      />

      <AdminStatusTabs
        label="Trạng thái kiểm duyệt"
        active={status}
        hrefFor={(s) => `/admin/moderation?status=${s}${kind ? `&kind=${kind}` : ""}${q.get("q") ? `&q=${encodeURIComponent(q.get("q"))}` : ""}`}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          icon: t.icon,
          count: t.key === "OPEN" ? openCount : t.key === status ? (data?.total ?? null) : null,
          urgent: t.key === "OPEN" || t.key === "BLOCKED",
        }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Loại"
          value={kind}
          onChange={(e) => q.set({ kind: e.target.value || undefined })}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm"
        >
          <option value="">Từ điển + đánh giá</option>
          <option value="comment">Bình luận từ điển</option>
          <option value="rating">Bình luận đánh giá bộ thẻ</option>
        </select>
        <input
          type="text"
          enterKeyHint="search"
          aria-label="Tìm theo nội dung / email"
          placeholder="Tìm nội dung, email, khoá mục…"
          defaultValue={q.get("q")}
          onKeyDown={(e) => {
            if (e.key === "Enter") q.set({ q: (e.target as HTMLInputElement).value || undefined });
          }}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm min-w-[240px]"
        />
      </div>

      <AdminFlash message={flash} onClose={() => setFlash(null)} />

      <AdminTableShell
        caption={`Bình luận ${TABS.find((t) => t.key === status)?.label.toLowerCase() ?? ""}`}
        stickyActions={status !== "REVIEWED"}
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText={status === "OPEN" ? "Không có bình luận nào chờ xem." : "Không có bình luận nào."}
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} bình luận` : undefined}
      >
        <thead>
          <tr>
            <th scope="col" className="w-32">Lúc</th>
            <th scope="col" className="min-w-[280px]">Nội dung (từ bị đánh dấu tô đỏ)</th>
            <th scope="col">AI</th>
            <th scope="col">Tác giả</th>
            <th scope="col">Ở đâu</th>
            <th scope="col" className="w-44">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => {
            const key = `${it.kind}:${it.id}`;
            const rowBusy = busy?.endsWith(key);
            return (
              <tr key={key} className={`transition-colors ${rowBusy ? "opacity-60" : "hover:bg-surface-container-low/40"}`} aria-busy={!!rowBusy}>
                <td className="whitespace-nowrap text-label-sm text-on-surface-variant">
                  {formatShort(it.createdAt)}
                  <div className="mt-1">
                    <AdminStatusBadge label={MODERATION_STATUS_LABELS[it.status]} tone={BADGE_TONE[moderationTone(it.status)]} />
                  </div>
                  {it.hidden && <div className="mt-1 text-error">đã ẩn</div>}
                </td>
                <td>
                  <ModerationText content={it.content} spans={it.spans} className="max-w-md text-on-surface" />
                </td>
                <td className="whitespace-nowrap text-label-sm">
                  <div className="font-semibold">{aiLabelText(it.label)}</div>
                  {it.score != null && <div className="text-on-surface-variant">p = {Math.round(it.score * 100)} %</div>}
                  {it.verdict && it.verdict !== it.status && <div className="text-on-surface-variant">AI: {MODERATION_STATUS_LABELS[it.verdict]}</div>}
                </td>
                <td className="text-label-sm">
                  <Link to={`/admin/users/${it.author.id}`} className="text-primary hover:underline">
                    <BreakableEmail email={it.author.email} />
                  </Link>
                  <div className="text-on-surface-variant">
                    {it.author.displayName}
                    {it.author.blocked24h > 0 && ` · bị chặn ${it.author.blocked24h} lần / 24 h`}
                    {it.author.commentLockedUntil && " · đang khoá bình luận"}
                  </div>
                </td>
                <td className="text-label-sm">
                  {it.kind === "comment" ? (
                    <Link to={`/admin/dictionary?tab=search&entry=${encodeURIComponent(it.target.key)}`} className="text-primary hover:underline">
                      Mục từ {it.target.title ?? it.target.key}
                    </Link>
                  ) : (
                    <Link to={`/admin/decks/${encodeURIComponent(it.target.key)}`} className="text-primary hover:underline">
                      Bộ thẻ {it.target.title ?? it.target.key}
                    </Link>
                  )}
                  {it.target.sensitive && <div className="text-[#B45309]">mục nhạy cảm</div>}
                </td>
                <td>
                  {canAct && it.status !== "REVIEWED" && (
                    <div className="flex flex-wrap gap-1">
                      {it.status === "BLOCKED" ? (
                        <Button size="sm" variant="primary" onClick={() => void run(`restore:${key}`, () => moderationAction(it.kind, it.id, "restore"), "Đã khôi phục, bình luận công khai.")}>
                          Khôi phục
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => void run(`ignore:${key}`, () => moderationAction(it.kind, it.id, "ignore"), "Đã bỏ qua, bình luận hiện nguyên văn.")}>
                          Bỏ qua
                        </Button>
                      )}
                      {!it.hidden && (
                        <Button size="sm" variant="outline" onClick={() => void hide(it)}>
                          {it.kind === "comment" ? "Ẩn" : "Xoá bình luận"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-error hover:bg-error/10 hover:text-error" onClick={() => void remove(it)}>
                        Xoá
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={q.page} size={PAGE_SIZE} total={data.total} onPage={q.setPage} />}
      {notePrompt && (
        <NotePromptModal
          title={notePrompt.title}
          onDone={(v) => {
            notePrompt.resolve(v);
            setNotePrompt(null);
          }}
        />
      )}
    </section>
  );
};

/** Hộp nhập ghi chú (lý do ẩn) — không dùng window.prompt. Rỗng = dùng ghi chú mặc định của server. */
const NotePromptModal: React.FC<{ title: string; onDone: (v: string | null) => void }> = ({ title, onDone }) => {
  const [v, setV] = useState("");
  return (
    <Modal
      isOpen
      onClose={() => onDone(null)}
      title={title}
      icon="edit_note"
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>Huỷ</Button>
          <Button onClick={() => onDone(v.trim())}>Xác nhận</Button>
        </>
      }
    >
      <textarea
        aria-label="Ghi chú"
        value={v}
        maxLength={500}
        rows={3}
        placeholder="Vi phạm quy tắc cộng đồng (AI gắn cờ)"
        onChange={(e) => setV(e.target.value)}
        className="w-full rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
      />
    </Modal>
  );
};
