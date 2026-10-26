import React from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/lib/useAsync";
import { fetchDeck } from "@/services/deckService";
import { Button } from "@/components/ui/Button";

// Bản in bộ thẻ (UC-29, PDF): bảng thẻ đơn giản, nền trắng, không thanh điều hướng; "Lưu PDF" = hộp in của trình duyệt.
export const DeckPrintPage: React.FC = () => {
  const { deckId = "" } = useParams();
  const deck = useAsync(() => fetchDeck(deckId), [deckId]);

  if (deck.error) {
    return (
      <main className="p-8 text-center">
        <p role="alert" className="text-error">{deck.error}</p>
        <Link to="/decks" className="text-primary hover:underline">Về bộ thẻ của tôi</Link>
      </main>
    );
  }
  if (!deck.data) return <main className="p-8 text-center text-on-surface-variant">Đang tải…</main>;
  const d = deck.data;
  const cards = [...d.cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    <main className="bg-white text-black min-h-screen px-6 py-6 print:p-0">
      <style>{"@media print { @page { margin: 14mm; } .no-print { display: none !important; } tr { break-inside: avoid; } }"}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-4 max-w-4xl mx-auto">
        <Link to={`/decks/${encodeURIComponent(d.id)}`} className="text-primary hover:underline text-body-sm">← Quay lại bộ thẻ</Link>
        <Button onClick={() => window.print()}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">print</span>
          In / Lưu PDF
        </Button>
      </div>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold">{d.title}</h1>
        <p className="text-sm text-gray-600 mb-4">
          Cấp {d.level} · {cards.length} thẻ{d.description ? ` · ${d.description}` : ""}
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="py-1.5 pr-2 w-10">#</th>
              <th className="py-1.5 pr-2">Thuật ngữ</th>
              <th className="py-1.5 pr-2">Cách đọc</th>
              <th className="py-1.5 pr-2">Hán-Việt</th>
              <th className="py-1.5">Nghĩa</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c, i) => (
              <tr key={c.id} className="border-b border-gray-300 align-top">
                <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                <td className="py-1.5 pr-2 text-lg" lang="ja">{c.term}</td>
                <td className="py-1.5 pr-2" lang="ja">{c.reading}</td>
                <td className="py-1.5 pr-2 text-xs uppercase tracking-wide">{c.hanViet}</td>
                <td className="py-1.5 whitespace-pre-line">{c.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
};

export default DeckPrintPage;
