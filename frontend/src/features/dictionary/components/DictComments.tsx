import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { runOnce } from "@/lib/inFlight";
import { extractErrorMessage } from "@/services/apiClient";
import {
  addDictComment,
  deleteDictComment,
  editDictComment,
  fetchDictComments,
  reportDictComment,
  toggleDictHelpful,
} from "@/services/dictionaryService";
import type { DictComment, DictKey } from "@/types/dictionary.types";
import type { ModerationInfo } from "@/types/moderation.types";

const MAX = 1000;
const PAGE = 20;

const timeOf = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

// Bình luận phẳng dưới mỗi mục (D19): sắp theo Hữu ích / Mới nhất, sửa / xoá của mình, "Hữu ích", báo cáo bình luận xấu.
export const DictComments: React.FC<{ entryKey: DictKey; onCountChange?: (n: number) => void }> = ({ entryKey, onCountChange }) => {
  const dialog = useDialog();
  const [sort, setSort] = useState<"helpful" | "newest">("helpful");
  const [size, setSize] = useState(PAGE);
  const [reload, setReload] = useState(0);
  const list = useAsync(() => fetchDictComments(entryKey, sort, 0, size), [entryKey, sort, size], reload);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [reporting, setReporting] = useState<DictComment | null>(null);
  const inFlight = useRef(new Set<string>());

  const refresh = () => setReload((n) => n + 1);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) {
      setError("Nội dung bình luận trống.");
      return;
    }
    void runOnce(inFlight.current, "add", async () => {
      setBusy(true);
      setError(null);
      try {
        await addDictComment(entryKey, content);
        setText("");
        onCountChange?.((list.data?.total ?? 0) + 1);
        refresh();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusy(false);
      }
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const content = editing.text.trim();
    if (!content) return;
    void runOnce(inFlight.current, `edit:${editing.id}`, async () => {
      try {
        await editDictComment(editing.id, content);
        setEditing(null);
        refresh();
      } catch (err) {
        void dialog.alert({ title: "Không sửa được", message: extractErrorMessage(err) });
      }
    });
  };

  const remove = async (c: DictComment) => {
    const ok = await dialog.confirm({ title: "Xoá bình luận?", message: "Bình luận sẽ bị xoá hẳn.", confirmLabel: "Xoá", tone: "danger" });
    if (!ok) return;
    await runOnce(inFlight.current, `del:${c.id}`, async () => {
      try {
        await deleteDictComment(c.id);
        onCountChange?.(Math.max(0, (list.data?.total ?? 1) - 1));
        refresh();
      } catch (err) {
        void dialog.alert({ title: "Không xoá được", message: extractErrorMessage(err) });
      }
    });
  };

  const helpful = (c: DictComment) =>
    void runOnce(inFlight.current, `vote:${c.id}`, async () => {
      try {
        await toggleDictHelpful(c.id);
        refresh();
      } catch (err) {
        void dialog.alert({ title: "Không thực hiện được", message: extractErrorMessage(err) });
      }
    });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return (
    <section aria-labelledby="dict-comments" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="dict-comments" className="font-semibold text-on-surface flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">forum</span>
          Bình luận {total > 0 && <span className="text-on-surface-variant font-normal">({total})</span>}
        </h3>
        <div role="group" aria-label="Sắp xếp bình luận" className="flex gap-1 text-label-md">
          {(["helpful", "newest"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 rounded-lg ${sort === s ? "bg-primary/10 text-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {s === "helpful" ? "Hữu ích" : "Mới nhất"}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <label htmlFor={`cmt-${entryKey}`} className="sr-only">Viết bình luận</label>
        <textarea
          id={`cmt-${entryKey}`}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Chia sẻ mẹo nhớ, cách dùng, lưu ý… (không đăng thông tin cá nhân)"
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface-variant">{text.length}/{MAX}</span>
          <Button type="submit" size="sm" isLoading={busy} disabled={!text.trim()}>Gửi bình luận</Button>
        </div>
        {error && <p role="alert" className="text-xs text-error">{error}</p>}
      </form>

      {list.error && <p role="alert" className="text-body-sm text-error">{list.error}</p>}
      {!list.loading && !list.error && items.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">Chưa có bình luận. Hãy là người đầu tiên chia sẻ kiến thức về mục này.</p>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.id} className={`rounded-xl border p-3 ${c.hidden ? "border-error/40 bg-error/5" : "border-surface-container-high bg-surface-container-lowest"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
              <span className="font-semibold text-on-surface">{c.displayName}{c.mine && " (bạn)"}</span>
              <span>{timeOf(c.createdAt)}{c.updatedAt !== c.createdAt && " · đã sửa"}</span>
            </div>
            {c.hidden && <p className="mt-1 text-xs text-error">Bình luận này đã bị quản trị viên ẩn, chỉ bạn thấy.</p>}
            <ModerationNotice info={c.moderation} />
            {editing?.id === c.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  aria-label="Sửa bình luận"
                  value={editing.text}
                  maxLength={MAX}
                  onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
                />
                <div className="flex gap-2 justify-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button>
                  <Button type="button" size="sm" onClick={saveEdit} disabled={!editing.text.trim()}>Lưu</Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-body-sm text-on-surface whitespace-pre-line break-words">{c.content}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <button
                type="button"
                disabled={c.mine || c.hidden}
                aria-pressed={c.votedByMe}
                onClick={() => helpful(c)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${c.votedByMe ? "text-primary font-semibold bg-primary/10" : "text-on-surface-variant hover:bg-surface-container"} disabled:opacity-60 disabled:cursor-default`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">thumb_up</span>
                Hữu ích {c.helpfulCount > 0 && `(${c.helpfulCount})`}
              </button>
              {c.mine && !c.hidden && editing?.id !== c.id && (
                <button type="button" onClick={() => setEditing({ id: c.id, text: c.content })} className="px-2 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container">
                  Sửa
                </button>
              )}
              {c.mine && (
                <button type="button" onClick={() => void remove(c)} className="px-2 py-1 rounded-lg text-error hover:bg-error/10">Xoá</button>
              )}
              {!c.mine && (
                <button type="button" onClick={() => setReporting(c)} className="px-2 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container">
                  Báo cáo
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {items.length < total && (
        <Button type="button" variant="outline" size="sm" onClick={() => setSize((s) => s + PAGE)} className="self-center">
          Xem thêm bình luận
        </Button>
      )}
      {reporting && <ReportCommentModal comment={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
};

/**
 * Dải kiểm duyệt AI (V38): chủ thấy BLOCKED (chưa đăng, sửa gửi lại) / FLAGGED (chờ admin) / PENDING (chưa kiểm); người khác chỉ
 * thấy ghi chú "từ nhạy cảm đang được che" khi content là bản che.
 */
const ModerationNotice: React.FC<{ info?: ModerationInfo | null }> = ({ info }) => {
  if (!info) return null;
  if (info.masked) {
    return <p className="mt-1 text-xs text-on-surface-variant">Một vài từ trong bình luận đang được che chờ quản trị viên xem lại.</p>;
  }
  const tone = info.status === "BLOCKED" ? "text-error" : info.status === "FLAGGED" ? "text-[#B45309]" : "text-on-surface-variant";
  const title = info.status === "BLOCKED" ? "Chưa được đăng" : info.status === "FLAGGED" ? "Đang chờ quản trị viên xem lại" : "Chưa kiểm duyệt";
  return (
    <p role={info.status === "BLOCKED" ? "alert" : undefined} className={`mt-1 text-xs ${tone}`}>
      <span className="font-semibold">{title}.</span> {info.message}
    </p>
  );
};

const REASONS = [
  { v: "SPAM", label: "Spam, quảng cáo" },
  { v: "OFFENSIVE", label: "Xúc phạm, thô tục" },
  { v: "WRONG", label: "Thông tin sai" },
  { v: "OTHER", label: "Khác" },
] as const;

const ReportCommentModal: React.FC<{ comment: DictComment; onClose: () => void }> = ({ comment, onClose }) => {
  const [reason, setReason] = useState<(typeof REASONS)[number]["v"]>("SPAM");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await reportDictComment(comment.id, reason, note.trim() || undefined);
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
      title="Báo cáo bình luận"
      icon="flag"
      footer={
        done ? (
          <Button onClick={onClose}>Đóng</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Huỷ</Button>
            <Button onClick={() => void submit()} isLoading={busy}>Gửi báo cáo</Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-body-sm">Đã gửi báo cáo. Quản trị viên sẽ xem xét.</p>
      ) : (
        <div className="flex flex-col gap-3 text-body-sm">
          <blockquote className="border-l-4 border-outline-variant pl-3 text-on-surface-variant whitespace-pre-line">{comment.content}</blockquote>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-semibold mb-1">Lý do</legend>
            {REASONS.map((r) => (
              <label key={r.v} className="flex items-center gap-2">
                <input type="radio" name="reason" checked={reason === r.v} onChange={() => setReason(r.v)} />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Ghi chú (tuỳ chọn)</span>
            <textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-error text-xs">{error}</p>}
        </div>
      )}
    </Modal>
  );
};
