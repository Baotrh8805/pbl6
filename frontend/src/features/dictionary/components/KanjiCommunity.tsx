import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchDictEntry } from "@/services/dictionaryService";
import type { DictEntry } from "@/types/dictionary.types";
import { kanjiKey, primaryMeaning, viStateNote } from "../dictUtils";
import { DictComments } from "./DictComments";
import { ReportEntryModal } from "./ReportEntryModal";

// Phần cộng đồng dưới thẻ chữ Hán (D29): nghĩa tiếng Việt của chữ, báo lỗi Hán-Việt / nghĩa chữ, bình luận.
export const KanjiCommunity: React.FC<{ ch: string }> = ({ ch }) => {
  const entry = useAsync(() => fetchDictEntry(kanjiKey(ch)), [ch]);
  const [reporting, setReporting] = useState<DictEntry | null>(null);
  if (entry.error) return <p role="alert" className="text-body-sm text-error">{entry.error}</p>;
  if (!entry.data) return <p className="text-body-sm text-on-surface-variant">Đang tải…</p>;
  const e = entry.data;
  const meaning = primaryMeaning(e);
  const note = viStateNote(e.viState, e.aiLeft, e.aiLimit);
  return (
    <section aria-label={`Cộng đồng: chữ ${ch}`} className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-body-sm text-on-surface-variant">
            Nghĩa của chữ <span lang="ja" className="font-semibold text-on-surface">{ch}</span>
            {e.hanViet && <> · <span className="font-semibold text-tertiary">{e.hanViet}</span></>}
          </p>
          {meaning && <p lang={meaning.lang} className="text-title-sm font-semibold text-on-surface">{meaning.text}</p>}
          {note && <p className="text-xs text-on-surface-variant">{note}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setReporting(e)}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">flag</span> Báo lỗi
        </Button>
      </div>
      <DictComments entryKey={e.key} />
      {reporting && <ReportEntryModal entry={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
};
