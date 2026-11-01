import React, { useId } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { kunLabel } from "@/lib/kanjiUtils";
import { HanVietBadge } from "@/features/hanviet/components/HanVietBadge";
import type { KanjiExample, KanjiInfoCard, Radical } from "@/types/api.types";
import { ExampleList, SpeakButton } from "./KanjiBits";
import { KanjiMnemonicSection } from "./KanjiMnemonicSection";

interface KanjiInfoCardViewProps {
  card: KanjiInfoCard;
  /** Bảng bộ thủ (có thể chưa tải): có thì hiện tên / nghĩa bộ, không thì chỉ số bộ. */
  radical: Radical | null;
  onWrite: (card: KanjiInfoCard) => void;
  onSpeakError: (message: string) => void;
  /** Chuỗi đang tra (?k=): giữ trên link sang tab Bộ thủ để quay lại tab Tra vẫn thấy đủ các chữ. */
  query: string;
  /** Thu gọn: chỉ còn dòng đầu (chữ, Hán-Việt, nghĩa, âm On / Kun tóm tắt); phần thân ẩn nhưng vẫn giữ trạng thái (mẹo đang viết). */
  expanded?: boolean;
  onToggle?: () => void;
}

interface ReadingRow {
  key: string;
  label: string;
  /** Đọc to: kun bỏ dấu chấm okurigana. */
  speak: string;
  examples: KanjiExample[];
}

const ReadingSection: React.FC<{
  title: string;
  hint: string;
  rows: ReadingRow[];
  emptyText: string;
  onSpeakError: (message: string) => void;
}> = ({ title, hint, rows, emptyText, onSpeakError }) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5 min-w-0">
      <h3 id={headingId} className="text-label-md font-semibold text-on-surface">
        {title} <span className="font-normal text-outline">{hint}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-label-sm text-outline">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl bg-surface-container-low p-2.5 flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-1">
                <span lang="ja" className="font-japanese text-body-lg font-bold text-primary">
                  {r.label}
                </span>
                <SpeakButton text={r.speak} label={`Phát âm ${r.speak}`} onError={onSpeakError} />
              </div>
              <ExampleList examples={r.examples} onSpeakError={onSpeakError} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// Thẻ một chữ Hán (C5): chữ lớn, Hán-Việt (link bản đồ Hán–Việt), nghĩa, số nét, bộ thủ (link sang tab Bộ thủ), mẹo nhớ
// (C4: mẹo đã duyệt + mẹo mình đã gửi), âm On / Kun mỗi âm ≤ 3 từ ví dụ JLPT. Hai cột âm trên màn rộng, xếp chồng trên mobile.
// Có onToggle thì thẻ thu gọn / mở rộng được (31/10: tra nhiều chữ một lúc không bị dài quá).
export const KanjiInfoCardView: React.FC<KanjiInfoCardViewProps> = ({ card, radical, onWrite, onSpeakError, query, expanded = true, onToggle }) => {
  const headingId = useId();
  const bodyId = useId();
  const readingsSummary = [...card.on.map((r) => r.reading), ...card.kun.map((r) => kunLabel(r))].join("・");
  const onRows: ReadingRow[] = card.on.map((r) => ({ key: r.reading, label: r.reading, speak: r.reading, examples: r.examples }));
  const kunRows: ReadingRow[] = card.kun.map((r) => ({
    key: kunLabel(r),
    label: kunLabel(r),
    speak: `${r.reading}${r.okurigana}`,
    examples: r.examples,
  }));

  return (
    <article
      aria-labelledby={headingId}
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm min-w-0"
    >
      <div className="flex items-start gap-space-md">
        <div
          className={`shrink-0 rounded-2xl bg-surface-container-low border border-surface-container-high flex items-center justify-center transition-all ${
            expanded ? "w-20 h-20 sm:w-24 sm:h-24" : "w-14 h-14"
          }`}
        >
          <h2 id={headingId} lang="ja" className={`font-japanese font-bold text-on-surface leading-none ${expanded ? "text-5xl sm:text-6xl" : "text-4xl"}`}>
            {card.kanji}
          </h2>
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {card.hanViet ? (
            <HanVietBadge hanViet={card.hanViet} className="text-body-md flex-wrap" />
          ) : (
            <span className="text-label-sm text-outline">Chưa có âm Hán-Việt</span>
          )}
          <p className={`text-body-sm text-on-surface-variant break-words ${expanded ? "" : "line-clamp-1"}`}>
            {card.meaningEn ?? <span className="text-outline">Chưa có nghĩa</span>}
            {card.meaningEn && <span className="text-outline"> (tiếng Anh)</span>}
          </p>
          {!expanded && readingsSummary && (
            <p lang="ja" className="text-label-sm text-on-surface-variant font-japanese truncate">{readingsSummary}</p>
          )}
          <dl className={`${expanded ? "flex" : "hidden"} flex-wrap gap-x-4 gap-y-1 text-label-sm text-on-surface-variant`}>
            <div>
              <dt className="inline">Số nét: </dt>
              <dd className="inline font-semibold text-on-surface tabular-nums">{card.strokeCount ?? "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="inline">Bộ thủ: </dt>
              <dd className="inline">
                {card.radical ? (
                  <Link
                    to={`/kanji?tab=radicals&r=${card.radical.no}&k=${encodeURIComponent(query || card.kanji)}`}
                    className="font-semibold text-primary hover:underline"
                    title="Xem các chữ cùng bộ thủ"
                  >
                    {radical ? (
                      <>
                        <span lang="ja" className="font-japanese">{radical.unified}</span> {radical.hanViet}
                        {radical.meaningVi && <span className="font-normal"> ({radical.meaningVi})</span>}
                      </>
                    ) : (
                      `số ${card.radical.no}`
                    )}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={expanded ? `Thu gọn chữ ${card.kanji}` : `Mở rộng chữ ${card.kanji}`}
            title={expanded ? "Thu gọn" : "Mở rộng"}
            className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">{expanded ? "expand_less" : "expand_more"}</span>
          </button>
        )}
      </div>

      {/* Ẩn bằng class, không bằng thuộc tính hidden (class flex của Tailwind thắng [hidden]); vẫn giữ mount để không mất mẹo đang viết. */}
      <div id={bodyId} className={`${expanded ? "flex" : "hidden"} flex-col gap-space-sm`}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onWrite(card)}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">draw</span>
          Luyện viết
        </Button>
        <SpeakButton text={card.on[0]?.reading ?? card.kun[0]?.reading ?? ""} label={`Phát âm chữ ${card.kanji}`} onError={onSpeakError} />
      </div>

      <KanjiMnemonicSection kanji={card.kanji} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
        <ReadingSection
          title="Âm On"
          hint="(On'yomi, âm Hán)"
          rows={onRows}
          emptyText="Chữ này không có âm On."
          onSpeakError={onSpeakError}
        />
        <ReadingSection
          title="Âm Kun"
          hint="(Kun'yomi, âm Nhật)"
          rows={kunRows}
          emptyText="Chữ này không có âm Kun."
          onSpeakError={onSpeakError}
        />
      </div>
      </div>
    </article>
  );
};
