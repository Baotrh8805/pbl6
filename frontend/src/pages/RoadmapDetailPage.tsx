import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { dayKey } from "@/lib/learningStats";
import { extractErrorMessage } from "@/services/apiClient";
import {
  activateLearningPath,
  deleteLearningPath,
  fetchLearningPath,
  mergeChapterUp,
  renameChapter,
  updateLearningPath,
} from "@/services/learningPathService";
import type { LearningPath, LearningPathPatch } from "@/types/api.types";
import { useShell } from "@/components/layout/shellContext";
import { PathStatusChip } from "@/features/roadmap/components/PathStatusChip";
import { PathProcessingPanel } from "@/features/roadmap/components/PathProcessingPanel";
import { PathFailedPanel } from "@/features/roadmap/components/PathFailedPanel";
import { CreateLearningPathModal } from "@/features/roadmap/components/CreateLearningPathModal";
import { PathDraftEditor } from "@/features/roadmap/components/PathDraftEditor";
import { PathActiveView } from "@/features/roadmap/components/PathActiveView";
import { isPathProcessing } from "@/features/roadmap/roadmapUtils";

const POLL_MS = 2000;
/** Sau khi kích hoạt: chờ danh sách bộ thẻ của shell có đủ bộ mới, tối đa chừng này. */
const DECKS_PENDING_MS = 8000;

export const RoadmapDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { decks, reviews, reloadStats } = useShell();

  const [path, setPath] = useState<LearningPath | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tăng để khởi động lại vòng poll / tải lại.
  const [pollRound, setPollRound] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [decksPending, setDecksPending] = useState(false);
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

  // Tải lại sau khi sửa bản nháp / kích hoạt.
  // Chỉ nhận kết quả của lần tải mới nhất: lưu-khi-blur và kích hoạt có thể chạy chồng nhau, phản hồi cũ về muộn
  // không được đè bản ACTIVE bằng bản DRAFT.
  const refreshSeq = useRef(0);
  const refreshPath = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const next = await fetchLearningPath(id, dayKey(new Date()));
      if (seq !== refreshSeq.current) return;
      setPath(next);
      setActionError(null);
    } catch (e) {
      if (seq === refreshSeq.current) setActionError(extractErrorMessage(e));
    }
  }, [id]);

  // Bộ thẻ mới tạo khi kích hoạt chưa có trong shell ngay: hiện "Đang tạo bộ thẻ…" tới khi đủ hoặc hết hạn.
  const allDecksLoaded =
    !!path?.chapters && path.chapters.every((c) => !c.deckId || decks.some((d) => d.id === c.deckId));
  const showDecksPending = decksPending && !allDecksLoaded;
  useEffect(() => {
    if (!decksPending) return;
    const timer = window.setTimeout(() => setDecksPending(false), DECKS_PENDING_MS);
    return () => window.clearTimeout(timer);
  }, [decksPending]);

  /**
   * Chạy một thao tác sửa bản nháp rồi tải lại. Không khoá cả trang: lưu khi blur mà khoá nút/ô nhập thì
   * cú click/Tab kế tiếp rơi vào phần tử bị disabled. Lỗi -> tải lại để bỏ thay đổi lạc quan rồi hiện lỗi.
   */
  const runAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refreshPath();
    } catch (e) {
      await refreshPath();
      setActionError(extractErrorMessage(e));
    }
  };

  const handlePatchPath = (patch: LearningPathPatch) => void runAction(() => updateLearningPath(id, patch));

  const handleRenameChapter = (cid: string, title: string) => {
    setPath((p) =>
      p?.chapters ? { ...p, chapters: p.chapters.map((c) => (c.id === cid ? { ...c, title } : c)) } : p
    );
    void runAction(() => renameChapter(id, cid, title));
  };

  const handleMergeUp = (cid: string) => runAction(() => mergeChapterUp(id, cid));

  const handleActivate = async ({ title, startDate, totalDays }: { title: string; startDate: string; totalDays: number }) => {
    if (!path) return;
    setActivating(true);
    try {
      // Lưu nốt giá trị đang gõ (blur-commit có thể còn đang chạy) để cú click đầu tiên luôn kích hoạt đúng.
      const patch: LearningPathPatch = {};
      if (title !== path.title) patch.title = title;
      if (totalDays !== path.totalDays) patch.totalDays = totalDays;
      if (startDate !== path.startDate) patch.startDate = startDate;
      if (Object.keys(patch).length > 0) await updateLearningPath(id, patch);
      const next = await activateLearningPath(id, { startDate, totalDays });
      refreshSeq.current++; // bỏ các lần tải lại đang dở (còn là DRAFT)
      setPath(next);
      setActionError(null);
      reloadStats();
      setDecksPending(true);
      void refreshPath(); // lấy "hôm nay" theo ngày của máy khách
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setActivating(false);
    }
  };

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
              disabled={activating}
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

      {actionError && path.status !== "DRAFT" && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {actionError}
        </p>
      )}

      {processing && <PathProcessingPanel path={path} />}

      {path.status === "FAILED" && (
        <PathFailedPanel path={path} onRetry={() => setCreateOpen(true)} onDelete={handleDelete} busy={activating} />
      )}

      {path.status === "DRAFT" && (
        <PathDraftEditor
          path={path}
          activating={activating}
          error={actionError}
          onPatchPath={handlePatchPath}
          onRenameChapter={handleRenameChapter}
          onMergeUp={handleMergeUp}
          onItemsPatched={() => void refreshPath()}
          onActivate={(values) => void handleActivate(values)}
        />
      )}

      {path.status === "ACTIVE" && (
        <PathActiveView path={path} decks={decks} reviews={reviews} now={new Date()} decksPending={showDecksPending} />
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
