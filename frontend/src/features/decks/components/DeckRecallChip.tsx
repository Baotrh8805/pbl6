import React from "react";
import { useAsync } from "@/lib/useAsync";
import { deckRecallText, recallTone } from "@/lib/moderation";
import { fetchDeckRecall } from "@/services/studyService";

const TONE: Record<ReturnType<typeof recallTone>, string> = {
  error: "bg-error/10 text-error",
  warning: "bg-[#FEF3C7] text-[#B45309]",
  success: "bg-primary/10 text-primary",
  neutral: "bg-surface-container text-on-surface-variant",
};

/**
 * Chip "Độ nhớ ≈ x % · n thẻ sắp quên" (HLR, D32) ở chi tiết bộ thẻ. Tự gọi GET /api/decks/{id}/recall; ai-service lỗi (503) /
 * bộ chưa học → không hiện gì (fetchDeckRecall trả null), không chặn trang.
 */
export const DeckRecallChip: React.FC<{ deckId: string; reload?: number }> = ({ deckId, reload = 0 }) => {
  const { data } = useAsync(() => fetchDeckRecall(deckId), [deckId], reload);
  const text = deckRecallText(data);
  if (!text || !data) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold ${TONE[recallTone(data.avgRecall)]}`}
      title="Xác suất còn nhớ dự đoán bởi mô hình trí nhớ (HLR) trên các thẻ đã học; thẻ dưới 70 % là 'sắp quên'"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">psychology</span>
      {text}
    </span>
  );
};
