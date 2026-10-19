import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { useAsync } from "@/lib/useAsync";
import { SERVER_PENDING_MESSAGE, isEndpointMissing } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { applyIPlusOne, fetchIPlusOne } from "@/services/extractionService";
import { LevelChip } from "@/features/hanviet/components/HanVietBits";
import { SpeakButton } from "@/features/kanji/components/KanjiBits";
import type { ExtractionItem } from "@/types/api.types";
import type { IPlusOneResponse, IPlusOneSentence } from "@/types/learner.types";
import { assumeKnownScope, highlightRuby, sentenceCountsLabel, splitHighlight } from "../iPlusOneUtils";

interface IPlusOnePanelProps {
  jobId: string;
  /** Item hiện có của job: biết câu nào đang là câu ví dụ và tên từ cho thông báo. */
  items: ExtractionItem[];
  /** Trình độ của job (options.userLevel) cho nhãn tuỳ chọn "coi từ dễ hơn là đã biết". */
  userLevel: string;
  /** Item server trả sau khi gắn câu ví dụ; null = response hỏng (nơi gọi tải lại items). */
  onApplied: (item: ExtractionItem | null) => void;
}

const TOAST_MS = 4000;

const sentenceKey = (s: IPlusOneSentence) => `${s.target.lemma}\u0000${s.sentence}`;

/** Câu với từ đích được tô + furigana; không tìm thấy từ trong câu thì hiện nguyên câu. */
const HighlightedSentence: React.FC<{ s: IPlusOneSentence }> = ({ s }) => {
  const parts = splitHighlight(s.sentence, [s.target.surface, s.target.lemma]);
  if (!parts) return <>{s.sentence}</>;
  const ruby = highlightRuby(parts.match, s.target);
  return (
    <>
      {parts.before}
      <mark className="bg-amber-100 text-on-surface rounded px-0.5 font-semibold">
        <span className="sr-only">(từ mới) </span>
        <Ruby term={parts.match} reading={ruby.reading ?? undefined} segments={ruby.segments} />
      </mark>
      {parts.after}
    </>
  );
};

// Tab "Câu ví dụ i+1" của trang bóc tách (C6): câu trong chính tài liệu chỉ có đúng MỘT từ người học chưa biết — đọc
// hiểu được ngữ cảnh nên từ mới dễ nhớ (giả thuyết i+1 của Krashen). Từ đích được tô và có furigana; câu nào gắn với một
// mục bóc tách thì "Dùng làm câu ví dụ" để thẻ tạo ra mang câu đó. Chỉ tải khi mở tab (server phải tách câu + đối chiếu
// thẻ đã học), backend chưa có endpoint thì báo câu bình tĩnh.
export const IPlusOnePanel: React.FC<IPlusOnePanelProps> = ({ jobId, items, userLevel, onApplied }) => {
  const headingId = useId();
  const optionId = useId();
  const [assumeLevelKnown, setAssumeLevelKnown] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<{ key: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const result = useAsync<IPlusOneResponse | "unavailable">(
    async () => {
      try {
        return await fetchIPlusOne(jobId, { assumeLevelKnown });
      } catch (e) {
        if (isEndpointMissing(e)) return "unavailable";
        throw e;
      }
    },
    [jobId, assumeLevelKnown, retryKey]
  );
  const data = result.data && result.data !== "unavailable" ? result.data : null;
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const showToast = (text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  const apply = async (s: IPlusOneSentence) => {
    if (!s.itemId || applying) return;
    const key = sentenceKey(s);
    setApplying(key);
    setApplyError(null);
    try {
      const updated = await applyIPlusOne(jobId, s.itemId, s.sentence);
      onApplied(updated);
      const term = updated?.term ?? itemById.get(s.itemId)?.term ?? s.target.lemma;
      showToast(`Đã dùng làm câu ví dụ cho «${term}».`);
    } catch (e) {
      setApplyError({ key, text: isEndpointMissing(e) ? SERVER_PENDING_MESSAGE : extractErrorMessage(e) });
    } finally {
      setApplying(null);
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-title-md text-title-md font-bold text-on-surface">
          Câu ví dụ i+1
        </h2>
        <p className="text-body-sm text-on-surface-variant max-w-3xl">
          Câu i+1 chỉ có đúng <strong className="font-semibold text-on-surface">một từ bạn chưa biết</strong>, mọi từ khác
          bạn đã học — đọc là hiểu ngữ cảnh nên từ mới dễ nhớ hơn. Từ được tính là đã biết khi thẻ của nó đã ôn ít nhất 2
          lần hoặc có khoảng ôn từ 7 ngày.
        </p>
      </div>

      <label htmlFor={optionId} className="inline-flex items-start gap-2 text-body-sm text-on-surface cursor-pointer self-start">
        <input
          id={optionId}
          type="checkbox"
          checked={assumeLevelKnown}
          onChange={(e) => setAssumeLevelKnown(e.target.checked)}
          className="mt-0.5 rounded accent-primary cursor-pointer"
        />
        <span>Coi {assumeKnownScope(userLevel)} là đã biết</span>
      </label>

      {result.loading ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Đang tìm câu i+1...</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : result.data === "unavailable" ? (
        <p className="p-3 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant">{SERVER_PENDING_MESSAGE}</p>
      ) : result.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-body-sm text-error">
          <span>Không tải được câu i+1: {result.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetryKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-space-md rounded-xl border border-dashed border-surface-container-high flex flex-col items-center gap-2 text-center">
          <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">auto_stories</span>
          <p className="text-body-md font-semibold text-on-surface">Chưa có câu i+1 trong tài liệu này</p>
          <p className="text-body-sm text-on-surface-variant max-w-xl">
            {data && data.knownCount > 0
              ? `Bạn đã biết ${data.knownCount} từ, nhưng câu nào trong tài liệu cũng còn từ 2 từ mới trở lên.`
              : "Bạn chưa có từ nào được tính là đã biết."}{" "}
            Hãy ôn thêm thẻ (mỗi thẻ ôn từ 2 lần) rồi quay lại
            {assumeLevelKnown ? "." : `, hoặc bật tuỳ chọn coi ${assumeKnownScope(userLevel)} là đã biết.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-label-sm text-on-surface-variant">
            {data.items.length} câu · bạn đã biết {data.knownCount.toLocaleString("vi-VN")} từ
          </p>
          <ul className="flex flex-col gap-2">
            {data.items.map((s) => {
              const key = sentenceKey(s);
              const item = s.itemId ? itemById.get(s.itemId) : undefined;
              const isCurrent = !!item && item.example?.trim() === s.sentence;
              return (
                <li key={key} className="p-3 rounded-xl bg-surface-container-low/50 border border-surface-container-high flex flex-col gap-2 min-w-0">
                  <div className="flex items-start gap-1">
                    <p lang="ja" className="flex-1 min-w-0 font-japanese text-body-lg text-on-surface leading-loose break-words">
                      <HighlightedSentence s={s} />
                    </p>
                    <SpeakButton text={s.sentence} label={`Đọc câu chứa ${s.target.lemma}`} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-on-surface-variant">
                    <span className="font-semibold text-on-surface">Từ mới:</span>
                    <span lang="ja" className="font-japanese text-body-sm text-on-surface">
                      {s.target.lemma}
                      {s.target.reading && s.target.reading !== s.target.lemma && ` (${s.target.reading})`}
                    </span>
                    <LevelChip level={s.target.level} />
                    {s.target.meaningEn && <span className="break-words min-w-0">{s.target.meaningEn}</span>}
                    <span aria-hidden="true">·</span>
                    <span className="text-outline">{sentenceCountsLabel(s)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!s.itemId ? (
                      <span className="text-[11px] text-outline">Từ này không có trong danh sách bóc tách nên không gắn vào thẻ được.</span>
                    ) : isCurrent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/40 text-on-secondary-fixed-variant text-label-sm font-semibold">
                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check</span>
                        Đang là câu ví dụ
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void apply(s)}
                        isLoading={applying === key}
                        disabled={applying !== null && applying !== key}
                      >
                        {applying !== key && (
                          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">format_quote</span>
                        )}
                        Dùng làm câu ví dụ
                      </Button>
                    )}
                    {applyError?.key === key && (
                      <span role="alert" className="text-label-sm text-error break-words">
                        {applyError.text}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Vùng thông báo luôn có trong DOM để trình đọc màn hình đọc được nội dung chèn vào (vùng live mới mount thì
          thường bị bỏ qua); pointer-events-none để khung rỗng không chặn bấm vào trang. */}
      <div
        role="status"
        className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 pointer-events-none"
      >
        {toast && (
          <div className="pointer-events-auto flex items-center gap-3 p-3 rounded-xl bg-primary text-on-primary shadow-2xl">
            <span aria-hidden="true" className="material-symbols-outlined text-secondary-fixed text-[22px] shrink-0">
              check_circle
            </span>
            <p className="flex-1 min-w-0 text-body-sm break-words">
              {toast} <span className="text-on-primary/80">Thẻ tạo từ mục này sẽ mang câu ví dụ mới.</span>
            </p>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Đóng thông báo"
              className="p-1 rounded-lg hover:bg-white/10 cursor-pointer shrink-0"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
