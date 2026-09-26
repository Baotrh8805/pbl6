import React, { useState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import type { Deck, Card, DeckDto, CardDto } from "@/types/api.types";

// Cùng kiểu với <Input> để select/textarea khớp ô nhập bên cạnh (labelClass/fieldClass dùng kiểu khác).
const fieldLabelClass = "text-xs font-semibold font-headline text-on-surface tracking-wide";
const selectClass =
  "w-full font-body text-sm text-on-surface bg-surface-container-lowest border border-outline-variant hover:border-outline focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg px-3.5 py-2.5 outline-none transition-all";
const textareaClass = `${selectClass} resize-none placeholder:text-outline/70`;

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const FormError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
      {message}
    </div>
  ) : null;

// Form con chỉ mount khi modal mở -> useState lấy giá trị ban đầu từ props, không cần effect.
interface FormBaseProps {
  formId: string;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
}

// ==========================================
// 1. DeckModal (Tạo & Sửa Bộ Thẻ)
// ==========================================
export interface DeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDeck?: Deck | null;
  defaultFolderId?: string;
  folders?: Array<{ id: string; title: string }>;
  onSave: (data: DeckDto) => Promise<void>;
}

export const DeckModal: React.FC<DeckModalProps> = ({
  isOpen,
  onClose,
  initialDeck,
  defaultFolderId,
  folders = [],
  onSave,
}) => {
  const formId = useId();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialDeck ? "Chỉnh sửa bộ thẻ" : "Tạo bộ thẻ mới"}
      icon={initialDeck ? "edit_note" : "library_add"}
      closeOnBackdrop={!isLoading}
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="primary" size="md" isLoading={isLoading}>
            {initialDeck ? "Cập nhật" : "Tạo bộ thẻ"}
          </Button>
        </>
      }
    >
      <DeckForm
        formId={formId}
        initialDeck={initialDeck}
        defaultFolderId={defaultFolderId}
        folders={folders}
        onSave={onSave}
        onClose={onClose}
        onSavingChange={setIsLoading}
      />
    </Modal>
  );
};

interface DeckFormProps extends FormBaseProps {
  initialDeck?: Deck | null;
  defaultFolderId?: string;
  folders: Array<{ id: string; title: string }>;
  onSave: (data: DeckDto) => Promise<void>;
}

const DeckForm: React.FC<DeckFormProps> = ({
  formId,
  initialDeck,
  defaultFolderId,
  folders,
  onSave,
  onClose,
  onSavingChange,
}) => {
  const [title, setTitle] = useState(initialDeck?.title ?? "");
  const [level, setLevel] = useState(initialDeck?.level || "N5");
  const [description, setDescription] = useState(initialDeck?.description || "");
  const [folderId, setFolderId] = useState(initialDeck ? initialDeck.folderId || "" : defaultFolderId || "");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const levelId = useId();
  const folderSelectId = useId();
  const descId = useId();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSavingChange(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        level,
        description: description.trim() || undefined,
        folderId: folderId || null,
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormError message={error} />

      <Input
        id={titleId}
        label="Tên bộ thẻ"
        required
        placeholder="VD: Từ vựng IT N3, 500 chữ Hán N2..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor={levelId} className={fieldLabelClass}>
            Trình độ JLPT <span className="text-tertiary ml-1">*</span>
          </label>
          <select id={levelId} value={level} onChange={(e) => setLevel(e.target.value)} className={selectClass}>
            {JLPT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor={folderSelectId} className={fieldLabelClass}>
            Thư mục (không bắt buộc)
          </label>
          <select
            id={folderSelectId}
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className={selectClass}
          >
            <option value="">-- Chưa phân loại --</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor={descId} className={fieldLabelClass}>
          Mô tả
        </label>
        <textarea
          id={descId}
          rows={3}
          placeholder="Mô tả nội dung, mục tiêu của bộ thẻ..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={textareaClass}
        />
      </div>
    </form>
  );
};

// ==========================================
// 2. CardModal (Thêm & Sửa Thẻ Flashcard)
// ==========================================
export interface CardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCard?: Card | null;
  onSave: (data: CardDto) => Promise<void>;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  onClose,
  initialCard,
  onSave,
}) => {
  const formId = useId();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialCard ? "Chỉnh sửa thẻ từ vựng" : "Thêm thẻ từ vựng mới"}
      icon={initialCard ? "edit" : "note_add"}
      closeOnBackdrop={!isLoading}
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="primary" size="md" isLoading={isLoading}>
            {initialCard ? "Lưu thay đổi" : "Thêm thẻ"}
          </Button>
        </>
      }
    >
      <CardForm
        formId={formId}
        initialCard={initialCard}
        onSave={onSave}
        onClose={onClose}
        onSavingChange={setIsLoading}
      />
    </Modal>
  );
};

interface CardFormProps extends FormBaseProps {
  initialCard?: Card | null;
  onSave: (data: CardDto) => Promise<void>;
}

const CardForm: React.FC<CardFormProps> = ({ formId, initialCard, onSave, onClose, onSavingChange }) => {
  const [term, setTerm] = useState(initialCard?.term ?? "");
  const [reading, setReading] = useState(initialCard?.reading || "");
  const [meaning, setMeaning] = useState(initialCard?.meaning ?? "");
  const [example, setExample] = useState(initialCard?.example || "");
  const [error, setError] = useState<string | null>(null);
  const termId = useId();
  const readingId = useId();
  const meaningId = useId();
  const exampleId = useId();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!term.trim() || !meaning.trim()) return;

    onSavingChange(true);
    setError(null);
    try {
      await onSave({
        term: term.trim(),
        reading: reading.trim() || null,
        meaning: meaning.trim(),
        example: example.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormError message={error} />

      <Input
        id={termId}
        label="Thuật ngữ / Từ vựng / Kanji"
        required
        placeholder="VD: 経済, 勉強, 食べる..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      <Input
        id={readingId}
        label="Cách đọc (Furigana / Hiragana)"
        placeholder="VD: けいざい, べんきょう, たべる..."
        value={reading}
        onChange={(e) => setReading(e.target.value)}
      />

      <Input
        id={meaningId}
        label="Nghĩa tiếng Việt"
        required
        placeholder="VD: kinh tế, học tập, ăn..."
        value={meaning}
        onChange={(e) => setMeaning(e.target.value)}
      />

      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor={exampleId} className={fieldLabelClass}>
          Câu ví dụ (không bắt buộc)
        </label>
        <textarea
          id={exampleId}
          rows={2}
          placeholder="VD: 日本の経済について勉強します。"
          value={example}
          onChange={(e) => setExample(e.target.value)}
          className={textareaClass}
        />
      </div>
    </form>
  );
};

// ==========================================
// 3. FolderModal (Tạo Thư Mục & Thư Mục Con)
// ==========================================
export interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolder?: { id: string; title: string } | null;
  /** Có giá trị = chế độ sửa (đổi tên / di chuyển); null = tạo mới. */
  folder?: { id: string; title: string; description?: string | null; level?: string | null; parentId?: string | null } | null;
  /** Đích di chuyển hợp lệ, đã loại sẵn chính nó và con cháu. Chỉ dùng ở chế độ sửa. */
  moveTargets?: { id: string; title: string; depth: number }[];
  onSave: (data: { title: string; description?: string; level?: string; parentId?: string | null }) => Promise<void>;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  parentFolder,
  folder,
  moveTargets = [],
  onSave,
}) => {
  const formId = useId();
  const [isLoading, setIsLoading] = useState(false);
  const isEdit = !!folder;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        folder
          ? `Sửa thư mục "${folder.title}"`
          : parentFolder
            ? `Thêm thư mục con trong "${parentFolder.title}"`
            : "Tạo thư mục mới"
      }
      icon={isEdit ? "drive_file_rename_outline" : "create_new_folder"}
      closeOnBackdrop={!isLoading}
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="primary" size="md" isLoading={isLoading}>
            {isEdit ? "Lưu thay đổi" : parentFolder ? "Thêm thư mục con" : "Tạo thư mục"}
          </Button>
        </>
      }
    >
      <FolderForm
        formId={formId}
        parentFolder={parentFolder}
        folder={folder}
        moveTargets={moveTargets}
        onSave={onSave}
        onClose={onClose}
        onSavingChange={setIsLoading}
      />
    </Modal>
  );
};

interface FolderFormProps extends FormBaseProps {
  parentFolder?: FolderModalProps["parentFolder"];
  folder?: FolderModalProps["folder"];
  moveTargets: { id: string; title: string; depth: number }[];
  onSave: FolderModalProps["onSave"];
}

const FolderForm: React.FC<FolderFormProps> = ({
  formId,
  parentFolder,
  folder,
  moveTargets,
  onSave,
  onClose,
  onSavingChange,
}) => {
  const isEdit = !!folder;
  const [title, setTitle] = useState(folder?.title ?? "");
  const [level, setLevel] = useState(folder?.level ?? "N5");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [parentId, setParentId] = useState(folder?.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const parentSelectId = useId();
  const levelId = useId();
  const descId = useId();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSavingChange(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        level,
        description: description.trim() || undefined,
        parentId: isEdit ? parentId || null : parentFolder?.id || null,
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormError message={error} />

      {isEdit && (
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor={parentSelectId} className={fieldLabelClass}>
            Thư mục cha (di chuyển)
          </label>
          {/* Thụt lề bằng khoảng trắng = cây chọn, 0 dòng JS. Đích không hợp lệ đã bị loại khỏi danh sách. */}
          <select
            id={parentSelectId}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={selectClass}
          >
            <option value="">— Thư mục gốc —</option>
            {moveTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {"  ".repeat(t.depth)}
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isEdit && parentFolder && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-low border border-surface-container-high/60 text-body-sm text-on-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            folder
          </span>
          <span>
            Thư mục cha: <strong className="text-on-surface font-semibold">{parentFolder.title}</strong>
          </span>
        </div>
      )}

      <Input
        id={titleId}
        label="Tên thư mục"
        required
        placeholder="VD: Kanji Mimikara N2, Ngữ pháp..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor={levelId} className={fieldLabelClass}>
          Trình độ JLPT (không bắt buộc)
        </label>
        <select id={levelId} value={level} onChange={(e) => setLevel(e.target.value)} className={selectClass}>
          {JLPT_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor={descId} className={fieldLabelClass}>
          Mô tả
        </label>
        <textarea
          id={descId}
          rows={2}
          placeholder="Mô tả nội dung của thư mục..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={textareaClass}
        />
      </div>
    </form>
  );
};
