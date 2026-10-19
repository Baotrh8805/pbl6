import React, { useMemo } from "react";
import type { HanVietEdge, HanVietGraph, HanVietNode } from "@/types/api.types";
import { LEVEL_TONE, UNKNOWN_LEVEL_TONE } from "@/features/extraction/extractionUtils";
import {
  edgePath,
  graphSummary,
  isKanjiNode,
  isWordNode,
  kanjiOfGraph,
  pillWidth,
  radialLayout,
  readingNodeOf,
  wordNodesOf,
} from "@/lib/hanVietUtils";

/** Cạnh khung viewBox (vuông); toạ độ của radialLayout tính theo số này. */
export const GRAPH_SIZE = 720;

// SVG tô bằng fill chứ không phải background, nên cần bộ lớp riêng cùng tông với LEVEL_TONE (chữ trên viên lấy
// đúng lớp text-* của LEVEL_TONE qua fill="currentColor").
const LEVEL_FILL: Record<string, string> = {
  N5: "fill-secondary-container/50",
  N4: "fill-primary-fixed",
  N3: "fill-[#FEF3C7]",
  N2: "fill-tertiary-fixed",
  N1: "fill-error-container",
};
const UNKNOWN_FILL = "fill-surface-container";

interface HanVietGraphSvgProps {
  graph: HanVietGraph;
  /** Chữ Hán đang lọc: chỉ từ ghép của chữ này rõ, phần còn lại mờ và không bấm được. */
  focusKanjiId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Bấm chữ Hán (nơi gọi tự đảo lọc); null = bấm nút âm ở tâm để bỏ lọc. */
  onFocusKanji: (id: string | null) => void;
}

// Nút nào cũng là <g role="button" tabIndex=0>: bàn phím Tab tới được, Enter/Space kích hoạt; <title> làm tooltip gốc.
// Vòng "halo" ẩn hiện khi hover / focus / đang chọn vì outline của trình duyệt không bám theo hình SVG.
const nodeBase =
  "cursor-pointer focus:outline-none transition-opacity [&:hover_.halo]:opacity-60 [&:focus-visible_.halo]:opacity-100";

export const HanVietGraphSvg: React.FC<HanVietGraphSvgProps> = ({ graph, focusKanjiId, selectedId, onSelect, onFocusKanji }) => {
  const positions = useMemo(() => radialLayout(graph, GRAPH_SIZE), [graph]);
  const kanji = useMemo(() => kanjiOfGraph(graph), [graph]);
  // từ -> các chữ Hán nối với nó (để biết từ nào thuộc chữ đang lọc)
  const wordKanji = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of kanji) for (const w of k.words) m.set(w.id, [...(m.get(w.id) ?? []), k.node.id]);
    return m;
  }, [kanji]);
  const reading = readingNodeOf(graph);
  const words = wordNodesOf(graph);

  const wordVisible = (id: string) => !focusKanjiId || (wordKanji.get(id) ?? []).includes(focusKanjiId);
  const edgeActive = (e: HanVietEdge) => !focusKanjiId || e.from === focusKanjiId || e.to === focusKanjiId;

  const activate = (node: HanVietNode) => {
    if (isKanjiNode(node)) onFocusKanji(node.id);
    else if (isWordNode(node)) {
      if (wordVisible(node.id)) onSelect(node.id);
    } else {
      onFocusKanji(null);
      onSelect(node.id);
    }
  };
  const onKey = (e: React.KeyboardEvent, node: HanVietNode) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(node);
    }
  };
  const haloClass = (id: string) => `halo fill-none stroke-primary ${selectedId === id ? "opacity-100" : "opacity-0"}`;

  return (
    <svg
      viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
      role="group"
      aria-label={graphSummary(graph)}
      className="block w-full h-auto min-w-[36rem] max-w-[52rem] mx-auto select-none"
    >
      {/* Cạnh vẽ trước để nằm dưới nút */}
      {graph.edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return null;
        return (
          <path
            key={`${e.from}|${e.to}|${i}`}
            d={edgePath(a, b)}
            strokeWidth={1.5}
            className={`fill-none stroke-outline-variant transition-opacity ${edgeActive(e) ? "" : "opacity-20"}`}
          />
        );
      })}

      {words.map((w) => {
        const p = positions[w.id];
        if (!p) return null;
        const width = pillWidth(w.label);
        const visible = wordVisible(w.id);
        const tone = (w.level && LEVEL_TONE[w.level]) || UNKNOWN_LEVEL_TONE;
        const fill = (w.level && LEVEL_FILL[w.level]) || UNKNOWN_FILL;
        const detail = [w.reading, w.meaning, w.level].filter(Boolean).join(" · ");
        return (
          <g
            key={w.id}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={visible ? 0 : -1}
            aria-hidden={visible ? undefined : true}
            aria-pressed={selectedId === w.id}
            aria-label={`Từ ${w.label}${detail ? `: ${detail}` : ""}`}
            onClick={() => activate(w)}
            onKeyDown={(e) => onKey(e, w)}
            className={`${nodeBase} ${visible ? "" : "opacity-20 pointer-events-none"}`}
          >
            <title>{detail ? `${w.label} · ${detail}` : w.label}</title>
            <rect className={haloClass(w.id)} x={-width / 2 - 3} y={-15} width={width + 6} height={30} rx={15} strokeWidth={2} />
            <rect className={fill} x={-width / 2} y={-12} width={width} height={24} rx={12} />
            <text
              lang="ja"
              fill="currentColor"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="central"
              className={`${tone} font-japanese`}
            >
              {w.label}
            </text>
          </g>
        );
      })}

      {kanji.map((k) => {
        const p = positions[k.node.id];
        if (!p) return null;
        const focused = focusKanjiId === k.node.id;
        const parts = [
          k.node.hanViet,
          k.node.on.length ? `on: ${k.node.on.join("、")}` : "",
          k.node.kun.length ? `kun: ${k.node.kun.join("、")}` : "",
          `${k.wordCount} từ`,
        ].filter(Boolean);
        return (
          <g
            key={k.node.id}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={focused}
            aria-label={`Chữ ${k.node.label} (${parts.join(", ")}). ${focused ? "Đang lọc, bấm để bỏ lọc" : "Bấm để chỉ hiện từ của chữ này"}`}
            onClick={() => activate(k.node)}
            onKeyDown={(e) => onKey(e, k.node)}
            className={nodeBase}
          >
            <title>{`${k.node.label} · ${parts.join(" · ")}`}</title>
            <circle className={haloClass(k.node.id)} r={32} strokeWidth={2} />
            <circle r={26} strokeWidth={2} className={`stroke-primary ${focused ? "fill-primary-fixed" : "fill-surface-container-lowest"}`} />
            <text
              lang="ja"
              fontSize={24}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-on-surface font-japanese"
            >
              {k.node.label}
            </text>
            <text y={40} fontSize={10} textAnchor="middle" className="fill-outline">
              {k.wordCount} từ
            </text>
          </g>
        );
      })}

      {reading && positions[reading.id] && (
        <g
          transform={`translate(${positions[reading.id].x} ${positions[reading.id].y})`}
          role="button"
          tabIndex={0}
          aria-pressed={selectedId === reading.id}
          aria-label={`Âm ${reading.label}. Bấm để xem tổng quan và bỏ lọc chữ`}
          onClick={() => activate(reading)}
          onKeyDown={(e) => onKey(e, reading)}
          className={nodeBase}
        >
          <title>{`Âm Hán-Việt ${reading.label}`}</title>
          <circle className={haloClass(reading.id)} r={44} strokeWidth={2} />
          <circle r={38} className="fill-primary" />
          <text
            fontSize={reading.label.length > 6 ? 12 : 16}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white"
          >
            {reading.label}
          </text>
        </g>
      )}
    </svg>
  );
};
