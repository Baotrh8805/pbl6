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

  const handleRecheck = async () => {
    setRecheckNote(null);
    const next = await recheckExtractionConflicts(id);
    if (isActiveStatus(next.status)) {
      restartWith(next);
      return;
    }
    setJob((prev) => ({ ...next, extractedText: next.extractedText ?? prev?.extractedText }));
    setItems(await fetchExtractionItems(id));
    setRecheckNote(recheckResultText(next.stats));
  };

  const handleApplied = (updated: ExtractionItem | null) => {
    if (updated) {
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      return;
    }
    fetchExtractionItems(id)
      .then(setItems)
      .catch(() => {
        // giữ danh sách hiện tại
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
    navigate(`/decks/${encodeURIComponent(decks[0].id)}`);
  };

  if (loadError && !job)
    return (
      <div className="py-8 flex flex-col items-start gap-3">
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm w-full">
          {loadError}
        </div>
        <Link to="/extractions" className="text-blue-600 hover:underline font-semibold text-sm inline-flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          Danh sách bóc tách
        </Link>
      </div>
    );

  if (!job) {
    return (
      <div className="flex flex-col gap-6 pb-12" aria-busy="true" aria-label="Đang tải kết quả bóc tách">
        {/* Back Link Skeleton */}
        <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />

        {/* Header & Stepper Card Skeleton */}
        <header className="flex flex-col gap-5 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 animate-pulse">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 rounded-full bg-slate-200" />
                <div className="h-5 w-16 rounded-full bg-slate-100" />
              </div>
              <div className="h-8 w-2/5 rounded-lg bg-slate-200" />
              <div className="h-4 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="h-9 w-28 rounded-xl bg-slate-200 shrink-0" />
          </div>

          {/* Stepper Skeleton (4 steps) */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-[120px]">
                <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-3.5 w-16 rounded bg-slate-200" />
                  <div className="h-2.5 w-12 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </header>

        {/* Filter Toolbar Skeleton */}
        <div className="h-12 w-full rounded-2xl bg-white border border-slate-200/90 animate-pulse" />

        {/* Item Rows Skeleton */}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 flex-1">
                <div className="h-5 w-24 rounded bg-slate-200" />
                <div className="h-4 w-40 rounded bg-slate-100" />
              </div>
              <div className="h-8 w-20 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const canReEnrich =
    job.status === "DONE" &&
    job.options.meaningLang === "vi" &&
    job.stats?.enriched === false &&
    (job.stats.enrichReason === "quota" || job.stats.enrichReason === "error");

  const active = isActiveStatus(job.status);
  const levelDist = job.status === "DONE" ? levelDistribution(job.stats) : null;
  const chapterCaps = job.stats?.capPerChapter;
  const cappedChapters = job.status === "DONE" && Array.isArray(chapterCaps) ? chapterCaps.length : 0;
  const conflictCount = statsConflictCount(job.stats);
  const conflictFields = conflictsByFieldSummary(job.stats);

  return (
    <section className="flex flex-col gap-6 pb-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Đường dẫn">
        <Link to="/extractions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Bóc tách AI</span>
        </Link>
      </nav>

      {/* Header & Stepper Card */}
      <header className="flex flex-col gap-5 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ExtractionStatusBadge status={job.status} />
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200/60">
                {SOURCE_TYPE_LABELS[job.sourceType]}
              </span>
              {levelDist?.source === "all" && (
                <span
                  title={OVERALL_RULE_HINT}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border cursor-help ${
                    levelDist.overallLevel ? LEVEL_TONE[levelDist.overallLevel] : UNKNOWN_LEVEL_TONE
                  }`}
                >
                  {overallLevelLabel(levelDist.overallLevel)}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight truncate">
              {job.sourceName || "Văn bản dán"}
            </h1>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Tạo lúc {formatDateTime(job.createdAt)} · trình độ mục tiêu JLPT {job.options.userLevel}
              {job.finishedAt && ` · hoàn tất lúc ${formatDateTime(job.finishedAt)}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {job.deckIds.length > 0 && (
              <Link
                to={`/decks/${encodeURIComponent(job.deckIds[0])}`}
                className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
              >
                Bộ thẻ đã tạo{job.deckIds.length > 1 ? ` (${job.deckIds.length})` : ""}
              </Link>
            )}
            {!active && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
                <span>Xoá</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-Step Stepper */}
        <div className="pt-2 border-t border-slate-100">
          <StageStepper status={job.status} stage={job.stage} />
        </div>

        {(levelDist || cappedChapters >= 2) && (
          <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
            <LevelDistributionBar stats={job.stats} />
            {cappedChapters >= 2 && (
              <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">menu_book</span>
                Giới hạn từ vựng chia theo chương: {cappedChapters} chương
              </p>
            )}
          </div>
        )}

        {job.status === "DONE" && (
          <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 text-xs">
            {conflictCount == null ? (
              <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">fact_check</span>
                Chưa đối chiếu với nguồn tri thức chuẩn
              </span>
            ) : conflictCount > 0 ? (
              <>
                <span
                  title="Tài liệu ghi khác nguồn tri thức chuẩn. Xem từng mục có badge cảnh báo."
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 font-bold"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warning</span>
                  {conflictCount} cảnh báo mâu thuẫn
                </span>
                {conflictFields && <span className="text-slate-400">{conflictFields}</span>}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified</span>
                Khớp chuẩn với nguồn tri thức
              </span>
            )}
            <RecheckConflictsButton onRecheck={handleRecheck} disabled={busy} />
            <span aria-live="polite" className="text-slate-500 font-medium">
              {recheckNote}
            </span>
          </div>
        )}

        {loadError && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>Mất kết nối khi theo dõi tiến trình: {loadError}</span>
            <button type="button" className="underline font-bold" onClick={() => setPollRound((n) => n + 1)}>
              Thử lại
            </button>
          </div>
        )}
      </header>

      {actionError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {actionError}
        </div>
      )}

      {active && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-sm flex items-center gap-3" aria-live="polite">
          <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0"></span>
          <span>Hệ thống AI đang xử lý tài liệu. Bạn có thể rời trang và quay lại sau từ danh sách Bóc tách AI.</span>
        </div>
      )}

      {job.status === "FAILED" && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col gap-3">
          <p className="text-base text-rose-900 font-bold">Xử lý thất bại</p>
          <p className="text-sm text-rose-700">{job.errorMessage || "Không rõ nguyên nhân."}</p>
          <div className="flex gap-2 pt-1">
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
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {job.stats?.layout === "list" && (
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
              Nhận dạng: danh sách từ vựng — mỗi dòng một cụm, nghĩa lấy từ tài liệu
            </span>
          )}
          {canReEnrich && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">
                Chưa dịch được nghĩa tiếng Việt (hết quota hoặc lỗi mạng), thẻ tạm dùng nghĩa tiếng Anh.
              </span>
              <button
                type="button"
                onClick={handleReEnrich}
                disabled={busy}
                className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-blue-600 shadow-2xs cursor-pointer"
              >
                Dịch lại nghĩa
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs Switcher: Kết quả bóc tách & Câu ví dụ i+1 */}
      {job.status === "DONE" && (
        <div
          role="tablist"
          aria-label="Xem kết quả"
          onKeyDown={onViewKeyDown}
          className="flex gap-1.5 p-1 rounded-xl bg-slate-100 self-start max-w-full overflow-x-auto border border-slate-200/80"
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
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selected
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  {v.icon}
                </span>
                <span>{v.label}</span>
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
          className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start"
        >
          <ExtractedTextPanel key={job.finishedAt ?? "text"} job={job} onReanalyze={handleReanalyze} />
          {itemsError ? (
            <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              Không tải được kết quả: {itemsError}
            </div>
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
