import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/layout/shellContext";
import { AddWordToDeckModal } from "@/features/hanviet/components/AddWordToDeckModal";
import { KnowledgeGraphSvg } from "@/features/graph/components/KnowledgeGraphSvg";
import { GraphNodePanel } from "@/features/graph/components/GraphNodePanel";
import { GraphConflicts, GraphRecommendations } from "@/features/graph/components/GraphRecommendations";
import { GraphPathFinder } from "@/features/graph/components/GraphPathFinder";
import { GraphAskPanel } from "@/features/graph/components/GraphAskPanel";
import { EmptyNote, GraphUnavailableNotice, TypeChip } from "@/features/graph/components/GraphBits";
import { useGraphAsync } from "@/features/graph/useGraphAsync";
import { exploreGraph, fetchGraphConflicts, fetchGraphRecommend, syncGraphMe } from "@/services/graphService";
import { groupByType, wordNodeForDeck } from "@/lib/graphLayout";
import type { HanVietWordNode } from "@/types/api.types";
import type { GraphNode } from "@/types/graph.types";

type GraphTab = "explore" | "suggest" | "ask" | "path";

const TABS: { key: GraphTab; label: string; icon: string }[] = [
  { key: "explore", label: "Khám phá", icon: "hub" },
  { key: "suggest", label: "Gợi ý cho bạn", icon: "lightbulb" },
  { key: "ask", label: "Hỏi đáp", icon: "forum" },
  { key: "path", label: "Đường nối", icon: "route" },
];
const TAB_KEYS = TABS.map((t) => t.key);
const QUICK: { label: string; q: string }[] = [
  { label: "食", q: "食" },
  { label: "食べる", q: "食べる" },
  { label: "THỰC", q: "THỰC" },
  { label: "日本", q: "日本" },
  { label: "〜なければならない", q: "〜なければならない" },
];

/**
 * Đồ thị tri thức Neo4j + GraphRAG (UC-34 / UC-35, spec 2026-10-27 §9). Trạng thái trên URL: ?tab=explore&q=食 | suggest | ask |
 * path. Khi mở trang, đồng bộ dữ liệu học của mình (POST /graph/sync/me, lỗi bỏ qua) để đồ thị thấy thẻ / lịch ôn mới nhất.
 */
export const KnowledgeGraphPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as GraphTab | null;
  const tab: GraphTab = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "explore";
  const q = (params.get("q") ?? "").trim();
  const [input, setInput] = useState(q);
  const [reload, setReload] = useState(0);
  const { decks, statsLoading } = useShell();
  const ownDecks = useMemo(() => decks.filter((d) => d.access === "owner"), [decks]);
  const [addWord, setAddWord] = useState<HanVietWordNode | null>(null);

  useEffect(() => {
    // Đồng bộ lười dữ liệu học khi mở trang; 429 (vừa đồng bộ) hay 503 (Neo4j tắt) đều không phải lỗi của người dùng
    syncGraphMe().catch(() => undefined);
  }, []);

  const go = useCallback(
    (next: GraphTab, extra: Record<string, string | null> = {}) => {
      setParams((prev) => {
        const out = new URLSearchParams(prev);
        if (next === "explore") out.delete("tab");
        else out.set("tab", next);
        for (const [k, v] of Object.entries(extra)) {
          if (v) out.set(k, v);
          else out.delete(k);
        }
        return out;
      });
    },
    [setParams]
  );
  const explore = useCallback(
    (query: string) => {
      setInput(query);
      go("explore", { q: query });
    },
    [go]
  );

  const exploreRes = useGraphAsync(() => (q ? exploreGraph(q) : Promise.resolve(null)), [q], reload);
  const suggestRes = useGraphAsync(() => (tab === "suggest" ? fetchGraphRecommend() : Promise.resolve(null)), [tab === "suggest"], reload);
  const conflictRes = useGraphAsync(() => (tab === "suggest" ? fetchGraphConflicts() : Promise.resolve(null)), [tab === "suggest"], reload);

  // Node đang chọn gắn với truy vấn tạo ra nó: đổi q thì về node tâm, không cần setState trong effect.
  const [sel, setSel] = useState<{ q: string; id: string | null }>({ q: "", id: null });
  const data = exploreRes.data ?? null;
  const selectedId = sel.q === q && sel.id ? sel.id : (data?.center ?? null);
  const selectedNode = data?.nodes.find((n) => n.id === selectedId) ?? null;
  const groups = useMemo(() => (data ? groupByType(data.nodes) : []), [data]);

  const onAddWord = (node: GraphNode) => {
    const w = wordNodeForDeck(node);
    if (w) setAddWord(w);
  };

  return (
    <section className="flex flex-col gap-space-md pb-space-xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Đồ thị tri thức</h1>
        <p className="text-body-md text-on-surface-variant max-w-3xl">
          Từ vựng – chữ Hán – bộ thủ – âm Hán-Việt – mẫu ngữ pháp – câu ví dụ nối với nhau trên Neo4j, cùng bộ thẻ và lịch ôn của bạn.
          Khám phá quan hệ, nhận gợi ý tính từ đồ thị, hoặc hỏi bằng tiếng Việt.
        </p>
      </header>

      <div role="tablist" aria-label="Chế độ xem" className="flex gap-1 overflow-x-auto border-b border-surface-container-high">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-label-md font-semibold whitespace-nowrap border-b-2 -mb-px cursor-pointer ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "explore" && (
        <div className="flex flex-col gap-space-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) explore(input.trim());
            }}
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={64}
                placeholder="Từ (食べる / 食べました), chữ Hán (食), âm Hán-Việt (THỰC), mẫu ngữ pháp (〜なければならない)…"
                aria-label="Tìm trong đồ thị"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button type="submit" isLoading={exploreRes.loading && q !== ""} disabled={!input.trim()}>
                Khám phá
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-label-sm">
              <span className="text-outline">Thử:</span>
              {QUICK.map((it) => (
                <button
                  key={it.q}
                  type="button"
                  onClick={() => explore(it.q)}
                  lang="ja"
                  className="font-japanese px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer"
                >
                  {it.label}
                </button>
              ))}
            </div>
          </form>

          {!q && (
            <EmptyNote icon="hub" title="Nhập một từ, chữ Hán, âm Hán-Việt hay mẫu ngữ pháp">
              Đồ thị vẽ node tâm và láng giềng hai bậc: từ → chữ Hán → bộ thủ / âm Hán-Việt / chữ giống hình, câu ví dụ → mẫu ngữ pháp,
              và thẻ của bạn chứa từ đó. Viền đỏ = đến hạn ôn, xanh = đã ôn, tím = có thẻ chưa ôn.
            </EmptyNote>
          )}
          {q && exploreRes.unavailable && <GraphUnavailableNotice />}
          {q && exploreRes.error && !exploreRes.unavailable && (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm flex items-center justify-between gap-2">
              {exploreRes.error}
              <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
                Thử lại
              </Button>
            </p>
          )}
          {q && data && !data.center && (
            <EmptyNote icon="search_off" title={`Không có «${q}» trong đồ thị`}>
              Thử dạng gốc của từ, một chữ Hán đơn, âm Hán-Việt viết hoa (THỰC) hoặc tên mẫu ngữ pháp (〜てもいい). Từ hiếm ngoài JLPT và
              danh sách phổ biến của JMdict không có trong đồ thị.
            </EmptyNote>
          )}
          {data && data.center && (
            <>
              <div className="grid gap-space-md lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
                <div className="min-w-0 flex flex-col gap-2">
                  <div className="overflow-x-auto rounded-2xl bg-surface-container-lowest border border-surface-container-high p-2">
                    <KnowledgeGraphSvg
                      nodes={data.nodes}
                      edges={data.edges}
                      centerId={data.center}
                      selectedId={selectedId}
                      onSelect={(id) => setSel({ q, id })}
                      onExpand={(id) => explore(id)}
                      className="min-w-[34rem] max-w-[52rem] mx-auto"
                    />
                  </div>
                  <p className="text-label-sm text-outline sm:hidden">Kéo ngang để xem toàn bộ đồ thị.</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-label-sm">
                    {groups.map((g) => (
                      <span key={g.type} className="inline-flex items-center gap-1">
                        <TypeChip type={g.type} />
                        <span className="text-outline">{g.nodes.length}</span>
                      </span>
                    ))}
                    <span className="ml-auto inline-flex items-center gap-2 text-outline">
                      <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full border-2 border-error" /> đến hạn</span>
                      <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full border-2 border-secondary" /> đã ôn</span>
                      <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full border-2 border-primary" /> có thẻ</span>
                    </span>
                  </div>
                </div>
                <GraphNodePanel
                  node={selectedNode}
                  nodes={data.nodes}
                  edges={data.edges}
                  onSelect={(id) => setSel({ q, id })}
                  onExpand={(id) => explore(id)}
                  onAddWord={onAddWord}
                />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "suggest" && (
        <div className="flex flex-col gap-space-md">
          {(suggestRes.unavailable || conflictRes.unavailable) && <GraphUnavailableNotice />}
          {suggestRes.error && !suggestRes.unavailable && (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">{suggestRes.error}</p>
          )}
          {suggestRes.loading && <p className="text-body-sm text-on-surface-variant">Đang tính gợi ý từ đồ thị…</p>}
          {suggestRes.data && <GraphRecommendations data={suggestRes.data} onExplore={explore} onAddWord={onAddWord} />}
          <h2 className="font-title-md text-title-md font-bold text-on-surface mt-2">Mâu thuẫn giữa các bộ thẻ của bạn</h2>
          {conflictRes.error && !conflictRes.unavailable && (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">{conflictRes.error}</p>
          )}
          {conflictRes.data && <GraphConflicts items={conflictRes.data.items} />}
        </div>
      )}

      {tab === "ask" && <GraphAskPanel onExplore={explore} />}
      {tab === "path" && <GraphPathFinder onExplore={explore} />}

      <AddWordToDeckModal word={addWord} decks={ownDecks} decksLoading={statsLoading} onClose={() => setAddWord(null)} />
    </section>
  );
};

export default KnowledgeGraphPage;
