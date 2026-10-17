import React, { useState } from "react";
import { fetchDeck } from "@/services/deckService";
import type { LibraryDeck, LibraryRating } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { DeckPreviewModal } from "@/features/decks/components/DeckPreviewModal";
import { DeckRatings } from "@/features/decks/components/DeckRatings";
import { ReportDeckModal } from "./ReportDeckModal";

interface LibraryPreviewModalProps {
  deck: LibraryDeck;
  onClose: () => void;
  onSave: (deck: LibraryDeck) => void;
  onRated: (deckId: string, rating: LibraryRating) => void;
}

// Xem trước bộ thẻ Thư viện: thẻ tải từ API khi mở, kèm đánh giá (sao + bình luận).
export const LibraryPreviewModal: React.FC<LibraryPreviewModalProps> = ({ deck, onClose, onSave, onRated }) => {
  const { data, error, loading } = useAsync(() => fetchDeck(deck.id), [deck.id]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  return (
    <>
    <DeckPreviewModal
      isOpen
      onClose={onClose}
      title={deck.title}
      level={deck.level}
      description={deck.description ?? undefined}
      cards={data?.cards ?? []}
      loading={loading}
      error={error}
      onSaveToFolder={() => onSave(deck)}
      extra={
        <div className="mb-3">
          <DeckRatings deckId={deck.id} isOwner={deck.mine} onChanged={(r) => onRated(deck.id, r)} />
          {!deck.mine && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              disabled={reported}
              className="mt-2 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-error underline disabled:no-underline disabled:opacity-60 cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">flag</span>
              {reported ? "Đã báo cáo" : "Báo cáo bộ thẻ này"}
            </button>
          )}
        </div>
      }
    />
    <ReportDeckModal deckId={deck.id} isOpen={reportOpen} onClose={() => setReportOpen(false)} onReported={() => setReported(true)} />
    </>
  );
};
