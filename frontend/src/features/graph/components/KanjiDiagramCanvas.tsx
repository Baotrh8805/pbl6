import React, { useMemo } from "react";
import type { KanjiDiagramEdge, KanjiDiagramMode, KanjiDiagramNode } from "@/types/kanjiDiagram.types";
import { edgePath, pillWidth } from "@/lib/hanVietUtils";
import { DIAGRAM_SIZE, diagramStats, edgeLabel, fitViewBox, sectorLayout } from "@/features/graph/diagramLayout";
import { EDGE_COLOR, NODE_FILL, NODE_TEXT, RADICAL_RING, nodeRadius } from "@/features/graph/diagramStyle";

/**
 * Canvas SVG sơ đồ chữ Hán (spec 2026-10-30 §3.5): tâm xanh dương, thành phần cam (bộ thủ viền đỏ), chữ cùng họ chỉ âm vàng,
 * từ ghép viên tím, chữ khác trong từ trắng viền xám; cạnh có mũi tên và nhãn: chỉ âm (xanh lá), cùng phần chỉ âm (xanh lá
 * nét đứt), bộ (đỏ), thành phần / có chữ (xám), ghép thành từ (tím). Đợt 1: tĩnh — bấm chọn, đúp chuột / Shift+Enter đổi tâm;
 * zoom / kéo / mở tầng ở đợt 2. Mọi node là <g role="button" tabIndex=0> như KnowledgeGraphSvg cũ (Tab tới được).
 */
interface KanjiDiagramCanvasProps {
  nodes: KanjiDiagramNode[];
  edges: KanjiDiagramEdge[];
  centerId: string | null;
  mode: KanjiDiagramMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Đúp chuột / Shift+Enter một chữ: vẽ lại với chữ đó làm tâm. */
  onRecenter: (kanji: string) => void;
  className?: string;
}

const kanjiOf = (n: KanjiDiagramNode): string | null => (n.id.startsWith("k:") ? n.id.slice(2) : null);

const roleText = (n: KanjiDiagramNode): string => {
  if (n.type === "component") {
    if (n.role === "phon") return n.isRadical ? "thành phần chỉ âm, cũng là bộ" : "thành phần chỉ âm";
    if (n.role === "radical") return "bộ thủ";
    return "thành phần";
  }
  if (n.type === "phonetic") return n.sameOn ? "cùng chỉ âm, đọc giống" : "cùng phần chỉ âm, đọc khác";
  if (n.type === "word") return "từ ghép";
  if (n.type === "kanji") return "chữ trong từ ghép";
  return "chữ đang xét";
};

const nodeBase =
  "cursor-pointer focus:outline-none [&:hover_.halo]:opacity-60 [&:focus-visible_.halo]:opacity-100";

export const KanjiDiagramCanvas: React.FC<KanjiDiagramCanvasProps> = ({
  nodes,
  edges,
  centerId,
  mode,
  selectedId,
  onSelect,
  onRecenter,
  className = "",
}) => {
  const positions = useMemo(() => sectorLayout(nodes, edges, centerId, DIAGRAM_SIZE), [nodes, edges, centerId]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const viewBox = useMemo(() => fitViewBox(positions, 64), [positions]);

  const activate = (n: KanjiDiagramNode, recenter: boolean) => {
    const ch = kanjiOf(n);
    if (recenter && ch && n.id !== centerId) onRecenter(ch);
    else onSelect(n.id);
  };
  const onKey = (e: React.KeyboardEvent, n: KanjiDiagramNode) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(n, e.shiftKey);
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
    const ra = na.type === "word" ? pillWidth(na.label, 16, 20) / 2 : nodeRadius(na);
    const rb = (nb.type === "word" ? pillWidth(nb.label, 16, 20) / 2 : nodeRadius(nb)) + 6;
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
          { swatch: <Line color={EDGE_COLOR.family} dashed />, text: "cùng phần chỉ âm, đọc khác" },
          { swatch: <Line color={EDGE_COLOR.radical} />, text: "bộ" },
        ]
      : [
          { swatch: <Dot fill={NODE_FILL.center} />, text: "chữ đang xét" },
          { swatch: <Dot fill={NODE_FILL.word} />, text: "từ ghép" },
          { swatch: <Dot fill={NODE_FILL.kanji} stroke="#94a3b8" />, text: "chữ khác trong từ" },
          { swatch: <Line color={EDGE_COLOR.compound} />, text: "ghép thành từ" },
        ];

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        role="group"
        aria-label={`Sơ đồ ${diagramStats(nodes)}`}
        className="block w-full h-auto select-none"
      >
        <defs>
          {Object.entries(EDGE_COLOR).map(([type, color]) => (
            <marker key={type} id={`kd-arrow-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={color} />
            </marker>
          ))}
        </defs>
        {edges.map((e, i) => {
          const t = trimmed(e);
          if (!t) return null;
          const touched = selectedId !== null && (e.from === selectedId || e.to === selectedId);
          const label = edgeLabel(e.type);
          return (
            <g key={`${e.from}|${e.to}|${e.type}|${i}`} className="pointer-events-none">
              <path
                d={edgePath(t.from, t.to)}
                fill="none"
                stroke={EDGE_COLOR[e.type]}
                strokeWidth={touched ? 2.6 : 1.8}
                strokeDasharray={e.type === "family" ? "6 4" : undefined}
                markerEnd={`url(#kd-arrow-${e.type})`}
                opacity={selectedId && !touched ? 0.55 : 1}
              />
              <text
                x={t.mid.x}
                y={t.mid.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill={EDGE_COLOR[e.type]}
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const r = nodeRadius(n);
          const isCenter = n.id === centerId;
          const selected = selectedId === n.id;
          const tip = `${n.label}${n.hanViet ? ` (${n.hanViet})` : ""}${n.meaningVi ? ` — ${n.meaningVi}` : n.meaningEn ? ` — ${n.meaningEn}` : ""} · ${roleText(n)}`;
          const isWord = n.type === "word";
          const w = isWord ? pillWidth(n.label, 16, 20) : r * 2;
          const radicalRing = n.type === "component" && (n.role === "radical" || n.isRadical);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={tip}
              aria-pressed={selected}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => activate(n, true)}
              onKeyDown={(e) => onKey(e, n)}
              className={nodeBase}
            >
              <title>{tip}</title>
              {isWord ? (
                <>
                  <rect x={-w / 2 - 5} y={-r - 5} width={w + 10} height={r * 2 + 10} rx={r + 5} className={`halo fill-none stroke-primary ${selected ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
                  <rect x={-w / 2} y={-r} width={w} height={r * 2} rx={r} fill={NODE_FILL.word} stroke={selected ? "#1b2a4a" : "#6d28d9"} strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="central" lang="ja" fontSize={16} fontWeight={700} fill={NODE_TEXT.word} className="font-japanese pointer-events-none">
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
                  <circle
                    r={r}
                    fill={NODE_FILL[n.type]}
                    stroke={isCenter ? "#1e3a8a" : n.type === "kanji" ? "#94a3b8" : "#ffffff"}
                    strokeWidth={isCenter ? 3 : 1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    lang="ja"
                    fontSize={isCenter ? 34 : n.type === "kanji" ? 20 : 26}
                    fontWeight={700}
                    fill={NODE_TEXT[n.type]}
                    className="font-japanese pointer-events-none"
                  >
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
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant px-1">
        <span className="font-semibold text-on-surface">{diagramStats(nodes)}</span>
        <span className="text-outline">· bấm vào chữ để xem chi tiết, đúp chuột để lấy chữ đó làm tâm</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {legend.map((l) => (
            <span key={l.text} className="inline-flex items-center gap-1">
              {l.swatch}
              {l.text}
            </span>
          ))}
        </span>
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
