import React, { useMemo, useRef } from "react";
import type { KanjiDiagramEdge, KanjiDiagramMode, KanjiDiagramNode } from "@/types/kanjiDiagram.types";
import { edgePath, pillWidth } from "@/lib/hanVietUtils";
import {
  DIAGRAM_SIZE,
  clientToDiagram,
  diagramStats,
  edgeLabel,
  fitViewBox,
  isGuessedPhonEdge,
  mergeDiagram,
  sectorLayout,
  wordLayout,
  type DiagramGraph,
  type DiagramPoint,
  type DiagramPositions,
} from "@/features/graph/diagramLayout";
import { EDGE_COLOR, NODE_FILL, NODE_TEXT, RADICAL_RING, nodeRadius } from "@/features/graph/diagramStyle";
import { useViewBox } from "@/features/graph/useViewBox";

/**
 * Canvas SVG sơ đồ chữ Hán (spec 2026-10-30 §3.5): tâm xanh dương, thành phần cam (bộ thủ viền đỏ), chữ cùng họ chỉ âm vàng,
 * từ ghép viên tím, chữ khác trong từ trắng viền xám; cạnh có mũi tên và nhãn: chỉ âm (xanh lá), cùng phần chỉ âm (xanh lá
 * nét đứt), bộ (đỏ), thành phần / có chữ (xám), ghép thành từ (tím). Tương tác (đợt 2): cuộn chuột / nút + − ⤢ / phím + − 0 để
 * zoom, kéo nền để pan, kéo node để sắp lại, huy hiệu + hoặc đúp chuột để mở thêm liên kết của node, Shift+Enter đổi tâm.
 * Bố cục lấy từ đồ thị gốc (`base`), node mở thêm (`extra`) và node đã kéo nhận toạ độ qua `positionsOverride`.
 */
interface KanjiDiagramCanvasProps {
  base: DiagramGraph;
  extra: DiagramGraph;
  centerId: string | null;
  mode: KanjiDiagramMode;
  selectedId: string | null;
  /** Node đã mở thêm (ẩn huy hiệu +). */
  expanded: ReadonlySet<string>;
  /** Node đang tải liên kết mở thêm. */
  expanding: ReadonlySet<string>;
  positionsOverride: DiagramPositions;
  onSelect: (id: string) => void;
  onExpand: (id: string) => void;
  /** Shift+Enter một chữ: vẽ lại với chữ đó làm tâm. */
  onRecenter: (kanji: string) => void;
  onDragNode: (id: string, p: DiagramPoint) => void;
  /** Toạ độ bố cục hiện tại (để trang đặt node mới quanh node mẹ). */
  onLayout?: (positions: DiagramPositions) => void;
  /** Nút góc trên trái: quay lại chữ trước (null = không có). */
  back?: { label: string; onClick: () => void } | null;
  /** Thanh dưới: mở thêm một tầng / thu gọn. */
  onExpandAll?: () => void;
  canExpandAll?: boolean;
  onCollapse?: () => void;
  canCollapse?: boolean;
  /** Bố cục: sector (Cấu tạo / Từ ghép) hoặc word (Phân tích từ, spec 30/10 từ nhiều chữ §4). */
  layout?: "sector" | "word";
  className?: string;
}

const kanjiOf = (n: KanjiDiagramNode): string | null => (n.id.startsWith("k:") ? n.id.slice(2) : null);

const roleText = (n: KanjiDiagramNode): string => {
  if (n.type === "component") {
    if (n.role === "phon") return n.guess ? "có thể là thành phần chỉ âm (đoán theo âm On)" : n.isRadical ? "thành phần chỉ âm, cũng là bộ" : "thành phần chỉ âm";
    if (n.role === "radical") return "bộ thủ";
    return "thành phần";
  }
  if (n.type === "phonetic") return n.sameOn ? "cùng chỉ âm, đọc giống" : "cùng phần chỉ âm, đọc khác";
  if (n.type === "word") return "từ ghép";
  if (n.type === "kanji") return "chữ trong từ ghép";
  return "chữ đang xét";
};

const nodeBase = "cursor-pointer focus:outline-none [&:hover_.halo]:opacity-60 [&:focus-visible_.halo]:opacity-100";
const toolBtn =
  "w-8 h-8 inline-flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export const KanjiDiagramCanvas: React.FC<KanjiDiagramCanvasProps> = ({
  base,
  extra,
  centerId,
  mode,
  selectedId,
  expanded,
  expanding,
  positionsOverride,
  onSelect,
  onExpand,
  onRecenter,
  onDragNode,
  onLayout,
  back,
  onExpandAll,
  canExpandAll = false,
  onCollapse,
  canCollapse = false,
  layout: layoutKind = "sector",
  className = "",
}) => {
  const merged = useMemo(() => mergeDiagram(base, extra), [base, extra]);
  const layout = useMemo(
    () =>
      layoutKind === "word" && centerId
        ? wordLayout(base.nodes, base.edges, centerId, DIAGRAM_SIZE)
        : sectorLayout(base.nodes, base.edges, centerId, DIAGRAM_SIZE),
    [base, centerId, layoutKind]
  );
  // từ làm tâm (Phân tích từ) vẽ viên lớn hơn từ ghép thường
  const wordPx = (n: KanjiDiagramNode) => (n.id === centerId ? 22 : 16);
  const radiusOf = (n: KanjiDiagramNode) => (n.type === "word" && n.id === centerId ? 22 : nodeRadius(n));
  const positions = useMemo<DiagramPositions>(() => ({ ...layout, ...positionsOverride }), [layout, positionsOverride]);
  const onLayoutRef = useRef(onLayout);
  React.useEffect(() => {
    onLayoutRef.current = onLayout;
  });
  React.useEffect(() => {
    onLayoutRef.current?.(positions);
  }, [positions]);
  const byId = useMemo(() => new Map(merged.nodes.map((n) => [n.id, n])), [merged]);
  const fitBox = useMemo(() => fitViewBox(positions, 64), [positions]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { view, isFit, zoomIn, zoomOut, fit, panHandlers, panning, onKeyDown } = useViewBox(fitBox, svgRef, `${centerId ?? ""}|${mode}`);

  // kéo node: bắt con trỏ trên <g>, quá 4 px mới coi là kéo; click sau một lần kéo bị nuốt (consumeDrag)
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const consumeDrag = () => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  };
  const nodeHandlers = (n: KanjiDiagramNode) => ({
    onPointerDown: (e: React.PointerEvent<SVGGElement>) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.stopPropagation();
      drag.current = { id: n.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      dragged.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<SVGGElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointer || d.id !== n.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.moved = true;
      dragged.current = true;
      const svg = svgRef.current;
      if (!svg) return;
      onDragNode(n.id, clientToDiagram(svg.getBoundingClientRect(), view, e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent<SVGGElement>) => {
      if (drag.current && e.pointerId === drag.current.pointer) drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  });

  const activate = (n: KanjiDiagramNode, kind: "select" | "expand" | "recenter") => {
    const ch = kanjiOf(n);
    if (kind === "recenter" && ch && n.id !== centerId) onRecenter(ch);
    else if (kind === "expand" && canExpand(n)) onExpand(n.id);
    else onSelect(n.id);
  };
  const canExpand = (n: KanjiDiagramNode) => Boolean(n.expandable) && n.id !== centerId && !expanded.has(n.id) && !expanding.has(n.id);
  const onKey = (e: React.KeyboardEvent, n: KanjiDiagramNode) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(n, e.shiftKey ? "recenter" : "select");
    } else if ((e.key === "+" || e.key === "=") && canExpand(n)) {
      // mở thêm bằng bàn phím (review 30/10 I4); chặn nổi bọt để khung không hiểu là phóng to
      e.preventDefault();
      e.stopPropagation();
      onExpand(n.id);
    }
  };

  // điểm đầu / cuối cạnh lùi vào mép node để mũi tên không chui vào trong hình
  const trimmed = (e: KanjiDiagramEdge) => {
    const a = positions[e.from];
    const b = positions[e.to];
    const na = byId.get(e.from);
    const nb = byId.get(e.to);
    if (!a || !b || !na || !nb) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ra = na.type === "word" ? pillWidth(na.label, wordPx(na), 20) / 2 : nodeRadius(na);
    const rb = (nb.type === "word" ? pillWidth(nb.label, wordPx(nb), 20) / 2 : nodeRadius(nb)) + 6;
    if (len <= ra + rb) return null;
    return {
      from: { x: a.x + (dx / len) * ra, y: a.y + (dy / len) * ra },
      to: { x: b.x - (dx / len) * rb, y: b.y - (dy / len) * rb },
      mid: { x: (a.x + b.x) / 2 - (dy / len) * 10, y: (a.y + b.y) / 2 + (dx / len) * 10 },
    };
  };

  const legend: { swatch: React.ReactNode; text: string }[] =
    mode === "structure"
      ? [
          { swatch: <Dot fill={NODE_FILL.center} />, text: "chữ đang xét" },
          { swatch: <Dot fill={NODE_FILL.component} />, text: "thành phần cấu tạo" },
          { swatch: <Dot fill={NODE_FILL.phonetic} />, text: "chữ cùng họ chỉ âm" },
          { swatch: <Line color={EDGE_COLOR.phon} />, text: "chỉ âm" },
          { swatch: <Line color={EDGE_COLOR.family} dashed />, text: "nét đứt: cùng phần chỉ âm nhưng đọc khác, hoặc chỉ âm đoán (?)" },
          { swatch: <Line color={EDGE_COLOR.radical} />, text: "bộ" },
          { swatch: <Line color={EDGE_COLOR.part} />, text: "thành phần khác" },
        ]
      : mode === "word"
        ? [
            { swatch: <Dot fill={NODE_FILL.word} />, text: "từ đang xét" },
            { swatch: <Dot fill={NODE_FILL.kanji} stroke="#94a3b8" />, text: "chữ trong từ" },
            { swatch: <Dot fill={NODE_FILL.component} />, text: "thành phần cấu tạo" },
            { swatch: <Line color={EDGE_COLOR.radical} />, text: "bộ" },
            { swatch: <Line color={EDGE_COLOR.phon} />, text: "chỉ âm" },
            { swatch: <Line color={EDGE_COLOR.phon} dashed />, text: "chỉ âm đoán (?)" },
            { swatch: <Line color={EDGE_COLOR.part} />, text: "thành phần khác" },
          ]
      : [
          { swatch: <Dot fill={NODE_FILL.center} />, text: "chữ đang xét" },
          { swatch: <Dot fill={NODE_FILL.word} />, text: "từ ghép" },
          { swatch: <Dot fill={NODE_FILL.kanji} stroke="#94a3b8" />, text: "chữ khác trong từ" },
          { swatch: <Line color={EDGE_COLOR.compound} />, text: "ghép thành từ" },
        ];
  const expandableLeft = merged.nodes.some(canExpand);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        className="relative rounded-xl bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Khung sơ đồ: phím + − để phóng / thu, 0 để vừa khung; kéo nền để di chuyển. Trên một chữ: Enter chọn, dấu + mở thêm liên kết, Shift+Enter lấy làm tâm"
      >
        {back && (
          <button
            type="button"
            onClick={back.onClick}
            className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant text-label-sm font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
            Quay lại <span lang="ja" className="font-japanese">{back.label}</span>
          </button>
        )}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1" role="group" aria-label="Phóng to / thu nhỏ">
          <button type="button" onClick={zoomIn} className={toolBtn} aria-label="Phóng to" title="Phóng to (+)">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button type="button" onClick={zoomOut} className={toolBtn} aria-label="Thu nhỏ" title="Thu nhỏ (−)">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <button type="button" onClick={fit} disabled={isFit} className={toolBtn} aria-label="Vừa khung" title="Vừa khung (0)">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">fit_screen</span>
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="group"
          aria-label={`Sơ đồ ${diagramStats(merged.nodes)}`}
          className={`block w-full h-auto select-none touch-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ aspectRatio: `${view.w} / ${view.h}`, maxHeight: "70vh" }}
          {...panHandlers}
        >
          <defs>
            {Object.entries(EDGE_COLOR).map(([type, color]) => (
              <marker key={type} id={`kd-arrow-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {merged.edges.map((e, i) => {
            const t = trimmed(e);
            if (!t) return null;
            const touched = selectedId !== null && (e.from === selectedId || e.to === selectedId);
            // chỉ âm do heuristic đoán: nét đứt + dấu hỏi để không khẳng định điều dữ liệu không có
            const guessed = isGuessedPhonEdge(e, byId.get(e.from), centerId, layoutKind);
            return (
              <g key={`${e.from}|${e.to}|${e.type}|${i}`} className="pointer-events-none">
                <path
                  d={edgePath(t.from, t.to)}
                  fill="none"
                  stroke={EDGE_COLOR[e.type]}
                  strokeWidth={touched ? 2.6 : 1.8}
                  strokeDasharray={e.type === "family" || guessed ? "6 4" : undefined}
                  markerEnd={`url(#kd-arrow-${e.type})`}
                  opacity={selectedId && !touched ? 0.55 : 1}
                />
                <text x={t.mid.x} y={t.mid.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill={EDGE_COLOR[e.type]} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                  {guessed ? "chỉ âm?" : edgeLabel(e.type)}
                </text>
              </g>
            );
          })}
          {merged.nodes.map((n) => {
            const p = positions[n.id];
            if (!p) return null;
            const r = radiusOf(n);
            const isCenter = n.id === centerId;
            const selected = selectedId === n.id;
            const tip = `${n.label}${n.hanViet ? ` (${n.hanViet})` : ""}${n.meaningVi ? ` — ${n.meaningVi}` : n.meaningEn ? ` — ${n.meaningEn}` : ""} · ${roleText(n)}${canExpand(n) ? " · có thể mở thêm (phím +)" : ""}`;
            const isWord = n.type === "word";
            const w = isWord ? pillWidth(n.label, wordPx(n), 20) : r * 2;
            const radicalRing = n.type === "component" && (n.role === "radical" || n.isRadical);
            const showPlus = canExpand(n);
            const busy = expanding.has(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={tip}
                aria-pressed={selected}
                onClick={() => {
                  if (!consumeDrag()) onSelect(n.id);
                }}
                onDoubleClick={() => activate(n, "expand")}
                onKeyDown={(e) => onKey(e, n)}
                className={nodeBase}
                {...nodeHandlers(n)}
              >
                <title>{tip}</title>
                {isWord ? (
                  <>
                    <rect x={-w / 2 - 5} y={-r - 5} width={w + 10} height={r * 2 + 10} rx={r + 5} className={`halo fill-none stroke-primary ${selected ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
                    <rect x={-w / 2} y={-r} width={w} height={r * 2} rx={r} fill={NODE_FILL.word} stroke={selected ? "#1b2a4a" : "#6d28d9"} strokeWidth={1.5} />
                    <text textAnchor="middle" dominantBaseline="central" lang="ja" fontSize={wordPx(n)} fontWeight={700} fill={NODE_TEXT.word} className="font-japanese pointer-events-none">
                      {n.label}
                    </text>
                    {n.reading && (
                      <text y={r + 13} textAnchor="middle" lang="ja" fontSize={10} fill="#45464e" className="font-japanese pointer-events-none">
                        {n.reading}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    <circle r={r + 6} className={`halo fill-none stroke-primary ${selected ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
                    {radicalRing && <circle r={r + 3} fill="none" stroke={RADICAL_RING} strokeWidth={2.5} />}
                    <circle r={r} fill={NODE_FILL[n.type]} stroke={isCenter ? "#1e3a8a" : n.type === "kanji" ? "#94a3b8" : "#ffffff"} strokeWidth={isCenter ? 3 : 1.5} />
                    <text textAnchor="middle" dominantBaseline="central" lang="ja" fontSize={isCenter ? 34 : n.type === "kanji" ? 20 : 26} fontWeight={700} fill={NODE_TEXT[n.type]} className="font-japanese pointer-events-none">
                      {n.label}
                    </text>
                    {n.hanViet && (
                      <text y={r + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill="#45464e" className="pointer-events-none">
                        {n.hanViet}
                      </text>
                    )}
                    {n.type === "component" && n.phon && n.phon !== n.label && (
                      <text y={r + 24} textAnchor="middle" lang="ja" fontSize={9} fill="#6b7280" className="font-japanese pointer-events-none">
                        {`≈ ${n.phon}`}
                      </text>
                    )}
                  </>
                )}
                {(showPlus || busy) && (
                  <g
                    transform={`translate(${(isWord ? w / 2 : r) - 4} ${-r + 2})`}
                    role="button"
                    aria-label={busy ? `Đang mở ${n.label}` : `Mở thêm liên kết của ${n.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!busy && !consumeDrag()) onExpand(n.id);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                  >
                    <circle r={9} fill={busy ? "#94a3b8" : "#16a34a"} stroke="#ffffff" strokeWidth={2} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={800} fill="#ffffff" className="pointer-events-none">
                      {busy ? "…" : "+"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant px-1">
        <span className="font-semibold text-on-surface">{diagramStats(merged.nodes)} trên sơ đồ</span>
        <span className="text-outline">· bấm chữ để xem chi tiết · bấm dấu + (hoặc đúp chuột) để mở thêm liên kết · kéo để sắp lại</span>
        {onExpandAll && (
          <button type="button" onClick={onExpandAll} disabled={!canExpandAll || !expandableLeft} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-outline-variant text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">unfold_more</span>
            Mở thêm 1 tầng
          </button>
        )}
        {onCollapse && (
          <button type="button" onClick={onCollapse} disabled={!canCollapse && isFit} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-outline-variant text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">unfold_less</span>
            Thu gọn
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant px-1">
        {legend.map((l) => (
          <span key={l.text} className="inline-flex items-center gap-1">
            {l.swatch}
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
};

const Dot: React.FC<{ fill: string; stroke?: string }> = ({ fill, stroke }) => (
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full" style={{ background: fill, border: `1.5px solid ${stroke ?? fill}` }} />
);

const Line: React.FC<{ color: string; dashed?: boolean }> = ({ color, dashed }) => (
  <span aria-hidden="true" className="inline-block w-5 border-t-2" style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />
);
