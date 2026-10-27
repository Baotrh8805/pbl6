import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { createKnowledgeSource, fetchKnowledgeSources } from "@/services/adminService";
import { formatShort } from "@/features/admin/adminUtils";
import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  knowledgeKindLabel,
} from "@/features/admin/moderationUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { KnowledgeUploadModal } from "@/features/admin/components/KnowledgeUploadModal";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";

const PAGE_SIZE = 20;

export const AdminKnowledgePage: React.FC = () => {
  const q = useAdminQuery();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const [draft, setDraft] = useState(q.get("q"));
  const [retry, setRetry] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, loading, error } = useAsync(
    () =>
      fetchKnowledgeSources({
        kind: q.get("kind"),
        status: q.get("status"),
        q: q.get("q"),
        page: q.page,
        size: PAGE_SIZE,
      }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];
  const hasFilters = Boolean(q.get("q") || q.get("kind") || q.get("status"));

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Nguồn tri thức chuẩn"
        description="Tài liệu tham chiếu (từ vựng, ngữ pháp, chữ Hán) để AI đối chiếu và cảnh báo mâu thuẫn khi bóc tách."
        actions={
          canAct ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
              Tải nguồn mới
            </Button>
          ) : undefined
        }
      />

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draft.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Tìm tiêu đề / tên tệp
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-60`}
            placeholder="Minna, N5…"
          />
        </label>
        <label className={adminLabelClass}>
          Loại
          <select value={q.get("kind")} onChange={(e) => q.set({ kind: e.target.value })} className={adminFieldClass}>
            <option value="">Tất cả loại</option>
            {KNOWLEDGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KNOWLEDGE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass}>
          Trạng thái
          <select value={q.get("status")} onChange={(e) => q.set({ status: e.target.value })} className={adminFieldClass}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(KNOWLEDGE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Lọc kết quả
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft("");
                q.set({ q: undefined, kind: undefined, status: undefined });
              }}
            >
              Đặt lại
            </Button>
          )}
        </div>
      </AdminFilterBar>

      {(
        <AdminTableShell
          caption="Danh sách nguồn tri thức chuẩn"
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText={hasFilters ? "Không có nguồn nào khớp bộ lọc." : "Chưa có nguồn tri thức nào. Tải tài liệu chuẩn đầu tiên để AI đối chiếu."}
          onRetry={() => setRetry((n) => n + 1)}
          statusText={data ? `${data.total.toLocaleString("vi-VN")} nguồn tri thức` : undefined}
        >
          <thead>
            <tr>
              <th scope="col" className="min-w-[200px]">Tiêu đề</th>
              <th scope="col">Loại</th>
              <th scope="col">Cấp</th>
              <th scope="col">Phiên bản</th>
              <th scope="col" className="text-right">Số mục</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Người tải</th>
              <th scope="col" className="w-36">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.id} className="hover:bg-surface-container-low/40 transition-colors">
                <td>
                  <Link
                    to={`/admin/knowledge/${encodeURIComponent(k.id)}`}
                    className="font-semibold text-primary hover:underline line-clamp-2 break-words"
                  >
                    {k.title}
                  </Link>
                  {k.sourceName && (
                    <div className="text-label-sm text-outline truncate max-w-[260px]" title={k.sourceName}>
                      {k.sourceName}
                    </div>
                  )}
                </td>
                <td>
                  <AdminStatusBadge label={knowledgeKindLabel(k.kind)} tone="info" />
                </td>
                <td className="font-mono">{k.level ?? <span className="text-outline">—</span>}</td>
                <td className="font-mono">v{k.version}</td>
                <td className="text-right font-mono">{(k.entryCount ?? 0).toLocaleString("vi-VN")}</td>
                <td>
                  <AdminStatusBadge
                    label={KNOWLEDGE_STATUS_LABELS[k.status] ?? k.status}
                    tone={k.status === "ACTIVE" ? "success" : "neutral"}
                    icon={k.status === "ACTIVE" ? "check_circle" : "inventory_2"}
                  />
                </td>
                <td className="text-on-surface-variant break-all">{k.uploadedByEmail ?? "—"}</td>
                <td className="whitespace-nowrap text-label-sm text-on-surface-variant">{formatShort(k.updatedAt ?? k.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}

      <KnowledgeUploadModal
        key={uploadOpen ? "open" : "closed"}
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        mode="create"
        submit={createKnowledgeSource}
        onDone={(detail) => {
          if (detail?.id) navigate(`/admin/knowledge/${encodeURIComponent(detail.id)}`);
          else setRetry((n) => n + 1);
        }}
      />
    </section>
  );
};

export default AdminKnowledgePage;
