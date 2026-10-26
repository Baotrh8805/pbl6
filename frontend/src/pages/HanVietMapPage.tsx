import React, { useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import { groupWordsByLevel, kanjiOfGraph, normalizeHanVietQuery, wordNodesOf } from "@/lib/hanVietUtils";
import { fetchHanVietGraph, suggestHanViet } from "@/services/nlpService";
import type { HanVietGraph, HanVietWordNode } from "@/types/api.types";
import { HanVietGraphSvg } from "@/features/hanviet/components/HanVietGraphSvg";
import { HanVietNodePanel } from "@/features/hanviet/components/HanVietNodePanel";
import { HanVietWordList } from "@/features/hanviet/components/HanVietWordList";
import { AddWordToDeckModal } from "@/features/hanviet/components/AddWordToDeckModal";

const SUGGEST_DEBOUNCE_MS = 250;
/** Âm ví dụ cho màn trống (âm phổ biến, chắc chắn có trong từ điển). */
const EXAMPLES = ["NHẬT", "HỌC", "SINH", "QUỐC", "NHÂN"];

const chipClass = (active: boolean) =>
  `px-2.5 py-1 min-h-8 rounded-full text-label-sm font-semibold border transition-colors cursor-pointer ${
    active
      ? "bg-primary-container text-on-primary border-primary-container"
      : "bg-surface-container-lowest text-on-surface-variant border-surface-container-high hover:bg-surface-container"
  }`;

const isLevel = (v: string | null): v is (typeof JLPT_LEVELS)[number] =>
  v !== null && (JLPT_LEVELS as readonly string[]).includes(v);

// F1 – Bản đồ Hán–Việt: gõ một âm (NHẬT) -> các chữ Hán mang âm đó -> từ ghép của từng chữ, vẽ toả tròn + liệt kê theo
// cấp. Âm / cấp nằm trên URL (?reading=&level=) để link "Xem mạng lưới" và nút Back hoạt động.
export const HanVietMapPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [params, setParams] = useSearchParams();
  const reading = normalizeHanVietQuery(params.get("reading") ?? "");
  const levelParam = params.get("level");
  const level = isLevel(levelParam) ? levelParam : "";

  const [input, setInput] = useState(reading);
  const [inputFocused, setInputFocused] = useState(false);
  // Gợi ý theo mẫu combobox ARIA: focus luôn ở ô nhập, ↓/↑ trỏ gợi ý qua aria-activedescendant (Tab rời ô nhập là đóng
  // danh sách nên gợi ý không thể là nút để Tab tới). `dismissed`: đóng bằng Esc / sau khi chọn / sau khi tra; gõ tiếp
  // hoặc focus lại thì mở lại. `active`: gợi ý đang trỏ, -1 = chưa trỏ.
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const searchId = useId();
  const listId = useId();

  // Âm trên URL đổi từ ngoài (link badge, Back): đồng bộ lại ô nhập (so khoá trong render, không cần effect).
  const [lastReading, setLastReading] = useState(reading);
  if (reading !== lastReading) {
    setLastReading(reading);
    setInput(reading);
  }

  const query = normalizeHanVietQuery(useDebouncedValue(input, SUGGEST_DEBOUNCE_MS));
  const wantSuggest = query.length > 0 && query !== reading;
  const suggestions = useAsync(() => (wantSuggest ? suggestHanViet(query) : Promise.resolve([])), [wantSuggest ? query : ""]);
  const graph = useAsync<HanVietGraph | null>(
    () => (reading ? fetchHanVietGraph(reading, level || undefined) : Promise.resolve(null)),
    [reading, level, reloadKey]
  );

  const go = (nextReading: string, nextLevel: string = level) => {
    const r = normalizeHanVietQuery(nextReading);
    const next: Record<string, string> = {};
    if (r) next.reading = r;
    if (nextLevel) next.level = nextLevel;
    setParams(next);
    setInput(r);
  };

  const suggestItems = suggestions.data ?? [];
  const showSuggest = inputFocused && !dismissed && wantSuggest && suggestItems.length > 0;
  // Gõ tiếp làm danh sách ngắn lại: chỉ số cũ vượt quá thì coi như chưa trỏ gợi ý nào.
  const activeIndex = showSuggest && active < suggestItems.length ? active : -1;
  const optionId = (i: number) => `${listId}-${i}`;

  const closeSuggest = () => {
    setDismissed(true);
    setActive(-1);
  };
  const pick = (nextReading: string) => {
    go(nextReading);
    closeSuggest();
  };

  // ↓/↑ trỏ gợi ý (vòng quanh), Enter chọn gợi ý đang trỏ (chưa trỏ thì nộp form như thường), Esc chỉ đóng danh sách.
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // bộ gõ (IME) đang ghép chữ: phím là của bộ gõ
    const n = suggestItems.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && wantSuggest && n > 0) {
      e.preventDefault();
      const from = showSuggest ? activeIndex : -1;
      setDismissed(false);
      setActive(e.key === "ArrowDown" ? (from + 1) % n : from <= 0 ? n - 1 : from - 1);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestItems[activeIndex].reading);
    } else if (e.key === "Escape" && showSuggest) {
      e.preventDefault(); // type="search": Esc mặc định xoá cả ô nhập — ở đây chỉ đóng gợi ý
      closeSuggest();
    }
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      {!embedded && (
      <header>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">
            hub
          </span>
          Bản đồ Hán–Việt
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-1 max-w-2xl">
          Gõ một âm Hán-Việt (vd. <strong>NHẬT</strong>) để xem các chữ Hán mang âm đó và từ ghép của chúng theo cấp JLPT —
          cách nhớ kanji nhanh cho người Việt.
        </p>
      </header>
      )}

      {/* Ô tìm + gợi ý */}
      <div className="relative">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(input);
            closeSuggest();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <label htmlFor={searchId} className="sr-only">
              Âm Hán-Việt
            </label>
            <span
              aria-hidden="true"
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline pointer-events-none"
            >
              search
            </span>
            <input
              id={searchId}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggest}
              aria-controls={showSuggest ? listId : undefined}
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setDismissed(false);
                setActive(-1);
              }}
              onKeyDown={onSearchKeyDown}
              onFocus={() => {
                setInputFocused(true);
                setDismissed(false);
              }}
              onBlur={() => {
                setInputFocused(false);
                setActive(-1);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Nhập âm Hán-Việt, vd. NHẬT, HỌC, SINH…"
              className="w-full pl-10 pr-3 py-2.5 min-h-11 rounded-xl bg-surface-container-lowest border border-surface-container-high text-body-md text-on-surface placeholder:text-outline uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button type="submit" size="md" disabled={!input.trim()}>
            Tra
          </Button>
        </form>

        {showSuggest && (
          // Chọn gợi ý bằng chuột: preventDefault ở mousedown để ô nhập chưa blur (blur sẽ đóng danh sách trước click).
          <ul
            id={listId}
            role="listbox"
            aria-label="Gợi ý âm"
            className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-surface-container-lowest border border-surface-container-high shadow-lg overflow-hidden"
          >
            {suggestItems.map((s, i) => (
              <li
                key={s.reading}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.reading)}
                className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-surface-container-low ${
                  i === activeIndex ? "bg-surface-container-low ring-2 ring-inset ring-primary/40" : ""
                }`}
              >
                <span className="font-semibold text-on-surface">{s.reading}</span>
                <span className="text-label-sm text-outline flex items-center gap-1.5">
                  {s.kanji.length > 0 && (
                    <span lang="ja" className="font-japanese text-on-surface-variant">
                      {s.kanji.slice(0, 4).join(" ")}
                    </span>
                  )}
                  <span className="tabular-nums">{s.count} chữ</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lọc cấp (gửi lên server) */}
      <div role="group" aria-label="Lọc từ ghép theo cấp" className="flex flex-wrap items-center gap-1.5">
        <span className="text-label-sm text-on-surface-variant mr-1">Cấp:</span>
        <button type="button" aria-pressed={level === ""} onClick={() => go(reading || input, "")} className={chipClass(level === "")}>
          Tất cả
        </button>
        {JLPT_LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            aria-pressed={level === lvl}
            onClick={() => go(reading || input, level === lvl ? "" : lvl)}
            className={chipClass(level === lvl)}
          >
            {lvl}
          </button>
        ))}
      </div>

      {!reading ? (
        <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
            hub
          </span>
          <p className="text-body-md text-on-surface-variant">Chưa có âm nào. Thử một âm phổ biến:</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => go(ex)} className={chipClass(false)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : graph.error ? (
        <div role="alert" className="p-space-md rounded-2xl bg-error/10 border border-error/20 flex flex-col items-start gap-2">
          <p className="text-error font-semibold">Không tải được mạng lưới: {graph.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : graph.loading || !graph.data ? (
        <p aria-live="polite" aria-busy="true" className="p-space-lg text-center text-on-surface-variant">
          Đang dựng mạng lưới cho âm «{reading}»…
        </p>
      ) : (
        // key theo âm + cấp: đổi tra cứu là trạng thái chọn / lọc / modal về mặc định
        <GraphResult key={`${reading}|${level}`} graph={graph.data} reading={reading} />
      )}
    </section>
  );
};

const GraphResult: React.FC<{ graph: HanVietGraph; reading: string }> = ({ graph, reading }) => {
  const { decks, statsLoading } = useShell();
  const ownDecks = useMemo(() => decks.filter((d) => d.access === "owner"), [decks]);
  const [focusKanjiId, setFocusKanjiId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addWord, setAddWord] = useState<HanVietWordNode | null>(null);

  const kanji = useMemo(() => kanjiOfGraph(graph), [graph]);
  const words = wordNodesOf(graph);
  const focused = focusKanjiId ? (kanji.find((k) => k.node.id === focusKanjiId) ?? null) : null;
  // Danh sách dưới đồ thị theo chữ đang lọc (nếu có): lọc nút từ rồi gom lại theo cấp.
  const listed: HanVietGraph = focused
    ? { ...graph, nodes: graph.nodes.filter((n) => n.type !== "word" || focused.words.some((w) => w.id === n.id)) }
    : graph;
  const buckets = groupWordsByLevel(listed);

  const toggleKanji = (id: string | null) => {
    setFocusKanjiId((cur) => (id === null || cur === id ? null : id));
    if (id) setSelectedId(id);
  };
  // Viên "+N từ": luôn lọc theo chữ đó (không đảo lọc như bấm chữ) rồi cuộn tới danh sách đủ từ.
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const showAllWords = (kanjiId: string) => {
    setFocusKanjiId(kanjiId);
    setSelectedId(kanjiId);
    listHeadingRef.current?.scrollIntoView({ block: "start" });
  };

  if (kanji.length === 0 && words.length === 0) {
    return (
      <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
          search_off
        </span>
        <p className="text-body-md font-semibold text-on-surface">Chưa có từ ghép cho âm này</p>
        <p className="text-body-sm text-on-surface-variant max-w-md">
          Không tìm thấy chữ Hán nào mang âm «{reading}». Kiểm tra lại dấu (vd. NHẬT, không phải NHAT) hoặc chọn một âm
          trong gợi ý khi gõ.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-space-md lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="min-w-0 flex flex-col gap-2">
          {/* Đồ thị giữ bề rộng tối thiểu để nhãn đọc được; màn hẹp (< 640 px) cuộn ngang thay vì bóp nhỏ */}
          <div className="overflow-x-auto rounded-2xl bg-surface-container-lowest border border-surface-container-high p-2">
            <HanVietGraphSvg
              graph={graph}
              focusKanjiId={focusKanjiId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onFocusKanji={toggleKanji}
              onShowAllWords={showAllWords}
            />
          </div>
          <p className="text-label-sm text-outline sm:hidden">Kéo ngang để xem toàn bộ mạng lưới.</p>
          {focused && (
            <p className="text-label-md text-on-surface-variant flex items-center gap-2 flex-wrap">
              Đang lọc từ của chữ{" "}
              <strong lang="ja" className="font-japanese text-on-surface">
                {focused.node.label}
              </strong>{" "}
              ({focused.wordCount} từ)
              <button
                type="button"
                onClick={() => toggleKanji(null)}
                className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface font-semibold hover:bg-surface-container-high cursor-pointer"
              >
                Bỏ lọc
              </button>
            </p>
          )}
        </div>
        <HanVietNodePanel graph={graph} kanji={kanji} selectedId={selectedId} onSelect={setSelectedId} onAddWord={setAddWord} />
      </div>

      <div className="flex flex-col gap-space-sm">
        <h2 ref={listHeadingRef} className="font-title-md text-title-md font-bold text-on-surface scroll-mt-20">
          Từ ghép theo cấp
          <span className="ml-2 text-label-sm font-medium text-outline">
            {focused ? `${focused.wordCount} từ của chữ ${focused.node.label}` : `${words.length} từ`}
          </span>
        </h2>
        {buckets.length === 0 ? (
          <p className="p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-center text-body-sm text-on-surface-variant">
            Chưa có từ ghép cho âm này{focused ? ` (chữ ${focused.node.label})` : ""}.
          </p>
        ) : (
          <HanVietWordList buckets={buckets} selectedId={selectedId} onSelect={setSelectedId} onAddWord={setAddWord} />
        )}
      </div>

      <AddWordToDeckModal word={addWord} decks={ownDecks} decksLoading={statsLoading} onClose={() => setAddWord(null)} />
    </>
  );
};

export default HanVietMapPage;
