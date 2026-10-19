import React from "react";
import {
  WEEKDAY_LABELS,
  parseWeekdayMask,
  studyDaysLabel,
  studyDaysPerWeek,
  weekdayMaskToggle,
} from "@/features/roadmap/roadmapUtils";

interface StudyDaysTogglesProps {
  /** 7 ký tự 0/1 Thứ 2..CN. */
  mask: string;
  onChange: (mask: string) => void;
  disabled?: boolean;
  label?: string;
  /** Ẩn dòng tóm tắt "T2–T6 · 5 ngày/tuần" (khi nơi gọi tự hiện). */
  compact?: boolean;
}

// 7 nút bật/tắt T2..CN dùng chung cho modal tạo, bản nháp và cài đặt. Không cho tắt ngày học cuối cùng:
// server từ chối "0000000", chặn ngay trên nút thay vì để người dùng gặp lỗi 400.
export const StudyDaysToggles: React.FC<StudyDaysTogglesProps> = ({
  mask,
  onChange,
  disabled = false,
  label = "Ngày học trong tuần",
  compact = false,
}) => {
  const bits = parseWeekdayMask(mask);
  const onlyOne = bits.filter(Boolean).length === 1;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold font-headline text-on-surface tracking-wide">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {WEEKDAY_LABELS.map((wd, i) => {
          const on = bits[i];
          const locked = on && onlyOne;
          return (
            <button
              key={wd}
              type="button"
              aria-pressed={on}
              disabled={disabled || locked}
              title={locked ? "Phải giữ ít nhất một ngày học" : undefined}
              onClick={() => onChange(weekdayMaskToggle(mask, i))}
              className={`min-w-10 px-2.5 py-1.5 rounded-lg text-label-sm font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed ${
                on
                  ? "bg-primary text-on-primary border-primary shadow-xs"
                  : "bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary hover:text-on-surface"
              }`}
            >
              {wd}
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="text-xs text-on-surface-variant">
          {studyDaysLabel(mask)} · {studyDaysPerWeek(mask)} ngày/tuần
        </p>
      )}
    </div>
  );
};
