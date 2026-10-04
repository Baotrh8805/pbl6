import React from "react";
import { fetchDeck } from "@/services/deckService";
import type { LibraryDeck, LibraryRating } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { DeckPreviewModal } from "@/features/decks/components/DeckPreviewModal";
import { DeckRatings } from "@/features/decks/components/DeckRatings";

interface LibraryPreviewModalProps {
  deck: LibraryDeck;
  onClose: () => void;
  onSave: (deck: LibraryDeck) => void;
  onRated: (deckId: string, rating: LibraryRating) => void;
}

// Xem trước bộ thẻ Thư viện: thẻ tải từ API khi mở, kèm đánh giá (sao + bình luận).
export const LibraryPreviewModal: React.FC<LibraryPreviewModalProps> = ({ deck, onClose, onSave, onRated }) => {
  const { data, error, loading } = useAsync(() => fetchDeck(deck.id), [deck.id]);
  return (
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
        </div>
      }
    />
  );
};
