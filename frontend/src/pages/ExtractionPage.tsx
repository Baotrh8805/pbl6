import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { extractErrorMessage } from "@/services/apiClient";
import {
  deleteExtraction,
  fetchExtraction,
  fetchExtractionItems,
  patchExtractionItems,
  reEnrichExtraction,
  recheckExtractionConflicts,
  rerunExtraction,
  updateExtractionText,
} from "@/services/extractionService";
import type { Deck, ExtractionItem, ExtractionItemPatch, ExtractionJob } from "@/types/api.types";
import { StageStepper } from "@/features/extraction/components/StageStepper";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { ExtractedTextPanel } from "@/features/extraction/components/ExtractedTextPanel";
import { ExtractionItemsPanel } from "@/features/extraction/components/ExtractionItemsPanel";
import { CreateDecksModal } from "@/features/extraction/components/CreateDecksModal";
import { LevelDistributionBar } from "@/features/extraction/components/LevelDistributionBar";
import { RecheckConflictsButton } from "@/features/extraction/components/RecheckConflictsButton";
import { IPlusOnePanel } from "@/features/extraction/components/IPlusOnePanel";
import { conflictsByFieldSummary, recheckResultText, statsConflictCount } from "@/features/extraction/conflictUtils";
import {
  LEVEL_TONE,
  OVERALL_RULE_HINT,
  SOURCE_TYPE_LABELS,
  UNKNOWN_LEVEL_TONE,
  formatDateTime,
  isActiveStatus,
  levelDistribution,
  overallLevelLabel,
} from "@/features/extraction/extractionUtils";

const POLL_MS = 2000;

type ResultView = "items" | "iplus1";

const VIEWS: { key: ResultView; label: string; icon: string }[] = [
  { key: "items", label: "Kết quả bóc tách", icon: "list_alt" },
  { key: "iplus1", label: "Câu ví dụ i+1", icon: "auto_stories" },
];
const viewTabId = (v: ResultView) => `extraction-view-${v}`;
const viewPanelId = (v: ResultView) => `extraction-view-panel-${v}`;

/** Chỉ số dùng để tải lại items: đổi khi job hoàn tất một lần chạy mới (finishedAt mới). */
const doneKey = (job: ExtractionJob | null) => (job?.status === "DONE" ? (job.finishedAt ?? "done") : null);

export const ExtractionPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  // Tab kết quả trên URL (?view=iplus1) để F5 / Back giữ đúng tab; tab i+1 chỉ tải khi mở.
  const [params, setParams] = useSearchParams();
  const view: ResultView = params.get("view") === "iplus1" ? "iplus1" : "items";
  const viewRefs = useRef<Partial<Record<ResultView, HTMLButtonElement | null>>>({});
  const [recheckNote, setRecheckNote] = useState<string | null>(null);

  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tăng để khởi động lại vòng poll (sau "Phân tích lại" / "Chạy lại").
  const [pollRound, setPollRound] = useState(0);

  const [items, setItems] = useState<ExtractionItem[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Poll mỗi 2 s khi QUEUED/RUNNING; dừng khi DONE/FAILED hoặc rời trang.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await fetchExtraction(id, true);
        if (!alive) return;
        setJob(next);
        setLoadError(null);
        if (isActiveStatus(next.status)) timer = window.setTimeout(tick, POLL_MS);
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

  // Tải items khi job DONE (và mỗi lần chạy lại xong).
  const itemsKey = doneKey(job);
  useEffect(() => {
    if (!itemsKey) return;
    let alive = true;
    fetchExtractionItems(id)
      .then((list) => alive && setItems(list))
      .catch((e) => alive && setItemsError(extractErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [id, itemsKey]);

  // Cập nhật lạc quan rồi PATCH; server trả toàn bộ items nên lấy luôn làm nguồn sự thật.
  // Lỗi -> hiện thông báo và tải lại để không lệch với server.
  const handlePatch = useCallback(
    async (patches: ExtractionItemPatch[]) => {
      setItems((prev) => {
        const byId = new Map(patches.map((p) => [p.id, p]));
        return prev.map((it) => {
          const p = byId.get(it.id);
          return p ? { ...it, ...p } : it;
        });
      });
      setBusy(true);
      try {
        setItems(await patchExtractionItems(id, patches));
        setActionError(null);
      } catch (e) {
        setActionError(extractErrorMessage(e));
        try {
          setItems(await fetchExtractionItems(id));
        } catch {
          // giữ state hiện tại; lỗi chính đã hiện ở trên
        }
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  const restartWith = (next: ExtractionJob) => {
    setJob(next);
    setItems([]);
    setPollRound((n) => n + 1);
  };

  const handleReanalyze = async (text: string) => {
    try {
      restartWith(await updateExtractionText(id, text));
      setActionError(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    }
  };

  const handleRerun = async () => {
    setBusy(true);
    try {
      restartWith(await rerunExtraction(id));
      setActionError(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Gemini hết quota / lỗi khi dịch: chỉ chạy lại bước ENRICH cho item thiếu nghĩa VI (không phân tích lại).
  const handleReEnrich = async () => {
    setBusy(true);
    try {
      restartWith(await reEnrichExtraction(id));
      setActionError(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // F2: đối chiếu lại với nguồn tri thức chuẩn. Server làm đồng bộ và trả job có stats.conflicts mới -> tải lại items
  // (conflicts nằm trên từng item). Nếu server chuyển job sang chạy nền thì poll như "Chạy lại". Lỗi để nút tự hiện.
  const handleRecheck = async () => {
    setRecheckNote(null);
    const next = await recheckExtractionConflicts(id);
    if (isActiveStatus(next.status)) {
      restartWith(next);
      return;
    }
    // Response không kèm văn bản (chỉ GET ?includeText=true có): giữ văn bản đang hiện cho khung "Văn bản đã bóc".
    setJob((prev) => ({ ...next, extractedText: next.extractedText ?? prev?.extractedText }));
    setItems(await fetchExtractionItems(id));
    setRecheckNote(recheckResultText(next.stats));
  };

  // i+1 "Dùng làm câu ví dụ": thay item server trả vào danh sách; response hỏng thì tải lại cả danh sách.
  const handleApplied = (updated: ExtractionItem | null) => {
    if (updated) {
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      return;
    }
    fetchExtractionItems(id)
      .then(setItems)
      .catch(() => {
        // giữ danh sách hiện tại; câu ví dụ đã lưu trên server, lần tải sau sẽ thấy
      });
  };

  const selectView = (next: ResultView) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === "items") out.delete("view");
        else out.set("view", next);
        return out;
      },
      { replace: true }
    );

  const onViewKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = VIEWS.findIndex((v) => v.key === view);
    const n = VIEWS.length;
    const next =
      e.key === "Home" ? VIEWS[0] : e.key === "End" ? VIEWS[n - 1] : VIEWS[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    selectView(next.key);
    viewRefs.current[next.key]?.focus();
  };

  const handleDelete = async () => {
    const ok = await dialog.confirm({
      title: "Xoá kết quả bóc tách?",
      message: "Văn bản và danh sách từ đã bóc tách sẽ bị xoá. Bộ thẻ đã tạo từ job này vẫn giữ nguyên.",
      confirmLabel: "Xoá",
      tone: "danger",
      action: () => deleteExtraction(id),
    });
    if (ok) navigate("/extractions");
  };

  const handleCreated = async (decks: Deck[]) => {
    setCreateOpen(false);
    if (decks.length > 1) {
      await dialog.alert({
        title: "Đã tạo bộ thẻ",
        tone: "success",
        message: (
          <ul className="list-disc pl-5">
            {decks.map((d) => (
              <li key={d.id}>
                {d.title} ({d.cards.length} thẻ)
              </li>
            ))}
          </ul>
        ),
      });
    }
    if (decks[0]) navigate(`/decks/${encodeURIComponent(decks[0].id)}`);
  };

  if (loadError && !job)
    return (
      <div className="py-space-lg flex flex-col items-start gap-space-sm">
        <p className="text-error">{loadError}</p>
        <Link to="/extractions" className="text-primary hover:underline">
          ← Danh sách bóc tách
        </Link>
      </div>
    );
  if (!job) return <p className="text-on-surface-variant py-space-lg">Đang tải...</p>;
  const canReEnrich =
    job.status === "DONE" &&
    job.options.meaningLang === "vi" &&
    job.stats?.enriched === false &&
    (job.stats.enrichReason === "quota" || job.stats.enrichReason === "error");

  const active = isActiveStatus(job.status);

  // B6: phân bố cấp + cấp tổng thể chỉ khi DONE – chạy lại vẫn giữ stats cũ tới khi xong nên không hiện số cũ lúc đang chạy.
  const levelDist = job.status === "DONE" ? levelDistribution(job.stats) : null;
  const chapterCaps = job.stats?.capPerChapter;
  const cappedChapters = job.status === "DONE" && Array.isArray(chapterCaps) ? chapterCaps.length : 0;
  // F2: null = job chưa được đối chiếu (job cũ / backend chưa có bước kiểm mâu thuẫn).
  const conflictCount = statsConflictCount(job.stats);
  const conflictFields = conflictsByFieldSummary(job.stats);

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <nav aria-label="Đường dẫn">
        <Link to="/extractions" className="text-label-md text-primary hover:underline inline-flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          Bóc tách AI
        </Link>
      </nav>

      <header className="flex flex-col gap-space-md p-space-md bg-surface-container-lowest border border-surface-container-high rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ExtractionStatusBadge status={job.status} />
              <span className="px-2 py-0.5 rounded-full bg-surface-container text-outline text-label-sm font-medium">
                {SOURCE_TYPE_LABELS[job.sourceType]}
              </span>
              {/* Chỉ job mới (có byLevelAll) mới có cấp tổng thể; null = ai-service chưa đủ dữ liệu. */}
              {levelDist?.source === "all" && (
                <span
                  title={OVERALL_RULE_HINT}
                  className={`px-2 py-0.5 rounded-full text-label-sm font-semibold cursor-help ${
                    levelDist.overallLevel ? LEVEL_TONE[levelDist.overallLevel] : UNKNOWN_LEVEL_TONE
                  }`}
                >
                  {overallLevelLabel(levelDist.overallLevel)}
                </span>
              )}
            </div>
            <h1 className="mt-2 font-headline-sm text-headline-sm font-bold text-on-surface truncate">
              {job.sourceName || "Văn bản dán"}
            </h1>
            <p className="mt-1 text-label-sm text-outline">
              Tạo lúc {formatDateTime(job.createdAt)} · trình độ {job.options.userLevel}
              {job.finishedAt && ` · xong lúc ${formatDateTime(job.finishedAt)}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {job.deckIds.length > 0 && (
              <Link
                to={`/decks/${encodeURIComponent(job.deckIds[0])}`}
                className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:opacity-90"
              >
                Bộ thẻ đã tạo{job.deckIds.length > 1 ? ` (${job.deckIds.length})` : ""}
              </Link>
            )}
            {!active && (
              <Button variant="ghost" size="md" onClick={handleDelete} className="text-error hover:bg-error/10 hover:text-error">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                Xoá
              </Button>
            )}
          </div>
        </div>

        <StageStepper status={job.status} stage={job.stage} />

        {(levelDist || cappedChapters >= 2) && (
          <div className="flex flex-col gap-1.5 pt-space-sm border-t border-surface-container-high">
            <LevelDistributionBar stats={job.stats} />
            {cappedChapters >= 2 && (
              <p className="text-label-sm text-outline inline-flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">menu_book</span>
                Giới hạn từ vựng chia theo chương: {cappedChapters} chương
              </p>
            )}
          </div>
        )}

        {job.status === "DONE" && (
          <div className="flex flex-wrap items-center gap-2 pt-space-sm border-t border-surface-container-high">
            {conflictCount == null ? (
              <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">fact_check</span>
                Chưa đối chiếu với nguồn tri thức chuẩn
              </span>
            ) : conflictCount > 0 ? (
              <>
                <span
                  title="Tài liệu ghi khác nguồn tri thức chuẩn (cách đọc, nghĩa, cấp...). Xem từng mục có badge cảnh báo."
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-label-sm font-semibold"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warning</span>
                  {conflictCount} cảnh báo mâu thuẫn
                </span>
                {conflictFields && <span className="text-label-sm text-outline">{conflictFields}</span>}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-label-sm text-secondary font-semibold">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified</span>
                Không có mâu thuẫn với nguồn chuẩn
              </span>
            )}
            <RecheckConflictsButton onRecheck={handleRecheck} disabled={busy} />
            <span aria-live="polite" className="text-label-sm text-on-surface-variant">
              {recheckNote}
            </span>
          </div>
        )}

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

      {active && (
        <p className="p-space-md rounded-2xl bg-surface-container-low text-body-sm text-on-surface-variant" aria-live="polite">
          Hệ thống đang xử lý tài liệu. Bạn có thể rời trang và quay lại sau từ mục Bóc tách AI.
        </p>
      )}

      {job.status === "FAILED" && (
        <div className="p-space-md rounded-2xl bg-error/5 border border-error/20 flex flex-col gap-3">
          <p className="text-body-md text-error font-semibold">Xử lý thất bại</p>
          <p className="text-body-sm text-on-surface">{job.errorMessage || "Không rõ nguyên nhân."}</p>
          <div className="flex gap-2">
            {job.extractedText && (
              <Button variant="primary" size="sm" onClick={handleRerun} isLoading={busy}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">replay</span>
                Chạy lại
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy}>
              Xoá
            </Button>
          </div>
        </div>
      )}

      {job.status === "DONE" && (job.stats?.layout === "list" || canReEnrich) && (
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          {job.stats?.layout === "list" && (
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">
              Nhận dạng: danh sách từ vựng — mỗi dòng một cụm, nghĩa lấy từ tài liệu
            </span>
          )}
          {canReEnrich && (
            <>
              <span className="text-on-surface-variant">
                Chưa dịch được nghĩa tiếng Việt (AI hết hạn mức hoặc lỗi), thẻ tạm dùng nghĩa tiếng Anh.
              </span>
              <Button variant="outline" size="sm" onClick={handleReEnrich} isLoading={busy}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">translate</span>
                Dịch lại nghĩa
              </Button>
            </>
          )}
        </div>
      )}

      {job.status === "DONE" && (
        <div
          role="tablist"
          aria-label="Xem kết quả"
          onKeyDown={onViewKeyDown}
          className="flex gap-1 p-1 rounded-xl bg-surface-container-low self-start max-w-full overflow-x-auto"
        >
          {VIEWS.map((v) => {
            const selected = v.key === view;
            return (
              <button
                key={v.key}
                ref={(el) => {
                  viewRefs.current[v.key] = el;
                }}
                id={viewTabId(v.key)}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={selected ? viewPanelId(v.key) : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectView(v.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg text-label-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  selected
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  {v.icon}
                </span>
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {job.status === "DONE" && view === "iplus1" && (
        <div role="tabpanel" id={viewPanelId("iplus1")} aria-labelledby={viewTabId("iplus1")}>
          <IPlusOnePanel jobId={id} items={items} userLevel={job.options.userLevel} onApplied={handleApplied} />
        </div>
      )}

      {job.status === "DONE" && view === "items" && (
        <div
          role="tabpanel"
          id={viewPanelId("items")}
          aria-labelledby={viewTabId("items")}
          className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-space-md items-start"
        >
          {/* key theo finishedAt: chạy lại xong thì textarea nhận văn bản mới */}
          <ExtractedTextPanel key={job.finishedAt ?? "text"} job={job} onReanalyze={handleReanalyze} />
          {itemsError ? (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
              Không tải được kết quả: {itemsError}
            </p>
          ) : (
            <ExtractionItemsPanel
              items={items}
              stats={job.stats}
              onPatch={handlePatch}
              onCreateDecks={() => setCreateOpen(true)}
              busy={busy}
            />
          )}
        </div>
      )}

      {createOpen && (
        <CreateDecksModal isOpen onClose={() => setCreateOpen(false)} job={job} items={items} onCreated={handleCreated} />
      )}
    </section>
  );
};

export default ExtractionPage;
