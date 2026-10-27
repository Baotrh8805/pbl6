import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { askGraph, GRAPH_UNAVAILABLE } from "@/services/graphService";
import { apiErrorText, errorCodeOf } from "@/lib/apiErrorInfo";
import { runOnce } from "@/lib/inFlight";
import { splitAnswer } from "@/lib/graphLayout";
import type { GraphAnswer, GraphNodeType } from "@/types/graph.types";
import { KnowledgeGraphSvg } from "./KnowledgeGraphSvg";
import { GraphUnavailableNotice, TypeChip } from "./GraphBits";

interface GraphAskPanelProps {
  onExplore: (id: string) => void;
}

const MAX = 300;
const EXAMPLES = [
  "食べる nghĩa là gì và tôi đã học nó chưa?",
  "Chữ 食 có bộ thủ gì, những từ nào chứa nó?",
  "Âm Hán-Việt THỰC gồm những chữ nào?",
  "〜なければならない dùng thế nào, cho câu ví dụ?",
];
const BRANCH: Record<string, string> = { graph: "đồ thị", text: "từ điển", both: "đồ thị + từ điển" };
const NODE_TYPES = new Set<string>(["word", "kanji", "radical", "component", "hanviet", "grammar", "sentence", "deck", "card", "path", "chapter", "user"]);

/** GraphRAG hỏi đáp (spec §7): câu hỏi → trả lời có nguồn [n] bấm được, danh sách nguồn, đồ thị con. */
export const GraphAskPanel: React.FC<GraphAskPanelProps> = ({ onExplore }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GraphAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const submit = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    await runOnce(inFlight.current, "ask", async () => {
      try {
        const res = await askGraph(text);
        setAnswer(res);
        setSelected(res.entities[0]?.id ?? null);
      } catch (e) {
        if (errorCodeOf(e) === GRAPH_UNAVAILABLE) setUnavailable(true);
        else setError(apiErrorText(e, { fallbacks: { 429: "Bạn đã hỏi quá nhiều trong một giờ, hãy quay lại sau." } }) ?? "Không hỏi được, thử lại sau.");
      } finally {
        setLoading(false);
      }
    });
  };

  const jump = (n: number) => {
    document.getElementById(`graph-source-${n}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-space-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
        className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-2"
      >
        <label htmlFor="graph-question" className="text-body-sm text-on-surface-variant">
          Hỏi bằng tiếng Việt về một từ, chữ Hán, âm Hán-Việt hay mẫu ngữ pháp. Câu trả lời chỉ dựa trên đồ thị tri thức + từ điển của
          ứng dụng và dữ liệu học của bạn, có đánh số nguồn.
        </label>
        <textarea
          id="graph-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(question);
            }
          }}
          rows={2}
          maxLength={MAX}
          placeholder="Vd. 食べる nghĩa là gì và tôi đã học nó chưa?"
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-body-md resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap gap-1.5 text-label-sm">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuestion(ex);
                  void submit(ex);
                }}
                className="px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer max-w-full truncate"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-label-sm text-outline">{question.length}/{MAX}</span>
            <Button type="submit" isLoading={loading} disabled={!question.trim()}>
              Hỏi
            </Button>
          </div>
        </div>
      </form>

      {unavailable && <GraphUnavailableNotice />}
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      {answer && (
        <div className="grid gap-space-md lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
          <article className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-3" aria-live="polite">
            <header className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-title-md text-title-md font-bold text-on-surface">Trả lời</h3>
              <span className="text-label-sm text-outline" title={answer.model === "template" ? "Ghép thẳng từ đồ thị, chưa qua mô hình ngôn ngữ" : `Model: ${answer.model}`}>
                {answer.model === "template" ? "Tóm tắt từ đồ thị" : `Gemini · ${answer.model}`}
              </span>
            </header>
            {answer.note && (
              <p className="px-2.5 py-1.5 rounded-lg bg-[#FEF3C7] text-[#92400E] text-label-md">{answer.note}</p>
            )}
            <div className="text-body-md text-on-surface whitespace-pre-wrap leading-relaxed">
              {splitAnswer(answer.answer).map((seg, i) =>
                seg.ref !== undefined ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => jump(seg.ref as number)}
                    className="inline-flex align-baseline px-1 rounded bg-primary/10 text-primary font-semibold text-label-sm hover:bg-primary/20 cursor-pointer"
                    title={answer.sources.find((s) => s.n === seg.ref)?.label}
                  >
                    {seg.text}
                  </button>
                ) : (
                  <React.Fragment key={i}>{seg.text}</React.Fragment>
                )
              )}
            </div>
            {answer.entities.length > 0 && (
              <p className="text-label-sm text-on-surface-variant flex flex-wrap items-center gap-1">
                <span className="text-outline">Nhận ra trong câu hỏi:</span>
                {answer.entities.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onExplore(e.id)}
                    lang="ja"
                    className="font-japanese px-1.5 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer"
                    title="Khám phá trên đồ thị"
                  >
                    {e.label}
                  </button>
                ))}
              </p>
            )}
            {answer.subgraph.nodes.length > 1 && (
              <details className="group">
                <summary className="cursor-pointer text-label-md font-semibold text-primary">Đồ thị con của câu trả lời ({answer.subgraph.nodes.length} node)</summary>
                <div className="mt-2 overflow-x-auto rounded-xl bg-surface border border-surface-container-high p-1">
                  <KnowledgeGraphSvg
                    nodes={answer.subgraph.nodes}
                    edges={answer.subgraph.edges}
                    centerId={answer.entities[0]?.id ?? null}
                    selectedId={selected}
                    onSelect={setSelected}
                    onExpand={onExplore}
                    size={560}
                    className="min-w-[28rem] max-w-[40rem] mx-auto"
                  />
                </div>
              </details>
            )}
          </article>
          <aside className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-2">
            <h3 className="font-title-md text-title-md font-bold text-on-surface">Nguồn ({answer.sources.length})</h3>
            {answer.sources.length === 0 && <p className="text-body-sm text-on-surface-variant">Không có ngữ cảnh nào — thử hỏi về một từ hoặc chữ Hán cụ thể.</p>}
            <ol className="flex flex-col gap-1.5">
              {answer.sources.map((s) => (
                <li key={s.n} id={`graph-source-${s.n}`} className="flex gap-2 text-body-sm scroll-mt-24 p-1.5 rounded-lg target:bg-primary/5">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-label-sm font-bold flex items-center justify-center">{s.n}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {NODE_TYPES.has(s.type) ? <TypeChip type={s.type as GraphNodeType} /> : <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-primary/10 text-primary">Của bạn</span>}
                      <span className="text-label-sm text-outline">{BRANCH[s.branch] ?? s.branch}</span>
                      {NODE_TYPES.has(s.type) && (
                        <button type="button" onClick={() => onExplore(s.id)} className="text-label-sm font-semibold text-primary hover:underline cursor-pointer">
                          Khám phá
                        </button>
                      )}
                    </div>
                    <p className="text-on-surface-variant">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
};
