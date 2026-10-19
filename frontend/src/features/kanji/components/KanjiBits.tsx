import React from "react";
import { Ruby } from "@/lib/ja";
import { canSpeak, speakJa } from "@/lib/speech";
import { LevelChip } from "@/features/hanviet/components/HanVietBits";
import type { KanjiExample } from "@/types/api.types";

/** Nút loa nhỏ: đọc tiếng Nhật bằng giọng trình duyệt; trình duyệt không đọc được thì không hiện. */
export const SpeakButton: React.FC<{ text: string; label: string; onError?: (message: string) => void }> = ({
  text,
  label,
  onError,
}) => {
  if (!canSpeak || !text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        speakJa(text).catch((e: unknown) => onError?.(e instanceof Error ? e.message : "Không phát âm được."));
      }}
      aria-label={label}
      title="Phát âm"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">volume_up</span>
    </button>
  );
};

/** Danh sách từ ví dụ JLPT: chữ + furigana, nghĩa, cấp, nút phát âm (đọc theo cách đọc để giọng máy không đọc sai kanji). */
export const ExampleList: React.FC<{ examples: KanjiExample[]; onSpeakError?: (message: string) => void }> = ({
  examples,
  onSpeakError,
}) => {
  if (examples.length === 0) return <p className="text-label-sm text-outline">Chưa có từ ví dụ JLPT.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {examples.map((ex) => (
        <li key={ex.term} className="flex items-center gap-2 min-w-0">
          <span className="font-japanese text-body-md text-on-surface shrink-0">
            <Ruby term={ex.term} reading={ex.reading ?? undefined} />
          </span>
          <span className="flex-1 min-w-0 text-body-sm text-on-surface-variant break-words">
            {ex.meaning ?? <span className="text-outline">Chưa có nghĩa</span>}
          </span>
          <LevelChip level={ex.level} className="shrink-0" />
          <SpeakButton text={ex.reading ?? ex.term} label={`Phát âm ${ex.term}`} onError={onSpeakError} />
        </li>
      ))}
    </ul>
  );
};
