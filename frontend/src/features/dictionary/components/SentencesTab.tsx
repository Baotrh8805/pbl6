import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { searchDictSentences } from "@/services/dictionaryService";
import { canSpeak, speakJa } from "@/lib/speech";
import type { DictKey, DictSentence, DictSentenceResult } from "@/types/dictionary.types";
import { highlightParts, looksLikeSentence } from "../dictUtils";

const PAGE = 20;

const Marked: React.FC<{ text: string; q: string; lang: string; className?: string }> = ({ text, q, lang, className }) => (
  <span lang={lang} className={className}>
    {highlightParts(text, q).map((p, i) =>
      p.hit ? (
        <mark key={i} className="bg-primary/15 text-on-surface rounded px-0.5">
          {p.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{p.text}</React.Fragment>
      )
    )}
  </span>
);

const SentenceRow: React.FC<{ s: DictSentence; q: string; onOpen: (key: DictKey) => void }> = ({ s, q, onOpen }) => (
  <li className="rounded-xl border border-surface-container-high bg-surface-container-lowest px-4 py-3 flex flex-col gap-1">
    <div className="flex items-start gap-2">
      <Marked text={s.jpn} q={q} lang="ja" className="text-body-lg text-on-surface flex-1 min-w-0" />
      {canSpeak && (
        <button
          type="button"
          onClick={() => void speakJa(s.jpn)}
          className="shrink-0 p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
          title="Nghe câu"
          aria-label="Nghe câu"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">volume_up</span>
        </button>
      )}
    </div>
    {s.vi && <Marked text={s.vi} q={q} lang="vi" className="text-body-sm text-on-surface" />}
    {s.eng && <Marked text={s.eng} q={q} lang="en" className="text-xs text-on-surface-variant" />}
    {s.words.length > 0 && (
      <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Từ trong câu">
        {s.words.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => onOpen(w.key)}
            className="text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface hover:bg-primary/10 hover:text-primary"
            title="Mở mục từ"
          >
            <span lang="ja">{w.head}</span>
          </button>
        ))}
      </div>
    )}
  </li>
);

// Tab Câu (cải tiến 26/10): tìm câu ví dụ theo cụm — chữ Nhật khớp đúng chuỗi, tiếng Anh khớp từ đầu một từ, tiếng Việt có hoặc
// không dấu. Mỗi câu: bản dịch Việt (dịch sẵn hoặc admin sửa), câu Anh, các mục từ mà câu làm ví dụ (bấm để mở ở tab Từ vựng).
export const SentencesTab: React.FC<{
  query: string;
  onQuery: (q: string) => void;
  onOpen: (key: DictKey) => void;
  /** Không có câu ví dụ chứa cụm mà cụm trông như cả câu → gợi ý tab Dịch (D33). */
  onTranslate?: (text: string) => void;
}> = ({ query, onQuery, onOpen, onTranslate }) => {
  const [input, setInput] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setInput(query);
  }
  const q = query.trim();
  const [res, setRes] = useState<{ key: string; data?: DictSentenceResult; error?: string; page: number }>({ key: "", page: 0 });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!q) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    searchDictSentences(q, 0, PAGE, ctl.signal)
      .then((r) => !ctl.signal.aborted && setRes({ key: q, data: r, page: 0 }))
      .catch((e) => !ctl.signal.aborted && setRes({ key: q, error: extractErrorMessage(e), page: 0 }));
    return () => ctl.abort();
  }, [q]);

  useEffect(() => {
    if (input.trim() === query.trim()) return;
    const t = setTimeout(() => onQuery(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input, query, onQuery]);

  const current = q && res.key === q ? res : null;
  const result = current?.data ?? null;
  const items = result?.items ?? [];
  const loading = !!q && !current;

  const loadMore = async () => {
    if (!result || !current) return;
    const next = current.page + 1;
    try {
      const r = await searchDictSentences(q, next, PAGE);
      setRes({ key: q, page: next, data: { ...r, items: [...items, ...r.items.filter((i) => !items.some((x) => x.id === i.id))] } });
    } catch (e) {
      setRes({ ...current, error: extractErrorMessage(e) });
    }
  };

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onQuery(input.trim());
        }}
        className="relative"
      >
        <label htmlFor="dict-sentence-q" className="sr-only">
          Cụm từ cần tìm trong câu ví dụ
        </label>
        <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
          format_quote
        </span>
        <input
          id="dict-sentence-q"
          type="search"
          value={input}
          maxLength={64}
          onChange={(e) => setInput(e.target.value)}
          placeholder="食べた, ご飯を, ăn cơm, eat…"
          className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </form>

      {!q && (
        <p className="text-body-sm text-on-surface-variant">
          Gõ một cụm tiếng Nhật (ví dụ 食べた, ご飯を), tiếng Việt hoặc tiếng Anh để xem câu ví dụ có cụm đó. Câu ngắn hiện trước.
        </p>
      )}
      {loading && <p className="text-body-sm text-on-surface-variant">Đang tìm…</p>}
      {current?.error && <p role="alert" className="text-body-sm text-error">{current.error}</p>}
      {result && items.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">
          Không có câu ví dụ nào chứa «{q}».
          {onTranslate && looksLikeSentence(q) && (
            <>
              {" "}
              <button type="button" onClick={() => onTranslate(q)} className="text-primary font-semibold hover:underline">
                Dịch cả câu này
              </button>
            </>
          )}
        </p>
      )}
      {result && items.length > 0 && (
        <p className="text-xs text-on-surface-variant" role="status">
          {result.total >= 500 ? "Hơn 500" : result.total.toLocaleString("vi-VN")} câu
        </p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Câu ví dụ">
          {items.map((s) => (
            <SentenceRow key={s.id} s={s} q={q} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {result && items.length < result.total && (
        <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} className="self-center">
          Tải thêm
        </Button>
      )}
    </div>
  );
};
