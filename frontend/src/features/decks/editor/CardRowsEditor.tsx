import React from "react";
import type { CardDto } from "@/types/api.types";
import type { EditorCard } from "./editorCards";

type EditableField = Exclude<keyof CardDto, "id">;

interface CardRowsEditorProps {
  cards: EditorCard[];
  onChange: (index: number, field: EditableField, value: string) => void;
  onInsertAfter: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

const captionClass = "block text-[11px] font-semibold text-outline uppercase tracking-wider mt-1 ml-1";
const inputBase =
  "w-full rounded-xl bg-surface-container-low/30 border border-surface-container-high focus:border-primary focus:ring-1 focus:ring-primary text-on-surface placeholder:text-outline/50 outline-none transition-all";

// Ô nhập + nhãn (nhãn nằm dưới ô như thiết kế cũ, gắn htmlFor để trình đọc màn hình đọc được).
const Field: React.FC<{
  id: string;
  label: string;
  value: string;
  placeholder: string;
  className: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, placeholder, className, onChange }) => (
  <div>
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputBase} ${className}`}
    />
    <label htmlFor={id} className={captionClass}>
      {label}
    </label>
  </div>
);

// Danh sách hàng thẻ kiểu Quizlet + nút "Thêm thẻ" cuối danh sách.
export const CardRowsEditor: React.FC<CardRowsEditorProps> = ({
  cards,
  onChange,
  onInsertAfter,
  onRemove,
  onAdd,
}) => (
  <>
    <div className="space-y-4">
      {cards.map((card, idx) => {
        const idBase = `card-row-${card._key}`;
        return (
          <div
            key={card._key}
            className="p-5 rounded-2xl bg-surface-container-lowest border border-surface-container-high hover:border-outline/40 shadow-xs transition-all space-y-3 group"
          >
            {/* Số thứ tự & nút thao tác nhanh */}
            <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-2.5">
              <span className="font-bold text-sm text-outline px-2.5 py-0.5 rounded-md bg-surface-container-low">
                {idx + 1}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onInsertAfter(idx)}
                  className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                  title="Thêm thẻ mới bên dưới"
                  aria-label={`Thêm thẻ mới bên dưới thẻ ${idx + 1}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                  title="Xóa thẻ này"
                  aria-label={`Xóa thẻ ${idx + 1}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>

            {/* 2 cột: Thuật ngữ + Cách đọc | Định nghĩa + Ví dụ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Field
                  id={`${idBase}-term`}
                  label="Thuật ngữ (Kanji)"
                  value={card.term}
                  placeholder="Thuật ngữ / Kanji (bắt buộc)"
                  className="px-3.5 py-2.5 text-base font-semibold font-japanese"
                  onChange={(v) => onChange(idx, "term", v)}
                />
                <Field
                  id={`${idBase}-reading`}
                  label="Cách đọc (Furigana / Hiragana)"
                  value={card.reading || ""}
                  placeholder="Cách đọc Hiragana / Furigana..."
                  className="px-3.5 py-2 text-sm font-japanese"
                  onChange={(v) => onChange(idx, "reading", v)}
                />
              </div>

              <div className="space-y-3">
                <Field
                  id={`${idBase}-meaning`}
                  label="Định nghĩa (Tiếng Việt)"
                  value={card.meaning}
                  placeholder="Định nghĩa tiếng Việt (bắt buộc)"
                  className="px-3.5 py-2.5 text-base font-medium"
                  onChange={(v) => onChange(idx, "meaning", v)}
                />
                <Field
                  id={`${idBase}-example`}
                  label="Ví dụ minh họa"
                  value={card.example || ""}
                  placeholder="Câu ví dụ minh họa..."
                  className="px-3.5 py-2 text-sm"
                  onChange={(v) => onChange(idx, "example", v)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* Nút thêm thẻ lớn cuối danh sách */}
    <div className="pt-2">
      <button
        type="button"
        onClick={onAdd}
        className="w-full py-5 rounded-2xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 bg-surface-container-lowest text-primary font-headline font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[24px]">add_circle</span>
        + Thêm thẻ
      </button>
    </div>
  </>
);
