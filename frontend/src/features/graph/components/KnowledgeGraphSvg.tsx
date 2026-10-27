import React, { useMemo } from "react";
import type { GraphEdge, GraphNode } from "@/types/graph.types";
import { TYPE_FILL, TYPE_LABEL, edgeLabel, forceLayout, learnerStroke, learnerText, nodeRadius, nodeText } from "@/lib/graphLayout";

export const GRAPH_SIZE = 720;

interface KnowledgeGraphSvgProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Bấm đúp / Shift+Enter một node: khám phá từ node đó (đổi tâm). */
  onExpand?: (id: string) => void;
  size?: number;
  className?: string;
}

const JA_TYPES = new Set(["word", "kanji", "radical", "component", "sentence", "grammar", "card"]);
// Mọi node là <g role="button" tabIndex=0>: Tab tới được, Enter/Space chọn; vòng "halo" thay outline của trình duyệt.
const nodeBase =
  "cursor-pointer focus:outline-none transition-opacity [&:hover_.halo]:opacity-60 [&:focus-visible_.halo]:opacity-100";

const textClass = (type: GraphNode["type"]): string => {
  switch (type) {
    case "word":
      return "fill-on-primary-fixed";
    case "kanji":
      return "fill-on-tertiary-fixed";
    case "hanviet":
      return "fill-on-secondary-container";
    case "grammar":
      return "fill-[#B45309]";
    case "deck":
    case "card":
      return "fill-on-primary-container";
    default:
      return "fill-on-surface";
  }
};

export const KnowledgeGraphSvg: React.FC<KnowledgeGraphSvgProps> = ({
  nodes,
  edges,
  centerId,
  selectedId,
  onSelect,
  onExpand,
  size = GRAPH_SIZE,
  className = "",
}) => {
  const positions = useMemo(() => forceLayout(nodes, edges, size, centerId), [nodes, edges, size, centerId]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.shiftKey && onExpand) onExpand(id);
      else onSelect(id);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="group"
      aria-label={`Đồ thị ${nodes.length} node, ${edges.length} quan hệ`}
      className={`block w-full h-auto select-none ${className}`}
    >
      {edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return null;
        const touched = selectedId !== null && (e.from === selectedId || e.to === selectedId);
        return (
          <line
            key={`${e.from}|${e.to}|${e.type}|${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={touched ? 2.5 : 1.5}
            strokeDasharray={e.type === "looks_like" || e.type === "homophone_of" ? "5 4" : undefined}
            className={`${touched ? "stroke-primary" : "stroke-outline-variant"} transition-colors`}
          >
            <title>{`${byId.get(e.from)?.label ?? e.from} — ${edgeLabel(e.type)} → ${byId.get(e.to)?.label ?? e.to}`}</title>
          </line>
        );
      })}
      {nodes.map((n) => {
        const p = positions[n.id];
        if (!p) return null;
        const isCenter = n.id === centerId;
        const r = nodeRadius(n.type, isCenter);
        const ring = learnerStroke(n);
        const learner = learnerText(n);
        const ja = JA_TYPES.has(n.type);
        const tip = `${TYPE_LABEL[n.type]}: ${n.label}${n.vi ? ` — ${n.vi}` : n.gloss ? ` — ${n.gloss}` : ""}${learner ? ` · ${learner}` : ""}`;
        return (
          <g
            key={n.id}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-label={tip}
            aria-pressed={selectedId === n.id}
            onClick={() => onSelect(n.id)}
            onDoubleClick={() => onExpand?.(n.id)}
            onKeyDown={(e) => onKey(e, n.id)}
            className={nodeBase}
          >
            <title>{tip}</title>
            <circle r={r + 5} className={`halo fill-none stroke-primary ${selectedId === n.id ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
            {ring && <circle r={r + 2.5} className={`fill-none ${ring}`} strokeWidth={3} />}
            <circle r={r} className={`${TYPE_FILL[n.type]} ${isCenter ? "stroke-primary" : "stroke-surface-container-highest"}`} strokeWidth={isCenter ? 2 : 1} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              lang={ja ? "ja" : undefined}
              className={`${textClass(n.type)} ${ja ? "font-japanese" : ""} font-semibold pointer-events-none`}
              style={{ fontSize: n.type === "kanji" || n.type === "radical" || n.type === "component" ? (isCenter ? 26 : 20) : isCenter ? 13 : 11 }}
            >
              {nodeText(n)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
