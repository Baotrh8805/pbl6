import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Deck } from "@/types/api.types";
import type { Review } from "@/lib/srs";

interface WeaknessRadarCardProps {
  decks: Deck[];
  reviews: Record<string, Review>;
  loading?: boolean;
}

interface WeakCardItem {
  id: string;
  term: string;
  reading: string | null;
  meaning: string;
  deckId: string;
  deckTitle: string;
  deckLevel: string;
  score: number;
  reason: string;
}

export const WeaknessRadarCard: React.FC<WeaknessRadarCardProps> = ({
  decks,
  reviews,
  loading = false,
}) => {
  const weakItems = useMemo<WeakCardItem[]>(() => {
    const list: WeakCardItem[] = [];

    for (const deck of decks) {
      for (const card of deck.cards) {
        const rev = reviews[card.id];
        if (!rev || rev.reps === 0) continue;

        // Điểm đánh giá độ khó:
        // - recallBefore thấp (HLR < 60% xác suất nhớ)
        // - ease thấp (< 2.2)
        // - interval ngắn (<= 1 ngày) dù đã ôn nhiều lần (reps >= 2)
        let score = 0;
        let reason = "Cần củng cố";

        if (rev.recallBefore != null && rev.recallBefore < 0.6) {
          score += (1 - rev.recallBefore) * 50;
          reason = `Xác suất nhớ thấp (${Math.round(rev.recallBefore * 100)}%)`;
        }
        if (rev.ease < 2.2) {
          score += (2.5 - rev.ease) * 20;
          reason = "Thường xuyên đánh giá khó";
        }
        if (rev.intervalDays <= 1 && rev.reps >= 2) {
          score += 30;
          reason = "Vừa bị quên gần đây";
        }

        if (score > 15) {
          list.push({
            id: card.id,
            term: card.term,
            reading: card.reading,
            meaning: card.meaning.split("\n")[0] || card.meaning,
            deckId: deck.id,
            deckTitle: deck.title,
            deckLevel: deck.level,
            score,
            reason,
          });
        }
      }
    }

    return list.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [decks, reviews]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-xs animate-pulse">
        <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-12 bg-slate-100 rounded-xl" />
          <div className="h-12 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="weakness-radar-title"
      className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col gap-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              psychology_alt
            </span>
          </div>
          <div>
            <h2 id="weakness-radar-title" className="text-sm font-bold text-slate-900 tracking-tight">
              Điểm yếu cần củng cố
            </h2>
            <p className="text-[11px] text-slate-500">Từ vựng/Hán tự dễ quên nhất tuần qua</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
          AI Radar
        </span>
      </div>

      {weakItems.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 text-center space-y-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-emerald-500 text-[24px]">
            task_alt
          </span>
          <p className="text-xs font-semibold text-slate-800">Không có từ nào bị báo động!</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Bạn đang ghi nhớ rất tốt các bộ thẻ. Các từ gặp khó khăn sẽ tự động được gợi ý tại đây khi ôn tập.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {weakItems.map((item) => (
            <li
              key={item.id}
              className="p-3 rounded-xl bg-slate-50 hover:bg-rose-50/40 border border-slate-200/70 hover:border-rose-200/70 transition-all flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-kanji text-base font-extrabold text-slate-900 group-hover:text-rose-700 transition-colors">
                    {item.term}
                  </span>
                  {item.reading && (
                    <span className="text-xs text-slate-500 font-medium">({item.reading})</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 truncate max-w-[210px]">{item.meaning}</p>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-100/60 px-1.5 py-0.2 rounded">
                    {item.reason}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                    · {item.deckTitle}
                  </span>
                </div>
              </div>

              <Link
                to={`/decks/${encodeURIComponent(item.deckId)}/study`}
                className="shrink-0 p-2 rounded-lg bg-white group-hover:bg-rose-600 text-slate-600 group-hover:text-white border border-slate-200 group-hover:border-rose-600 shadow-2xs transition-all text-xs font-semibold"
                title={`Ôn bộ thẻ ${item.deckTitle}`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  play_arrow
                </span>
                <span className="sr-only">Ôn thẻ này</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

