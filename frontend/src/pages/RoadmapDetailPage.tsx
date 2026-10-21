import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { dayKey } from "@/lib/learningStats";
import { runOnce } from "@/lib/inFlight";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchOpenQuizAttempt } from "@/services/studyService";
import {
  activateLearningPath,
  completeLearningPath,
  deleteLearningPath,
  enrichLearningPath,
  fetchLearningPath,
  mergeChapterUp,
  rebalanceLearningPath,
  renameChapter,
  retryLearningPath,
  startChapterQuiz,
  updateLearningPath,
  updateLearningPathText,
} from "@/services/learningPathService";
import type { LearningPath, LearningPathPatch } from "@/types/api.types";
import { useShell } from "@/components/layout/shellContext";
import { PathStatusChip, RemedialChip } from "@/features/roadmap/components/PathStatusChip";
import { PathProcessingPanel } from "@/features/roadmap/components/PathProcessingPanel";
import { PathFailedPanel } from "@/features/roadmap/components/PathFailedPanel";
import { CreateLearningPathModal } from "@/features/roadmap/components/CreateLearningPathModal";
import { PathDraftEditor, type ActivateValues } from "@/features/roadmap/components/PathDraftEditor";
import { PathActiveView } from "@/features/roadmap/components/PathActiveView";
import { PathSettingsDrawer } from "@/features/roadmap/components/PathSettingsDrawer";
import {
  OVERFLOW_WARNING,
  chapterQuizReplaceNotice,
  chapterQuizTarget,
  isPathBusy,
  isPathProcessing,
  mergeLockKey,
} from "@/features/roadmap/roadmapUtils";

const POLL_MS = 2000;
/** Sau khi kích hoạt: chờ danh sách bộ thẻ của shell có đủ bộ mới, tối đa chừng này. */
const DECKS_PENDING_MS = 8000;
/** Sau "Dịch lại nghĩa": poll thêm chừng này kể cả khi job chưa kịp chuyển RUNNING (202 trả trước khi worker nhận việc). */
const ENRICH_POLL_MS = 30_000;
/** Thông báo thành công tự ẩn sau chừng này. */
const NOTICE_MS = 8000;

type BusyAction = "rebalance" | "retry" | "enrich" | "complete" | "settings" | "text";

/**
 * Route giữ nguyên component khi chỉ đổi :id (vd. "Tạo lại" từ lộ trình FAILED sang lộ trình mới) ->
 * key={id} để mount lại: bỏ path / modal / lỗi của lộ trình cũ, vòng poll và refresh dở bị huỷ theo.
 */
export const RoadmapDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  return <RoadmapDetail key={id} id={id} />;
};

const RoadmapDetail: React.FC<{ id: string }> = ({ id }) => {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { decks, reviews, reloadStats } = useShell();

  const [path, setPath] = useState<LearningPath | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tăng để khởi động lại vòng poll / tải lại.
  const [pollRound, setPollRound] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [quizBusy, setQuizBusy] = useState<string | null>(null);
  // Lỗi mở "Kiểm tra chương" hiện ngay dưới nút của chương đó (nút nằm sâu trong trang, báo ở đầu trang thì không ai thấy).
  const [quizError, setQuizError] = useState<{ chapterId: string; message: string } | null>(null);
  // Lỗi thao tác khác hiện ở đầu trang: cuộn tới để người dùng thấy dù đang ở cuối trang.
  const actionErrorRef = useRef<HTMLParagraphElement>(null);
  const [decksPending, setDecksPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Mốc (ms) tới đó vòng poll vẫn chạy dù lộ trình không "bận" — dùng sau "Dịch lại nghĩa".
  const pollExtraUntil = useRef(0);
  // LP-13: thao tác ghi đang chạy theo loại (kích hoạt, gộp chương, cân lại...). Nút có disabled theo state, nhưng state chỉ
  // đổi ở lần render sau -> bấm đúp vẫn gửi hai request; khoá đồng bộ này chặn lần thứ hai ngay trong handler.
  const inFlight = useRef(new Set<string>());

  // Bộ đếm chung cho MỌI lần tải lộ trình (poll lẫn tải lại sau thao tác ghi): chỉ lần mới nhất được ghi vào state.
  // Lưu-khi-blur và kích hoạt có thể chạy chồng nhau, phản hồi cũ về muộn không được đè bản ACTIVE bằng bản DRAFT; poll
  // trong lúc dịch lại nghĩa trên bản nháp đang sửa cũng không được trả ô nhập về giá trị trước PATCH.
  const refreshSeq = useRef(0);

  // Poll mỗi 2 s khi PROCESSING (hoặc job đang chạy lại bước dịch nghĩa); dừng khi xong hoặc rời trang.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      const seq = ++refreshSeq.current;
      try {
        const next = await fetchLearningPath(id, dayKey(new Date()));
        if (!alive) return;
        if (seq === refreshSeq.current) {
          setPath(next);
          setLoadError(null);
        }
        // Phản hồi cũ vẫn đủ để biết job còn chạy hay không: hẹn tick kế để vòng poll không tắt oan.
        if (isPathBusy(next) || Date.now() < pollExtraUntil.current) timer = window.setTimeout(tick, POLL_MS);
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

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (actionError) actionErrorRef.current?.scrollIntoView({ block: "nearest" });
  }, [actionError]);

  // Tải lại sau khi sửa bản nháp / kích hoạt / cân lại lịch (cùng bộ đếm `refreshSeq` với vòng poll ở trên).
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
   * Chạy một thao tác ghi rồi tải lại. Không khoá cả trang: lưu khi blur mà khoá nút/ô nhập thì
   * cú click/Tab kế tiếp rơi vào phần tử bị disabled. Lỗi -> tải lại để bỏ thay đổi lạc quan rồi hiện lỗi.
   * Trả kết quả của thao tác (undefined khi lỗi) để nơi gọi đọc cờ `overflow` của response.
   */
  const runAction = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await action();
      await refreshPath();
      return result;
    } catch (e) {
      await refreshPath();
      setActionError(extractErrorMessage(e));
      return undefined;
    }
  };

  const handlePatchPath = (patch: LearningPathPatch) => void runAction(() => updateLearningPath(id, patch));

  const handleRenameChapter = (cid: string, title: string) => {
    setPath((p) =>
      p?.chapters ? { ...p, chapters: p.chapters.map((c) => (c.id === cid ? { ...c, title } : c)) } : p
    );
    void runAction(() => renameChapter(id, cid, title));
  };

  // Gộp lặp cùng một chương (bấm đúp) = request thứ hai gộp tiếp chương kề trên: khoá theo từng chương (mergeLockKey).
  const handleMergeUp = async (cid: string) => {
    await runOnce(inFlight.current, mergeLockKey(cid), () => runAction(() => mergeChapterUp(id, cid)));
  };

  const activate = async ({ title, startDate, totalDays, dailyCap, studyDays }: ActivateValues) => {
    if (!path) return;
    setActivating(true);
    try {
      // Lưu nốt giá trị đang gõ (blur-commit có thể còn đang chạy) để cú click đầu tiên luôn kích hoạt đúng.
      const patch: LearningPathPatch = {};
      if (title !== path.title) patch.title = title;
      if (totalDays !== path.totalDays) patch.totalDays = totalDays;
      if (startDate !== path.startDate) patch.startDate = startDate;
      if (path.dailyCap != null && dailyCap !== path.dailyCap) patch.dailyCap = dailyCap;
      if (path.studyDays != null && studyDays !== path.studyDays) patch.studyDays = studyDays;
      if (Object.keys(patch).length > 0) await updateLearningPath(id, patch);
      const next = await activateLearningPath(id, { startDate, totalDays, dailyCap, studyDays });
      refreshSeq.current++; // bỏ các lần tải lại đang dở (còn là DRAFT)
      setPath(next);
      setActionError(null);
      setNotice(next.overflow ? `Đã kích hoạt. ${OVERFLOW_WARNING}` : "Đã kích hoạt lộ trình. Chúc bạn học tốt!");
      reloadStats();
      setDecksPending(true);
      // Response activate (?date=) đã có "hôm nay" đúng theo máy khách (LP-11), nhưng forecast[] / days[] chỉ có ở
      // GET /{id} -> tải thêm một lần để biểu đồ khối lượng hiện ngay.
      void refreshPath();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setActivating(false);
    }
  };

  const handleActivate = (values: ActivateValues) => runOnce(inFlight.current, "activate", () => activate(values));

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

  // Cân lại lịch (LP-4): hỏi trước vì server xếp lại mọi thẻ chưa học; lỗi hiện ngay trong hộp thoại. Khoá giữ suốt lúc hộp
  // thoại mở: bấm đúp nút không mở hộp thứ hai đè hộp đang chờ.
  const rebalance = async (extend: boolean) => {
    // Kết quả gom qua object vì gán trong closure `action` (TS không theo dõi gán trong hàm con).
    const done: { path?: LearningPath } = {};
    const ok = await dialog.confirm({
      title: extend ? "Kéo dài lộ trình?" : "Cân lại lịch?",
      message: extend
        ? "Giữ nhịp học hiện tại và kéo dài số ngày tới khi đủ chỗ cho thẻ nợ. Thẻ đã học giữ nguyên lịch ôn."
        : "Chia thẻ nợ và thẻ chưa tới ngày đều vào các ngày còn lại (giữ ngày kết thúc). Thẻ đã học giữ nguyên lịch ôn.",
      confirmLabel: extend ? "Kéo dài" : "Cân lại",
      tone: "info",
      action: async () => {
        setBusyAction("rebalance");
        try {
          done.path = await rebalanceLearningPath(id, extend);
        } finally {
          setBusyAction(null);
        }
      },
    });
    const next = done.path;
    if (!ok || !next) return;
    refreshSeq.current++;
    setPath(next);
    setActionError(null);
    setNotice(
      next.overflow
        ? `Đã ${extend ? "kéo dài" : "cân lại"} lịch. ${OVERFLOW_WARNING}`
        : extend
          ? `Đã kéo dài lộ trình tới ${next.totalDays} ngày.`
          : "Đã cân lại lịch cho các ngày còn lại."
    );
    void refreshPath(); // forecast[] chỉ có ở GET /{id}
  };

  const handleRebalance = (extend: boolean) => runOnce(inFlight.current, "rebalance", () => rebalance(extend));

  const complete = async () => {
    const ok = await dialog.confirm({
      title: "Hoàn thành lộ trình?",
      message: "Bạn đã học hết thẻ của lộ trình. Chốt hoàn thành để ghi nhận; bộ thẻ và lịch ôn vẫn hoạt động bình thường.",
      confirmLabel: "Hoàn thành",
      tone: "success",
      action: async () => {
        setBusyAction("complete");
        try {
          await completeLearningPath(id);
        } finally {
          setBusyAction(null);
        }
      },
    });
    if (!ok) return;
    setNotice("Chúc mừng! Lộ trình đã được đánh dấu hoàn thành.");
    reloadStats();
    await refreshPath();
  };

  const handleComplete = () => runOnce(inFlight.current, "complete", complete);

  // FAILED -> chạy lại từ bước phân tích (không tốn lượt). Server từ chối (400: job mất văn bản) -> hiện lý do trong panel.
  const retry = async () => {
    setBusyAction("retry");
    try {
      const next = await retryLearningPath(id);
      refreshSeq.current++;
      setPath(next);
      setActionError(null);
      setPollRound((n) => n + 1); // PROCESSING: poll như lúc tạo
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRetry = () => runOnce(inFlight.current, "retry", retry);

  // Dịch lại nghĩa: 202 + lộ trình (trạng thái không đổi), job chuyển sang chạy bước ENRICH -> poll tới khi job DONE.
  // Lỗi: tải lại (qua vòng poll, để tiếp tục poll nếu job hoá ra đang chạy). Cooldown 5 phút chỉ tính từ
  // `job.stats.enrichedAt` server trả — 429 của server luôn kèm mốc đó, còn 429 "hàng đợi đầy" (job thành FAILED) thì
  // không có cooldown và nút phải bấm lại được ngay, nên không đặt mốc chờ ở máy khách.
  const enrich = async () => {
    setBusyAction("enrich");
    try {
      const next = await enrichLearningPath(id);
      refreshSeq.current++;
      setPath(next);
      setActionError(null);
      pollExtraUntil.current = Date.now() + ENRICH_POLL_MS;
      setPollRound((n) => n + 1);
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setPollRound((n) => n + 1);
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnrich = () => runOnce(inFlight.current, "enrich", enrich);

  // Spec 21/10: sửa văn bản gốc (OCR hạ cấp) -> hỏi trước vì bản nháp chương hiện tại bị dựng lại; 202 PROCESSING -> poll như
  // lúc tạo. Lỗi server hiện trong hộp thoại (action), người dùng sửa tiếp hoặc huỷ.
  const reanalyzeText = async (text: string) => {
    setBusyAction("text");
    try {
      const done: { path?: LearningPath } = {};
      const ok = await dialog.confirm({
        title: "Phân tích lại từ văn bản đã sửa?",
        message: "Bản nháp chương hiện tại sẽ được dựng lại từ văn bản mới. Chương đã đổi tên hoặc gộp sẽ về như ban đầu.",
        confirmLabel: "Phân tích lại",
        tone: "warning",
        action: async () => {
          done.path = await updateLearningPathText(id, text);
        },
      });
      if (!ok || !done.path) return;
      refreshSeq.current++;
      setPath(done.path);
      setActionError(null);
      setPollRound((n) => n + 1);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReanalyzeText = (text: string) => runOnce(inFlight.current, "text", () => reanalyzeText(text));

  // Kiểm tra chương: server mở (hoặc nối lại) lượt quiz exam trên bộ của chương; QuizPage khôi phục đúng lượt qua ?attempt=.
  // ?path= để màn kết quả quiz có nút "Về lộ trình" (chương hiện "Đã qua" ngay khi đạt ngưỡng). Lượt trả về không phải exam
  // (server cũ trả lại lượt luyện tập đang mở) -> báo lỗi, không vào: làm ở đó chương không bao giờ qua (chapterQuizTarget).
  // Bộ của chương đang có lượt làm dở mà server sẽ nộp thay (luyện tập đã làm câu nào đó, bài kiểm tra ít câu mở từ trang Quiz)
  // -> hỏi trước (chapterQuizReplaceNotice); hủy thì không gọi server, lượt đó vẫn làm tiếp được ở trang Quiz.
  const startQuiz = async (cid: string) => {
    setQuizBusy(cid);
    setQuizError(null);
    try {
      const chapter = path?.chapters?.find((c) => c.id === cid);
      if (chapter?.deckId) {
        const notice = chapterQuizReplaceNotice(await fetchOpenQuizAttempt(chapter.deckId), chapter.cardCount);
        if (notice) {
          const ok = await dialog.confirm({
            title: "Nộp bài đang làm dở?",
            message: notice,
            confirmLabel: "Nộp và kiểm tra",
            tone: "warning",
          });
          if (!ok) return;
        }
      }
      const target = chapterQuizTarget(await startChapterQuiz(id, cid), id);
      if ("error" in target) {
        setQuizError({ chapterId: cid, message: target.error });
        return;
      }
      navigate(target.url);
    } catch (e) {
      setQuizError({ chapterId: cid, message: extractErrorMessage(e) });
    } finally {
      setQuizBusy(null);
    }
  };

  const handleStartQuiz = (cid: string) => runOnce(inFlight.current, "quiz", () => startQuiz(cid));

  // Cài đặt (trần / ngày học / nhắc / số ngày / ngày bắt đầu): PATCH ?date= trả lộ trình đã xếp lại; ném lỗi cho hộp thoại.
  const handleSaveSettings = async (patch: LearningPathPatch) => {
    setBusyAction("settings");
    try {
      const next = await updateLearningPath(id, patch);
      refreshSeq.current++;
      setPath(next);
      setActionError(null);
      setNotice(next.overflow ? `Đã lưu cài đặt. ${OVERFLOW_WARNING}` : "Đã lưu cài đặt lộ trình.");
      void refreshPath(); // forecast[] chỉ có ở GET /{id}
    } finally {
      setBusyAction(null);
    }
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
  const busy = activating || busyAction !== null;

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
            <div className="flex flex-wrap items-center gap-2">
              <PathStatusChip status={path.status} completed={!!path.completedAt} />
              {path.sourceType === "remedial" && <RemedialChip />}
            </div>
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

      {notice && (
        <p
          role="status"
          className="p-3 rounded-lg bg-secondary-container/40 border border-secondary/30 text-on-secondary-container text-body-sm flex items-start gap-2"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="p-0.5 rounded hover:bg-secondary/20" aria-label="Ẩn thông báo">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </p>
      )}

      {/* Bản nháp / thất bại tự hiện lỗi trong khối của mình. */}
      {actionError && path.status !== "DRAFT" && path.status !== "FAILED" && (
        <p ref={actionErrorRef} role="alert" className="scroll-mt-20 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {actionError}
        </p>
      )}

      {processing && <PathProcessingPanel path={path} />}

      {path.status === "FAILED" && (
        <PathFailedPanel
          path={path}
          onRetry={() => void handleRetry()}
          onRecreate={() => setCreateOpen(true)}
          onDelete={handleDelete}
          busy={busy}
          retrying={busyAction === "retry"}
          error={actionError}
        />
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
          onEnrich={() => void handleEnrich()}
          enriching={busyAction === "enrich"}
          onReanalyzeText={async (text) => {
            await handleReanalyzeText(text);
          }}
        />
      )}

      {path.status === "ACTIVE" && (
        <>
          <PathActiveView
            path={path}
            decks={decks}
            reviews={reviews}
            now={new Date()}
            decksPending={showDecksPending}
            busy={busy}
            quizBusy={quizBusy}
            onRebalance={(extend) => void handleRebalance(extend)}
            onComplete={() => void handleComplete()}
            onStartQuiz={(cid) => void handleStartQuiz(cid)}
            quizError={quizError}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <PathSettingsDrawer
            isOpen={settingsOpen}
            path={path}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
          />
        </>
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
