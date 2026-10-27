import React from "react";
import { Link } from "react-router-dom";
import type { GraphNode, GraphNodeType } from "@/types/graph.types";
import { TYPE_CHIP, TYPE_LABEL, nodeHref, wordMeaning } from "@/lib/graphLayout";
import { LEVEL_TONE, UNKNOWN_LEVEL_TONE } from "@/features/extraction/extractionUtils";

export const TypeChip: React.FC<{ type: GraphNodeType }> = ({ type }) => (
  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${TYPE_CHIP[type]}`}>{TYPE_LABEL[type]}</span>
);

export const JlptChip: React.FC<{ level?: string | null }> = ({ level }) =>
  level ? (
    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${LEVEL_TONE[level] ?? UNKNOWN_LEVEL_TONE}`}>{level}</span>
  ) : null;

/** Một dòng node (từ / chữ / mẫu…) dùng trong gợi ý, nguồn, đường nối: nhãn Nhật + nghĩa + nút Khám phá. */
export const NodeLine: React.FC<{
  node: GraphNode;
  onExplore?: (id: string) => void;
  onAddWord?: (node: GraphNode) => void;
  note?: React.ReactNode;
}> = ({ node, onExplore, onAddWord, note }) => {
  const href = nodeHref(node);
  const meaning =
    node.type === "word" ? wordMeaning(node) : node.type === "kanji" ? [node.hanViet, node.meaning].filter(Boolean).join(" · ")
      : node.type === "grammar" ? node.meaningVi ?? "" : node.type === "sentence" ? node.vi ?? node.eng ?? "" : node.type === "radical" ? `${node.nameVi ?? ""} ${node.meaningVi ? `(${node.meaningVi})` : ""}` : "";
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeChip type={node.type} />
          <span lang="ja" className="font-japanese font-semibold text-on-surface">
            {node.label}
          </span>
          {node.type === "word" && node.reading && node.reading !== node.term && (
            <span lang="ja" className="font-japanese text-body-sm text-on-surface-variant">
              {node.reading}
            </span>
          )}
          <JlptChip level={node.jlpt ?? node.level} />
        </div>
        {meaning && <p className="text-body-sm text-on-surface-variant truncate">{meaning}</p>}
        {note && <p className="text-label-sm text-outline">{note}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onExplore && (
          <button
            type="button"
            onClick={() => onExplore(node.id)}
            className="px-2 py-1 rounded-md text-label-sm font-semibold text-primary hover:bg-primary/10 cursor-pointer"
          >
            Khám phá
          </button>
        )}
        {onAddWord && node.type === "word" && (
          <button
            type="button"
            onClick={() => onAddWord(node)}
            className="px-2 py-1 rounded-md text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer"
            title="Thêm vào bộ thẻ"
          >
            + Thẻ
          </button>
        )}
        {href && (
          <Link to={href} className="px-2 py-1 rounded-md text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container" title="Mở trong từ điển">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] align-middle">
              open_in_new
            </span>
            <span className="sr-only">Mở trong từ điển</span>
          </Link>
        )}
      </div>
    </div>
  );
};

/** Neo4j chưa chạy / chưa dựng: hướng dẫn thay vì lỗi đỏ (spec §9). */
export const GraphUnavailableNotice: React.FC = () => (
  <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col items-center gap-2 text-center">
    <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">
      hub
    </span>
    <p className="text-body-md font-semibold text-on-surface">Đồ thị tri thức chưa sẵn sàng</p>
    <p className="text-body-sm text-on-surface-variant max-w-md">
      Máy chủ chưa nối được Neo4j hoặc chưa dựng dữ liệu đồ thị. Quản trị viên bật Neo4j (<code className="font-mono text-label-sm">docker compose up -d neo4j</code>)
      rồi bấm «Dựng lại đồ thị» ở Admin › Tổng quan; sau đó trang này tự hoạt động.
    </p>
  </div>
);

export const EmptyNote: React.FC<{ icon: string; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-1 text-center">
    <span aria-hidden="true" className="material-symbols-outlined text-[32px] text-outline">
      {icon}
    </span>
    <p className="text-body-md font-semibold text-on-surface">{title}</p>
    {children && <p className="text-body-sm text-on-surface-variant max-w-md">{children}</p>}
  </div>
);
