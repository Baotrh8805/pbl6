import React, { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { deleteLearningPath, fetchLearningPaths } from "@/services/learningPathService";
import type { LearningPath } from "@/types/api.types";
import { CreateLearningPathModal } from "@/features/roadmap/components/CreateLearningPathModal";
import { LearningPathCard, LearningPathCardSkeleton } from "@/features/roadmap/components/LearningPathCard";
import { NextStepsCard } from "@/features/insights/components/NextStepsCard";
import { WeaknessCard } from "@/features/insights/components/WeaknessCard";

type RoadmapTab = "all" | "active" | "draft" | "completed";

export const RoadmapPage: React.FC = () => {
  const dialog = useDialog();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RoadmapTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, error, loading } = useAsync(fetchLearningPaths, [refreshIndex]);
  const paths = useMemo(() => data ?? [], [data]);
  const now = new Date();

  // ?remedial=1 (mục "Bổ khuyết" của Học gì tiếp, kể cả từ Tổng quan): WeaknessCard mở sẵn modal rồi gỡ tham số.
  const [params, setParams] = useSearchParams();
  const autoOpenRemedial = params.get("remedial") === "1";
  const clearRemedialParam = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("remedial");
        return next;
      },
      { replace: true }
    );
  }, [setParams]);

  const handleDelete = async (path: LearningPath) => {
    const ok = await dialog.confirm({
      title: "Xoá lộ trình?",
      message: "Kế hoạch học sẽ bị xoá. Bộ thẻ và thư mục đã tạo giữ nguyên.",
      confirmLabel: "Xoá",
      tone: "danger",
      action: () => deleteLearningPath(path.id),
    });
    if (ok) setRefreshIndex((n) => n + 1);
  };

  // Lọc theo tab trạng thái và từ khoá tìm kiếm
  const activeSpotlight = useMemo(
    () => paths.find((p) => p.status === "ACTIVE" && !p.completedAt),
    [paths]
  );

  const counts = useMemo(() => {
    const active = paths.filter((p) => p.status === "ACTIVE" && !p.completedAt).length;
    const draft = paths.filter((p) => p.status === "DRAFT" || p.status === "PROCESSING").length;
    const completed = paths.filter((p) => p.status === "ACTIVE" && !!p.completedAt).length;
    return { all: paths.length, active, draft, completed };
  }, [paths]);

  const filteredPaths = useMemo(() => {
    return paths.filter((p) => {
      // Lọc tab
      if (activeTab === "active" && (p.status !== "ACTIVE" || !!p.completedAt)) return false;
      if (activeTab === "draft" && p.status !== "DRAFT" && p.status !== "PROCESSING") return false;
      if (activeTab === "completed" && (p.status !== "ACTIVE" || !p.completedAt)) return false;

      // Lọc từ khoá
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchSource = (p.sourceName ?? "").toLowerCase().includes(q);
        if (!matchTitle && !matchSource) return false;
      }
      return true;
    });
  }, [paths, activeTab, searchQuery]);

  const tabs: { id: RoadmapTab; label: string; count: number }[] = [
    { id: "all", label: "Tất cả", count: counts.all },
    { id: "active", label: "Đang học", count: counts.active },
    { id: "draft", label: "Bản nháp", count: counts.draft },
    { id: "completed", label: "Đã xong", count: counts.completed },
  ];

  return (
    <section className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Kế hoạch học tập cá nhân hóa
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Lộ trình học tập
          </h1>
          <p className="text-sm md:text-base text-slate-600 mt-1">
            Biến tài liệu của bạn thành kế hoạch học theo từng chương và từng ngày tối ưu.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)} className="shadow-xs cursor-pointer">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
          Tạo lộ trình
        </Button>
      </div>

      {/* Active Roadmap Spotlight Hero */}
      {activeSpotlight && (
        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-blue-50/80 via-white to-emerald-50/60 border border-blue-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col gap-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs">
                Đang thực hiện
              </span>
              <span className="text-xs font-medium text-slate-500">
                Ngày {activeSpotlight.today?.dayIndex ?? 1}/{activeSpotlight.totalDays}
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900">
              {activeSpotlight.title}
            </h2>
            {activeSpotlight.today && (
              <p className="text-xs text-slate-600 flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">history</span>
                  Ôn {activeSpotlight.today.dueCount ?? 0}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">fiber_new</span>
                  Mới {activeSpotlight.today.newCount ?? 0}
                </span>
                {(activeSpotlight.today.behindCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">pending_actions</span>
                    Nợ {activeSpotlight.today.behindCount}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Link
              to={`/roadmap/${encodeURIComponent(activeSpotlight.id)}`}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-all active:scale-95"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
              Tiếp tục học
            </Link>
          </div>
        </div>
      )}

      {/* Insights: Gợi ý việc tiếp theo + điểm yếu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <NextStepsCard />
        <WeaknessCard autoOpenRemedial={autoOpenRemedial} onAutoOpenHandled={clearRemedialParam} />
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 sm:p-2.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] sm:w-64">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            search
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm lộ trình..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}{" "}
          <button type="button" onClick={() => setRefreshIndex((n) => n + 1)} className="underline font-semibold cursor-pointer">
            Thử lại
          </button>
        </p>
      )}

      {loading ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-label="Đang tải danh sách lộ trình">
          {Array.from({ length: 6 }).map((_, i) => (
            <LearningPathCardSkeleton key={`skeleton-${i}`} />
          ))}
        </ul>
      ) : filteredPaths.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white border border-dashed border-slate-200/90 shadow-xs flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">alt_route</span>
          </div>
          <p className="text-sm font-medium text-slate-600">
            {paths.length === 0 ? "Bạn chưa có lộ trình học tập nào." : "Không có lộ trình nào phù hợp với bộ lọc."}
          </p>
          {paths.length === 0 && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} className="cursor-pointer">
              Tạo lộ trình đầu tiên
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredPaths.map((p) => (
            <LearningPathCard key={p.id} path={p} now={now} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      <CreateLearningPathModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </section>
  );
};

export default RoadmapPage;
