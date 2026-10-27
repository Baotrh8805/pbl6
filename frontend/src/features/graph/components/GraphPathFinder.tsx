import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fetchGraphPath } from "@/services/graphService";
import { edgeLabel } from "@/lib/graphLayout";
import { useGraphAsync } from "../useGraphAsync";
import { EmptyNote, GraphUnavailableNotice, NodeLine } from "./GraphBits";

interface GraphPathFinderProps {
  onExplore: (id: string) => void;
}

const EXAMPLES: [string, string][] = [
  ["食", "ご飯"],
  ["学校", "THỰC"],
  ["日本", "本"],
];

/** Đường nối ngắn nhất giữa hai khái niệm (shortestPath Cypher ≤ 6 bước, chỉ qua quan hệ lớp tham chiếu). */
export const GraphPathFinder: React.FC<GraphPathFinderProps> = ({ onExplore }) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pair, setPair] = useState<[string, string] | null>(null);
  const res = useGraphAsync(() => (pair ? fetchGraphPath(pair[0], pair[1]) : Promise.resolve(null)), [pair?.[0] ?? "", pair?.[1] ?? ""]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (from.trim() && to.trim()) setPair([from.trim(), to.trim()]);
  };

  return (
    <div className="flex flex-col gap-space-md">
      <form onSubmit={submit} className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-2">
        <p className="text-body-sm text-on-surface-variant">
          Nhập hai từ / chữ Hán / âm Hán-Việt / mẫu ngữ pháp; đồ thị tìm chuỗi quan hệ ngắn nhất nối chúng (qua chữ Hán chung, bộ thủ, âm
          Hán-Việt, câu ví dụ…).
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] items-center">
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            maxLength={64}
            placeholder="Từ điểm… (vd. 食)"
            aria-label="Khái niệm đầu"
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span aria-hidden="true" className="material-symbols-outlined text-outline justify-self-center">
            arrow_forward
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            maxLength={64}
            placeholder="…tới điểm (vd. ご飯)"
            aria-label="Khái niệm cuối"
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button type="submit" size="md" isLoading={res.loading && pair !== null} disabled={!from.trim() || !to.trim()}>
            Tìm đường nối
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-label-sm">
          <span className="text-outline">Thử:</span>
          {EXAMPLES.map(([a, b]) => (
            <button
              key={`${a}-${b}`}
              type="button"
              onClick={() => {
                setFrom(a);
                setTo(b);
                setPair([a, b]);
              }}
              className="px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer"
            >
              <span lang="ja" className="font-japanese">{a}</span> → <span lang="ja" className="font-japanese">{b}</span>
            </button>
          ))}
        </div>
      </form>

      {res.unavailable && <GraphUnavailableNotice />}
      {res.error && !res.unavailable && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {res.error}
        </p>
      )}
      {res.data && !res.data.found && (
        <EmptyNote icon="route" title="Không tìm thấy đường nối trong 6 bước">
          {!res.data.from || !res.data.to
            ? "Một trong hai khái niệm không có trong đồ thị (kiểm tra chính tả hoặc chọn từ phổ biến hơn)."
            : "Hai khái niệm này không chung chữ Hán, bộ thủ, âm Hán-Việt hay câu ví dụ nào gần nhau."}
        </EmptyNote>
      )}
      {res.data && res.data.found && (
        <ol className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col" aria-label="Chuỗi quan hệ">
          {res.data.nodes.map((n, i) => {
            const edge = res.data!.edges[i];
            return (
              <li key={`${n.id}-${i}`} className="flex flex-col">
                <NodeLine node={n} onExplore={onExplore} />
                {edge && (
                  <div className="flex items-center gap-2 pl-3 text-label-sm text-outline">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                      south
                    </span>
                    {edge.from === n.id ? edgeLabel(edge.type) : `← ${edgeLabel(edge.type)}`}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
