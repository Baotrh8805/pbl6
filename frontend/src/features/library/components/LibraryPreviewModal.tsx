import React, { useState } from "react";
import { fetchDeck } from "@/services/deckService";
import { rateLibraryDeck } from "@/services/libraryService";
import { extractErrorMessage } from "@/services/apiClient";
import type { LibraryDeck, LibraryRating } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { DeckPreviewModal } from "@/features/decks/components/DeckPreviewModal";

interface LibraryPreviewModalProps {
  deck: LibraryDeck;
  onClose: () => void;
  onSave: (deck: LibraryDeck) => void;
  onRated: (deckId: string, rating: LibraryRating) => void;
}

// Xem trước bộ thẻ Thư viện: thẻ tải từ API khi mở, kèm chấm sao.
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
      extra={<RatingStars deck={deck} onRated={onRated} />}
    />
  );
};

// Chấm 1-5 sao; chấm lại ghi đè. Không chấm được bộ thẻ của chính mình.
const RatingStars: React.FC<{ deck: LibraryDeck; onRated: LibraryPreviewModalProps["onRated"] }> = ({
  deck,
  onRated,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deck.mine) {
    return <p className="mb-3 text-xs text-on-surface-variant text-center">Đây là bộ thẻ bạn đã đăng.</p>;
  }

  const rate = async (stars: number) => {
    setSaving(true);
    setError(null);
    try {
      onRated(deck.id, await rateLibraryDeck(deck.id, stars));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 flex flex-col items-center gap-1">
      <div role="group" aria-label="Đánh giá bộ thẻ" className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            aria-label={`${n} sao`}
            aria-pressed={deck.myRating === n}
            onClick={() => rate(n)}
            className="p-0.5 text-amber-500 hover:scale-110 transition-transform disabled:opacity-50 cursor-pointer"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: `'FILL' ${(deck.myRating ?? 0) >= n ? 1 : 0}` }}
            >
              star
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {deck.myRating ? `Bạn đã chấm ${deck.myRating} sao · bấm để chấm lại` : "Chấm sao cho bộ thẻ này"}
      </p>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
};
