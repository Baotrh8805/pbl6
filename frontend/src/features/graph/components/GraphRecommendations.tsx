import React from "react";
import type { GraphConflict, GraphNode, GraphRecommend } from "@/types/graph.types";
import { Link } from "react-router-dom";
import { EmptyNote, NodeLine } from "./GraphBits";

interface GraphRecommendationsProps {
  data: GraphRecommend;
  onExplore: (id: string) => void;
  onAddWord: (node: GraphNode) => void;
}

const Section: React.FC<{ title: string; hint: string; count: number; children: React.ReactNode }> = ({ title, hint, count, children }) => (
  <section className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-1">
    <h3 className="font-title-md text-title-md font-bold text-on-surface">
      {title} <span className="ml-1 text-label-sm font-medium text-outline">{count}</span>
    </h3>
    <p className="text-label-sm text-on-surface-variant">{hint}</p>
    <div className="divide-y divide-surface-container-high">{children}</div>
  </section>
);

/** Ba nhóm gợi ý tính bằng Cypher từ đồ thị + dữ liệu ôn tập (spec §6). */
export const GraphRecommendations: React.FC<GraphRecommendationsProps> = ({ data, onExplore, onAddWord }) => {
  const empty = data.words.length === 0 && data.weakKanji.length === 0 && data.homophones.length === 0;
  if (empty) {
    return (
      <EmptyNote icon="lightbulb" title="Chưa có gợi ý">
        Gợi ý tính từ các thẻ bạn đã ôn: học vài bộ thẻ có chữ Hán rồi quay lại, đồ thị sẽ tìm từ mới từ chữ đã biết, chữ hay sai và từ
        đồng âm dễ nhầm.
      </EmptyNote>
    );
  }
  return (
    <div className="grid gap-space-md lg:grid-cols-2">
      <Section
        title="Từ mới từ chữ đã học"
        hint={`Từ ở cấp ${data.level} trở xuống chứa chữ Hán bạn đã ôn mà chưa có trong bộ thẻ nào của bạn; tỉ lệ chữ đã biết cao xếp trước.`}
        count={data.words.length}
      >
        {data.words.length === 0 && <p className="py-2 text-body-sm text-on-surface-variant">Chưa có — hãy ôn thêm thẻ có chữ Hán.</p>}
        {data.words.map((w) => (
          <NodeLine
            key={w.word.id}
            node={w.word}
            onExplore={onExplore}
            onAddWord={onAddWord}
            note={`Bạn đã biết ${w.sharedKanji}/${w.totalKanji} chữ: ${w.knownChars.join(" ")}`}
          />
        ))}
      </Section>
      <Section title="Chữ Hán hay sai" hint="Chữ xuất hiện trong thẻ bạn trả lời «Quên» ít nhất 2 lần trong 30 ngày, kèm bộ thủ và chữ giống hình để phân biệt." count={data.weakKanji.length}>
        {data.weakKanji.length === 0 && <p className="py-2 text-body-sm text-on-surface-variant">Không có chữ nào sai nhiều — tốt lắm.</p>}
        {data.weakKanji.map((k) => (
          <NodeLine
            key={k.kanji.id}
            node={k.kanji}
            onExplore={onExplore}
            note={
              <>
                Sai {k.again30d} lần · trong thẻ: <span lang="ja" className="font-japanese">{k.terms.join("、")}</span>
                {k.radical && ` · bộ ${k.radical.no} ${k.radical.char ?? ""} (${k.radical.nameVi ?? ""})`}
                {k.similar.length > 0 && (
                  <>
                    {" · giống hình: "}
                    <span lang="ja" className="font-japanese">{k.similar.join(" ")}</span>
                  </>
                )}
              </>
            }
          />
        ))}
      </Section>
      <Section title="Từ đồng âm dễ nhầm" hint="Từ JLPT đọc giống một từ bạn đang học nhưng viết khác chữ; học cùng nhau để không lẫn." count={data.homophones.length}>
        {data.homophones.length === 0 && <p className="py-2 text-body-sm text-on-surface-variant">Chưa có cặp đồng âm nào với từ đang học.</p>}
        {data.homophones.map((h) => (
          <NodeLine
            key={h.word.id}
            node={h.word}
            onExplore={onExplore}
            onAddWord={onAddWord}
            note={
              <>
                Cùng cách đọc với <span lang="ja" className="font-japanese">{h.withTerms.join("、")}</span> trong thẻ của bạn
              </>
            }
          />
        ))}
      </Section>
    </div>
  );
};

/** Xung đột giữa các bộ thẻ của mình: cùng thuật ngữ, khác cách đọc hoặc trỏ hai mục từ khác nhau (phát hiện mâu thuẫn). */
export const GraphConflicts: React.FC<{ items: GraphConflict[] }> = ({ items }) => {
  if (items.length === 0) {
    return (
      <EmptyNote icon="task_alt" title="Không thấy mâu thuẫn giữa các bộ thẻ">
        Đồ thị so mọi cặp thẻ cùng thuật ngữ trong các bộ của bạn: khác cách đọc hoặc khớp hai mục từ khác nhau mới coi là mâu thuẫn.
      </EmptyNote>
    );
  }
  const deckLink = (deck: GraphNode) => (deck.id.startsWith("d:") ? `/decks/${encodeURIComponent(deck.id.slice(2))}` : null);
  const side = (s: GraphConflict["a"]) => {
    const link = deckLink(s.deck);
    return (
      <span>
        {link ? (
          <Link to={link} className="font-semibold text-primary hover:underline">
            {s.deck.label}
          </Link>
        ) : (
          <span className="font-semibold">{s.deck.label}</span>
        )}
        : <span lang="ja" className="font-japanese">{s.card.reading ?? "(không có cách đọc)"}</span>
        {s.word && (
          <span className="text-on-surface-variant">
            {" "}
            → {s.word.label}
            {s.word.vi ? ` (${s.word.vi})` : s.word.gloss ? ` (${s.word.gloss})` : ""}
          </span>
        )}
      </span>
    );
  };
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c, i) => (
        <li key={`${c.term}|${c.a.card.id}|${c.b.card.id}|${i}`} className="p-space-sm rounded-xl bg-surface-container-lowest border border-surface-container-high text-body-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span lang="ja" className="font-japanese font-bold text-on-surface text-title-md">
              {c.term}
            </span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${c.kind === "reading" ? "bg-error-container text-on-error-container" : "bg-[#FEF3C7] text-[#B45309]"}`}>
              {c.kind === "reading" ? "Khác cách đọc" : "Trỏ hai mục từ khác"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-on-surface">
            <div>{side(c.a)}</div>
            <div>{side(c.b)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
};
