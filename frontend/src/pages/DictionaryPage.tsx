import React, { useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KanjiPage } from "@/pages/KanjiPage";
import { HanVietMapPage } from "@/pages/HanVietMapPage";
import { WordsTab } from "@/features/dictionary/components/WordsTab";
import { NotebookTab } from "@/features/dictionary/components/NotebookTab";
import { KanjiCommunity } from "@/features/dictionary/components/KanjiCommunity";
import type { DictKey } from "@/types/dictionary.types";

type DictTab = "words" | "kanji" | "hanviet" | "notebook";

const TABS: { key: DictTab; label: string; icon: string }[] = [
  { key: "words", label: "Từ vựng", icon: "menu_book" },
  { key: "kanji", label: "Hán tự", icon: "translate" },
  { key: "hanviet", label: "Hán-Việt", icon: "hub" },
  { key: "notebook", label: "Sổ tay", icon: "bookmarks" },
];
const TAB_KEYS = TABS.map((t) => t.key);
// tham số riêng của từng tab: đổi tab thì bỏ tham số của tab cũ để URL gọn và không lẫn (r = bộ thủ ở Hán tự)
const TAB_PARAMS: Record<DictTab, string[]> = {
  words: ["q", "e"],
  kanji: ["k", "sub", "r"],
  hanviet: ["reading", "level"],
  notebook: [],
};
const KANJI_RE = /[㐀-䶿一-鿿豈-﫿]/u;

// Từ điển (D14): Từ vựng (mới) + Hán tự (/kanji cũ) + Hán-Việt (/han-viet cũ) + Sổ tay. Mọi trạng thái trên URL:
// ?tab=words&q=…&e=<khoá mục>, ?tab=kanji&k=食&sub=radicals&r=85, ?tab=hanviet&reading=…, ?tab=notebook.
export const DictionaryPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as DictTab | null;
  const tab: DictTab = raw && TAB_KEYS.includes(raw) ? raw : "words";
  const tabRefs = useRef<Partial<Record<DictTab, HTMLButtonElement | null>>>({});

  const go = useCallback(
    (next: DictTab, extra: Record<string, string | null> = {}, replace = false) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(next === tab ? prev : undefined);
          if (next === "words") out.delete("tab");
          else out.set("tab", next);
          if (next !== tab) for (const k of TAB_PARAMS[tab]) out.delete(k);
          for (const [k, v] of Object.entries(extra)) {
            if (v) out.set(k, v);
            else out.delete(k);
          }
          return out;
        },
        { replace }
      );
    },
    [setParams, tab]
  );

  const openKey = useCallback(
    (key: DictKey | null) => {
      if (key && key.startsWith("k:") && tab === "kanji") {
        go("kanji", { k: key.slice(2) });
        return;
      }
      go("words", { e: key, q: tab === "words" ? params.get("q") : null });
    },
    [go, tab, params]
  );

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = TAB_KEYS.indexOf(tab);
    const n = TAB_KEYS.length;
    const next = e.key === "Home" ? TAB_KEYS[0] : e.key === "End" ? TAB_KEYS[n - 1] : TAB_KEYS[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    go(next);
    tabRefs.current[next]?.focus();
  };

  const kanjiChar = (params.get("k") ?? "").match(KANJI_RE)?.[0] ?? null;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <header>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">menu_book</span>
          Từ điển Nhật–Việt
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-1 max-w-2xl">
          Tra từ, cách đọc, âm Hán-Việt, nghĩa tiếng Việt và câu ví dụ; bình luận chia sẻ mẹo nhớ; báo lỗi để quản trị viên sửa
          từ điển gốc cho mọi người.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Loại tra cứu"
        onKeyDown={onTabKeyDown}
        className="flex gap-1 p-1 rounded-xl bg-surface-container-low self-start max-w-full overflow-x-auto"
      >
        {TABS.map((t) => {
          const selected = t.key === tab;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              id={`dict-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={selected ? `dict-panel-${t.key}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => go(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg text-label-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`dict-panel-${tab}`} aria-labelledby={`dict-tab-${tab}`}>
        {tab === "words" && (
          <WordsTab
            query={params.get("q") ?? ""}
            entryKey={params.get("e")}
            onQuery={(q) => go("words", { q: q || null, e: null }, true)}
            onOpen={openKey}
          />
        )}
        {tab === "kanji" && (
          <div className="flex flex-col gap-4">
            <KanjiPage embedded />
            {kanjiChar && <KanjiCommunity ch={kanjiChar} />}
          </div>
        )}
        {tab === "hanviet" && <HanVietMapPage embedded />}
        {tab === "notebook" && <NotebookTab onOpen={(k) => go("words", { e: k })} />}
      </div>

      <p className="text-[11px] text-on-surface-variant">
        Dữ liệu: JMdict (EDRDG), Tatoeba, KanjiVG, Unihan, kanjium… <Link to="/about/data" className="hover:underline">Nguồn và giấy phép</Link>
      </p>
    </section>
  );
};

export default DictionaryPage;
