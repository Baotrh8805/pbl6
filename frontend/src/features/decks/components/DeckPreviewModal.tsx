import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { CardDto } from "@/types/api.types";

export interface DeckPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  level: string;
  description?: string;
  cards: CardDto[];
  onSaveToFolder?: () => void;
  /** Thẻ đang tải từ API / lỗi tải (xem trước bộ thẻ Thư viện). */
  loading?: boolean;
  error?: string;
  /** Nội dung thêm phía trên thẻ, ví dụ chấm sao. */
  extra?: React.ReactNode;
}

export const DeckPreviewModal: React.FC<DeckPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  level,
  description,
  cards,
  onSaveToFolder,
  loading,
  error,
  extra,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="xl"
    title={
      <span className="flex items-center gap-2.5">
        <span className="px-2 py-0.5 rounded font-label-sm text-xs font-bold bg-[#FFF7ED] text-[#C2410C] shrink-0">
          {level}
        </span>
        <span className="line-clamp-1 text-base">{title}</span>
      </span>
    }
    subtitle={loading ? "Đang tải thẻ..." : `Xem trước ${cards.length} thẻ từ vựng`}
    footer={
      <>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-sm hover:bg-surface-container-high transition-colors mr-auto"
        >
          Đóng
        </button>
        {onSaveToFolder && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onSaveToFolder();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              bookmark_add
            </span>
            Lưu về thư mục của tôi
          </button>
        )}
      </>
    }
  >
    {extra}
    {loading ? (
      <p className="py-12 text-center text-on-surface-variant">Đang tải thẻ...</p>
    ) : error ? (
      <p role="alert" className="py-12 text-center text-error">
        {error}
      </p>
    ) : (
      <PreviewBody description={description} cards={cards} />
    )}
  </Modal>
);

// Mount lại mỗi lần mở modal -> luôn bắt đầu từ thẻ đầu, mặt trước.
const PreviewBody: React.FC<{ description?: string; cards: CardDto[] }> = ({ description, cards }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const currentCard = cards[currentIdx] || null;

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIdx((prev) => (prev < cards.length - 1 ? prev + 1 : 0));
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIdx((prev) => (prev > 0 ? prev - 1 : cards.length - 1));
  };

  const toggleFlip = () => setIsFlipped((prev) => !prev);

  return (
    <div className="flex flex-col items-center gap-4">
      {description && (
        <p className="text-xs text-on-surface-variant text-center max-w-md line-clamp-2">
          {description}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="py-12 text-center text-on-surface-variant">
          Chưa có thẻ từ vựng trong bộ thẻ này.
        </div>
      ) : currentCard ? (
        <div className="w-full flex flex-col items-center gap-4">
          {/* Mặt thẻ chứa heading nên dùng div role="button" (không lồng block trong <button>) */}
          <div
            role="button"
            tabIndex={0}
            aria-pressed={isFlipped}
            onClick={toggleFlip}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFlip();
              }
            }}
            className="w-full min-h-[220px] p-6 rounded-2xl bg-gradient-to-b from-surface-container-lowest to-surface-container-low border border-surface-container-high shadow-md hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between select-none relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <div className="flex items-center justify-between text-xs text-outline">
              <span className="font-label-sm font-semibold">
                Thẻ #{currentIdx + 1} / {cards.length}
              </span>
              <span className="flex items-center gap-1 text-primary group-hover:underline">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  sync
                </span>
                {isFlipped ? "Xem mặt trước" : "Lật xem nghĩa"}
              </span>
            </div>

            {!isFlipped ? (
              /* Mặt trước */
              <div className="text-center py-6">
                {currentCard.reading && (
                  <p className="text-xs text-on-surface-variant mb-1 font-body">
                    {currentCard.reading}
                  </p>
                )}
                <h2 className="text-3xl sm:text-4xl font-bold font-kanji text-primary tracking-wide">
                  {currentCard.term}
                </h2>
                <p className="text-[11px] text-outline mt-3">
                  (Nhấn vào thẻ để xem nghĩa & ví dụ)
                </p>
              </div>
            ) : (
              /* Mặt sau */
              <div className="text-center py-4 space-y-2.5">
                <h3 className="text-xl font-bold text-primary font-headline whitespace-pre-line">
                  {currentCard.meaning}
                </h3>
                {currentCard.reading && (
                  <p className="text-xs text-on-surface-variant">
                    Đọc: <span className="font-medium">{currentCard.reading}</span>
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center text-[10px] text-outline">
              NihonGen AI Flashcard
            </div>
          </div>

          {/* Navigation controls */}
          <div className="flex items-center justify-between w-full pt-1">
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                chevron_left
              </span>
              Thẻ trước
            </button>
            <span className="text-xs text-on-surface-variant font-label-sm">
              {currentIdx + 1} / {cards.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold transition-colors"
            >
              Thẻ tiếp
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
