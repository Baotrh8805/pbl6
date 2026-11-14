import React from "react";
import { Link } from "react-router-dom";
import { LEVEL_TONE, UNKNOWN_LEVEL_TONE } from "@/features/extraction/extractionUtils";
import type { HanVietWordNode } from "@/types/api.types";

/** Badge cấp JLPT nhỏ, cùng tông LEVEL_TONE với LevelBadge của bóc tách (ở đây không có levelConfidence). */
export const LevelChip: React.FC<{ level: string | null; className?: string }> = ({ level, className = "" }) => (
  <span
    title={level ? `Cấp ${level}` : "Chưa rõ cấp JLPT"}
    className={`inline-flex items-center px-1.5 py-0.5 rounded font-label-sm text-[11px] font-bold ${
      (level && LEVEL_TONE[level]) || UNKNOWN_LEVEL_TONE
    } ${className}`}
  >
    {level ?? "?"}
  </span>
);

interface WordActionsProps {
  word: HanVietWordNode;
  onAdd: (word: HanVietWordNode) => void;
}

// Hai hành động của một từ ghép: tìm bộ thẻ cộng đồng chứa từ (Thư viện nhận ?q=), thêm từ thành thẻ vào bộ của mình.
export const WordActions: React.FC<WordActionsProps> = ({ word, onAdd }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <Link
      to={`/library?q=${encodeURIComponent(word.label)}`}
      title={`Tìm bộ thẻ có «${word.label}» trong Thư viện cộng đồng`}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-9 rounded-lg bg-surface-container-low text-label-sm font-semibold text-on-surface hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
        search
      </span>
      Tìm bộ thẻ
    </Link>
    <button
      type="button"
      onClick={() => onAdd(word)}
      title={`Thêm «${word.label}» vào một bộ thẻ của bạn`}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-9 rounded-lg bg-primary text-on-primary text-label-sm font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
        playlist_add
      </span>
      Thêm vào bộ thẻ
    </button>
  </div>
);
