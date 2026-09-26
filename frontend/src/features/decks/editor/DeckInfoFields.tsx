import React from "react";

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

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
}

// Thông tin chung của bộ thẻ: tiêu đề, mô tả, cấp độ JLPT, thư mục.
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
  </div>
);
