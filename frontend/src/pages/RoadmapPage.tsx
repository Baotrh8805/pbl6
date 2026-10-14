import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useShell } from "@/components/layout/shellContext";
import { useAsync } from "@/lib/useAsync";
import { deleteLearningPath, fetchLearningPaths } from "@/services/learningPathService";
import type { LearningPath } from "@/types/api.types";
import { CreateLearningPathModal } from "@/features/roadmap/components/CreateLearningPathModal";
import { LearningPathCard } from "@/features/roadmap/components/LearningPathCard";

export const RoadmapPage: React.FC = () => {
  const dialog = useDialog();
  const { decks, reviews } = useShell();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, error, loading } = useAsync(fetchLearningPaths, [refreshIndex]);
  const paths = data ?? [];
  const now = new Date();

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

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Lộ trình học tập</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Biến tài liệu của bạn thành kế hoạch học theo từng chương và từng ngày.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)} className="shadow-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
          Tạo lộ trình
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
      ) : paths.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">alt_route</span>
          <p className="text-body-md text-on-surface-variant">Bạn chưa có lộ trình học tập nào.</p>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Tạo lộ trình đầu tiên
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
          {paths.map((p) => (
            <LearningPathCard key={p.id} path={p} decks={decks} reviews={reviews} now={now} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      <CreateLearningPathModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </section>
  );
};

export default RoadmapPage;
