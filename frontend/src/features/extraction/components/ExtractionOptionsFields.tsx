import React, { useId } from "react";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import type { ExtractionOptions } from "@/types/api.types";
import {
  EXTRACT_MODE_LABELS,
  LEVEL_FILTER_LABELS,
  OCR_MODE_LABELS,
  UNKNOWN_POLICY_LABELS,
  needsOcr,
} from "../extractionUtils";

interface ExtractionOptionsFieldsProps {
  options: ExtractionOptions;
  onChange: <K extends keyof ExtractionOptions>(key: K, value: ExtractionOptions[K]) => void;
  /** Tệp đang chọn; select OCR chỉ hiện khi là ảnh / PDF scan (truyền null khi nguồn là văn bản). */
  file: File | null;
}

// Khối "Tuỳ chọn bóc tách": các select + checkbox dùng chung cho modal bóc tách và modal tạo lộ trình.
export const ExtractionOptionsFields: React.FC<ExtractionOptionsFieldsProps> = ({ options, onChange: set, file }) => {
  const ids = {
    userLevel: useId(),
    levelFilter: useId(),
    meaningLang: useId(),
    treatUnknownAs: useId(),
    ocrMode: useId(),
    extractMode: useId(),
  };

  return (
    <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/40 space-y-3">
      <div className={labelClass}>Tuỳ chọn bóc tách</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={ids.userLevel} className="text-xs font-semibold text-on-surface">
            Trình độ của tôi
          </label>
          <select id={ids.userLevel} value={options.userLevel} onChange={(e) => set("userLevel", e.target.value)} className={fieldClass}>
            {JLPT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.levelFilter} className="text-xs font-semibold text-on-surface">
            Lọc cấp độ
          </label>
          <select
            id={ids.levelFilter}
            value={options.levelFilter}
            onChange={(e) => set("levelFilter", e.target.value as ExtractionOptions["levelFilter"])}
            className={fieldClass}
          >
            {(Object.keys(LEVEL_FILTER_LABELS) as ExtractionOptions["levelFilter"][]).map((v) => (
              <option key={v} value={v}>
                {LEVEL_FILTER_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.extractMode} className="text-xs font-semibold text-on-surface">
            Bố cục tài liệu
          </label>
          <select
            id={ids.extractMode}
            value={options.extractMode}
            onChange={(e) => set("extractMode", e.target.value as ExtractionOptions["extractMode"])}
            className={fieldClass}
          >
            {(Object.keys(EXTRACT_MODE_LABELS) as ExtractionOptions["extractMode"][]).map((v) => (
              <option key={v} value={v}>
                {EXTRACT_MODE_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.meaningLang} className="text-xs font-semibold text-on-surface">
            Ngôn ngữ nghĩa
          </label>
          <select
            id={ids.meaningLang}
            value={options.meaningLang}
            onChange={(e) => set("meaningLang", e.target.value as ExtractionOptions["meaningLang"])}
            className={fieldClass}
          >
            <option value="vi">Tiếng Việt (cần AI dịch, dự phòng tiếng Anh)</option>
            <option value="en">Tiếng Anh (từ điển JMdict)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.treatUnknownAs} className="text-xs font-semibold text-on-surface">
            Từ không rõ cấp JLPT
          </label>
          <select
            id={ids.treatUnknownAs}
            value={options.treatUnknownAs}
            onChange={(e) => set("treatUnknownAs", e.target.value as ExtractionOptions["treatUnknownAs"])}
            className={fieldClass}
          >
            {(Object.keys(UNKNOWN_POLICY_LABELS) as ExtractionOptions["treatUnknownAs"][]).map((v) => (
              <option key={v} value={v}>
                {UNKNOWN_POLICY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        {/* OCR chỉ áp dụng cho ảnh / PDF scan */}
        {needsOcr(file) && (
          <div className="space-y-1.5">
            <label htmlFor={ids.ocrMode} className="text-xs font-semibold text-on-surface">
              Hướng chữ (OCR)
            </label>
            <select
              id={ids.ocrMode}
              value={options.ocrMode}
              onChange={(e) => set("ocrMode", e.target.value as ExtractionOptions["ocrMode"])}
              className={fieldClass}
            >
              {(Object.keys(OCR_MODE_LABELS) as ExtractionOptions["ocrMode"][]).map((v) => (
                <option key={v} value={v}>
                  {OCR_MODE_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input type="checkbox" checked={options.includeGrammar} onChange={(e) => set("includeGrammar", e.target.checked)} className="rounded accent-primary" />
          <span>Tách mẫu ngữ pháp</span>
        </label>
        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input type="checkbox" checked={options.includeFurigana} onChange={(e) => set("includeFurigana", e.target.checked)} className="rounded accent-primary" />
          <span>Tự tạo Furigana</span>
        </label>
        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input type="checkbox" checked={options.includeHanViet} onChange={(e) => set("includeHanViet", e.target.checked)} className="rounded accent-primary" />
          <span>Ánh xạ âm Hán-Việt</span>
        </label>
      </div>
    </div>
  );
};
