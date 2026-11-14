import React from "react";
import { Ruby } from "@/lib/ja";
import type { LevelBucket } from "@/lib/hanVietUtils";
import type { HanVietWordNode } from "@/types/api.types";
import { LevelChip, WordActions } from "./HanVietBits";

interface HanVietWordListProps {
  buckets: LevelBucket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddWord: (word: HanVietWordNode) => void;
}

// Danh sách từ ghép gom theo cấp, dưới đồ thị. Mobile-first: mỗi từ một khối, hành động xuống dòng khi hẹp.
// Bấm vào phần chữ = chọn từ (đồng bộ với nút trên SVG và cột chi tiết).
export const HanVietWordList: React.FC<HanVietWordListProps> = ({ buckets, selectedId, onSelect, onAddWord }) => (
  <div className="flex flex-col gap-space-md">
    {buckets.map((bucket) => (
      <section key={bucket.level} aria-labelledby={`hv-bucket-${bucket.level}`} className="flex flex-col gap-2">
        <h3 id={`hv-bucket-${bucket.level}`} className="flex items-center gap-2 font-title-md text-title-md font-bold text-on-surface">
          <LevelChip level={bucket.level === "unknown" ? null : bucket.level} />
          {bucket.label}
          <span className="text-label-sm font-medium text-outline">({bucket.words.length} từ)</span>
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {bucket.words.map((w) => {
            const selected = selectedId === w.id;
            return (
              <li
                key={w.id}
                className={`flex flex-col gap-2 p-3 rounded-xl border transition-colors ${
                  selected
                    ? "bg-primary/5 border-primary"
                    : "bg-surface-container-lowest border-surface-container-high hover:border-outline-variant"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(w.id)}
                  className="text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
                >
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-title-md font-semibold font-japanese text-on-surface">
                      <Ruby term={w.label} reading={w.reading || undefined} />
                    </span>
                    {w.hanViet && <span className="text-label-sm font-semibold text-tertiary tracking-wide">{w.hanViet}</span>}
                  </span>
                  <span className="block text-body-sm text-on-surface-variant mt-0.5">
                    {w.meaning || <span className="text-outline">Chưa có nghĩa</span>}
                  </span>
                </button>
                <WordActions word={w} onAdd={onAddWord} />
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);
