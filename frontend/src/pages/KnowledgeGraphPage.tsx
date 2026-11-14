import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/layout/shellContext";
import { useAsync } from "@/lib/useAsync";
import { hasCjkIdeograph, isCjkIdeograph } from "@/lib/textUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { suggestHanViet } from "@/services/nlpService";
import { AddWordToDeckModal } from "@/features/hanviet/components/AddWordToDeckModal";
import { KanjiDiagramCanvas } from "@/features/graph/components/KanjiDiagramCanvas";
import { KanjiDiagramPanel } from "@/features/graph/components/KanjiDiagramPanel";
import { DiagramCharBar } from "@/features/graph/components/DiagramCharBar";
import {
  diagramKey,
  diagramStats,
  placeAround,
  showWordTab, type DiagramGraph, type DiagramPoint, type DiagramPositions } from "@/features/graph/diagramLayout";
import { fetchKanjiDiagram } from "@/services/kanjiDiagramService";
import { readDiagramMemory, restoredSearch, searchToRemember, writeDiagramMemory } from "@/features/graph/diagramMemory";
import type { HanVietWordNode } from "@/types/api.types";
import type { KanjiDiagramMode, KanjiDiagramResponse } from "@/types/kanjiDiagram.types";

const MODES: { key: KanjiDiagramMode; label: string; icon: string; hint: string }[] = [
  { key: "word", label: "Phân tích từ", icon: "join_inner", hint: "từ ở giữa, mỗi chữ cùng thành phần cấu tạo" },
  { key: "structure", label: "Cấu tạo", icon: "account_tree", hint: "thành phần, bộ thủ, họ chữ cùng chỉ âm" },
  { key: "compounds", label: "Từ ghép", icon: "hub", hint: "từ thông dụng chứa chữ và các chữ ghép cùng" },
];
const MODE_KEYS = MODES.map((m) => m.key);
const QUICK: string[] = ["学生", "時", "寺", "青", "生", "THỜI", "THANH", "học sinh"];
/** Câu tìm là đúng một chữ Hán: giữ tab Cấu tạo / Từ ghép đang mở; còn lại (từ, kana, Hán-Việt) để ai-service tự chọn chế độ. */
const isSingleKanji = (v: string): boolean => Array.from(v).filter(isCjkIdeograph).length === 1;
export const MAX_QUERY_CHARS = 32;
/** "Mở thêm 1 tầng" mở tối đa chừng này node (tuần tự, đều qua cache backend). */
const EXPAND_ALL_MAX = 8;
const EXPAND_RADIUS = 110;
const EMPTY_GRAPH: DiagramGraph = { nodes: [], edges: [] };

/** Trạng thái mở thêm / kéo node, gắn với khoá (q|mode|k) tạo ra nó: đổi truy vấn là về sơ đồ gốc, không cần effect. */
interface Overlay {
  key: string;
  extra: DiagramGraph;
  expanded: Set<string>;
  override: DiagramPositions;
}
const emptyOverlay = (key: string): Overlay => ({ key, extra: EMPTY_GRAPH, expanded: new Set(), override: {} });

/**
 * Sơ đồ chữ Hán (/graph, spec 2026-10-30): thay bộ khám phá Neo4j cũ. Trạng thái trên URL: ?q=時&mode=compounds (mode mặc định
 * structure không ghi). Đổi tâm = đổi q (push history) nên Back / Forward của trình duyệt đi lại các chữ đã xem; nút "Quay lại
 * [chữ trước]" dùng ngăn xếp riêng trong phiên. Node đang chọn, node đã mở thêm và vị trí đã kéo gắn với (q, mode) tạo ra
 * chúng. Dữ liệu tĩnh ở ai-service, không cần Neo4j.
 */
export const KnowledgeGraphPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  // Sidebar dẫn tới /graph không kèm ?q=: nhớ câu tìm gần nhất trong tab (sessionStorage) và khôi phục khi mở trang trống,
  // bằng replace để Back không dừng ở trang trống. Ghi mỗi khi URL có q (Back / Forward / đổi tab chế độ đều cập nhật).
  const pendingRestore = useMemo(() => restoredSearch(params, readDiagramMemory()), [params]);
  useEffect(() => {
    const v = searchToRemember(params);
    if (v) writeDiagramMemory(v);
  }, [params]);
  useEffect(() => {
    if (pendingRestore) setParams(pendingRestore, { replace: true });
  }, [pendingRestore, setParams]);
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_CHARS);
  const rawMode = params.get("mode") as KanjiDiagramMode | null;
  // mode trên URL: thiếu = để ai-service tự chọn (từ 2–4 chữ → Phân tích từ); k = chữ chọn trong từ (spec 30/10 từ nhiều chữ §3)
  const modeUrl: KanjiDiagramMode | null = rawMode && MODE_KEYS.includes(rawMode) ? rawMode : null;
  const k = params.get("k") || null;
  const key = diagramKey(q, modeUrl, k);
  // ô tìm gắn với q tạo ra nó: q đổi (Back / Forward, chọn ứng viên) thì ô hiện q mới, không cần setState trong effect (review I5)
  const [typed, setTyped] = useState<{ q: string; value: string }>({ q, value: q });
  const input = typed.q === q ? typed.value : q;
  const setInput = (value: string) => setTyped({ q, value });
  const [reload, setReload] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [history, setHistory] = useState<string[]>([]);
  const { decks, statsLoading } = useShell();
  const ownDecks = useMemo(() => decks.filter((d) => d.access === "owner"), [decks]);
  const [addWord, setAddWord] = useState<HanVietWordNode | null>(null);

  // gợi ý âm Hán-Việt khi gõ chữ Latinh (debounce 200 ms); gõ chữ Hán thì không gợi ý
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);
  const wantSuggest = debounced.length >= 1 && debounced.length <= 12 && !hasCjkIdeograph(debounced) && /^[\p{L}\s]+$/u.test(debounced);
  const suggestRes = useAsync(() => (wantSuggest ? suggestHanViet(debounced, 8) : Promise.resolve([])), [wantSuggest ? debounced : ""]);
  const suggestions = suggestRes.data ?? [];

  const go = useCallback(
    (next: { q?: string; mode?: KanjiDiagramMode | null; k?: string | null }, replace = false) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next.q !== undefined) {
            if (next.q) out.set("q", next.q);
            else out.delete("q");
            if (next.k === undefined) out.delete("k"); // đổi câu tìm: chữ chọn của từ cũ không còn nghĩa
          }
          if (next.mode !== undefined) {
            if (next.mode) out.set("mode", next.mode);
            else out.delete("mode");
          }
          if (next.k !== undefined) {
            if (next.k) out.set("k", next.k);
            else out.delete("k");
          }
          return out;
        },
        { replace }
      );
    },
    [setParams]
  );
  const modeFor = useCallback(
    (v: string): KanjiDiagramMode | null => (modeUrl && modeUrl !== "word" && isSingleKanji(v) ? modeUrl : null),
    [modeUrl]
  );
  const draw = useCallback(
    (query: string) => {
      const v = query.trim().slice(0, MAX_QUERY_CHARS);
      setTyped({ q, value: v });
      if (v && q && v !== q) setHistory((h) => [...h.slice(-19), q]);
      go({ q: v, mode: modeFor(v) }, v === q); // vẽ lại cùng chữ: thay entry thay vì push (review M3)
    },
    [go, q, modeFor]
  );
  // "Quay lại [chữ trước]" vẽ lại chữ đó bằng một entry mới (không navigate(-1): đổi tab / vẽ lại cũng push history nên lùi một bước
  // không chắc về đúng chữ — review 30/10 I2)
  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    go({ q: prev, mode: modeFor(prev) });
  };

  const res = useAsync(() => (q ? fetchKanjiDiagram(q, modeUrl, k) : Promise.resolve(null)), [q, modeUrl, k], reload);
  const data: KanjiDiagramResponse | null = res.data ?? null;
  // chế độ thực tế do ai-service trả (gửi word cho một chữ → structure); URL ghi chế độ khác thì sửa lại bằng replace
  const mode: KanjiDiagramMode = data?.mode ?? modeUrl ?? "structure";
  useEffect(() => {
    if (data && modeUrl && data.query === q && data.mode !== modeUrl) go({ mode: data.mode === "word" ? null : data.mode }, true);
  }, [data, modeUrl, q, go]);
  const hasWord = showWordTab(data?.word?.term ?? null, data?.chars ?? []);
  const tabs = MODES.filter((m) => m.key !== "word" || hasWord);
  const tabKeys = tabs.map((m) => m.key);
  const selectMode = (m: KanjiDiagramMode) => (m === "word" ? go({ mode: null, k: "" }) : go({ mode: m }));
  const pickChar = (ch: string) => go({ mode: "structure", k: ch });
  const [sel, setSel] = useState<{ key: string; id: string | null }>({ key: "", id: null });
  const selectedId = sel.key === key && sel.id ? sel.id : (data?.center ?? null);
  const select = (id: string) => setSel({ key, id });

  // ---- mở thêm liên kết / kéo node -----------------------------------------------------------------------------------------
  const [overlayState, setOverlay] = useState<Overlay>(() => emptyOverlay(key));
  const overlay = overlayState.key === key ? overlayState : emptyOverlay(key);
  const [expanding, setExpanding] = useState<Set<string>>(new Set());
  const [expandError, setExpandError] = useState<string | null>(null);
  const layoutRef = useRef<DiagramPositions>({});
  const baseGraph = useMemo<DiagramGraph>(() => (data && data.center ? { nodes: data.nodes, edges: data.edges } : EMPTY_GRAPH), [data]);

  const expand = useCallback(
    async (id: string) => {
      if (!id.startsWith("k:") || !data?.center) return;
      const ch = id.slice(2);
      setExpanding((s) => new Set(s).add(id));
      setExpandError(null);
      try {
        // Phân tích từ: mở thêm một chữ = Cấu tạo đầy đủ của chữ đó (họ chỉ âm…), không lặp lại chế độ từ (spec §4)
        const more = await fetchKanjiDiagram(ch, mode === "word" ? "structure" : mode);
        setOverlay((cur) => {
          const o = cur.key === key ? cur : emptyOverlay(key);
          const known = new Set([...baseGraph.nodes.map((n) => n.id), ...o.extra.nodes.map((n) => n.id)]);
          const fresh = more.nodes.filter((n) => !known.has(n.id));
          const anchor = layoutRef.current[id] ?? { x: 0, y: 0 };
          const placed = placeAround(anchor, fresh.map((n) => n.id), layoutRef.current, EXPAND_RADIUS);
          const expanded = new Set(o.expanded).add(id);
          return {
            key,
            extra: { nodes: [...o.extra.nodes, ...fresh], edges: [...o.extra.edges, ...more.edges] },
            expanded,
            override: { ...o.override, ...placed },
          };
        });
      } catch (e) {
        setExpandError(extractErrorMessage(e));
      } finally {
        setExpanding((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [data, mode, key, baseGraph]
  );
  const expandAll = async () => {
    const all = [...baseGraph.nodes, ...overlay.extra.nodes];
    const todo = all.filter((n) => n.expandable && n.id !== data?.center && !overlay.expanded.has(n.id)).slice(0, EXPAND_ALL_MAX);
    for (const n of todo) await expand(n.id);
  };
  const collapse = () => {
    setOverlay(emptyOverlay(key));
    setExpandError(null);
  };
  const onDragNode = (id: string, p: DiagramPoint) =>
    setOverlay((cur) => {
      const o = cur.key === key ? cur : emptyOverlay(key);
      return { ...o, key, override: { ...o.override, [id]: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } } };
    });
  const canCollapse = overlay.extra.nodes.length > 0 || Object.keys(overlay.override).length > 0;

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const i = tabKeys.indexOf(mode);
    let next: KanjiDiagramMode | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabKeys[(i + 1) % tabKeys.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabKeys[(i - 1 + tabKeys.length) % tabKeys.length];
    else if (e.key === "Home") next = tabKeys[0];
    else if (e.key === "End") next = tabKeys[tabKeys.length - 1];
    if (next) {
      e.preventDefault();
      selectMode(next);
      tabRefs.current[next]?.focus();
    }
  };

  const centerLabel = data?.mode === "word" && data.word ? data.word.term : data?.center ? data.center.slice(2) : null;

  return (
    <section className="flex flex-col gap-space-md pb-space-xl">
      <header>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">account_tree</span>
          Sơ đồ chữ Hán & Đồ thị tri thức
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Trực quan hóa cấu tạo chữ Hán, họ chữ cùng chỉ âm và mạng lưới từ ghép liên đới.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div role="tablist" aria-label="Chế độ sơ đồ" onKeyDown={onTabKeyDown} className="flex gap-1 p-1 rounded-xl bg-surface-container-low self-start shrink-0">
          {tabs.map((m) => {
            const selected = m.key === mode;
            return (
              <button
                key={m.key}
                ref={(el) => {
                  tabRefs.current[m.key] = el;
                }}
                id={`kd-tab-${m.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={selected ? "kd-panel" : undefined}
                tabIndex={selected ? 0 : -1}
                title={m.hint}
                onClick={() => selectMode(m.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg text-label-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  selected ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) draw(input);
          }}
          className="flex flex-1 min-w-0 gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={MAX_QUERY_CHARS}
            placeholder="Gõ chữ Hán (時), từ (学生), kana hoặc âm Hán-Việt (học sinh) rồi Enter"
            aria-label="Chữ Hán, từ, kana hoặc âm Hán-Việt"
            lang="ja"
            list="kd-suggest"
            autoComplete="off"
            className="flex-1 min-w-0 px-3.5 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md font-japanese focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
          />
          <datalist id="kd-suggest">
            {suggestions.map((s) => (
              <option key={s.reading} value={s.reading} label={`${s.count} chữ · ${s.kanji.join(" ")}`} />
            ))}
          </datalist>
          <Button type="submit" isLoading={res.loading && q !== ""} disabled={!input.trim()}>
            Vẽ sơ đồ
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-label-sm -mt-1">
        <span className="text-outline text-xs">Thử nhanh:</span>
        {QUICK.map((it) => (
          <button
            key={it}
            type="button"
            onClick={() => draw(it)}
            lang="ja"
            className={`font-japanese px-2 py-0.5 rounded-md bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold cursor-pointer transition-colors ${q === it ? "ring-1 ring-primary bg-primary/10 text-primary" : ""}`}
          >
            {it}
          </button>
        ))}
      </div>

      {/* Dãy vết khám phá (Exploration Breadcrumbs) */}
      {history.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-3 rounded-xl bg-surface-container-low text-xs border border-surface-container-high/40 scrollbar-none">
          <span className="text-outline font-semibold uppercase tracking-wider text-[10px] shrink-0">Lộ trình khám phá:</span>
          {history.map((item, idx) => (
            <React.Fragment key={`${item}-${idx}`}>
              <button
                type="button"
                onClick={() => {
                  setHistory((prev) => prev.slice(0, idx));
                  draw(item);
                }}
                className="font-japanese font-semibold text-primary hover:underline hover:bg-surface-container px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0"
              >
                {item}
              </button>
              <span className="text-outline shrink-0">›</span>
            </React.Fragment>
          ))}
          <span className="font-japanese font-bold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
            {q}
          </span>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {data && centerLabel ? `Sơ đồ của ${centerLabel}: ${diagramStats(data.nodes)}` : ""}
      </p>

      <div id="kd-panel" role="tabpanel" aria-labelledby={`kd-tab-${mode}`} className="flex flex-col gap-space-md">
        {!q && !pendingRestore && (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-6 flex flex-col items-center text-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-primary/60">account_tree</span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">Nhập một chữ Hán, một từ hoặc âm Hán-Việt</h2>
            <p className="text-body-sm text-on-surface-variant max-w-xl">
              Sơ đồ vẽ chữ ở giữa, thành phần cấu tạo bên trái (bộ thủ viền đỏ, phần chỉ âm nối bằng mũi tên xanh lá) và họ chữ cùng chỉ âm
              bên phải. Bấm một chữ để xem chi tiết ở bảng bên; bấm dấu + để mở thêm liên kết; cuộn chuột để phóng to, kéo để di chuyển.
            </p>
          </div>
        )}
        {q && res.error && (
          <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm flex items-center justify-between gap-2">
            {res.error}
            <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
              Thử lại
            </Button>
          </p>
        )}
        {q && res.loading && !res.error && <p className="text-body-sm text-on-surface-variant">Đang dựng sơ đồ «{q}»…</p>}
        {q && data && (
          <div className="grid gap-space-md lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
            <div className="min-w-0 rounded-2xl bg-surface-container-lowest border border-surface-container-high p-3 flex flex-col gap-2 shadow-xs">
              <DiagramCharBar
                word={data.word?.term ?? null}
                chars={data.chars}
                active={mode === "word" ? null : data.selectedChar}
                onWord={() => selectMode("word")}
                onChar={pickChar}
              />
              {data.center ? (
                <>
                  <KanjiDiagramCanvas
                    layout={mode === "word" ? "word" : "sector"}
                    base={baseGraph}
                    extra={overlay.extra}
                    centerId={data.center}
                    mode={mode}
                    selectedId={selectedId}
                    expanded={overlay.expanded}
                    expanding={expanding}
                    positionsOverride={overlay.override}
                    onSelect={select}
                    onExpand={(id) => void expand(id)}
                    onRecenter={draw}
                    onDragNode={onDragNode}
                    onLayout={(p) => {
                      layoutRef.current = p;
                    }}
                    back={history.length > 0 ? { label: history[history.length - 1], onClick: goBack } : null}
                    onExpandAll={() => void expandAll()}
                    canExpandAll={expanding.size === 0}
                    onCollapse={collapse}
                    canCollapse={canCollapse}
                  />
                  {expandError && (
                    <p role="alert" className="text-body-sm text-error">
                      Không mở thêm được: {expandError}
                    </p>
                  )}
                </>
              ) : (
                <div className="min-h-[18rem] flex flex-col items-center justify-center text-center gap-2 p-6">
                  <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
                    {data.candidates.length > 0 || data.wordCandidates.length > 0 ? "touch_app" : "search_off"}
                  </span>
                  <p className="text-body-md text-on-surface-variant">
                    {data.wordCandidates.length > 0
                      ? `«${q}» ứng với ${data.wordCandidates.length} từ — chọn một từ ở bảng bên để vẽ sơ đồ.`
                      : data.candidates.length > 0
                      ? `Âm «${q.toUpperCase()}» ứng với ${data.candidates.length} chữ — chọn một chữ ở bảng bên để vẽ sơ đồ.`
                      : `Không tìm thấy chữ nào cho «${q}».`}
                  </p>
                </div>
              )}
            </div>
            <KanjiDiagramPanel
              data={data}
              extraNodes={overlay.extra.nodes}
              selectedId={selectedId}
              mode={mode}
              onRecenter={draw}
              onSelect={select}
              onMode={selectMode}
              onAddWord={setAddWord}
              onChar={pickChar}
            />
          </div>
        )}
      </div>

      <AddWordToDeckModal word={addWord} decks={ownDecks} decksLoading={statsLoading} onClose={() => setAddWord(null)} />

      <p className="text-[11px] text-on-surface-variant">
        Dữ liệu cấu tạo và phần chỉ âm từ KanjiVG (© Ulrich Apel, CC BY-SA 3.0); âm đọc, bộ thủ từ Unihan; từ ghép từ danh sách JLPT và
        JMdict (EDRDG). <Link to="/about/data" className="hover:underline">Nguồn và giấy phép</Link>
      </p>
    </section>
  );
};

export default KnowledgeGraphPage;
