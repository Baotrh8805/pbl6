import React, { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { useAsync } from "@/lib/useAsync";
import { splitContent } from "@/lib/cardContent";
import {
  GROUP_TABS,
  REASON_HINTS,
  REASON_LABELS,
  REMEDIAL_MIN_CARDS,
  WEAKNESS_DAYS,
  WEAK_PREVIEW_COUNT,
  groupLabel,
  reasonCounts,
} from "@/lib/insightUtils";
import { fetchWeaknesses } from "@/services/insightService";
import type { WeaknessGroupBy, WeaknessReason } from "@/types/api.types";
import { CreateRemedialModal } from "./CreateRemedialModal";

interface WeaknessCardProps {
  /** ?remedial=1 (mục "Bổ khuyết" của Học gì tiếp): mở sẵn modal khi đủ thẻ yếu. */
  autoOpenRemedial?: boolean;
  /** Gọi một lần sau khi đã xử lý autoOpenRemedial (mở được hay không) để trang gỡ tham số khỏi URL. */
  onAutoOpenHandled?: () => void;
}

/** Số nhóm hiện trong một tab; còn lại gộp thành "+N nhóm" (chữ Hán có thể rất nhiều nhóm). */
const GROUP_PREVIEW = 12;

const REASON_TONE: Record<WeaknessReason, string> = {
  lapses: "bg-error-container text-on-error-container",
  low_ease: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  slow: "bg-[#FEF3C7] text-[#B45309]",
  quiz_wrong: "bg-primary-fixed text-on-primary-fixed",
};

const tabId = (base: string, key: WeaknessGroupBy) => `${base}-tab-${key}`;
const panelId = (base: string, key: WeaknessGroupBy) => `${base}-panel-${key}`;

// Điểm yếu 30 ngày (spec §3.7): tổng số thẻ cần củng cố, lý do (hay quên / khó nhớ / chậm / sai quiz), cách gom theo cấp /
// loại / chữ Hán / bộ thẻ và 8 thẻ yếu nhất; nút tạo lộ trình bổ khuyết chỉ bật khi server báo đủ thẻ (canRemedial).
export const WeaknessCard: React.FC<WeaknessCardProps> = ({ autoOpenRemedial = false, onAutoOpenHandled }) => {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<WeaknessGroupBy>("level");
  const [modalOpen, setModalOpen] = useState(false);
  const tabRefs = useRef<Partial<Record<WeaknessGroupBy, HTMLButtonElement | null>>>({});
  const { data, error, loading } = useAsync(() => fetchWeaknesses(WEAKNESS_DAYS), [reload]);
  const canRemedial = data?.canRemedial ?? false;

  // Mở modal theo URL chỉ sau khi đã biết có đủ thẻ yếu hay không (điều chỉnh state ngay trong render, không cần effect);
  // tham số gỡ đi thì đặt lại cờ để lần bấm "Bổ khuyết" sau (cùng trang) vẫn mở được.
  const [autoHandled, setAutoHandled] = useState(false);
  if (autoOpenRemedial && !loading && !autoHandled) {
    setAutoHandled(true);
    if (canRemedial) setModalOpen(true);
  } else if (!autoOpenRemedial && autoHandled) {
    setAutoHandled(false);
  }
  // Dù mở được hay không vẫn báo trang gỡ ?remedial=1 để F5 / Back không mở lại modal ngoài ý muốn.
  useEffect(() => {
    if (autoOpenRemedial && autoHandled) onAutoOpenHandled?.();
  }, [autoOpenRemedial, autoHandled, onAutoOpenHandled]);

  // Mẫu tablist WAI-ARIA: ←/→ (vòng quanh), Home/End chuyển tab và dời focus theo.
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = GROUP_TABS.map((t) => t.key);
    const i = keys.indexOf(tab);
    let next: WeaknessGroupBy | undefined;
    if (e.key === "ArrowRight") next = keys[(i + 1) % keys.length];
    else if (e.key === "ArrowLeft") next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === "Home") next = keys[0];
    else if (e.key === "End") next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const groups = data?.groups[tab] ?? [];

  return (
    <section
      aria-labelledby={headingId}
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-tertiary">troubleshoot</span>
          Điểm yếu
        </h2>
        <span className="text-label-sm text-outline">{WEAKNESS_DAYS} ngày gần đây</span>
      </div>

      {loading ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Đang phân tích điểm yếu...</span>
          <div className="h-8 w-40 rounded-lg bg-surface-container-low animate-pulse" />
          <div className="h-24 rounded-xl bg-surface-container-low animate-pulse" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Không tải được điểm yếu: {error ?? "dữ liệu trống"}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="underline font-semibold">
            Thử lại
          </button>
        </p>
      ) : data.total === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-secondary">verified</span>
          <span>Chưa thấy thẻ nào cần củng cố trong {WEAKNESS_DAYS} ngày qua. Cứ giữ nhịp ôn đều nhé!</span>
        </div>
      ) : (
        <>
          <p className="text-body-md text-on-surface">
            <strong className="font-headline-sm text-headline-sm font-bold text-tertiary tabular-nums">{data.total}</strong>{" "}
            thẻ cần củng cố
          </p>

          <ul aria-label="Lý do" className="flex flex-wrap gap-1.5">
            {reasonCounts(data.cards).map(({ reason, count }) => (
              <li
                key={reason}
                title={REASON_HINTS[reason]}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold ${REASON_TONE[reason]}`}
              >
                {REASON_LABELS[reason]}
                <span className="tabular-nums">· {count}</span>
                <span className="sr-only"> thẻ ({REASON_HINTS[reason]})</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <div
              role="tablist"
              aria-label="Gom thẻ yếu theo"
              onKeyDown={onTabKeyDown}
              className="flex gap-1 overflow-x-auto p-1 rounded-xl bg-surface-container-low"
            >
              {GROUP_TABS.map((t) => {
                const selected = t.key === tab;
                return (
                  <button
                    key={t.key}
                    ref={(el) => {
                      tabRefs.current[t.key] = el;
                    }}
                    id={tabId(baseId, t.key)}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    aria-controls={selected ? panelId(baseId, t.key) : undefined}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTab(t.key)}
                    className={`flex-1 shrink-0 inline-flex items-center justify-center gap-1 px-2 py-1.5 min-h-9 rounded-lg text-label-md whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected
                        ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    {t.label}
                    <span className="text-label-sm text-outline tabular-nums">{data.groups[t.key].length}</span>
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" id={panelId(baseId, tab)} aria-labelledby={tabId(baseId, tab)}>
              {groups.length === 0 ? (
                <p className="text-label-sm text-outline">Không có nhóm nào.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {groups.slice(0, GROUP_PREVIEW).map((g) => (
                    <li
                      key={g.key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-surface-container-high text-label-md text-on-surface max-w-full"
                    >
                      <span lang={tab === "kanji" ? "ja" : undefined} className={`truncate ${tab === "kanji" ? "font-japanese text-body-md" : ""}`}>
                        {groupLabel(tab, g)}
                      </span>
                      <span className="text-label-sm font-semibold text-outline tabular-nums">{g.count}</span>
                    </li>
                  ))}
                  {groups.length > GROUP_PREVIEW && (
                    <li className="inline-flex items-center px-2.5 py-1 text-label-sm text-outline">
                      +{groups.length - GROUP_PREVIEW} nhóm
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-label-md font-semibold text-on-surface-variant">
              {Math.min(WEAK_PREVIEW_COUNT, data.cards.length)} thẻ yếu nhất
            </h3>
            <ul className="flex flex-col divide-y divide-surface-container-high rounded-xl border border-surface-container-high overflow-hidden">
              {data.cards.slice(0, WEAK_PREVIEW_COUNT).map((c) => (
                <li key={c.cardId} className="flex flex-col gap-1 px-3 py-2 bg-surface-container-lowest">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-body-lg font-semibold text-on-surface font-japanese break-all">
                      <Ruby term={c.term} reading={c.reading ?? undefined} />
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {c.reasons.map((r) => (
                        <span
                          key={r}
                          title={REASON_HINTS[r]}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${REASON_TONE[r]}`}
                        >
                          {REASON_LABELS[r]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant break-words">
                    {splitContent(c.meaning).head || <span className="text-outline">Chưa có nghĩa</span>}
                    {c.deckId && (
                      <>
                        {" · "}
                        <Link to={`/decks/${encodeURIComponent(c.deckId)}`} className="text-label-sm text-primary hover:underline">
                          {c.deckTitle ?? "Bộ thẻ"}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {data && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canRemedial}
            onClick={() => setModalOpen(true)}
            aria-describedby={!canRemedial ? `${baseId}-remedial-hint` : undefined}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">healing</span>
            Tạo lộ trình bổ khuyết
          </Button>
          {!canRemedial && (
            <span id={`${baseId}-remedial-hint`} className="text-label-sm text-outline">
              Cần ít nhất {REMEDIAL_MIN_CARDS} thẻ yếu (hiện có {data.total}).
            </span>
          )}
        </div>
      )}

      <CreateRemedialModal isOpen={modalOpen} onClose={() => setModalOpen(false)} weakness={data ?? null} />
    </section>
  );
};
