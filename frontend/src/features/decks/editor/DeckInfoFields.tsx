import React from "react";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import type { DeckVisibility } from "@/types/api.types";

const labelClass = "block text-xs font-semibold uppercase tracking-wider text-outline mb-1.5";
const selectClass =
  "w-full px-3 py-2.5 text-sm rounded-xl bg-surface-container-low/40 border border-surface-container-high focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface outline-none cursor-pointer";

interface DeckInfoFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  level: string;
  onLevelChange: (value: string) => void;
  folderId: string;
  onFolderIdChange: (value: string) => void;
  folders: Array<{ id: string; title: string }>;
  /** Quyền truy cập (rà soát 27/10): chỉ chủ bộ thẻ (tạo mới / sửa) mới có; bỏ trống = ẩn khối này. */
  visibility?: DeckVisibility;
  onVisibilityChange?: (value: DeckVisibility) => void;
  /** Sau khi lưu mở ngay hộp Chia sẻ (mời theo email, link riêng có mật khẩu). */
  openShareAfter?: boolean;
  onOpenShareAfterChange?: (value: boolean) => void;
}

const ACCESS_OPTIONS: { value: DeckVisibility; icon: string; title: string; hint: string }[] = [
  { value: "private", icon: "lock", title: "Riêng tư", hint: "Chỉ bạn và người được mời (theo email hoặc link riêng) xem được." },
  { value: "public", icon: "public", title: "Công khai", hint: "Mọi người đã đăng nhập đều xem, học và lưu bản sao được; hiện ở Thư viện cộng đồng." },
];

// Thông tin chung của bộ thẻ: tiêu đề, mô tả, cấp độ JLPT, thư mục, quyền truy cập.
export const DeckInfoFields: React.FC<DeckInfoFieldsProps> = ({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  level,
  onLevelChange,
  folderId,
  onFolderIdChange,
  folders,
  visibility,
  onVisibilityChange,
  openShareAfter = false,
  onOpenShareAfterChange,
}) => (
  <div className="p-6 rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs space-y-4">
    <div>
      <label htmlFor="deck-title-input" className={labelClass}>
        Tiêu đề <span className="text-error">*</span>
      </label>
      <input
        id="deck-title-input"
        type="text"
        required
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder='Nhập tiêu đề, ví dụ "Từ vựng N3 - Chuyên ngành Công nghệ thông tin"'
        className="w-full px-4 py-3 text-lg font-semibold rounded-xl bg-surface-container-low/40 border border-surface-container-high focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-outline/50 outline-none transition-all"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <label htmlFor="deck-description-input" className={labelClass}>
          Mô tả
        </label>
        <input
          id="deck-description-input"
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Thêm mô tả về nội dung hoặc mục tiêu học của bộ thẻ..."
          className="w-full px-4 py-2.5 text-sm rounded-xl bg-surface-container-low/40 border border-surface-container-high focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-outline/50 outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="deck-level-select" className={labelClass}>
            Cấp độ JLPT
          </label>
          <select
            id="deck-level-select"
            value={level}
            onChange={(e) => onLevelChange(e.target.value)}
            className={selectClass}
          >
            {JLPT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="deck-folder-select" className={labelClass}>
            Thư mục
          </label>
          <select
            id="deck-folder-select"
            value={folderId}
            onChange={(e) => onFolderIdChange(e.target.value)}
            className={selectClass}
          >
            <option value="">(Không có thư mục)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>

    {visibility !== undefined && onVisibilityChange && (
      <fieldset className="space-y-2">
        <legend className={labelClass}>Quyền truy cập</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACCESS_OPTIONS.map((opt) => {
            const selected = visibility === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-surface-container-high hover:border-outline"
                }`}
              >
                <input
                  type="radio"
                  name="deck-visibility"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onVisibilityChange(opt.value)}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">{opt.icon}</span>
                    {opt.title}
                  </span>
                  <span className="block text-xs text-on-surface-variant mt-0.5">{opt.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        {onOpenShareAfterChange && (
          <label className="inline-flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
            <input type="checkbox" checked={openShareAfter} onChange={(e) => onOpenShareAfterChange(e.target.checked)} className="accent-primary" />
            Sau khi lưu, mở hộp Chia sẻ để mời theo email hoặc tạo link riêng (có thể đặt mật khẩu)
          </label>
        )}
      </fieldset>
    )}
  </div>
);
