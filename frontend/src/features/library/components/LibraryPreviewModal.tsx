import React, { useState } from "react";
import { fetchDeck } from "@/services/deckService";
import type { LibraryDeck, LibraryRating } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { deckShareUrl } from "@/lib/deckUtils";
import { useCopyToClipboard } from "@/lib/clipboard";
import { DeckPreviewModal } from "@/features/decks/components/DeckPreviewModal";
import { DeckRatings } from "@/features/decks/components/DeckRatings";
import { ReportDeckModal } from "./ReportDeckModal";
import { useReportedByMe } from "../useReportedByMe";

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
  const [reported, markReported] = useReportedByMe(deck.id, !deck.mine);
  // Bộ thẻ Thư viện luôn công khai -> ai có tài khoản mở liên kết đều xem được (D2).
  const { copied, copy } = useCopyToClipboard();
  // Cả hai cách chép đều hỏng (không Clipboard API, execCommand từ chối) thì phải nói ra,
  // kèm chính liên kết để người dùng bôi đen chép tay vì trong modal không có chỗ nào hiện nó.
  const [copyError, setCopyError] = useState(false);
  const shareLink = deckShareUrl(window.location.origin, deck.id);
  const handleCopyLink = async () => {
    const ok = await copy(shareLink);
    setCopyError(!ok);
  };
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
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={handleCopyLink}
              title="Sao chép liên kết tới bộ thẻ này"
              className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary underline cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                {copied ? "check" : "link"}
              </span>
              {copied ? "Đã chép liên kết" : "Sao chép liên kết"}
            </button>
            {!deck.mine && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                disabled={reported}
                className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-error underline disabled:no-underline disabled:opacity-60 cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">flag</span>
                {reported ? "Đã báo cáo" : "Báo cáo bộ thẻ này"}
              </button>
            )}
          </div>
          {/* Vùng thông báo cho trình đọc màn hình: nút đổi chữ nhưng không tự được đọc lại */}
          <p aria-live="polite" className="sr-only">
            {copied ? "Đã chép liên kết" : ""}
          </p>
          {copyError && (
            <p role="alert" className="mt-1 text-xs text-error font-medium break-all">
              Không thể sao chép tự động. Hãy chọn và chép thủ công:{" "}
              <span className="font-mono font-normal select-all">{shareLink}</span>
            </p>
          )}
        </div>
      }
    />
    <ReportDeckModal deckId={deck.id} isOpen={reportOpen} onClose={() => setReportOpen(false)} onReported={markReported} />
    </>
  );
};
