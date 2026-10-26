import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchDictEntry, searchDictionary } from "@/services/dictionaryService";
import type { DictEntry, DictKey, DictSearchResult, DictSummary } from "@/types/dictionary.types";
import { headOf, prepareQuery, primaryMeaning } from "../dictUtils";
import { DictEntryView } from "./DictEntryView";

const ROMAJI_KEY = "dict.romaji";
const PAGE = 20;

const readRomaji = (): boolean => {
  try {
    return localStorage.getItem(ROMAJI_KEY) !== "0";
  } catch {
    return true;
  }
};

export const ResultRow: React.FC<{ item: DictSummary; active?: boolean; onClick: () => void }> = ({ item, active, onClick }) => {
  const head = headOf(item);
  const meaning = primaryMeaning(item);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${active ? "border-primary bg-primary/5" : "border-transparent hover:bg-surface-container"}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span lang="ja" className="font-semibold text-on-surface">{head.main}</span>
        {head.reading && <span lang="ja" className="text-body-sm text-on-surface-variant">{head.reading}</span>}
        {item.jlpt && <span className="text-[11px] px-1 rounded bg-primary/10 text-primary font-semibold">{item.jlpt}</span>}
        {item.common && <span aria-label="thông dụng" title="Thông dụng" className="w-1.5 h-1.5 rounded-full bg-secondary self-center" />}
      </span>
      {meaning && <span lang={meaning.lang} className="block text-xs text-on-surface-variant truncate">{meaning.text}</span>}
      {item.unavailable && <span className="block text-xs text-on-surface-variant">Không tải được chi tiết</span>}
    </button>
  );
};

// Tab Từ vựng (D14, D18): ô tìm (kanji / kana / romaji / Việt / Anh, debounce, huỷ request cũ), danh sách kết quả, chi tiết mục.
// ≥ 1024 px hai cột; hẹp hơn: mở mục thì danh sách thu lại thành nút "← Kết quả".
export const WordsTab: React.FC<{
  query: string;
  entryKey: string | null;
  onQuery: (q: string) => void;
  onOpen: (key: DictKey | null) => void;
}> = ({ query, entryKey, onQuery, onOpen }) => {
  const [input, setInput] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  // URL đổi từ bên ngoài (Back, link) → ô tìm theo URL (điều chỉnh lúc render, không dùng effect)
  if (query !== prevQuery) {
    setPrevQuery(query);
    setInput(query);
  }
  const [romaji, setRomaji] = useState(readRomaji);
  const prepared = prepareQuery(query, romaji);
  const searchKey = prepared.q ? `${prepared.mode}|${prepared.q}` : "";
  // Kết quả gắn với khoá đã tạo ra nó (như useAsync): khoá đổi = đang tải, không cần setState trong effect
  const [res, setRes] = useState<{ key: string; data?: DictSearchResult; error?: string; page: number }>({ key: "", page: 0 });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!searchKey) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const [mode, ...rest] = searchKey.split("|");
    searchDictionary(rest.join("|"), mode as "ja" | "auto", 0, PAGE, ctl.signal)
      .then((r) => !ctl.signal.aborted && setRes({ key: searchKey, data: r, page: 0 }))
      .catch((e) => !ctl.signal.aborted && setRes({ key: searchKey, error: extractErrorMessage(e), page: 0 }));
    return () => ctl.abort();
  }, [searchKey]);

  const current = res.key === searchKey ? res : null;
  const result = searchKey ? (current?.data ?? null) : null;
  const searchError = searchKey ? (current?.error ?? null) : null;
  const searching = !!searchKey && !current;

  // gõ xong 300 ms mới đẩy lên URL (tránh mỗi phím một mục lịch sử trình duyệt)
  useEffect(() => {
    if (input.trim() === query.trim()) return;
    const t = setTimeout(() => onQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input, query, onQuery]);

  const [entryState, setEntryState] = useState<{ key: string | null; data?: DictEntry; error?: string }>({ key: null });
  useEffect(() => {
    if (!entryKey) return;
    let alive = true;
    fetchDictEntry(entryKey, query || undefined)
      .then((e) => alive && setEntryState({ key: entryKey, data: e }))
      .catch((e) => alive && setEntryState({ key: entryKey, error: extractErrorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [entryKey, query]);
  const entryCurrent = entryKey && entryState.key === entryKey ? entryState : null;
  const entry = entryCurrent?.data ?? null;
  const entryError = entryCurrent?.error ?? null;
  const entryLoading = !!entryKey && !entryCurrent;
  const setEntry = (e: DictEntry) => setEntryState({ key: entryKey, data: e });

  const loadMore = async () => {
    if (!result || !current) return;
    const next = current.page + 1;
    try {
      const r = await searchDictionary(prepared.q, prepared.mode, next, PAGE);
      setRes({
        key: searchKey,
        page: next,
        data: { ...r, items: [...result.items, ...r.items.filter((i) => !result.items.some((x) => x.key === i.key))] },
      });
    } catch (e) {
      setRes({ ...current, error: extractErrorMessage(e) });
    }
  };

  const toggleRomaji = () => {
    const v = !romaji;
    setRomaji(v);
    try {
      localStorage.setItem(ROMAJI_KEY, v ? "1" : "0");
    } catch {
      /* chế độ riêng tư: chỉ nhớ trong phiên */
    }
  };

  const prep = prepareQuery(input, romaji);
  const items = result?.items ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div className={`flex flex-col gap-3 ${entryKey ? "hidden lg:flex" : "flex"}`}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onQuery(input.trim());
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="dict-q" className="sr-only">Từ cần tra</label>
          <div className="relative">
            <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              id="dict-q"
              type="search"
              value={input}
              autoFocus
              maxLength={64}
              onChange={(e) => setInput(e.target.value)}
              placeholder="食べる, taberu, ăn, eat…"
              className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={romaji} onChange={toggleRomaji} />
              Gõ romaji → kana
            </label>
            {prep.converted && <span lang="ja">Đang tra: {prep.q}</span>}
          </div>
        </form>

        {searchError && <p role="alert" className="text-body-sm text-error">{searchError}</p>}
        {searching && items.length === 0 && <p className="text-body-sm text-on-surface-variant">Đang tra…</p>}
        {!searching && result && items.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">Không tìm thấy «{query}». Thử gõ kana, chữ Hán hoặc nghĩa tiếng Việt / Anh.</p>
        )}
        {!query && (
          <p className="text-body-sm text-on-surface-variant">
            Gõ từ tiếng Nhật (chữ Hán, kana hoặc romaji), nghĩa tiếng Việt hay tiếng Anh để tra. Mỗi mục có âm Hán-Việt, nghĩa
            tiếng Việt, câu ví dụ và bình luận của cộng đồng.
          </p>
        )}
        {items.length > 0 && (
          <ul className="flex flex-col gap-0.5" aria-label="Kết quả tra cứu">
            {items.map((it) => (
              <li key={it.key}>
                <ResultRow item={it} active={it.key === entryKey} onClick={() => onOpen(it.key)} />
              </li>
            ))}
          </ul>
        )}
        {result && items.length < result.total && result.modeUsed !== "vi" && (
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} className="self-center">
            Tải thêm
          </Button>
        )}
      </div>

      <div className={`${entryKey ? "block" : "hidden lg:block"} min-w-0`}>
        {entryKey && (
          <button type="button" onClick={() => onOpen(null)} className="lg:hidden mb-3 inline-flex items-center gap-1 text-label-md text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span> Kết quả
          </button>
        )}
        {entryLoading && !entry && <p className="text-body-sm text-on-surface-variant">Đang mở mục từ…</p>}
        {entryError && <p role="alert" className="text-body-sm text-error">{entryError}</p>}
        {entry ? (
          <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 sm:p-6">
            <DictEntryView entry={entry} onOpen={(k) => onOpen(k)} onChange={setEntry} />
          </div>
        ) : (
          !entryKey && (
            <div className="hidden lg:flex h-full min-h-60 items-center justify-center rounded-2xl border border-dashed border-outline-variant text-body-sm text-on-surface-variant p-6 text-center">
              Chọn một kết quả để xem chi tiết.
            </div>
          )
        )}
      </div>
    </div>
  );
};
