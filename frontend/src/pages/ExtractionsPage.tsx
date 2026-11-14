import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { deleteExtraction, fetchExtractions } from "@/services/extractionService";
import type { ExtractionJob } from "@/types/api.types";
import { QuickAiUploadModal } from "@/features/dashboard/components/modals/QuickAiUploadModal";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { LevelDistributionBar } from "@/features/extraction/components/LevelDistributionBar";
import { SOURCE_TYPE_LABELS, formatDateTime, isActiveStatus } from "@/features/extraction/extractionUtils";

type StatusFilter = "all" | "done" | "active" | "failed";

export const ExtractionsPage: React.FC = () => {
  const dialog = useDialog();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, error, loading } = useAsync(fetchExtractions, [refreshIndex]);
  const jobs = useMemo(() => data ?? [], [data]);

  // Thống kê tổng quan
  const statsSummary = useMemo(() => {
    let totalVocab = 0;
    let totalDecks = 0;
    let doneJobs = 0;
    let activeJobs = 0;
    let failedJobs = 0;

    for (const j of jobs) {
      if (j.status === "DONE") doneJobs++;
      else if (j.status === "FAILED") failedJobs++;
      else activeJobs++;

      if (j.stats) totalVocab += j.stats.vocab;
      totalDecks += j.deckIds.length;
    }

    return { totalVocab, totalDecks, doneJobs, activeJobs, failedJobs, total: jobs.length };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (j.sourceName || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "done"
          ? j.status === "DONE"
          : statusFilter === "failed"
          ? j.status === "FAILED"
          : isActiveStatus(j.status);
      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchQuery, statusFilter]);

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
    <section className="flex flex-col gap-6 pb-12">
      {/* 1. Header: Tiêu đề & Nút tải lên */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              AI Document Pipeline
            </span>
            <span className="text-xs text-slate-500 font-medium">
              OCR &amp; Trích xuất thông minh
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Bóc tách AI
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Tải tài liệu PDF, ảnh chụp giáo trình hoặc dán văn bản để tự động trích xuất từ vựng, Kanji, ngữ pháp và phân loại theo cấp độ JLPT.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer self-start sm:self-auto active:scale-95"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            upload_file
          </span>
          <span>Bóc tách tài liệu mới</span>
        </button>
      </div>

      {/* 2. Thanh KPI tóm tắt hiệu quả bóc tách */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                document_scanner
              </span>
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900 font-headline">{statsSummary.total}</div>
              <div className="text-xs text-slate-500 font-medium">Tài liệu đã bóc tách</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                translate
              </span>
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900 font-headline">
                {statsSummary.totalVocab.toLocaleString("vi-VN")}
              </div>
              <div className="text-xs text-slate-500 font-medium">Từ vựng &amp; Hán tự trích xuất</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                style
              </span>
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900 font-headline">{statsSummary.totalDecks}</div>
              <div className="text-xs text-slate-500 font-medium">Bộ thẻ flashcard đã tạo</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Toolbar: Tìm kiếm & Lọc trạng thái */}
      {jobs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <div role="group" aria-label="Lọc trạng thái" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white font-bold shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tất cả ({statsSummary.total})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "done"}
              onClick={() => setStatusFilter("done")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "done"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200/70 hover:bg-emerald-100"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                check_circle
              </span>
              <span>Hoàn thành ({statsSummary.doneJobs})</span>
            </button>

            {statsSummary.activeJobs > 0 && (
              <button
                type="button"
                aria-pressed={statusFilter === "active"}
                onClick={() => setStatusFilter("active")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-blue-600 text-white font-bold shadow-xs"
                    : "bg-blue-50 text-blue-800 border border-blue-200/70 hover:bg-blue-100"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px] animate-spin">
                  sync
                </span>
                <span>Đang xử lý ({statsSummary.activeJobs})</span>
              </button>
            )}

            {statsSummary.failedJobs > 0 && (
              <button
                type="button"
                aria-pressed={statusFilter === "failed"}
                onClick={() => setStatusFilter("failed")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === "failed"
                    ? "bg-rose-600 text-white font-bold shadow-xs"
                    : "bg-rose-50 text-rose-800 border border-rose-200/70 hover:bg-rose-100"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                  error
                </span>
                <span>Thất bại ({statsSummary.failedJobs})</span>
              </button>
            )}
          </div>

          <div className="relative min-w-[220px]">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-2.5"
            >
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên tài liệu..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRefreshIndex((n) => n + 1)}
            className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 4. Trạng thái tải & Danh sách */}
      {loading ? (
        <ul className="space-y-3" aria-label="Đang tải lịch sử bóc tách">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs animate-pulse"
              aria-hidden="true"
            >
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 rounded-full bg-slate-200" />
                  <div className="h-4 w-12 rounded bg-slate-100" />
                </div>
                <div className="h-5 w-2/5 rounded bg-slate-200" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
              </div>
              <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0" />
            </li>
          ))}
        </ul>
      ) : filteredJobs.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white border border-dashed border-slate-300 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
              document_scanner
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800">
            {jobs.length === 0 ? "Bạn chưa bóc tách tài liệu nào." : "Không tìm thấy tài liệu phù hợp."}
          </p>
          <p className="text-xs text-slate-500 max-w-sm">
            Tải lên tài liệu giáo trình, hợp đồng tiếng Nhật hoặc đề thi để AI tự động trích xuất flashcard.
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs cursor-pointer mt-1"
          >
            Bắt đầu bóc tách ngay
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredJobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all shadow-xs group"
            >
              <Link to={`/extractions/${encodeURIComponent(job.id)}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ExtractionStatusBadge status={job.status} />
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                    {SOURCE_TYPE_LABELS[job.sourceType]}
                  </span>
                </div>
                <div className="mt-1.5 text-base font-bold text-slate-900 truncate group-hover:text-purple-700 transition-colors">
                  {job.sourceName || "Văn bản dán"}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                      calendar_today
                    </span>
                    {formatDateTime(job.createdAt)}
                  </span>
                  {job.stats && (
                    <span className="font-medium text-slate-700">
                      · {job.stats.vocab} từ vựng · {job.stats.grammar} ngữ pháp
                    </span>
                  )}
                  {job.deckIds.length > 0 && (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 text-[11px]">
                      {job.deckIds.length} bộ thẻ đã tạo
                    </span>
                  )}
                  {job.status === "FAILED" && job.errorMessage && (
                    <span className="text-rose-600 font-medium">· {job.errorMessage}</span>
                  )}
                </div>
                {job.status === "DONE" && job.stats && (
                  <LevelDistributionBar stats={job.stats} compact className="mt-2.5" />
                )}
              </Link>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/extractions/${encodeURIComponent(job.id)}`}
                  className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs transition-colors"
                >
                  <span>Xem kết quả</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    chevron_right
                  </span>
                </Link>

                {!isActiveStatus(job.status) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(job)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Xoá kết quả này"
                    aria-label={`Xoá ${job.sourceName || "văn bản dán"}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      delete
                    </span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <QuickAiUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />
    </section>
  );
};

export default ExtractionsPage;
