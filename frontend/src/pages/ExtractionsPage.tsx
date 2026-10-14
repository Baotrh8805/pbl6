import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { deleteExtraction, fetchExtractions } from "@/services/extractionService";
import type { ExtractionJob } from "@/types/api.types";
import { QuickAiUploadModal } from "@/features/dashboard/components/modals/QuickAiUploadModal";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { SOURCE_TYPE_LABELS, formatDateTime, isActiveStatus } from "@/features/extraction/extractionUtils";

// Lịch sử bóc tách của tôi: mỗi job một dòng, bấm vào để duyệt / tạo bộ thẻ.
export const ExtractionsPage: React.FC = () => {
  const dialog = useDialog();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data, error, loading } = useAsync(fetchExtractions, [refreshIndex]);
  const jobs = data ?? [];

  const handleDelete = async (job: ExtractionJob) => {
    const ok = await dialog.confirm({
      title: "Xoá kết quả bóc tách?",
      message: `"${job.sourceName || "Văn bản dán"}" sẽ bị xoá. Bộ thẻ đã tạo từ job này vẫn giữ nguyên.`,
      confirmLabel: "Xoá",
      tone: "danger",
      action: () => deleteExtraction(job.id),
    });
    if (ok) setRefreshIndex((n) => n + 1);
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Bóc tách AI</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Tải tài liệu tiếng Nhật hoặc dán văn bản để tự động tách từ vựng, ngữ pháp và tạo bộ thẻ.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setUploadOpen(true)} className="shadow-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
          Bóc tách mới
        </Button>
      </div>

      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}{" "}
          <button type="button" onClick={() => setRefreshIndex((n) => n + 1)} className="underline font-semibold">
            Thử lại
          </button>
        </p>
      )}

      {loading ? (
        <p className="text-on-surface-variant">Đang tải...</p>
      ) : jobs.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">document_scanner</span>
          <p className="text-body-md text-on-surface-variant">Bạn chưa bóc tách tài liệu nào.</p>
          <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
            Bắt đầu ngay
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center gap-space-md p-space-sm sm:p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high hover:border-outline-variant transition-colors"
            >
              <Link to={`/extractions/${encodeURIComponent(job.id)}`} className="flex-1 min-w-0 group">
                <div className="flex items-center gap-2 flex-wrap">
                  <ExtractionStatusBadge status={job.status} />
                  <span className="text-label-sm text-outline">{SOURCE_TYPE_LABELS[job.sourceType]}</span>
                </div>
                <div className="mt-1 text-title-md font-semibold text-on-surface truncate group-hover:text-primary">
                  {job.sourceName || "Văn bản dán"}
                </div>
                <div className="text-label-sm text-outline mt-0.5">
                  {formatDateTime(job.createdAt)}
                  {job.stats && ` · ${job.stats.vocab} từ vựng · ${job.stats.grammar} ngữ pháp`}
                  {job.deckIds.length > 0 && ` · đã tạo ${job.deckIds.length} bộ thẻ`}
                  {job.status === "FAILED" && job.errorMessage && ` · ${job.errorMessage}`}
                </div>
              </Link>
              {!isActiveStatus(job.status) && (
                <button
                  type="button"
                  onClick={() => handleDelete(job)}
                  className="p-2 rounded-lg text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer shrink-0"
                  title="Xoá kết quả này"
                  aria-label={`Xoá ${job.sourceName || "văn bản dán"}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <QuickAiUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />
    </section>
  );
};

export default ExtractionsPage;
