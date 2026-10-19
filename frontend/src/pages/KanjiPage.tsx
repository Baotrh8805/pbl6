import React, { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import { useAsync } from "@/lib/useAsync";
import { MAX_LOOKUP_KANJI, extractKanji, parseRadicalNo } from "@/lib/kanjiUtils";
import { fetchRadicals } from "@/services/kanjiService";
import type { Radical } from "@/types/api.types";
import { KanjiLookupTab } from "@/features/kanji/components/KanjiLookupTab";
import { RadicalsTab } from "@/features/kanji/components/RadicalsTab";

type KanjiTab = "lookup" | "radicals";

const TABS: { key: KanjiTab; label: string; icon: string }[] = [
  { key: "lookup", label: "Tra chữ Hán", icon: "search" },
  { key: "radicals", label: "Bộ thủ", icon: "category" },
];

const tabId = (t: KanjiTab) => `kanji-tab-${t}`;
const panelId = (t: KanjiTab) => `kanji-panel-${t}`;

// C4 + C5 — Chữ Hán & Bộ thủ: tra từng chữ (Hán-Việt, bộ, On/Kun, mẹo nhớ đã duyệt + góp mẹo, ví dụ) và khám phá
// 214 bộ thủ. Mọi trạng thái điều hướng nằm trên URL (?tab=radicals&r=85, ?k=学生) để link chéo giữa hai tab, link từ
// trang bộ thẻ, F5 và nút Back đều đúng.
export const KanjiPage: React.FC = () => {
  const { currentLevel } = useShell();
  const [params, setParams] = useSearchParams();
  const tab: KanjiTab = params.get("tab") === "radicals" ? "radicals" : "lookup";
  const rawK = params.get("k") ?? "";
  const allKanji = extractKanji(rawK);
  const kanji = allKanji.slice(0, MAX_LOOKUP_KANJI);
  const radicalNo = parseRadicalNo(params.get("r"));
  const [radicalsReload, setRadicalsReload] = useState(0);
  const radicals = useAsync(fetchRadicals, [radicalsReload]);
  const radicalList: Radical[] = useMemo(() => radicals.data ?? [], [radicals.data]);
  const radicalByNo = useMemo(() => new Map(radicalList.map((r) => [r.no, r])), [radicalList]);
  const tabRefs = useRef<Partial<Record<KanjiTab, HTMLButtonElement | null>>>({});

  // Giữ tham số của tab kia khi chuyển tab để quay lại vẫn thấy đúng chữ / bộ đang xem.
  const update = (next: { tab?: KanjiTab; k?: string | null; r?: number | null }) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next.tab !== undefined) {
        if (next.tab === "lookup") out.delete("tab");
        else out.set("tab", next.tab);
      }
      if (next.k !== undefined) {
        if (next.k) out.set("k", next.k);
        else out.delete("k");
      }
      if (next.r !== undefined) {
        if (next.r) out.set("r", String(next.r));
        else out.delete("r");
      }
      return out;
    });
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const n = TABS.length;
    const next =
      e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[n - 1] : TABS[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    update({ tab: next.key });
    tabRefs.current[next.key]?.focus();
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <header>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">
            translate
          </span>
          Chữ Hán & Bộ thủ
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-1 max-w-2xl">
          Tra âm Hán-Việt, bộ thủ, âm On / Kun, mẹo nhớ và từ ví dụ của từng chữ; khám phá 214 bộ thủ để nhớ chữ theo bộ —
          rồi tạo bộ thẻ chỉ với một nút bấm.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Chế độ"
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
              id={tabId(t.key)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={selected ? panelId(t.key) : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ tab: t.key })}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg text-label-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected
                  ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {t.icon}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
        {tab === "lookup" ? (
          <KanjiLookupTab
            kanji={kanji}
            truncated={allKanji.length > kanji.length}
            onSearch={(list) => update({ k: list.join("") })}
            radicalByNo={radicalByNo}
            userLevel={currentLevel}
          />
        ) : (
          <RadicalsTab
            radicals={radicalList}
            loading={radicals.loading}
            error={radicals.error}
            onRetry={() => setRadicalsReload((n) => n + 1)}
            selectedNo={radicalNo}
            onSelect={(no) => update({ r: no })}
            userLevel={currentLevel}
          />
        )}
      </div>
    </section>
  );
};

export default KanjiPage;
