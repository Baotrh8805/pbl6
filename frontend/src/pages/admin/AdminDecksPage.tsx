import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import {
  clearRatingComment,
  deleteAdminExtraction,
  fetchAdminDecks,
  fetchAdminExtractions,
  fetchAdminRatings,
} from "@/services/adminService";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { formatShort } from "@/features/admin/adminUtils";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { SOURCE_TYPE_LABELS, isActiveStatus } from "@/features/extraction/extractionUtils";

const PAGE_SIZE = 20;
const SELECT = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm";
const TABS = [
  { key: "decks", label: "Bộ thẻ" },
  { key: "ratings", label: "Bình luận" },
  { key: "extractions", label: "Bóc tách AI" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const DecksTab: React.FC<{ q: ReturnType<typeof useAdminQuery> }> = ({ q }) => {
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(
    () =>
      fetchAdminDecks({
        q: q.get("q"),
        visibility: q.get("visibility"),
        official: q.get("official"),
        featured: q.get("featured"),
        ownerId: q.get("ownerId"),
        page: q.page,
        size: PAGE_SIZE,
      }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Tiêu đề
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} className={`${SELECT} w-56`} />
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Hiển thị
          <select value={q.get("visibility")} onChange={(e) => q.set({ visibility: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Official
          <select value={q.get("official")} onChange={(e) => q.set({ official: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            <option value="true">Có</option>
            <option value="false">Không</option>
          </select>
        </label>
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Featured
          <select value={q.get("featured")} onChange={(e) => q.set({ featured: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            <option value="true">Có</option>
            <option value="false">Không</option>
          </select>
        </label>
        {q.get("ownerId") && (
          <span className="text-body-sm text-on-surface-variant">
            Chủ #{q.get("ownerId")}{" "}
            <button type="button" className="underline cursor-pointer" onClick={() => q.set({ ownerId: undefined })}>
              bỏ lọc
            </button>
          </span>
        )}
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </form>
      <AdminTableShell
        caption="Danh sách bộ thẻ"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có bộ thẻ nào khớp bộ lọc."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} bộ thẻ` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Tiêu đề · chủ</th>
            <th scope="col">Hiển thị</th>
            <th scope="col">Cờ</th>
            <th scope="col">Thẻ</th>
            <th scope="col">★</th>
            <th scope="col">Báo cáo</th>
            <th scope="col">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>
                <div className="font-semibold text-on-surface">{d.title}</div>
                <div className="text-on-surface-variant">
                  {d.level} · {d.ownerEmail}
                </div>
              </td>
              <td>{d.visibility}</td>
              <td className="text-on-surface-variant">
                {[d.official && "Official", d.featured && "Featured"].filter(Boolean).join(" · ") || "—"}
              </td>
              <td>{d.cardCount}</td>
              <td>{d.avgStars === null ? "—" : d.avgStars.toFixed(1)}</td>
              <td className={d.openReports > 0 ? "font-bold text-error" : ""}>
                {d.openReports > 0 ? `${d.openReports} ⚠` : 0}
              </td>
              <td>
                <Link to={`/admin/decks/${encodeURIComponent(d.id)}`} className="font-semibold text-primary underline">
                  Xem
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </>
  );
};

const RatingsTab: React.FC<{ q: ReturnType<typeof useAdminQuery>; canAct: boolean }> = ({ q, canAct }) => {
  const dialog = useDialog();
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(
    () => fetchAdminRatings({ q: q.get("q"), deckId: q.get("deckId"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Nội dung bình luận
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} className={`${SELECT} w-64`} />
        </label>
        {q.get("deckId") && (
          <span className="text-body-sm text-on-surface-variant">
            Bộ thẻ {q.get("deckId")}{" "}
            <button type="button" className="underline cursor-pointer" onClick={() => q.set({ deckId: undefined })}>
              bỏ lọc
            </button>
          </span>
        )}
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </form>
      <AdminTableShell
        caption="Bình luận đánh giá"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có bình luận nào."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} bình luận` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Bộ thẻ</th>
            <th scope="col">Người</th>
            <th scope="col">★</th>
            <th scope="col">Bình luận</th>
            <th scope="col">Ngày</th>
            {canAct && (
              <th scope="col">
                <span className="sr-only">Thao tác</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`/admin/decks/${encodeURIComponent(r.deckId)}`} className="font-semibold text-primary underline">
                  {r.deckTitle}
                </Link>
              </td>
              <td>{r.userEmail}</td>
              <td>{r.stars}</td>
              <td className="max-w-md break-words">{r.comment}</td>
              <td className="whitespace-nowrap text-on-surface-variant">{formatShort(r.updatedAt)}</td>
              {canAct && (
                <td>
                  <button
                    type="button"
                    className="font-semibold text-error underline cursor-pointer"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Xoá bình luận?",
                        message: `Bình luận của ${r.userEmail} bị xoá, số sao giữ nguyên.`,
                        confirmLabel: "Xoá",
                        tone: "danger",
                        action: () => clearRatingComment(r.id),
                      });
                      if (ok) setRetry((n) => n + 1);
                    }}
                  >
                    Xoá bình luận
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </>
  );
};

const ExtractionsTab: React.FC<{ q: ReturnType<typeof useAdminQuery>; canAct: boolean }> = ({ q, canAct }) => {
  const dialog = useDialog();
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(
    () => fetchAdminExtractions({ status: q.get("status"), userId: q.get("userId"), page: q.page, size: PAGE_SIZE }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-label-sm text-outline font-semibold">
          Trạng thái
          <select value={q.get("status")} onChange={(e) => q.set({ status: e.target.value })} className={SELECT}>
            <option value="">Tất cả</option>
            {["QUEUED", "RUNNING", "DONE", "FAILED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {q.get("userId") && (
          <span className="text-body-sm text-on-surface-variant">
            Người dùng #{q.get("userId")}{" "}
            <button type="button" className="underline cursor-pointer" onClick={() => q.set({ userId: undefined })}>
              bỏ lọc
            </button>
          </span>
        )}
      </div>
      <AdminTableShell
        caption="Lượt bóc tách"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có lượt bóc tách nào."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} lượt` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Người</th>
            <th scope="col">Nguồn</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Lỗi</th>
            <th scope="col">Tạo</th>
            <th scope="col">Xong</th>
            {canAct && (
              <th scope="col">
                <span className="sr-only">Thao tác</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, userEmail, purpose }) => (
            <tr key={job.id}>
              <td>{userEmail}</td>
              <td>
                <div>{SOURCE_TYPE_LABELS[job.sourceType]}</div>
                <div className="text-on-surface-variant truncate max-w-[14rem]">{job.sourceName || "Văn bản dán"}</div>
                {purpose === "learning_path" && <div className="text-label-sm text-outline">lộ trình học</div>}
              </td>
              <td>
                <ExtractionStatusBadge status={job.status} /> <span className="text-label-sm text-outline">{job.stage}</span>
              </td>
              <td className="max-w-xs text-error break-words">{job.errorMessage ?? ""}</td>
              <td className="whitespace-nowrap text-on-surface-variant">{formatShort(job.createdAt)}</td>
              <td className="whitespace-nowrap text-on-surface-variant">{formatShort(job.finishedAt)}</td>
              {canAct && (
                <td>
                  {!isActiveStatus(job.status) && purpose !== "learning_path" && (
                    <button
                      type="button"
                      className="font-semibold text-error underline cursor-pointer"
                      onClick={async () => {
                        const ok = await dialog.confirm({
                          title: "Xoá lượt bóc tách?",
                          message: "Kết quả bóc tách bị xoá; bộ thẻ đã tạo từ nó vẫn giữ nguyên.",
                          confirmLabel: "Xoá",
                          tone: "danger",
                          action: () => deleteAdminExtraction(job.id),
                        });
                        if (ok) setRetry((n) => n + 1);
                      }}
                    >
                      Xoá
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </>
  );
};

export const AdminDecksPage: React.FC = () => {
  const q = useAdminQuery({ tab: "decks" });
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const tab = (TABS.some((t) => t.key === q.get("tab")) ? q.get("tab") : "decks") as Tab;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Nội dung</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Bộ thẻ, bình luận đánh giá và lượt bóc tách của mọi người dùng.</p>
      </div>
      <nav className="flex gap-1 border-b border-surface-container-high" aria-label="Loại nội dung">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/admin/decks?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`px-3 py-2 text-body-sm font-semibold border-b-2 -mb-px ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "decks" && <DecksTab q={q} />}
      {tab === "ratings" && <RatingsTab q={q} canAct={canAct} />}
      {tab === "extractions" && <ExtractionsTab q={q} canAct={canAct} />}
    </section>
  );
};

export default AdminDecksPage;
