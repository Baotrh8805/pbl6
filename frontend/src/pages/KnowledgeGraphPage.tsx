import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { KanjiDiagramCanvas } from "@/features/graph/components/KanjiDiagramCanvas";
import { KanjiDiagramPanel } from "@/features/graph/components/KanjiDiagramPanel";
import { diagramStats, placeAround, type DiagramGraph, type DiagramPoint, type DiagramPositions } from "@/features/graph/diagramLayout";
import { fetchKanjiDiagram } from "@/services/kanjiDiagramService";
import type { KanjiDiagramMode, KanjiDiagramResponse } from "@/types/kanjiDiagram.types";

const MODES: { key: KanjiDiagramMode; label: string; icon: string; hint: string }[] = [
  { key: "structure", label: "Cấu tạo", icon: "account_tree", hint: "thành phần, bộ thủ, họ chữ cùng chỉ âm" },
  { key: "compounds", label: "Từ ghép", icon: "hub", hint: "từ thông dụng chứa chữ và các chữ ghép cùng" },
];
const MODE_KEYS = MODES.map((m) => m.key);
const QUICK: string[] = ["時", "寺", "青", "工", "生", "THỜI", "THANH"];
export const MAX_QUERY_CHARS = 32;
/** "Mở thêm 1 tầng" mở tối đa chừng này node (tuần tự, đều qua cache backend). */
const EXPAND_ALL_MAX = 8;
const EXPAND_RADIUS = 110;
const EMPTY_GRAPH: DiagramGraph = { nodes: [], edges: [] };

/** Trạng thái mở thêm / kéo node, gắn với khoá (q|mode) tạo ra nó: đổi truy vấn là về sơ đồ gốc, không cần effect. */
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
  const navigate = useNavigate();
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_CHARS);
  const rawMode = params.get("mode") as KanjiDiagramMode | null;
  const mode: KanjiDiagramMode = rawMode && MODE_KEYS.includes(rawMode) ? rawMode : "structure";
  const key = `${q}|${mode}`;
  const [input, setInput] = useState(q);
  const [reload, setReload] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [history, setHistory] = useState<string[]>([]);

  const go = useCallback(
    (next: { q?: string; mode?: KanjiDiagramMode }, replace = false) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next.q !== undefined) {
            if (next.q) out.set("q", next.q);
            else out.delete("q");
          }
          if (next.mode !== undefined) {
            if (next.mode === "structure") out.delete("mode");
            else out.set("mode", next.mode);
          }
          return out;
        },
        { replace }
      );
    },
    [setParams]
  );
  const draw = useCallback(
    (query: string) => {
      const v = query.trim().slice(0, MAX_QUERY_CHARS);
      setInput(v);
      if (v && q && v !== q) setHistory((h) => [...h.slice(-19), q]);
      go({ q: v });
    },
    [go, q]
  );
  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setInput(prev);
    navigate(-1);
  };

  const res = useAsync(() => (q ? fetchKanjiDiagram(q, mode) : Promise.resolve(null)), [q, mode], reload);
  const data: KanjiDiagramResponse | null = res.data ?? null;
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
        const more = await fetchKanjiDiagram(ch, mode);
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
    const i = MODE_KEYS.indexOf(mode);
    let next: KanjiDiagramMode | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = MODE_KEYS[(i + 1) % MODE_KEYS.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = MODE_KEYS[(i - 1 + MODE_KEYS.length) % MODE_KEYS.length];
    else if (e.key === "Home") next = MODE_KEYS[0];
    else if (e.key === "End") next = MODE_KEYS[MODE_KEYS.length - 1];
    if (next) {
      e.preventDefault();
      go({ mode: next });
      tabRefs.current[next]?.focus();
    }
  };

  const centerLabel = data?.center ? data.center.slice(2) : null;

  return (
    <section className="flex flex-col gap-space-md pb-space-xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">account_tree</span>
          Sơ đồ chữ Hán
        </h1>
        <p className="text-body-md text-on-surface-variant max-w-3xl">
          Một chữ Hán được ghép từ những phần nào, phần nào là bộ, phần nào cho âm đọc, và những chữ nào mượn cùng phần chỉ âm (時 持 待
          特 等 詩 侍 đều mang 寺). Chuyển sang <strong>Từ ghép</strong> để xem từ thông dụng chứa chữ đó.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div role="tablist" aria-label="Chế độ sơ đồ" onKeyDown={onTabKeyDown} className="flex gap-1 p-1 rounded-xl bg-surface-container-low self-start shrink-0">
          {MODES.map((m) => {
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
                onClick={() => go({ mode: m.key })}
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
            placeholder="Gõ chữ Hán (時) hoặc âm Hán-Việt (THỜI, thoi) rồi Enter"
            aria-label="Chữ Hán hoặc âm Hán-Việt"
            lang="ja"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-body-md font-japanese focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button type="submit" isLoading={res.loading && q !== ""} disabled={!input.trim()}>
            Vẽ sơ đồ
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-label-sm -mt-1">
        <span className="text-outline">Thử:</span>
        {QUICK.map((it) => (
          <button
            key={it}
            type="button"
            onClick={() => draw(it)}
            lang="ja"
            className={`font-japanese px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer ${q === it ? "ring-1 ring-primary" : ""}`}
          >
            {it}
          </button>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {data && centerLabel ? `Sơ đồ của ${centerLabel}: ${diagramStats(data.nodes)}` : ""}
      </p>

      <div id="kd-panel" role="tabpanel" aria-labelledby={`kd-tab-${mode}`} className="flex flex-col gap-space-md">
        {!q && (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-6 flex flex-col items-center text-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-primary/60">account_tree</span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">Nhập một chữ Hán hoặc âm Hán-Việt</h2>
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
            <div className="min-w-0 rounded-2xl bg-surface-container-lowest border border-surface-container-high p-3 flex flex-col gap-2">
              {data.center ? (
                <>
                  <KanjiDiagramCanvas
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
                    {data.candidates.length > 0 ? "touch_app" : "search_off"}
                  </span>
                  <p className="text-body-md text-on-surface-variant">
                    {data.candidates.length > 0
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
              onMode={(m) => go({ mode: m })}
            />
          </div>
        )}
      </div>

      <p className="text-[11px] text-on-surface-variant">
        Dữ liệu cấu tạo và phần chỉ âm từ KanjiVG (© Ulrich Apel, CC BY-SA 3.0); âm đọc, bộ thủ từ Unihan; từ ghép từ danh sách JLPT và
        JMdict (EDRDG). <Link to="/about/data" className="hover:underline">Nguồn và giấy phép</Link>
      </p>
    </section>
  );
};

export default KnowledgeGraphPage;
