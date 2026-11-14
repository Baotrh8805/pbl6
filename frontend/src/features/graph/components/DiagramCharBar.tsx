import React from "react";
import { WORD_MAX_CHARS } from "@/features/graph/diagramLayout";

/**
 * Thanh chọn chữ trên sơ đồ khi câu tìm là từ nhiều chữ (spec 30/10 từ nhiều chữ §5): chip cả từ (về "Phân tích từ", chỉ khi từ
 * có ≤ 4 chữ) + chip từng chữ (sang Cấu tạo của chữ đó). Chip đang vẽ viền primary.
 */
interface DiagramCharBarProps {
  /** Từ của câu tìm; null khi cụm dài hơn 4 chữ (không có Phân tích từ). */
  word: string | null;
  chars: string[];
  /** Chữ đang vẽ; null khi đang ở Phân tích từ. */
  active: string | null;
  onWord: () => void;
  onChar: (ch: string) => void;
}

const chip = (on: boolean) =>
  `font-japanese px-2.5 py-1 rounded-lg text-body-md font-bold cursor-pointer border ${
    on ? "border-primary text-primary bg-primary/5" : "border-outline-variant text-on-surface hover:bg-surface-container"
  }`;

export const DiagramCharBar: React.FC<DiagramCharBarProps> = ({ word, chars, active, onWord, onChar }) => {
  if (chars.length < 2) return null;
  const tooLong = chars.length > WORD_MAX_CHARS;
  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label="Chọn chữ trong từ" className="flex flex-wrap items-center gap-1.5">
        {word && !tooLong && (
          <>
            <button type="button" lang="ja" onClick={onWord} aria-pressed={active === null} className={chip(active === null)} title="Phân tích cả từ">
              {word}
            </button>
            <span aria-hidden="true" className="text-outline">·</span>
          </>
        )}
        {chars.map((ch) => (
          <button key={ch} type="button" lang="ja" onClick={() => onChar(ch)} aria-pressed={active === ch} className={chip(active === ch)} title={`Cấu tạo của ${ch}`}>
            {ch}
          </button>
        ))}
      </div>
      {tooLong && <p className="text-label-sm text-outline">Từ dài hơn {WORD_MAX_CHARS} chữ: chọn từng chữ để xem cấu tạo.</p>}
    </div>
  );
};
