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
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import { formatShort } from "@/features/admin/adminUtils";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { SOURCE_TYPE_LABELS, isActiveStatus } from "@/features/extraction/extractionUtils";

const PAGE_SIZE = 20;

const TABS = [
  { key: "decks", label: "Bộ thẻ học", icon: "style" },
  { key: "ratings", label: "Đánh giá & Bình luận", icon: "reviews" },
  { key: "extractions", label: "Tác vụ bóc tách AI", icon: "psychology" },
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

  const curVis = q.get("visibility");
  const curOff = q.get("official");
  const curFeat = q.get("featured");

  return (
    <>
      {/* Quick filter pills */}
      <div className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit flex-wrap">
        <button
          type="button"
          onClick={() => q.set({ visibility: undefined, official: undefined, featured: undefined })}
          className={`px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            !curVis && !curOff && !curFeat
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Tất cả bộ thẻ
        </button>
        <button
          type="button"
          onClick={() => q.set({ visibility: "public", official: undefined, featured: undefined })}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            curVis === "public"
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">public</span>
          <span>Công khai (Public)</span>
        </button>
        <button
          type="button"
          onClick={() => q.set({ official: "true", visibility: undefined, featured: undefined })}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            curOff === "true"
              ? "bg-surface-container-lowest text-secondary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified</span>
          <span>Official (Chính thức)</span>
        </button>
        <button
          type="button"
          onClick={() => q.set({ featured: "true", visibility: undefined, official: undefined })}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
            curFeat === "true"
              ? "bg-surface-container-lowest text-amber-600 shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">grade</span>
          <span>Featured (Nổi bật)</span>
        </button>
      </div>

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Tên bộ thẻ
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-60`}
            placeholder="Tìm theo tiêu đề..."
          />
        </label>
        <label className={adminLabelClass}>
          Chế độ hiển thị
          <select
            value={q.get("visibility")}
            onChange={(e) => q.set({ visibility: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả</option>
            <option value="public">Công khai (Public)</option>
            <option value="private">Riêng tư (Private)</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          Gắn cờ Official
          <select
            value={q.get("official")}
            onChange={(e) => q.set({ official: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả</option>
            <option value="true">Có gắn cờ</option>
            <option value="false">Không</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          Gắn cờ Featured
          <select
            value={q.get("featured")}
            onChange={(e) => q.set({ featured: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả</option>
            <option value="true">Có gắn cờ</option>
            <option value="false">Không</option>
          </select>
        </label>
        {q.get("ownerId") && (
          <span className="text-body-sm text-on-surface-variant flex items-center gap-1 bg-surface-container px-2.5 py-1.5 rounded-lg border border-surface-container-high">
            <span>Chủ #{q.get("ownerId")}</span>
            <button
              type="button"
              className="underline cursor-pointer text-primary font-semibold ml-1"
              onClick={() => q.set({ ownerId: undefined })}
            >
              bỏ lọc
            </button>
          </span>
        )}
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </AdminFilterBar>

      <AdminTableShell
        caption="Danh sách bộ thẻ"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có bộ thẻ nào khớp với tiêu chí tìm kiếm."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} bộ thẻ học` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Bộ thẻ & Tác giả</th>
            <th scope="col">Hiển thị</th>
            <th scope="col">Cờ chứng thực</th>
            <th scope="col">Quy mô</th>
            <th scope="col">Đánh giá & Tải</th>
            <th scope="col">Báo cáo</th>
            <th scope="col" className="w-24 text-right">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="hover:bg-surface-container-low/50 transition-colors">
              <td>
                <div className="font-semibold text-on-surface text-body-md">
                  <Link to={`/admin/decks/${encodeURIComponent(d.id)}`} className="hover:text-primary hover:underline">
                    {d.title}
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-0.5">
                  <span className="font-semibold px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant font-mono text-[11px]">
                    {d.level}
                  </span>
                  {d.category && (
                    <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[11px]">
                      {d.category}
                    </span>
                  )}
                  <span>· Chủ: </span>
                  <Link
                    to={`/admin/users/${d.ownerId}`}
                    className="text-primary hover:underline truncate max-w-[200px]"
                    title={`Xem tài khoản ${d.ownerEmail}`}
                  >
                    {d.ownerEmail}
                  </Link>
                </div>
              </td>
              <td>
                <AdminStatusBadge
                  label={d.visibility === "public" ? "Public" : "Private"}
                  tone={d.visibility === "public" ? "info" : "neutral"}
                />
              </td>
              <td>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {d.official && <AdminStatusBadge label="Official" tone="success" icon="verified" />}
                  {d.featured && <AdminStatusBadge label="Featured" tone="warn" icon="grade" />}
                  {!d.official && !d.featured && <span className="text-outline font-mono">—</span>}
                </div>
              </td>
              <td>
                <span className="font-mono font-bold text-body-sm">{d.cardCount}</span>
                <span className="text-outline text-label-sm ml-1">thẻ</span>
              </td>
              <td>
                <div className="flex items-center gap-1 font-mono text-body-sm font-semibold text-amber-600">
                  <span>★</span>
                  <span>{d.avgStars === null ? "—" : d.avgStars.toFixed(1)}</span>
                </div>
                <div className="text-[11px] text-outline font-mono">{d.downloads} lượt tải</div>
              </td>
              <td>
                {d.openReports > 0 ? (
                  <Link to={`/admin/reports?deckId=${encodeURIComponent(d.id)}`}>
                    <AdminStatusBadge label={`${d.openReports} mở`} tone="error" icon="flag" />
                  </Link>
                ) : (
                  <span className="text-outline font-mono">0</span>
                )}
              </td>
              <td className="text-right">
                <Link
                  to={`/admin/decks/${encodeURIComponent(d.id)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container hover:border-primary text-body-sm font-semibold text-primary transition-all"
                >
                  <span>Xem</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
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
      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Tìm nội dung bình luận
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-72`}
            placeholder="Nội dung cần kiểm tra..."
          />
        </label>
        {q.get("deckId") && (
          <span className="text-body-sm text-on-surface-variant flex items-center gap-1 bg-surface-container px-2.5 py-1.5 rounded-lg border border-surface-container-high">
            <span>Bộ thẻ #{q.get("deckId")}</span>
            <button
              type="button"
              className="underline cursor-pointer text-primary font-semibold ml-1"
              onClick={() => q.set({ deckId: undefined })}
            >
              bỏ lọc
            </button>
          </span>
        )}
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </AdminFilterBar>

      <AdminTableShell
        caption="Bình luận đánh giá"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có bình luận đánh giá nào."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} bình luận` : undefined}
      >
        <thead>
          <tr>
            <th scope="col" className="w-48">Bộ thẻ</th>
            <th scope="col" className="w-48">Người đánh giá</th>
            <th scope="col" className="w-24">Số sao</th>
            <th scope="col">Bình luận của học viên</th>
            <th scope="col" className="w-36">Thời điểm</th>
            {canAct && (
              <th scope="col" className="w-24 text-right">
                <span className="sr-only">Thao tác</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-container-low/40 transition-colors">
              <td>
                <Link
                  to={`/admin/decks/${encodeURIComponent(r.deckId)}`}
                  className="font-semibold text-primary hover:underline line-clamp-2 text-body-sm"
                >
                  {r.deckTitle}
                </Link>
              </td>
              <td>
                <div className="font-semibold text-on-surface text-body-sm">{r.userEmail}</div>
                <div className="text-outline text-label-sm font-mono">ID #{r.userId}</div>
              </td>
              <td>
                <div className="flex items-center gap-0.5 text-amber-500 font-bold text-body-sm">
                  <span>★</span>
                  <span>{r.stars}</span>
                </div>
              </td>
              <td>
                <div className="max-w-xl break-words text-on-surface bg-surface-container-low/40 p-2.5 rounded-xl border border-surface-container-high/60 text-body-sm leading-relaxed">
                  “{r.comment}”
                </div>
              </td>
              <td className="whitespace-nowrap text-on-surface-variant text-label-sm">
                {formatShort(r.updatedAt)}
              </td>
              {canAct && (
                <td className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-error hover:bg-error/10 hover:text-error"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Xoá bình luận vi phạm?",
                        message: `Bình luận của ${r.userEmail} sẽ bị xoá vĩnh viễn, điểm đánh giá ${r.stars} sao vẫn giữ nguyên.`,
                        confirmLabel: "Xoá bình luận",
                        tone: "danger",
                        action: () => clearRatingComment(r.id),
                      });
                      if (ok) setRetry((n) => n + 1);
                    }}
                  >
                    Xoá
                  </Button>
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
      <AdminFilterBar onSubmit={(e) => e.preventDefault()}>
        <label className={adminLabelClass}>
          Trạng thái xử lý AI
          <select
            value={q.get("status")}
            onChange={(e) => q.set({ status: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả trạng thái</option>
            {["QUEUED", "RUNNING", "DONE", "FAILED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {q.get("userId") && (
          <span className="text-body-sm text-on-surface-variant flex items-center gap-1 bg-surface-container px-2.5 py-1.5 rounded-lg border border-surface-container-high">
            <span>Người dùng #{q.get("userId")}</span>
            <button
              type="button"
              className="underline cursor-pointer text-primary font-semibold ml-1"
              onClick={() => q.set({ userId: undefined })}
            >
              bỏ lọc
            </button>
          </span>
        )}
      </AdminFilterBar>

      <AdminTableShell
        caption="Lượt bóc tách"
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Không có tác vụ bóc tách AI nào."
        onRetry={() => setRetry((n) => n + 1)}
        statusText={data ? `${data.total.toLocaleString("vi-VN")} lượt bóc tách` : undefined}
      >
        <thead>
          <tr>
            <th scope="col">Học viên</th>
            <th scope="col">Nguồn tài liệu</th>
            <th scope="col">Tiến độ AI</th>
            <th scope="col">Thông tin lỗi</th>
            <th scope="col">Khởi tạo</th>
            <th scope="col">Hoàn tất</th>
            {canAct && (
              <th scope="col" className="text-right">
                <span className="sr-only">Thao tác</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, userEmail, purpose }) => (
            <tr key={job.id} className="hover:bg-surface-container-low/40 transition-colors">
              <td className="font-semibold text-on-surface">
                <div>{userEmail}</div>
                <div className="text-outline text-label-sm font-mono">ID #{job.id}</div>
              </td>
              <td>
                <div className="font-medium text-body-sm">{SOURCE_TYPE_LABELS[job.sourceType]}</div>
                <div className="text-on-surface-variant truncate max-w-[14rem] text-label-sm">{job.sourceName || "Văn bản dán"}</div>
                {purpose === "learning_path" && (
                  <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary-fixed text-on-primary-fixed-variant">
                    Lộ trình học
                  </span>
                )}
              </td>
              <td>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ExtractionStatusBadge status={job.status} />
                  <span className="text-label-sm text-outline font-mono">{job.stage}</span>
                </div>
              </td>
              <td className="max-w-xs text-error break-words text-label-sm">{job.errorMessage ?? ""}</td>
              <td className="whitespace-nowrap text-on-surface-variant text-label-sm">{formatShort(job.createdAt)}</td>
              <td className="whitespace-nowrap text-on-surface-variant text-label-sm">{formatShort(job.finishedAt)}</td>
              {canAct && (
                <td className="text-right">
                  {!isActiveStatus(job.status) && purpose !== "learning_path" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-error hover:bg-error/10 hover:text-error"
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
                    </Button>
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
      <AdminPageHeader
        title="Quản trị Nội dung"
        description="Kiểm duyệt kho bộ thẻ tiếng Nhật, bình luận đánh giá và quản lý tác vụ bóc tách AI."
      />

      <nav className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit" aria-label="Loại nội dung">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/admin/decks?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all ${
              tab === t.key
                ? "bg-surface-container-lowest text-primary shadow-xs"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{t.icon}</span>
            <span>{t.label}</span>
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
