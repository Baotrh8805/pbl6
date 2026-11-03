import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchDictEntry, fetchDictHistory, searchDictionary } from "@/services/dictionaryService";
import type { DictEntry, DictKey, DictSearchResult, DictSummary } from "@/types/dictionary.types";
import { deinflectNote, headOf, highlightParts, jlptChipClass, looksLikeSentence, prepareQuery, primaryMeaning } from "../dictUtils";
import { DictEntryView } from "./DictEntryView";
import { HandwritingPad } from "./HandwritingPad";

const ROMAJI_KEY = "dict.romaji";
const PAGE = 20;
const SUGGESTIONS = ["食べる", "勉強", "日本語", "ありがとう", "học", "eat"];

const readRomaji = (): boolean => {
  try {
    return localStorage.getItem(ROMAJI_KEY) !== "0";
  } catch {
    return true;
  }
};

/** Đang gõ trong ô nhập / có hộp thoại mở → không bắt phím tắt của trang. */
const typingOrModal = (t: EventTarget | null): boolean =>
  (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) ||
  !!document.querySelector('[role="dialog"], [aria-modal="true"]');

/** Tô phần khớp truy vấn (dùng lại highlightParts của tab Câu). */
const Hl: React.FC<{ text: string; q?: string }> = ({ text, q }) => (
  <>
    {q
      ? highlightParts(text, q).map((p, i) =>
          p.hit ? (
            <mark key={i} className="bg-transparent text-primary font-bold">{p.text}</mark>
          ) : (
            <React.Fragment key={i}>{p.text}</React.Fragment>
          )
        )
      : text}
  </>
);

export const ResultRow: React.FC<{ item: DictSummary; active?: boolean; query?: string; onClick: () => void }> = ({ item, active, query, onClick }) => {
  const head = headOf(item);
  const meaning = primaryMeaning(item);
  return (
    <button
      type="button"
      data-result
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`group relative w-full text-left pl-3.5 pr-8 py-2.5 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer ${
        active ? "border-primary bg-primary/5" : "border-transparent hover:bg-surface-container hover:border-surface-container-high"
      }`}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />}
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span lang="ja" className="font-japanese text-lg leading-tight font-semibold text-on-surface"><Hl text={head.main} q={query} /></span>
        {head.reading && <span lang="ja" className="font-japanese text-body-sm text-on-surface-variant"><Hl text={head.reading} q={query} /></span>}
        {item.jlpt && <span className={`text-[11px] px-1.5 py-px rounded-md font-semibold self-center ${jlptChipClass(item.jlpt)}`}>{item.jlpt}</span>}
        {item.common && <span aria-label="thông dụng" title="Thông dụng" className="w-1.5 h-1.5 rounded-full bg-sky-500 self-center" />}
      </span>
      {meaning && (
        <span lang={meaning.lang} className="block mt-0.5 text-body-sm text-on-surface-variant truncate">
          <Hl text={meaning.text} q={query} />
        </span>
      )}
      {item.unavailable && <span className="block text-xs text-on-surface-variant">Không tải được chi tiết</span>}
      <span
        aria-hidden="true"
        className={`material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[20px] transition-opacity ${
          active ? "text-primary opacity-100" : "text-outline opacity-0 group-hover:opacity-100"
        }`}
      >
        chevron_right
      </span>
    </button>
  );
};

const ResultSkeleton: React.FC = () => (
  <ul aria-hidden="true" className="flex flex-col gap-1">
    {Array.from({ length: 5 }, (_, i) => (
      <li key={i} className="px-3.5 py-3 rounded-xl animate-pulse">
        <span className="block h-5 w-2/5 rounded bg-surface-container-high" />
        <span className="block mt-2 h-3.5 w-4/5 rounded bg-surface-container" />
      </li>
    ))}
  </ul>
);

/** Trang trống: các mục đã tra gần đây + vài từ gợi ý. */
const EmptyStart: React.FC<{ onOpen: (key: DictKey) => void; onTry: (q: string) => void }> = ({ onOpen, onTry }) => {
  const recent = useAsync(() => fetchDictHistory(8), []);
  const items = recent.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <section aria-labelledby="dict-recent" className="flex flex-col gap-1">
          <h3 id="dict-recent" className="text-label-md font-semibold text-on-surface-variant inline-flex items-center gap-1.5 px-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">history</span>
            Tra gần đây
          </h3>
          <ul className="flex flex-col gap-0.5">
            {items.map((it) => (
              <li key={it.key}>
                <ResultRow item={it} onClick={() => onOpen(it.key)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {recent.loading && items.length === 0 && <ResultSkeleton />}
      <div className="rounded-2xl bg-surface-container-low p-4 flex flex-col gap-2">
        <p className="text-body-sm text-on-surface-variant">
          Gõ chữ Hán, kana, romaji, nghĩa tiếng Việt hoặc tiếng Anh. Bấm <kbd className="px-1.5 rounded border border-outline-variant bg-surface-container-lowest text-xs">/</kbd> để
          về ô tìm, <kbd className="px-1.5 rounded border border-outline-variant bg-surface-container-lowest text-xs">↓</kbd> để chọn kết quả.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onTry(s)}
              className="px-2.5 py-1 rounded-full border border-outline-variant bg-surface-container-lowest text-body-sm hover:border-primary hover:text-primary cursor-pointer transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Khung hiển thị gợi ý khám phá & từ hay hôm nay khi chưa chọn mục từ ở cột phải. */
const DictDiscoveryShowcase: React.FC<{
  onTry: (q: string) => void;
}> = ({ onTry }) => {
  return (
    <div className="hidden lg:flex flex-col gap-5 p-6 rounded-3xl bg-surface-container-lowest border border-surface-container-high/60 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/40">
        <div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-wider">
            Gợi ý hôm nay
          </span>
          <h3 className="font-headline-sm text-headline-sm font-bold text-primary mt-1">
            Khám phá từ vựng & Hán tự
          </h3>
        </div>
        <span aria-hidden="true" className="material-symbols-outlined text-[32px] text-primary/30">
          auto_stories
        </span>
      </div>

      {/* Card Từ vựng nổi bật */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/5 via-primary-container/5 to-transparent border border-primary/10 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span lang="ja" className="font-japanese text-2xl font-bold text-primary">
              一期一会
            </span>
            <span lang="ja" className="font-japanese text-xs text-on-surface-variant font-medium">
              【いちごいちえ】
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
              JLPT N1
            </span>
          </div>
          <p className="text-xs text-primary/80 font-bold mt-1">NHẤT KÌ NHẤT HỘI</p>
          <p className="text-body-sm text-on-surface-variant mt-1">
            "Mỗi cuộc gặp gỡ trong đời đều là duyên phận chỉ có một lần duy nhất — hãy trân trọng từng khoảnh khắc."
          </p>
        </div>
        <button
          type="button"
          onClick={() => onTry("一期一会")}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors cursor-pointer"
        >
          Tra chi tiết
        </button>
      </div>

      {/* Các chủ đề tra cứu nhanh */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-outline">
          Bộ từ vựng trọng tâm theo cấp độ
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { level: "N5", label: "Căn bản khởi đầu", sample: "食べる" },
            { level: "N4", label: "Giao tiếp hàng ngày", sample: "約束" },
            { level: "N3", label: "Trung cấp thông dụng", sample: "経験" },
            { level: "N2", label: "Công sở & Báo chí", sample: "担当" },
            { level: "N1", label: "Thành ngữ & Cao cấp", sample: "躊躇" },
            { level: "IT", label: "Tiếng Nhật CNTT", sample: "開発" },
          ].map((item) => (
            <button
              key={item.level}
              type="button"
              onClick={() => onTry(item.sample)}
              className="p-2.5 text-left rounded-xl bg-surface-container-low hover:bg-surface-container border border-surface-container-high/40 transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">{item.level}</span>
                <span lang="ja" className="font-japanese text-xs text-on-surface-variant group-hover:text-primary">
                  {item.sample}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">{item.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Banner liên kết sang Sơ đồ chữ Hán */}
      <div className="p-3.5 rounded-2xl bg-surface-container-low flex items-center justify-between gap-3 border border-surface-container-high/40">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-primary">
            account_tree
          </span>
          <div>
            <p className="text-xs font-bold text-on-surface">Muốn nhìn thấy cấu tạo chữ Hán?</p>
            <p className="text-[11px] text-on-surface-variant">Khám phá họ chữ cùng chỉ âm và mạng lưới từ ghép trong Sơ đồ chữ Hán.</p>
          </div>
        </div>
        <Link
          to="/graph"
          className="shrink-0 px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-primary font-semibold text-xs transition-colors"
        >
          Mở sơ đồ →
        </Link>
      </div>
    </div>
  );
};

// Tab Từ vựng: ô tìm, danh sách kết quả, chi tiết mục, liên kết tri thức.
export const WordsTab: React.FC<{
  query: string;
  entryKey: string | null;
  onQuery: (q: string) => void;
  onOpen: (key: DictKey | null) => void;
  onTranslate?: (text: string) => void;
}> = ({ query, entryKey, onQuery, onOpen, onTranslate }) => {
  const [input, setInput] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setInput(query);
  }
  const [romaji, setRomaji] = useState(readRomaji);
  const [drawOpen, setDrawOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const prepared = prepareQuery(query, romaji);
  const searchKey = prepared.q ? `${prepared.mode}|${prepared.q}` : "";
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

  useEffect(() => {
    if (input.trim() === query.trim()) return;
    const t = setTimeout(() => onQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input, query, onQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || typingOrModal(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!drawOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"], [aria-modal="true"]')) setDrawOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (searchBoxRef.current && e.target instanceof Node && !searchBoxRef.current.contains(e.target)) setDrawOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [drawOpen]);

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
      /* chế độ riêng tư */
    }
  };

  const resultButtons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-result]") ?? []);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowDown") return;
    const first = resultButtons()[0];
    if (first) {
      e.preventDefault();
      first.focus();
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const btns = resultButtons();
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) inputRef.current?.focus();
    else btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const clearInput = () => {
    setInput("");
    onQuery("");
    inputRef.current?.focus();
  };

  const prep = prepareQuery(input, romaji);
  const items = result?.items ?? [];
  const note = items.length > 0 ? deinflectNote(result) : null;
  const head = entry ? headOf(entry) : null;

  const handleShowcaseSelect = (term: string) => {
    setInput(term);
    onQuery(term);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
      <div className={`flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start ${entryKey ? "hidden lg:flex" : "flex"}`}>
        <div ref={searchBoxRef} className="relative">
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
              <span aria-hidden="true" className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                ref={inputRef}
                id="dict-q"
                type="text"
                enterKeyHint="search"
                value={input}
                autoFocus
                maxLength={64}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="食べる, taberu, ăn, eat…"
                aria-keyshortcuts="/"
                className="w-full h-12 rounded-2xl border border-outline-variant bg-surface-container-lowest pl-11 pr-20 text-body-md shadow-sm transition-colors focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {input && (
                  <button
                    type="button"
                    onClick={clearInput}
                    aria-label="Xoá ô tìm"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawOpen((v) => !v)}
                  aria-expanded={drawOpen}
                  aria-controls="dict-draw"
                  aria-label={drawOpen ? "Đóng ô vẽ chữ Hán" : "Vẽ chữ Hán để tra"}
                  title="Vẽ chữ Hán"
                  className={`w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer ${
                    drawOpen ? "bg-primary text-on-primary" : "text-primary hover:bg-primary/10"
                  }`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">draw</span>
                </button>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-on-surface-variant">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <span className="relative inline-flex">
                  <input type="checkbox" checked={romaji} onChange={toggleRomaji} className="peer sr-only" />
                  <span className="w-8 h-[18px] rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
                  <span className="absolute left-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-3.5" />
                </span>
                Gõ romaji → kana
              </label>
              {prep.converted && (
                <span>
                  Đang tra: <span lang="ja" className="font-japanese font-semibold text-on-surface">{prep.q}</span>
                </span>
              )}
            </div>
          </form>

          {drawOpen && (
            <>
              <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setDrawOpen(false)} />
              <div
                id="dict-draw"
                className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-2 shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-14 lg:z-30 lg:w-[480px] lg:max-h-none lg:overflow-visible lg:rounded-2xl lg:shadow-xl"
              >
                <HandwritingPad pickHint="thêm vào ô tìm" onPick={(ch) => setInput((v) => v + ch)} onClose={() => setDrawOpen(false)} />
              </div>
            </>
          )}
        </div>

        {searchError && <p role="alert" className="text-body-sm text-error">{searchError}</p>}
        {searching && items.length === 0 && <ResultSkeleton />}
        {!searching && result && items.length === 0 && (
          <p className="text-body-sm text-on-surface-variant px-1">Không tìm thấy «{query}». Thử gõ kana, chữ Hán hoặc nghĩa tiếng Việt / Anh.</p>
        )}
        {!query && <EmptyStart onOpen={(k) => onOpen(k)} onTry={(q) => setInput(q)} />}
        {onTranslate && query && looksLikeSentence(query) && (
          <p role="status" className="flex gap-2 text-xs text-on-surface-variant rounded-xl bg-primary/5 px-3 py-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">translate</span>
            <span>
              Có vẻ bạn nhập cả câu.{" "}
              <button type="button" onClick={() => onTranslate(query)} className="text-primary font-semibold hover:underline cursor-pointer">
                Dịch cả câu và phân tích từng cụm
              </button>
            </span>
          </p>
        )}
        {note && (
          <p role="status" className="flex gap-2 text-xs text-on-surface-variant rounded-xl bg-surface-container-low px-3 py-2" lang="vi">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">info</span>
            <span>{note}</span>
          </p>
        )}
        {items.length > 0 && (
          <div className="flex flex-col gap-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:-mx-1 lg:px-1 lg:pb-1">
            {result && (
              <p className="px-1 text-[11px] text-on-surface-variant">
                {result.total > items.length ? `${items.length} / ${result.total} kết quả` : `${items.length} kết quả`}
              </p>
            )}
            <ul ref={listRef} onKeyDown={onListKeyDown} className="flex flex-col gap-0.5" aria-label="Kết quả tra cứu">
              {items.map((it) => (
                <li key={it.key}>
                  <ResultRow item={it} query={prepared.q} active={it.key === entryKey} onClick={() => onOpen(it.key)} />
                </li>
              ))}
            </ul>
            {result && items.length < result.total && result.modeUsed !== "vi" && (
              <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} className="self-center">
                Tải thêm
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={`${entryKey ? "block" : "hidden lg:block"} min-w-0`}>
        {entryKey && (
          <div className="lg:hidden sticky top-16 z-20 -mx-gutter px-gutter py-2 mb-3 bg-surface/95 backdrop-blur border-b border-surface-container-high flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(null)}
              className="inline-flex items-center gap-1 min-h-10 pr-2 text-label-md font-semibold text-primary cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span> Kết quả
            </button>
            {head && <span lang="ja" className="font-japanese truncate text-body-sm text-on-surface-variant">{head.main}</span>}
          </div>
        )}
        {entryLoading && !entry && (
          <div aria-busy="true" className="rounded-3xl border border-surface-container-high bg-surface-container-lowest p-6 animate-pulse">
            <span className="sr-only">Đang mở mục từ…</span>
            <span className="block h-10 w-1/3 rounded bg-surface-container-high" />
            <span className="block mt-3 h-5 w-1/4 rounded bg-surface-container" />
            <span className="block mt-6 h-16 w-full rounded-xl bg-surface-container" />
          </div>
        )}
        {entryError && <p role="alert" className="text-body-sm text-error">{entryError}</p>}
        {entry ? (
          <div className="rounded-3xl border border-surface-container-high bg-surface-container-lowest p-4 sm:p-6 shadow-sm">
            <DictEntryView entry={entry} onOpen={(k) => onOpen(k)} onChange={setEntry} />
          </div>
        ) : (
          !entryKey && <DictDiscoveryShowcase onTry={handleShowcaseSelect} />
        )}
      </div>
    </div>
  );
};
