import React, { useState } from "react";
import { MODERATION_STATUS_LABELS } from "@/lib/moderation";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { Pager } from "@/features/admin/components/Pager";
import { DictEntryEditor } from "@/features/admin/components/DictEntryEditor";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { headOf } from "@/features/dictionary/dictUtils";
import {
  fetchDictAdminComments,
  fetchDictHistoryAdmin,
  fetchDictQueue,
  fetchDictStats,
  searchDictAdmin,
  syncDictToAi,
  type DictQueueFilter,
} from "@/services/adminDictionaryService";
import { extractErrorMessage } from "@/services/apiClient";
import type { DictKey, DictQueueGroup } from "@/types/dictionary.types";

const PAGE_SIZE = 20;
type Tab = "queue" | "search" | "comments" | "history";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "queue", label: "Hàng chờ", icon: "pending_actions" },
  { key: "search", label: "Tìm & sửa", icon: "search" },
  { key: "comments", label: "Bình luận", icon: "forum" },
  { key: "history", label: "Lịch sử", icon: "history" },
];
const GROUP_LABELS: Record<DictQueueGroup, { label: string; cls: string }> = {
  reported: { label: "Bị báo cáo", cls: "bg-error/10 text-error" },
  en_only: { label: "Chỉ có nghĩa Anh", cls: "bg-warning/10 text-on-surface" },
  machine: { label: "Nghĩa máy chưa kiểm", cls: "bg-primary/10 text-primary" },
  verified: { label: "Đã kiểm", cls: "bg-secondary/10 text-secondary" },
};
const FILTERS: { key: DictQueueFilter; label: string }[] = [
  { key: "pending", label: "Cần kiểm (mặc định)" },
  { key: "reported", label: "Bị báo cáo" },
  { key: "en_only", label: "Chỉ có nghĩa Anh" },
  { key: "machine", label: "Nghĩa máy chưa kiểm" },
  { key: "verified", label: "Đã kiểm" },
  { key: "all", label: "Tất cả" },
];
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "");
const select = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-sm";

// Quản lý từ điển gốc (D16, D21): hàng chờ xếp mục bị báo cáo → chỉ có nghĩa Anh → nghĩa máy chưa kiểm; tìm & sửa mọi mục; bình
// luận; lịch sử sửa. Mở một mục = ngăn sửa (DictEntryEditor).
export const AdminDictionaryPage: React.FC = () => {
  const q = useAdminQuery({ tab: "queue", group: "pending" });
  const tab = (TABS.some((t) => t.key === q.get("tab")) ? q.get("tab") : "queue") as Tab;
  const [open, setOpen] = useState<DictKey | null>(null);
  const [reload, setReload] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const stats = useAsync(fetchDictStats, [reload]);

  const sync = async () => {
    try {
      const r = await syncDictToAi();
      setSyncMsg(r.ok ? `Đã đồng bộ ai-service (phiên bản ${r.backendVersion}).` : "Chưa đồng bộ được ai-service (ai-service tắt hoặc lỗi).");
    } catch (e) {
      setSyncMsg(extractErrorMessage(e));
    }
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Từ điển"
        description="Kiểm và sửa từ điển gốc: nghĩa tiếng Việt, cách đọc, âm Hán-Việt, câu ví dụ. Bản sửa có hiệu lực cho mọi người và cho cả bóc tách tài liệu."
        actions={<Button variant="outline" size="sm" onClick={() => void sync()}>Đồng bộ ai-service</Button>}
      />
      {syncMsg && <p role="status" className="text-xs text-on-surface-variant">{syncMsg}</p>}
      {stats.data && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
          {[
            ["Có nghĩa Việt", stats.data.entriesVi],
            ["Đã kiểm", stats.data.verified],
            ["Chưa kiểm", stats.data.machine],
            ["Báo cáo mở", stats.data.openReports],
            ["Lượt tra 7 ngày", stats.data.lookups7d],
            ["Bình luận 7 ngày", stats.data.comments7d],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-xl bg-surface-container-low p-2.5">
              <dt className="text-xs text-on-surface-variant">{label}</dt>
              <dd className="font-bold text-title-md">{(n as number).toLocaleString("vi-VN")}</dd>
            </div>
          ))}
        </dl>
      )}

      <nav aria-label="Mục quản lý từ điển" className="flex flex-wrap gap-1.5 p-1 bg-surface-container-low rounded-xl w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/admin/dictionary?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold ${tab === t.key ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:bg-surface-container"}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "queue" && <QueueTab q={q} reload={reload} onOpen={setOpen} />}
      {tab === "search" && <SearchTab onOpen={setOpen} />}
      {tab === "comments" && <CommentsTab q={q} reload={reload} onOpen={setOpen} />}
      {tab === "history" && <HistoryTab q={q} reload={reload} onOpen={setOpen} />}

      {open && <DictEntryEditor entryKey={open} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} />}
    </section>
  );
};

type Q = ReturnType<typeof useAdminQuery>;

const QueueTab: React.FC<{ q: Q; reload: number; onOpen: (k: DictKey) => void }> = ({ q, reload, onOpen }) => {
  const group = (FILTERS.some((f) => f.key === q.get("group")) ? q.get("group") : "pending") as DictQueueFilter;
  const [search, setSearch] = useState(q.get("q"));
  const { data, loading, error } = useAsync(
    () => fetchDictQueue({ group, level: q.get("level"), kind: q.get("kind") as "word" | "kanji" | "", q: q.get("q"), page: q.page, size: PAGE_SIZE }),
    [q.key],
    reload
  );
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: search.trim() || undefined });
        }}
      >
        <label className="flex flex-col gap-1 text-xs">Nhóm
          <select className={select} value={group} onChange={(e) => q.set({ group: e.target.value })}>
            {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">Cấp
          <select className={select} value={q.get("level")} onChange={(e) => q.set({ level: e.target.value || undefined })}>
            <option value="">Mọi cấp</option>
            {["N5", "N4", "N3", "N2", "N1"].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">Loại
          <select className={select} value={q.get("kind")} onChange={(e) => q.set({ kind: e.target.value || undefined })}>
            <option value="">Từ + chữ Hán</option>
            <option value="word">Từ vựng</option>
            <option value="kanji">Chữ Hán</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs grow min-w-40">Tìm (từ, cách đọc, nghĩa, khoá)
          <input className={select} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Button type="submit" size="sm">Lọc</Button>
      </form>
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      {loading && !data && <p className="text-body-sm text-on-surface-variant">Đang tải…</p>}
      {data && data.items.length === 0 && <p className="text-body-sm text-on-surface-variant">Không có mục nào.</p>}
      <ul className="flex flex-col gap-1.5">
        {(data?.items ?? []).map((r) => {
          const head = headOf({ key: r.entryKey, headKanji: r.headKanji ?? r.term, headKana: r.headKana ?? r.reading, reading: r.headKana ?? r.reading });
          const g = GROUP_LABELS[r.group];
          return (
            <li key={r.entryKey}>
              <button type="button" onClick={() => onOpen(r.entryKey)} className="w-full text-left rounded-xl border border-surface-container-high bg-surface-container-lowest hover:border-primary p-3 flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span lang="ja" className="font-semibold">{head.main}</span>
                  {head.reading && <span lang="ja" className="text-on-surface-variant text-body-sm">{head.reading}</span>}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${g.cls}`}>{g.label}</span>
                  {r.openReports > 0 && <span className="text-[11px] text-error font-semibold">{r.openReports} báo cáo</span>}
                  {r.level && <span className="text-[11px] text-primary font-semibold">{r.level}</span>}
                  {r.lookups30d > 0 && <span className="text-[11px] text-on-surface-variant">{r.lookups30d} lượt tra / 30 ngày</span>}
                </span>
                <span className="text-body-sm text-on-surface">{r.meaningVi ?? <span className="text-on-surface-variant italic" lang="en">{r.glossShort ?? "(chưa có nghĩa)"}</span>}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {data && <Pager page={q.page} size={PAGE_SIZE} total={data.total} onPage={q.setPage} />}
    </div>
  );
};

const SearchTab: React.FC<{ onOpen: (k: DictKey) => void }> = ({ onOpen }) => {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading } = useAsync(() => (query ? searchDictAdmin(query) : Promise.resolve(null)), [query]);
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
        <input className={`${select} grow`} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Từ, kana, nghĩa Việt / Anh, hoặc k:食 / w:1358280" aria-label="Tìm mục từ điển" />
        <Button type="submit" size="sm">Tìm</Button>
      </form>
      {/^(w:|k:)/.test(input.trim()) && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => onOpen(input.trim())}>Mở khoá {input.trim()}</Button>
      )}
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      {loading && query && <p className="text-body-sm text-on-surface-variant">Đang tìm…</p>}
      <ul className="flex flex-col gap-1">
        {(data?.items ?? []).map((it) => {
          const head = headOf(it);
          return (
            <li key={it.key}>
              <button type="button" onClick={() => onOpen(it.key)} className="w-full text-left rounded-lg hover:bg-surface-container px-3 py-2">
                <span lang="ja" className="font-semibold">{head.main}</span> {head.reading && <span lang="ja" className="text-on-surface-variant">{head.reading}</span>}
                <span className="block text-xs text-on-surface-variant">{it.meaningVi ?? it.glossShort}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const CommentsTab: React.FC<{ q: Q; reload: number; onOpen: (k: DictKey) => void }> = ({ q, reload, onOpen }) => {
  const hidden = q.get("hidden");
  const { data, error } = useAsync(
    () => fetchDictAdminComments({ q: q.get("q") || undefined, hidden: hidden === "" ? undefined : hidden === "true", page: q.page, size: PAGE_SIZE }),
    [q.key],
    reload
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <select className={select} value={hidden} onChange={(e) => q.set({ hidden: e.target.value || undefined })} aria-label="Trạng thái">
          <option value="">Mọi bình luận</option>
          <option value="false">Đang hiện</option>
          <option value="true">Đã ẩn</option>
        </select>
      </div>
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      <ul className="flex flex-col gap-1.5">
        {(data?.items ?? []).map((c) => (
          <li key={c.id} className={`rounded-xl border p-3 text-body-sm ${c.hidden ? "border-error/40" : "border-surface-container-high"}`}>
            <p className="text-xs text-on-surface-variant">{c.displayName} ({c.email}) · {time(c.createdAt)} · 👍 {c.helpfulCount}{c.hidden ? ` · đã ẩn: ${c.hiddenNote ?? ""}` : ""}{c.modStatus && c.modStatus !== "CLEAN" && c.modStatus !== "REVIEWED" ? ` · AI: ${MODERATION_STATUS_LABELS[c.modStatus]}${c.modSpans?.length ? ` (${c.modSpans.join(", ")})` : ""}` : ""}</p>
            <p className="whitespace-pre-line">{c.content}</p>
            <button type="button" onClick={() => onOpen(c.entryKey)} className="text-xs text-primary hover:underline">Mở mục {c.entryKey}</button>
          </li>
        ))}
      </ul>
      {data && <Pager page={q.page} size={PAGE_SIZE} total={data.total} onPage={q.setPage} />}
    </div>
  );
};

const HistoryTab: React.FC<{ q: Q; reload: number; onOpen: (k: DictKey) => void }> = ({ q, reload, onOpen }) => {
  const { data, error } = useAsync(() => fetchDictHistoryAdmin({ field: q.get("field") || undefined, page: q.page, size: 30 }), [q.key], reload);
  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-error text-body-sm">{error}</p>}
      <ul className="flex flex-col gap-1.5">
        {(data?.items ?? []).map((h) => (
          <li key={h.id} className="rounded-xl border border-surface-container-high p-3 text-xs">
            <p><strong>{h.field}</strong>{h.subKey ? ` (${h.subKey})` : ""}: <span className="line-through text-on-surface-variant">{h.oldValue ?? "∅"}</span> → {h.newValue ?? "∅"}</p>
            <p className="text-on-surface-variant">{h.actorEmail} · {time(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</p>
            <button type="button" onClick={() => onOpen(h.entryKey)} className="text-primary hover:underline">Mở {h.entryKey}</button>
          </li>
        ))}
      </ul>
      {data && <Pager page={q.page} size={30} total={data.total} onPage={q.setPage} />}
    </div>
  );
};

export default AdminDictionaryPage;
