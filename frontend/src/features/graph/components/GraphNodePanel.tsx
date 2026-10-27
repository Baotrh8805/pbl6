import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { GraphEdge, GraphNode } from "@/types/graph.types";
import { edgeLabel, edgesOf, learnerText, nodeHref, wordMeaning } from "@/lib/graphLayout";
import { JlptChip, TypeChip } from "./GraphBits";

interface GraphNodePanelProps {
  node: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelect: (id: string) => void;
  onExpand: (id: string) => void;
  onAddWord: (node: GraphNode) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2 text-body-sm">
    <dt className="w-20 shrink-0 text-outline">{label}</dt>
    <dd className="min-w-0 text-on-surface">{children}</dd>
  </div>
);

const JA = new Set(["word", "kanji", "radical", "component", "sentence", "grammar", "card"]);

function rows(n: GraphNode): { label: string; value: React.ReactNode }[] {
  switch (n.type) {
    case "word":
      return [
        { label: "Cách đọc", value: n.reading ?? "—" },
        { label: "Nghĩa", value: wordMeaning(n) || "—" },
        { label: "Nghĩa Anh", value: n.vi && n.gloss ? n.gloss : null },
        { label: "Phổ biến", value: n.common ? "Có" : null },
      ].filter((r) => r.value !== null && r.value !== undefined);
    case "kanji":
      return [
        { label: "Hán-Việt", value: n.hanViet ?? "—" },
        { label: "Nghĩa", value: n.meaning ?? "—" },
        { label: "Số nét", value: n.strokes ?? "—" },
        { label: "Bộ thủ", value: n.radicalNo ? `số ${n.radicalNo}` : "—" },
      ];
    case "radical":
      return [
        { label: "Tên", value: n.nameVi ?? "—" },
        { label: "Nghĩa", value: n.meaningVi ?? "—" },
        { label: "Số nét", value: n.strokes ?? "—" },
      ];
    case "grammar":
      return [
        { label: "Cấp", value: n.level ?? "—" },
        { label: "Nghĩa", value: n.meaningVi ?? "—" },
      ];
    case "sentence":
      return [
        { label: "Tiếng Việt", value: n.vi ?? "chưa có bản dịch" },
        { label: "Tiếng Anh", value: n.eng ?? "—" },
      ];
    case "card":
      return [
        { label: "Cách đọc", value: n.reading ?? "—" },
        { label: "Nghĩa", value: n.meaning ?? "—" },
      ];
    case "deck":
      return [{ label: "Cấp", value: n.level ?? "—" }];
    case "chapter":
      return [{ label: "Thứ tự", value: n.position ?? "—" }];
    case "path":
      return [{ label: "Trạng thái", value: n.status ?? "—" }];
    default:
      return [];
  }
}

export const GraphNodePanel: React.FC<GraphNodePanelProps> = ({ node, nodes, edges, onSelect, onExpand, onAddWord }) => {
  if (!node) {
    return (
      <aside className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high text-body-sm text-on-surface-variant">
        Bấm một node để xem chi tiết; bấm đúp (hoặc Shift+Enter) để khám phá từ node đó.
      </aside>
    );
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rels = new Map<string, GraphNode[]>();
  for (const e of edgesOf(node.id, edges)) {
    const other = byId.get(e.other);
    if (!other) continue;
    const key = `${e.type}|${e.outward ? "out" : "in"}`;
    rels.set(key, [...(rels.get(key) ?? []), other]);
  }
  const href = nodeHref(node);
  const learner = learnerText(node);
  const ja = JA.has(node.type);
  return (
    <aside className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-3" aria-live="polite">
      <div className="flex items-start gap-3">
        <span lang={ja ? "ja" : undefined} className={`${ja ? "font-japanese" : ""} ${node.type === "kanji" || node.type === "radical" ? "text-5xl" : "text-2xl"} font-bold text-on-surface leading-tight break-words min-w-0`}>
          {node.type === "sentence" ? node.jpn : node.label}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypeChip type={node.type} />
        <JlptChip level={node.jlpt ?? node.level} />
      </div>
      <dl className="flex flex-col gap-1">
        {rows(node).map((r) => (
          <Row key={r.label} label={r.label}>
            {r.value}
          </Row>
        ))}
      </dl>
      {learner && (
        <p className="text-body-sm text-on-surface px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] align-middle mr-1 text-primary">
            school
          </span>
          {learner}
        </p>
      )}
      {rels.size > 0 && (
        <dl className="flex flex-col gap-1.5 border-t border-surface-container-high pt-2">
          {[...rels.entries()].map(([key, list]) => {
            const [type, dir] = key.split("|");
            return (
              <div key={key} className="text-body-sm">
                <dt className="text-outline">
                  {dir === "out" ? edgeLabel(type) : `← ${edgeLabel(type)}`} ({list.length})
                </dt>
                <dd className="flex flex-wrap gap-1 mt-0.5">
                  {list.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onSelect(o.id)}
                      lang={JA.has(o.type) ? "ja" : undefined}
                      className={`px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer ${JA.has(o.type) ? "font-japanese" : ""}`}
                      title={o.vi ?? o.gloss ?? o.meaning ?? o.meaningVi ?? undefined}
                    >
                      {o.type === "sentence" ? (o.label.length > 14 ? o.label.slice(0, 13) + "…" : o.label) : o.label}
                    </button>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={() => onExpand(node.id)}>
          Khám phá từ đây
        </Button>
        {node.type === "word" && (
          <Button size="sm" variant="outline" onClick={() => onAddWord(node)}>
            Thêm vào bộ thẻ
          </Button>
        )}
        {href && (
          <Link to={href} className="inline-flex items-center px-3 py-1.5 rounded-lg text-label-md font-semibold text-primary hover:bg-primary/10">
            Mở trong {node.type === "deck" || node.type === "card" ? "bộ thẻ" : node.type === "path" ? "lộ trình" : "từ điển"}
          </Link>
        )}
      </div>
    </aside>
  );
};
