import React from "react";
import type { Card, LibraryDeck } from "@/types/api.types";
import { formatCompactCount, initials, ratingSummary } from "./libraryOptions";
import { CardContent } from "@/features/decks/components/CardContent";

interface FeaturedDeckHeroProps {
  deck: LibraryDeck;
  sampleCard: Card | null;
  onPreview: (deck: LibraryDeck) => void;
  onSave: (deck: LibraryDeck) => void;
}

// Banner "Bộ thẻ nổi bật tuần này" + thẻ mẫu minh họa.
export const FeaturedDeckHero: React.FC<FeaturedDeckHeroProps> = ({ deck, sampleCard, onPreview, onSave }) => (
  <div className="relative w-full rounded-2xl bg-gradient-to-r from-primary via-primary-container to-[#1b2a4a] text-on-primary overflow-hidden shadow-xl">
    {/* Hiệu ứng nền */}
    <div aria-hidden="true" className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-tertiary-container/30 blur-3xl pointer-events-none"></div>
    <div aria-hidden="true" className="absolute right-48 bottom-0 w-64 h-64 rounded-full bg-secondary/15 blur-2xl pointer-events-none"></div>

    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-space-lg p-space-lg md:p-space-xl items-center">
      <div className="lg:col-span-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-tertiary text-on-tertiary font-label-sm text-xs font-semibold flex items-center gap-1.5 shadow-xs">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[15px] text-on-tertiary-container"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              stars
            </span>
            BỘ THẺ NỔI BẬT TUẦN NÀY
          </span>
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest/20 backdrop-blur-md text-inverse-primary font-label-sm text-xs font-bold">
            JLPT {deck.level}
          </span>
          {deck.official && (
            <span className="flex items-center gap-1 text-secondary-fixed text-xs font-semibold">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified</span>
              Giáo Trình Chuẩn
            </span>
          )}
        </div>

        <h2 className="font-headline-md text-headline-md font-bold text-on-primary max-w-2xl leading-snug">
          {deck.title}
        </h2>
        <p className="font-body-md text-body-md text-inverse-primary/90 max-w-2xl line-clamp-2">
          {deck.description}
        </p>

        <div className="flex flex-wrap items-center gap-y-2 gap-x-6 pt-1 text-inverse-primary font-body-sm text-body-sm">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-full bg-surface-container-highest/20 ring-1 ring-surface-container-highest/30 text-on-primary text-[11px] font-bold flex items-center justify-center"
            >
              {initials(deck.authorName)}
            </span>
            <span className="text-on-primary font-semibold">{deck.authorName}</span>
          </div>
          <div className="flex items-center gap-1 text-on-primary">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[17px] text-amber-300"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            {/* Cùng nhãn với thẻ Thư viện (NEW-02): "4 · 1 đánh giá" / "Chưa có đánh giá" — trước đây banner in
                "Chưa có (0 đánh giá)" trong khi thẻ của chính bộ đó ở lưới bên dưới ghi khác. */}
            <span className="font-bold">{ratingSummary(deck.rating, deck.ratingsCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[17px]">cloud_download</span>
            <span className="font-bold text-on-primary">{formatCompactCount(deck.downloadsCount)}</span> lượt tải
          </div>
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[17px]">style</span>
            <span className="text-on-primary font-bold">{deck.cardsCount}</span> thẻ câu hỏi + Audio
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onSave(deck)}
            className="flex items-center gap-2 px-space-md py-2.5 rounded-xl bg-tertiary-container text-on-tertiary-container font-label-md text-label-md font-bold shadow-lg hover:brightness-110 transition-all cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">bookmark_add</span>
            <span>Lưu Về Thư Viện Cá Nhân</span>
          </button>
          <button
            type="button"
            onClick={() => onPreview(deck)}
            className="flex items-center gap-2 px-space-md py-2.5 rounded-xl bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 backdrop-blur-md text-on-primary font-label-md text-label-md transition-all cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
            <span>Xem Thử Thẻ Từ Vựng</span>
          </button>
        </div>
      </div>

      {/* Thẻ mẫu: bấm để xem thử (button nên chỉ dùng span bên trong) */}
      {sampleCard && (
        <div className="lg:col-span-4 flex justify-center lg:justify-end">
          <button
            type="button"
            onClick={() => onPreview(deck)}
            aria-label={`Xem thử thẻ mẫu của bộ ${deck.title}`}
            className="relative block w-full max-w-sm text-left rounded-xl p-space-md bg-surface-container-lowest text-on-surface shadow-2xl space-y-3 transform lg:rotate-1 hover:rotate-0 transition-all cursor-pointer border border-surface-container-high/60"
          >
            <span className="flex items-center justify-between pb-2 border-b border-surface-container">
              <span className="px-2 py-0.5 rounded bg-surface-container font-label-sm text-[10px] uppercase font-bold text-on-surface-variant">
                Thẻ Mẫu #01
              </span>
              <span className="text-secondary font-label-sm text-xs font-bold">{deck.level} Bắt Buộc Nhớ</span>
            </span>
            <span className="block text-center py-2">
              <span className="block font-body text-xs text-on-surface-variant">{sampleCard.term}</span>
              <span className="block font-headline-md text-headline-md text-primary font-bold">
                {sampleCard.reading}
              </span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1">
                <CardContent
                  text={sampleCard.meaning}
                  headClassName="font-medium"
                  restClassName="text-xs mt-1 line-clamp-3"
                />
              </span>
            </span>
            <span className="flex items-center justify-between text-[11px] text-on-surface-variant font-label-sm pt-1">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">volume_up</span> Tokyo
                Accent
              </span>
              <span className="text-secondary font-semibold">
                {"SRS Interval: 3 Ngày"}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  </div>
);
