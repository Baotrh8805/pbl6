import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { dayKey } from "@/lib/learningStats";
import { extractErrorMessage } from "@/services/apiClient";
import { deleteLearningPath, fetchLearningPath } from "@/services/learningPathService";
import type { LearningPath } from "@/types/api.types";
import { PathStatusChip } from "@/features/roadmap/components/PathStatusChip";
import { PathProcessingPanel } from "@/features/roadmap/components/PathProcessingPanel";
import { PathFailedPanel } from "@/features/roadmap/components/PathFailedPanel";
import { CreateLearningPathModal } from "@/features/roadmap/components/CreateLearningPathModal";
import { isPathProcessing } from "@/features/roadmap/roadmapUtils";

const POLL_MS = 2000;

export const RoadmapDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();

  const [path, setPath] = useState<LearningPath | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tăng để khởi động lại vòng poll / tải lại.
  const [pollRound, setPollRound] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy] = useState(false); // Task 10: setBusy khi sửa bản nháp / kích hoạt
  const [createOpen, setCreateOpen] = useState(false);

  // Poll mỗi 2 s khi PROCESSING; dừng khi sang trạng thái khác hoặc rời trang.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await fetchLearningPath(id, dayKey(new Date()));
        if (!alive) return;
        setPath(next);
        setLoadError(null);
        if (isPathProcessing(next.status)) timer = window.setTimeout(tick, POLL_MS);
      } catch (e) {
        if (alive) setLoadError(extractErrorMessage(e));
      }
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id, pollRound]);

  // Task 10 dùng: tải lại sau khi sửa bản nháp / kích hoạt.
  const refreshPath = useCallback(async () => {
    try {
      setPath(await fetchLearningPath(id, dayKey(new Date())));
      setActionError(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    }
  }, [id]);
  void refreshPath;

  const handleDelete = async () => {
    const ok = await dialog.confirm({
      title: "Xoá lộ trình?",
      message: "Kế hoạch học sẽ bị xoá. Bộ thẻ và thư mục đã tạo giữ nguyên.",
      confirmLabel: "Xoá",
      tone: "danger",
      action: () => deleteLearningPath(id),
    });
    if (ok) navigate("/roadmap");
  };

  if (loadError && !path)
    return (
      <div className="py-space-lg flex flex-col items-start gap-space-sm">
        <p className="text-error">{loadError}</p>
        <Link to="/roadmap" className="text-primary hover:underline">
          ← Lộ trình học tập
        </Link>
      </div>
    );
  if (!path) return <p className="text-on-surface-variant py-space-lg">Đang tải...</p>;

  const processing = isPathProcessing(path.status);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <nav aria-label="Đường dẫn">
        <Link to="/roadmap" className="text-label-md text-primary hover:underline inline-flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          Lộ trình học tập
        </Link>
      </nav>

      <header className="flex flex-col gap-space-sm p-space-md bg-surface-container-lowest border border-surface-container-high rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0">
            <PathStatusChip status={path.status} />
            <h1 className="mt-2 font-headline-sm text-headline-sm font-bold text-on-surface truncate">{path.title}</h1>
          </div>
          {!processing && (
            <Button
              variant="ghost"
              size="md"
              onClick={handleDelete}
              disabled={busy}
              className="text-error hover:bg-error/10 hover:text-error shrink-0"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
              Xoá
            </Button>
          )}
        </div>
        {loadError && (
          <p role="alert" className="text-label-sm text-error">
            Mất kết nối khi theo dõi tiến trình: {loadError}{" "}
            <button type="button" className="underline font-semibold" onClick={() => setPollRound((n) => n + 1)}>
              Thử lại
            </button>
          </p>
        )}
      </header>

      {actionError && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {actionError}
        </p>
      )}

      {processing && <PathProcessingPanel path={path} />}

      {path.status === "FAILED" && (
        <PathFailedPanel path={path} onRetry={() => setCreateOpen(true)} onDelete={handleDelete} busy={busy} />
      )}

      {path.status === "DRAFT" && (
        <div className="p-space-md rounded-2xl bg-surface-container-low text-body-sm text-on-surface-variant">
          Bản nháp — đang hoàn thiện giao diện
        </div>
      )}

      {path.status === "ACTIVE" && (
        <div className="p-space-md rounded-2xl bg-surface-container-low text-body-sm text-on-surface-variant">
          Đang học — đang hoàn thiện giao diện
        </div>
      )}

      {createOpen && (
        <CreateLearningPathModal
          isOpen
          onClose={() => setCreateOpen(false)}
          initial={{ days: path.totalDays, title: path.title }}
        />
      )}
    </section>
  );
};

export default RoadmapDetailPage;
