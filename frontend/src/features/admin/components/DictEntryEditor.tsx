import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDialog } from "@/components/ui/dialogContext";
import { runOnce } from "@/lib/inFlight";
import { extractErrorMessage } from "@/services/apiClient";
import {
  applyDictReport,
  deleteDictCommentAdmin,
  dismissDictReport,
  fetchDictAdminEntry,
  hideDictComment,
  putDictOverride,
  resolveDictReport,
  retranslateDictEntry,
  revertDictHistory,
  setDictExampleVi,
  setDictMeaning,
  unhideDictComment,
  verifyDictMeaning,
  type DictOverrideField,
} from "@/services/adminDictionaryService";
import type { DictAdminEntry, DictKey } from "@/types/dictionary.types";
import { REPORT_FIELD_LABELS, headOf, isKanjiKey, kanjiKey } from "@/features/dictionary/dictUtils";

const FIELD_LABELS: Record<string, string> = {
  ...REPORT_FIELD_LABELS,
  meaning_vi_verify: "Xác nhận nghĩa Việt",
  example_jpn: "Câu ví dụ (Nhật)",
  example_eng: "Câu ví dụ (Anh)",
  example_hidden: "Ẩn câu ví dụ",
};
const SOURCE_LABELS: Record<string, string> = { SEED: "dịch sẵn", GEMINI: "AI dịch khi tra", ADMIN: "admin" };
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "");
const box = "rounded-xl border border-surface-container-high p-3 flex flex-col gap-2";
const input = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-sm w-full";

/** Một ô ghi đè dữ liệu gốc: hiện giá trị gốc, ô sửa, Lưu / Bỏ ghi đè. */
const OverrideField: React.FC<{
  label: string;
  original?: string | null;
  current?: string | null;
  overridden: boolean;
  onSave: (v: string | null) => Promise<void>;
  lang?: string;
}> = ({ label, original, current, overridden, onSave, lang }) => {
  const [v, setV] = useState(current ?? "");
  const [prev, setPrev] = useState(current);
  if (current !== prev) {
    setPrev(current);
    setV(current ?? "");
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-on-surface">{label}{overridden && <span className="ml-1 text-tertiary">(đã ghi đè)</span>}</span>
      <div className="flex gap-2">
        <input lang={lang} value={v} onChange={(e) => setV(e.target.value)} className={input} aria-label={label} />
        <Button size="sm" variant="outline" disabled={v.trim() === (current ?? "").trim() || !v.trim()} onClick={() => void onSave(v.trim())}>Lưu</Button>
        {overridden && <Button size="sm" variant="ghost" onClick={() => void onSave(null)}>Bỏ</Button>}
      </div>
      {original != null && overridden && <span className="text-[11px] text-on-surface-variant">Gốc: {original}</span>}
    </div>
  );
};

// Ngăn sửa một mục (spec 2026-10-26 §8.1): nghĩa Việt (lưu / xác nhận / dịch lại), ghi đè dữ liệu gốc, câu ví dụ, báo cáo đang mở
// (Áp dụng đề xuất / Đã sửa tay / Từ chối), lịch sử + hoàn tác, bình luận. Mọi thao tác ghi đều có audit + lịch sử ở backend.
export const DictEntryEditor: React.FC<{ entryKey: DictKey; onClose: () => void; onChanged?: () => void }> = ({ entryKey, onClose, onChanged }) => {
  const dialog = useDialog();
  const [key, setKey] = useState(entryKey);
  const [loaded, setLoaded] = useState<{ key: DictKey; entry?: DictAdminEntry; error?: string } | null>(null);
  const entry = loaded && loaded.key === key ? (loaded.entry ?? null) : null;
  const error = loaded && loaded.key === key ? (loaded.error ?? null) : null;
  const setEntry = (e: DictAdminEntry) => setLoaded({ key: e.key, entry: e });
  const [meaning, setMeaning] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    fetchDictAdminEntry(key)
      .then((e) => {
        if (!alive) return;
        setLoaded({ key, entry: e });
        setMeaning(e.admin.meaningVi ?? "");
      })
      .catch((e) => alive && setLoaded({ key, error: extractErrorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [key]);

  const act = (name: string, task: () => Promise<DictAdminEntry | void>, ok?: string) =>
    runOnce(inFlight.current, name, async () => {
      try {
        const r = await task();
        if (r && "admin" in r) {
          if (r.key === key) {
            setEntry(r);
            setMeaning(r.admin.meaningVi ?? "");
          }
        } else {
          const fresh = await fetchDictAdminEntry(key);
          setEntry(fresh);
          setMeaning(fresh.admin.meaningVi ?? "");
        }
        setFlash(ok ?? "Đã lưu.");
        onChanged?.();
      } catch (e) {
        void dialog.alert({ title: "Không thực hiện được", message: extractErrorMessage(e), tone: "error" });
      }
    });

  const override = (target: DictKey, field: DictOverrideField, value: string | null, subKey = "") =>
    act(`ov:${target}:${field}:${subKey}`, async () => {
      const r = await putDictOverride(target, { field, subKey, value });
      return target === key ? r : undefined;
    });

  const [notePrompt, setNotePrompt] = useState<{ title: string; resolve: (v: string | null) => void } | null>(null);
  const askNote = (title: string, _required: boolean): Promise<string | null> =>
    new Promise((resolve) => setNotePrompt({ title, resolve }));

  const head = entry ? headOf(entry) : null;
  const kanji = isKanjiKey(key);
  const ovs = entry?.admin.overrides ?? [];
  const hasOv = (k: DictKey, field: string, sub = "") => ovs.some((o) => o.entryKey === k && o.field === field && o.subKey === sub);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="3xl"
      icon="edit_note"
      title={head ? `Sửa: ${head.main}${head.reading ? ` 【${head.reading}】` : ""}` : "Đang tải…"}
      subtitle={<span className="font-mono text-xs">{key}</span>}
      footer={<Button variant="ghost" onClick={onClose}>Đóng</Button>}
    >
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      {flash && (
        <p role="status" className="mb-2 text-xs text-secondary">
          {flash} <button type="button" className="underline" onClick={() => setFlash(null)}>Ẩn</button>
        </p>
      )}
      {entry && (
        <div className="flex flex-col gap-4 text-body-sm">
          {entry.missing && <p className="text-xs text-error">ai-service không có dữ liệu gốc của mục này (có thể chưa dựng lại JMdict).</p>}

          <section className={box} aria-label="Nghĩa tiếng Việt">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Nghĩa tiếng Việt</h3>
              {entry.admin.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${entry.admin.status === "VERIFIED" ? "bg-secondary/10 text-secondary" : "bg-warning/10 text-on-surface"}`}>
                  {entry.admin.status === "VERIFIED" ? "Đã kiểm" : "Chưa kiểm"} · {SOURCE_LABELS[entry.admin.source ?? ""] ?? entry.admin.source}
                  {entry.admin.model ? ` · ${entry.admin.model}` : ""}
                </span>
              )}
            </div>
            <textarea value={meaning} onChange={(e) => setMeaning(e.target.value)} rows={2} maxLength={1000} className={input} aria-label="Nghĩa tiếng Việt" />
            <p className="text-xs text-on-surface-variant">
              Gợi ý tiếng Anh: <span lang="en">{kanji ? entry.meaningEn : entry.glossShort}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!meaning.trim() || meaning.trim() === (entry.admin.meaningVi ?? "")} onClick={() => void act("meaning", () => setDictMeaning(key, meaning.trim()))}>
                Lưu (đánh dấu đã kiểm)
              </Button>
              {entry.admin.status === "MACHINE" && (
                <Button size="sm" variant="secondary" onClick={() => void act("verify", () => verifyDictMeaning(key), "Đã xác nhận nghĩa đúng.")}>
                  Xác nhận đúng
                </Button>
              )}
              {entry.admin.status !== "VERIFIED" && !key.startsWith("w:jlpt:") && (
                <Button size="sm" variant="outline" onClick={() => void act("retranslate", () => retranslateDictEntry(key), "Đã dịch lại bằng AI.")}>
                  Dịch lại bằng AI
                </Button>
              )}
            </div>
          </section>

          <section className={box} aria-label="Dữ liệu gốc">
            <h3 className="font-semibold">Dữ liệu gốc (ghi đè có hiệu lực toàn hệ thống)</h3>
            {!kanji ? (
              <>
                <OverrideField label="Cách đọc" lang="ja" original={(entry as { readingOriginal?: string }).readingOriginal ?? entry.headKana}
                  current={entry.reading} overridden={hasOv(key, "reading")} onSave={(v) => override(key, "reading", v)} />
                <OverrideField label="Nghĩa tiếng Anh (tóm tắt)" lang="en" original={(entry as { glossOriginal?: string }).glossOriginal}
                  current={entry.glossShort} overridden={hasOv(key, "meaning_en")} onSave={(v) => override(key, "meaning_en", v)} />
                {(entry.hanVietChars ?? []).map((c) => (
                  <OverrideField key={c.char} label={`Âm Hán-Việt của 「${c.char}」 (sửa cho mọi từ chứa chữ)`} current={c.reading}
                    overridden={hasOv(kanjiKey(c.char), "han_viet")} onSave={(v) => override(kanjiKey(c.char), "han_viet", v)} />
                ))}
              </>
            ) : (
              <>
                <OverrideField label="Âm Hán-Việt" current={entry.hanViet} overridden={hasOv(key, "han_viet")} onSave={(v) => override(key, "han_viet", v)} />
                <OverrideField label="Nghĩa tiếng Anh của chữ" lang="en" current={entry.meaningEn} overridden={hasOv(key, "kanji_meaning")}
                  onSave={(v) => override(key, "kanji_meaning", v)} />
              </>
            )}
          </section>

          {(entry.examples?.length ?? 0) > 0 && (
            <section className={box} aria-label="Câu ví dụ">
              <h3 className="font-semibold">Câu ví dụ</h3>
              <ul className="flex flex-col gap-3">
                {entry.examples!.map((x) => (
                  <li key={x.id} className={`flex flex-col gap-1.5 ${x.hidden ? "opacity-60" : ""}`}>
                    <OverrideField label={`#${x.id} — Nhật`} lang="ja" current={x.jpn} overridden={hasOv(key, "example_jpn", x.id)}
                      onSave={(v) => override(key, "example_jpn", v, x.id)} />
                    <p className="text-xs text-on-surface-variant" lang="en">{x.eng}</p>
                    <OverrideField label="Bản dịch tiếng Việt" current={x.vi} overridden={!!x.vi}
                      onSave={(v) => act(`exvi:${x.id}`, () => setDictExampleVi(key, x.id, v))} />
                    <label className="inline-flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={!!x.hidden} onChange={(e) => void override(key, "example_hidden", e.target.checked ? "true" : null, x.id)} />
                      Ẩn câu này với người học
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={box} aria-label="Báo cáo đang mở">
            <h3 className="font-semibold">Báo cáo đang mở ({entry.admin.openReports.length})</h3>
            {entry.admin.openReports.length === 0 && <p className="text-xs text-on-surface-variant">Không có.</p>}
            <ul className="flex flex-col gap-2">
              {entry.admin.openReports.map((r) => (
                <li key={r.id} className="rounded-lg bg-surface-container-low p-2.5 flex flex-col gap-1">
                  <p className="text-xs text-on-surface-variant">
                    #{r.id} · {r.kind === "COMMENT" ? "Bình luận" : FIELD_LABELS[r.field ?? ""] ?? r.field}{r.subKey ? ` · ${r.subKey}` : ""} · {r.reporterEmail} · {time(r.createdAt)}
                  </p>
                  {r.kind === "ENTRY" ? (
                    <p>
                      <span className="text-on-surface-variant line-through">{r.currentValue || "(trống)"}</span> → <strong>{r.proposedValue || "(không đề xuất)"}</strong>
                    </p>
                  ) : (
                    <p className="whitespace-pre-line">{r.commentContent}</p>
                  )}
                  {r.note && <p className="text-xs">Ghi chú: {r.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {r.kind === "ENTRY" && r.proposedValue && r.field !== "other" && (
                      <Button size="sm" onClick={() => void act(`apply:${r.id}`, () => applyDictReport(r.id), "Đã áp dụng đề xuất.")}>Áp dụng đề xuất</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void act(`resolve:${r.id}`, async () => { await resolveDictReport(r.id); }, "Đã đánh dấu đã xử lý.")}>
                      {r.kind === "COMMENT" ? "Ẩn bình luận" : "Đã sửa tay"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const note = await askNote("Lý do từ chối", true);
                      if (note) void act(`dismiss:${r.id}`, async () => { await dismissDictReport(r.id, note); }, "Đã từ chối báo cáo.");
                    }}>Từ chối</Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={box} aria-label="Lịch sử sửa">
            <h3 className="font-semibold">Lịch sử sửa</h3>
            {entry.admin.history.length === 0 && <p className="text-xs text-on-surface-variant">Chưa có lần sửa nào.</p>}
            <ul className="flex flex-col gap-1.5">
              {entry.admin.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    <strong>{FIELD_LABELS[h.field] ?? h.field}</strong>{h.subKey ? ` (${h.subKey})` : ""}: <span className="line-through text-on-surface-variant">{h.oldValue ?? "∅"}</span> → {h.newValue ?? "∅"}
                    <span className="block text-on-surface-variant">{h.actorEmail} · {time(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</span>
                  </span>
                  {h.field !== "meaning_vi_verify" && (
                    <Button size="sm" variant="ghost" onClick={() => void act(`revert:${h.id}`, async () => {
                      const r = await revertDictHistory(h.id);
                      if (r.key !== key) setKey(r.key);
                      return r;
                    }, "Đã hoàn tác.")}>Hoàn tác</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className={box} aria-label="Bình luận">
            <h3 className="font-semibold">Bình luận mới ({entry.admin.comments.length})</h3>
            <ul className="flex flex-col gap-1.5">
              {entry.admin.comments.map((c) => (
                <li key={c.id} className={`text-xs rounded-lg p-2 ${c.hidden ? "bg-error/5" : "bg-surface-container-low"}`}>
                  <p className="text-on-surface-variant">{c.displayName} ({c.email}) · {time(c.createdAt)}{c.hidden ? ` · đã ẩn: ${c.hiddenNote ?? ""}` : ""}</p>
                  <p className="whitespace-pre-line text-body-sm">{c.content}</p>
                  <div className="flex gap-2 mt-1">
                    {c.hidden ? (
                      <button type="button" className="text-primary hover:underline" onClick={() => void act(`unhide:${c.id}`, async () => { await unhideDictComment(c.id); })}>Hiện lại</button>
                    ) : (
                      <button type="button" className="text-primary hover:underline" onClick={async () => {
                        const note = await askNote("Lý do ẩn bình luận", true);
                        if (note) void act(`hide:${c.id}`, async () => { await hideDictComment(c.id, note); });
                      }}>Ẩn</button>
                    )}
                    <button type="button" className="text-error hover:underline" onClick={async () => {
                      const ok = await dialog.confirm({ title: "Xoá bình luận?", message: c.content, confirmLabel: "Xoá", tone: "danger" });
                      if (ok) void act(`delc:${c.id}`, async () => { await deleteDictCommentAdmin(c.id); });
                    }}>Xoá</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {notePrompt && (
        <NotePromptModal
          title={notePrompt.title}
          onDone={(v) => {
            notePrompt.resolve(v);
            setNotePrompt(null);
          }}
        />
      )}
    </Modal>
  );
};

/** Hộp nhập ghi chú bắt buộc (lý do từ chối / ẩn) — không dùng window.prompt của trình duyệt. */
const NotePromptModal: React.FC<{ title: string; onDone: (v: string | null) => void }> = ({ title, onDone }) => {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      isOpen
      onClose={() => onDone(null)}
      title={title}
      icon="edit"
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>Huỷ</Button>
          <Button onClick={() => (v.trim() ? onDone(v.trim()) : setErr("Hãy nhập lý do."))}>Xác nhận</Button>
        </>
      }
    >
      <textarea autoFocus value={v} maxLength={300} rows={3} onChange={(e) => setV(e.target.value)} className={input} aria-label={title} />
      {err && <p role="alert" className="text-xs text-error mt-1">{err}</p>}
    </Modal>
  );
};
