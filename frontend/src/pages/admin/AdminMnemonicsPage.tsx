import React, { useState } from "react";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import {
  approveMnemonic,
  fetchAdminMnemonics,
  patchAdminMnemonic,
  rejectMnemonic,
} from "@/services/adminService";
import { formatShort } from "@/features/admin/adminUtils";
import {
  MNEMONIC_DB_MAX,
  MNEMONIC_STATUS_LABELS,
  canReviewMnemonic,
  isPendingError,
  mnemonicSourceLabel,
  mnemonicTextError,
  parseMnemonicStatus,
  type MnemonicStatusKey,
} from "@/features/admin/moderationUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { AdminStatusBadge, type BadgeTone } from "@/features/admin/components/AdminStatusBadge";
import { AdminStatusTabs } from "@/features/admin/components/AdminStatusTabs";
import { AdminPendingNotice } from "@/features/admin/components/AdminPendingNotice";
import { AdminFlash, type AdminFlashMessage } from "@/features/admin/components/AdminFlash";
import { RejectMnemonicModal } from "@/features/admin/components/RejectMnemonicModal";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { useAdminQueues } from "@/features/admin/useAdminQueues";
import type { AdminMnemonic, AdminMnemonicSource } from "@/types/adminModeration.types";
import type { AdminPage } from "@/types/api.types";

const PAGE_SIZE = 20;

const TAB_ICONS: Record<MnemonicStatusKey, string> = {
  PENDING: "hourglass_top",
  APPROVED: "check_circle",
  REJECTED: "block",
};

const SOURCE_STYLE: Record<AdminMnemonicSource, { tone: BadgeTone; icon: string }> = {
  AI: { tone: "info", icon: "auto_awesome" },
  TEMPLATE: { tone: "neutral", icon: "article" },
  USER: { tone: "success", icon: "person" },
};

type BusyKind = "approve" | "reject" | "edit";

/** Xoá một khoá khỏi bản đồ id -> trạng thái bận mà không tạo biến thừa. */
const without = <T,>(map: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...map };
  delete next[key];
  return next;
};

export const AdminMnemonicsPage: React.FC = () => {
  const q = useAdminQuery({ status: "PENDING" });
  const status = parseMnemonicStatus(q.get("status"));
  const { userProfile } = useAuth();
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  // reload: tải lại ngầm sau thao tác (giữ bảng, không nháy "Đang tải").
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(
    () => fetchAdminMnemonics({ status, q: q.get("q"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry],
    reload
  );
  // Số chờ duyệt cho tab lấy từ AdminLayout (đã tải cho badge), không gọi lại /admin/stats.
  const { queues, reloadQueues } = useAdminQueues();

  // Bản sao cục bộ của trang hiện tại để cập nhật lạc quan (ẩn mẹo vừa duyệt, thay nội dung vừa sửa) trước khi tải lại.
  // Dữ liệu server mới về thì đặt lại theo server (mẫu "điều chỉnh state khi props đổi" của React).
  const [local, setLocal] = useState<{ src?: AdminPage<AdminMnemonic>; items: AdminMnemonic[] }>({ items: [] });
  if (data && local.src !== data) setLocal({ src: data, items: data.items });
  const rows = data ? local.items : [];

  const [busy, setBusy] = useState<Record<string, BusyKind>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<AdminMnemonic | null>(null);
  const [flash, setFlash] = useState<AdminFlashMessage | null>(null);

  /** Chạy một thao tác trên một mẹo; trả null khi xong hoặc câu lỗi (nơi gọi quyết định hiện ở đâu). */
  const act = async (m: AdminMnemonic, kind: BusyKind, run: () => Promise<AdminMnemonic>, okText: string): Promise<string | null> => {
    setBusy((b) => ({ ...b, [m.id]: kind }));
    setFlash(null);
    try {
      const updated = { ...m, ...(await run()) };
      setLocal((l) => ({
        ...l,
        items:
          status === "PENDING" && updated.status !== "PENDING"
            ? l.items.filter((x) => x.id !== m.id)
            : l.items.map((x) => (x.id === m.id ? updated : x)),
      }));
      setFlash({ ok: true, text: okText });
      setReload((n) => n + 1);
      return null;
    } catch (e) {
      // 409 = mẹo không còn PENDING (admin khác vừa xử lý): tải lại để bảng khớp thực tế.
      if (isAxiosError(e) && e.response?.status === 409) {
        setReload((n) => n + 1);
        reloadQueues();
      }
      return extractErrorMessage(e);
    } finally {
      setBusy((b) => without(b, m.id));
    }
  };

  const fail = (message: string | null) => {
    if (message) setFlash({ ok: false, text: message });
  };

  const saveEdit = async (m: AdminMnemonic) => {
    if (!editing) return;
    const err = mnemonicTextError(editing.text);
    if (err) return;
    const message = await act(m, "edit", () => patchAdminMnemonic(m.id, editing.text.trim()), `Đã lưu mẹo nhớ chữ ${m.kanji}.`);
    if (message) fail(message);
    else setEditing(null);
  };

  const pendingCount = status === "PENDING" ? (data?.total ?? null) : (queues?.pendingMnemonics ?? null);
  const pending = isPendingError(error);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Mẹo nhớ bộ thủ"
        description="Duyệt mẹo nhớ do AI, mẫu tự động và người học đề xuất trước khi hiện cho mọi người học."
      />

      <AdminStatusTabs
        label="Trạng thái mẹo nhớ"
        active={status}
        hrefFor={(s) => `/admin/mnemonics?status=${s}${q.get("q") ? `&q=${encodeURIComponent(q.get("q"))}` : ""}`}
        tabs={(Object.keys(MNEMONIC_STATUS_LABELS) as MnemonicStatusKey[]).map((s) => ({
          key: s,
          label: MNEMONIC_STATUS_LABELS[s],
          icon: TAB_ICONS[s],
          count: s === "PENDING" ? pendingCount : s === status ? (data?.total ?? null) : null,
          urgent: s === "PENDING",
        }))}
      />

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Tìm chữ Hán / nội dung mẹo
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-64`}
            placeholder="海, nước…"
          />
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Tìm
          </Button>
          {q.get("q") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft("");
                q.set({ q: undefined });
              }}
            >
              Đặt lại
            </Button>
          )}
        </div>
      </AdminFilterBar>

      <AdminFlash message={flash} onClose={() => setFlash(null)} />

      {pending ? (
        <AdminPendingNotice />
      ) : (
        <AdminTableShell
          caption={`Mẹo nhớ ${MNEMONIC_STATUS_LABELS[status].toLowerCase()}`}
          stickyActions={status === "PENDING"}
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText={status === "PENDING" ? "Không còn mẹo nhớ nào chờ duyệt." : "Không có mẹo nhớ nào."}
          onRetry={() => setRetry((n) => n + 1)}
          statusText={data ? `${data.total.toLocaleString("vi-VN")} mẹo nhớ` : undefined}
        >
          <thead>
            <tr>
              <th scope="col" className="w-20">Chữ</th>
              <th scope="col">Bộ thủ</th>
              <th scope="col" className="min-w-[260px]">Mẹo nhớ</th>
              <th scope="col">Nguồn</th>
              <th scope="col">Tác giả</th>
              <th scope="col" className="w-32">Tạo lúc</th>
              {status === "PENDING" ? (
                <th scope="col" className="w-32">
                  <span className="sr-only">Thao tác</span>
                </th>
              ) : (
                <th scope="col">Kiểm duyệt</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const rowBusy = busy[m.id];
              const canReview = canReviewMnemonic(m.status, userProfile?.role);
              const isEditing = editing?.id === m.id;
              const editError = isEditing ? mnemonicTextError(editing.text) : null;
              const style = SOURCE_STYLE[m.source] ?? SOURCE_STYLE.TEMPLATE;
              return (
                <tr key={m.id} className={`transition-colors ${rowBusy ? "opacity-60" : "hover:bg-surface-container-low/40"}`} aria-busy={!!rowBusy}>
                  <td>
                    <span lang="ja" className="font-japanese text-[34px] leading-none text-on-surface">
                      {m.kanji}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {m.radical ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span lang="ja" className="font-japanese text-title-md text-on-surface">
                          {m.radical.char}
                        </span>
                        <span className="text-label-sm text-on-surface-variant">
                          #{m.radical.no}
                          {m.radical.nameVi ? ` · ${m.radical.nameVi}` : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <form
                        className="flex flex-col gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveEdit(m);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                        }}
                      >
                        <textarea
                          value={editing.text}
                          onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          maxLength={MNEMONIC_DB_MAX}
                          rows={3}
                          autoFocus
                          aria-label={`Sửa mẹo nhớ chữ ${m.kanji}`}
                          aria-invalid={!!editError}
                          className={`${adminFieldClass} w-full`}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-label-sm ${editError ? "text-error" : "text-outline"}`}>
                            {editError ?? `${editing.text.trim().length}/${MNEMONIC_DB_MAX}`}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={!!rowBusy}>
                              Huỷ
                            </Button>
                            <Button type="submit" variant="primary" size="sm" isLoading={rowBusy === "edit"} disabled={!!editError}>
                              Lưu
                            </Button>
                          </span>
                        </div>
                      </form>
                    ) : (
                      <p className="whitespace-pre-line break-words max-w-md text-on-surface">{m.mnemonicVi}</p>
                    )}
                  </td>
                  <td>
                    <AdminStatusBadge label={mnemonicSourceLabel(m.source)} tone={style.tone} icon={style.icon} />
                    {m.generatedModel && (
                      <div className="mt-1 font-mono text-[11px] text-outline truncate max-w-[140px]" title={m.generatedModel}>
                        {m.generatedModel}
                      </div>
                    )}
                  </td>
                  <td className="text-on-surface-variant break-all">
                    {m.authorEmail ?? <span className="italic text-outline">{m.source === "USER" ? "(tài khoản đã xoá)" : "Hệ thống"}</span>}
                  </td>
                  <td className="whitespace-nowrap text-label-sm text-on-surface-variant">{formatShort(m.createdAt)}</td>
                  {status === "PENDING" ? (
                    <td>
                      {canReview && !isEditing && (
                        <div className="flex flex-col items-stretch gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            isLoading={rowBusy === "approve"}
                            disabled={!!rowBusy}
                            title="Mẹo đã duyệt trước đó của chữ này (nếu có) sẽ được thay bằng mẹo này"
                            onClick={async () =>
                              fail(await act(m, "approve", () => approveMnemonic(m.id), `Đã duyệt mẹo nhớ chữ ${m.kanji}.`))
                            }
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check</span>
                            Duyệt
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!!rowBusy}
                            isLoading={rowBusy === "reject"}
                            onClick={() => setRejecting(m)}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">block</span>
                            Từ chối
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!!rowBusy}
                            onClick={() => setEditing({ id: m.id, text: m.mnemonicVi })}
                            aria-label={`Sửa mẹo nhớ chữ ${m.kanji}`}
                          >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
                            Sửa
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : (
                    <td className="text-body-sm text-on-surface-variant min-w-[160px]">
                      {m.reviewNote && <div className="italic line-clamp-3 break-words">“{m.reviewNote}”</div>}
                      <div className="text-label-sm text-outline mt-0.5">
                        {m.reviewedByEmail ?? "—"} · {formatShort(m.reviewedAt)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </AdminTableShell>
      )}
      {data && !pending && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}

      {/* key: mỗi mẹo một modal mới, ghi chú của lần từ chối trước không sót lại */}
      <RejectMnemonicModal
        key={rejecting?.id ?? "none"}
        mnemonic={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(note) =>
          rejecting
            ? act(rejecting, "reject", () => rejectMnemonic(rejecting.id, note), `Đã từ chối mẹo nhớ chữ ${rejecting.kanji}.`)
            : Promise.resolve(null)
        }
      />
    </section>
  );
};

export default AdminMnemonicsPage;
