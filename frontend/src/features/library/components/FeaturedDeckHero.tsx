import React from "react";
import { Link } from "react-router-dom";
import type { Card, LibraryDeck } from "@/types/api.types";
import { saveActionOf } from "@/features/library/librarySave";
import { formatCompactCount, initials, ratingSummary } from "./libraryOptions";
import { CardContent } from "@/features/decks/components/CardContent";

interface FeaturedDeckHeroProps {
  deck: LibraryDeck;
  sampleCard: Card | null;
  onPreview: (deck: LibraryDeck) => void;
  onSave: (deck: LibraryDeck) => void;
}

// Banner "Bộ thẻ nổi bật tuần này" + thẻ mẫu minh họa tinh gọn.
export const FeaturedDeckHero: React.FC<FeaturedDeckHeroProps> = ({ deck, sampleCard, onPreview, onSave }) => (
  <div className="relative w-full rounded-2xl bg-gradient-to-br from-primary via-[#0f2347] to-[#1b2a4a] text-on-primary overflow-hidden shadow-lg border border-primary-container/40">
    {/* Hiệu ứng nền dịu */}
    <div aria-hidden="true" className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-secondary/15 blur-3xl pointer-events-none" />
    <div aria-hidden="true" className="absolute right-40 bottom-0 w-48 h-48 rounded-full bg-tertiary-container/20 blur-2xl pointer-events-none" />

    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-space-md lg:gap-space-lg p-5 sm:p-6 lg:p-7 items-center">
      <div className="lg:col-span-8 space-y-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary font-label-sm text-[11px] font-semibold flex items-center gap-1 shadow-xs">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[14px] text-amber-300"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              stars
            </span>
            BỘ THẺ NỔI BẬT TUẦN
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-white font-label-sm text-[11px] font-bold">
            JLPT {deck.level}
          </span>
          {deck.official && (
            <span className="inline-flex items-center gap-1 text-secondary-fixed text-xs font-semibold">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">verified</span>
              Giáo Trình Chuẩn
            </span>
          )}
        </div>

        <h2 className="font-headline-md text-headline-md font-bold text-on-primary max-w-2xl leading-snug">
          {deck.title}
        </h2>
        <p className="font-body-sm text-body-sm text-white/80 max-w-2xl line-clamp-2">
          {deck.description || "Bộ flashcard tinh tuyển dành cho người học tiếng Nhật với câu ví dụ thực tế và giải thích chi tiết."}
        </p>

        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-5 pt-0.5 text-white/90 font-body-sm text-xs">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="w-6 h-6 rounded-full bg-white/15 ring-1 ring-white/20 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {initials(deck.authorName)}
            </span>
            <span className="text-white font-medium">{deck.authorName}</span>
          </div>
          <div className="flex items-center gap-1 text-white">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[15px] text-amber-300"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            <span className="font-semibold">{ratingSummary(deck.rating, deck.ratingsCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">cloud_download</span>
            <span><strong className="text-white">{formatCompactCount(deck.downloadsCount)}</strong> lượt tải</span>
          </div>
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">style</span>
            <span><strong className="text-white">{deck.cardsCount}</strong> thẻ</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {(() => {
            const action = saveActionOf(deck);
            const cls =
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-md hover:brightness-110 transition-all cursor-pointer";
            return action.kind === "open" ? (
              <Link to={action.href} className={cls}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">bookmark_added</span>
                <span>{action.label}</span>
              </Link>
            ) : (
              <button type="button" onClick={() => onSave(deck)} className={cls}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">bookmark_add</span>
                <span>Lưu Về Tài Khoản</span>
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => onPreview(deck)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-label-md text-xs font-semibold transition-all cursor-pointer border border-white/10"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">visibility</span>
            <span>Xem Thử Nội Dung</span>
          </button>
        </div>
      </div>

      {/* Thẻ mẫu: bấm để xem thử */}
      {sampleCard && (
        <div className="lg:col-span-4 flex justify-center lg:justify-end">
          <button
            type="button"
            onClick={() => onPreview(deck)}
            aria-label={`Xem thử thẻ mẫu của bộ ${deck.title}`}
            className="relative block w-full max-w-xs text-left rounded-xl p-4 bg-surface-container-lowest text-on-surface shadow-xl space-y-2.5 transform lg:rotate-1 hover:rotate-0 transition-transform duration-200 cursor-pointer border border-surface-container-high/60 group"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-surface-container">
              <span className="px-1.5 py-0.5 rounded bg-surface-container font-label-sm text-[10px] uppercase font-bold text-on-surface-variant">
                Thẻ Mẫu #01
              </span>
              <span className="text-secondary font-label-sm text-[11px] font-bold">JLPT {deck.level}</span>
            </div>
            <div className="block text-center py-1">
              <span lang="ja" className="block font-japanese text-sm text-on-surface-variant font-medium">
                {sampleCard.term}
              </span>
              <span lang="ja" className="block font-japanese font-headline-sm text-headline-sm text-primary font-bold mt-0.5">
                {sampleCard.reading}
              </span>
              <div className="block font-body-sm text-body-sm text-on-surface-variant mt-1">
                <CardContent
                  text={sampleCard.meaning}
                  headClassName="font-medium text-xs text-on-surface"
                  restClassName="text-[11px] mt-0.5 line-clamp-2 text-on-surface-variant"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-label-sm pt-1 border-t border-surface-container-high/40">
              <span className="group-hover:text-primary transition-colors inline-flex items-center gap-1 font-medium">
                Xem toàn bộ {deck.cardsCount} thẻ
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  </div>
);
