import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import {
  activateKnowledgeSource,
  archiveKnowledgeSource,
  deleteKnowledgeSource,
  fetchKnowledgeSource,
  updateKnowledgeSource,
} from "@/services/adminService";
import { formatShort } from "@/features/admin/adminUtils";
import {
  KNOWLEDGE_STATUS_LABELS,
  canDeleteKnowledge,
  filterKnowledgeEntries,
  knowledgeKindLabel,
} from "@/features/admin/moderationUtils";
import { AdminDetailCard } from "@/features/admin/components/AdminDetailCard";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminJsonViewer } from "@/features/admin/components/AdminJsonViewer";
import { AdminFlash, type AdminFlashMessage } from "@/features/admin/components/AdminFlash";
import { KnowledgeUploadModal } from "@/features/admin/components/KnowledgeUploadModal";
import { adminFieldClass } from "@/features/admin/components/AdminFilterBar";

/** Số mục hiện trong bảng trước khi bấm "Xem thêm" (server trả ≤ 500; DOM 500 dòng vẫn ổn nhưng cuộn rất dài). */
const ENTRY_PREVIEW = 100;

const BackLink: React.FC = () => (
  <Link to="/admin/knowledge" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:underline w-fit">
    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
    <span>Quay lại danh sách nguồn tri thức</span>
  </Link>
);

export const AdminKnowledgeDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const canDelete = canDeleteKnowledge(userProfile?.role);
  const [reload, setReload] = useState(0);
  const { data: src, loading, error } = useAsync(() => fetchKnowledgeSource(id), [id], reload);
  const [flash, setFlash] = useState<AdminFlashMessage | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [entryQuery, setEntryQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  if (loading) return <p className="text-on-surface-variant p-space-md">Đang tải nguồn tri thức...</p>;
  if (error || !src) {
    return (
      <section className="flex flex-col gap-space-lg pb-space-xl">
        <BackLink />
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error ?? "Không tìm thấy nguồn tri thức."}
        </p>
      </section>
    );
  }

  const entries = src.entries ?? [];
  const filtered = filterKnowledgeEntries(entries, entryQuery);
  const visible = showAll ? filtered : filtered.slice(0, ENTRY_PREVIEW);
  const archived = src.status === "ARCHIVED";

  const toggleArchive = async () => {
    const ok = await dialog.confirm({
      title: archived ? `Dùng lại nguồn "${src.title}"?` : `Lưu trữ nguồn "${src.title}"?`,
      message: archived
        ? "Nguồn được đưa trở lại danh sách tham chiếu khi kiểm tra mâu thuẫn."
        : "Nguồn lưu trữ không còn được dùng để đối chiếu khi bóc tách; dữ liệu được giữ nguyên và có thể dùng lại.",
      confirmLabel: archived ? "Dùng lại" : "Lưu trữ",
      tone: archived ? "info" : "warning",
      action: () => (archived ? activateKnowledgeSource(src.id) : archiveKnowledgeSource(src.id)),
    });
    if (ok) {
      setFlash({ ok: true, text: archived ? "Đã đưa nguồn trở lại sử dụng." : "Đã lưu trữ nguồn." });
      setReload((n) => n + 1);
    }
  };

  const remove = async () => {
    const ok = await dialog.confirm({
      title: `Xoá vĩnh viễn nguồn "${src.title}"?`,
      message: "Nội dung và mọi mục đã trích sẽ bị xoá, không khôi phục được. Muốn tạm ngừng dùng thì chọn Lưu trữ.",
      confirmLabel: "Xoá vĩnh viễn",
      tone: "danger",
      action: () => deleteKnowledgeSource(src.id),
    });
    if (ok) navigate("/admin/knowledge");
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <BackLink />
      <AdminFlash message={flash} onClose={() => setFlash(null)} />

      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md shadow-xs flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-headline-sm text-on-surface break-words">{src.title}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <AdminStatusBadge label={knowledgeKindLabel(src.kind)} tone="info" />
              {src.level && <AdminStatusBadge label={`JLPT ${src.level}`} tone="primary" />}
              <AdminStatusBadge label={`Phiên bản ${src.version}`} tone="neutral" icon="history" />
              <AdminStatusBadge
                label={KNOWLEDGE_STATUS_LABELS[src.status] ?? src.status}
                tone={archived ? "neutral" : "success"}
                icon={archived ? "inventory_2" : "check_circle"}
              />
            </div>
          </div>
          {canAct && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">upload_file</span>
                Tải phiên bản mới
              </Button>
              <Button variant="outline" size="sm" onClick={toggleArchive}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  {archived ? "unarchive" : "archive"}
                </span>
                {archived ? "Dùng lại" : "Lưu trữ"}
              </Button>
              {canDelete && (
                <Button variant="danger" size="sm" onClick={remove}>
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
                  Xoá
                </Button>
              )}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-body-sm">
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40 min-w-0">
            <dt className="text-outline text-label-sm font-semibold">Tệp nguồn</dt>
            <dd className="font-semibold text-on-surface mt-0.5 truncate" title={src.sourceName ?? undefined}>
              {src.sourceName ?? "Văn bản dán"}
            </dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40 min-w-0">
            <dt className="text-outline text-label-sm font-semibold">Người tải</dt>
            <dd className="font-semibold text-on-surface mt-0.5 truncate">{src.uploadedByEmail ?? "—"}</dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold">Tạo lúc</dt>
            <dd className="font-semibold text-on-surface mt-0.5">{formatShort(src.createdAt)}</dd>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low/50 border border-surface-container-high/40">
            <dt className="text-outline text-label-sm font-semibold">Cập nhật</dt>
            <dd className="font-semibold text-on-surface mt-0.5">{formatShort(src.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
        <AdminDetailCard
          title="Các mục đã trích"
          icon="list_alt"
          className="xl:col-span-7 min-w-0"
          description={`${(src.entryCount ?? entries.length).toLocaleString("vi-VN")} mục${
            src.entryCount !== undefined && src.entryCount > entries.length ? ` · hiện ${entries.length} mục đầu` : ""
          }`}
        >
          {entries.length === 0 ? (
            <p className="text-on-surface-variant italic py-2 text-center">Chưa trích được mục nào từ nguồn này.</p>
          ) : (
            <>
              <input
                type="search"
                value={entryQuery}
                onChange={(e) => setEntryQuery(e.target.value)}
                placeholder="Lọc theo từ, cách đọc, nghĩa…"
                aria-label="Lọc các mục"
                className={`${adminFieldClass} w-full sm:w-72`}
              />
              <p role="status" className="text-label-sm text-outline">
                {filtered.length.toLocaleString("vi-VN")} mục khớp
              </p>
              {/* relative: caption sr-only (position:absolute) lấy vùng cuộn làm khối chứa, như AdminTableShell. */}
              <div className="relative overflow-x-auto rounded-xl border border-surface-container-high">
                <table className="w-full text-body-sm [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:text-label-sm [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-outline [&_th]:font-bold [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high">
                  <caption className="sr-only">Các mục trích từ nguồn tri thức</caption>
                  <thead>
                    <tr>
                      <th scope="col">Từ</th>
                      <th scope="col">Cách đọc</th>
                      <th scope="col">Nghĩa</th>
                      <th scope="col">Cấp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e, i) => (
                      <tr key={`${e.term}-${i}`}>
                        <td lang="ja" className="font-japanese font-semibold text-on-surface whitespace-nowrap">{e.term}</td>
                        <td lang="ja" className="font-japanese text-on-surface-variant whitespace-nowrap">{e.reading ?? "—"}</td>
                        <td className="break-words min-w-[160px]">{e.meaning ?? "—"}</td>
                        <td className="font-mono">{e.level ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > ENTRY_PREVIEW && (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Thu gọn" : `Xem tất cả ${filtered.length.toLocaleString("vi-VN")} mục`}
                </Button>
              )}
              <div>
                <div className="text-label-sm text-outline font-semibold mb-1">JSON gốc</div>
                <AdminJsonViewer data={entries} />
              </div>
            </>
          )}
        </AdminDetailCard>

        <AdminDetailCard
          title="Xem trước nội dung"
          icon="article"
          className="xl:col-span-5 min-w-0"
          description="Tối đa 4.000 ký tự đầu của tài liệu gốc."
        >
          {src.contentPreview ? (
            <pre
              lang="ja"
              className="font-japanese text-body-sm whitespace-pre-wrap break-words max-h-[28rem] overflow-y-auto p-3 rounded-lg bg-surface-container-low border border-surface-container-high"
            >
              {src.contentPreview}
            </pre>
          ) : (
            <p className="text-on-surface-variant italic py-2 text-center">Không có nội dung xem trước.</p>
          )}
        </AdminDetailCard>
      </div>

      <KnowledgeUploadModal
        key={uploadOpen ? "open" : "closed"}
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        mode="update"
        initial={{ title: src.title, kind: src.kind, level: src.level }}
        submit={(input) => updateKnowledgeSource(src.id, input)}
        onDone={(detail) => {
          setFlash({ ok: true, text: `Đã tải phiên bản ${detail?.version ?? src.version + 1}.` });
          setReload((n) => n + 1);
        }}
      />
    </section>
  );
};

export default AdminKnowledgeDetailPage;
