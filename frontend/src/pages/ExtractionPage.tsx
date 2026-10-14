import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { extractErrorMessage } from "@/services/apiClient";
import {
  deleteExtraction,
  fetchExtraction,
  fetchExtractionItems,
  patchExtractionItems,
  reEnrichExtraction,
  rerunExtraction,
  updateExtractionText,
} from "@/services/extractionService";
import type { Deck, ExtractionItem, ExtractionItemPatch, ExtractionJob } from "@/types/api.types";
import { StageStepper } from "@/features/extraction/components/StageStepper";
import { ExtractionStatusBadge } from "@/features/extraction/components/ExtractionStatusBadge";
import { ExtractedTextPanel } from "@/features/extraction/components/ExtractedTextPanel";
import { ExtractionItemsPanel } from "@/features/extraction/components/ExtractionItemsPanel";
import { CreateDecksModal } from "@/features/extraction/components/CreateDecksModal";
import { SOURCE_TYPE_LABELS, formatDateTime, isActiveStatus } from "@/features/extraction/extractionUtils";

const POLL_MS = 2000;

/** Chỉ số dùng để tải lại items: đổi khi job hoàn tất một lần chạy mới (finishedAt mới). */
const doneKey = (job: ExtractionJob | null) => (job?.status === "DONE" ? (job.finishedAt ?? "done") : null);

export const ExtractionPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();

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
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-space-md items-start">
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
