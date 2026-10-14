import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchFolders } from "@/services/folderService";
import { createDecksFromExtraction } from "@/services/extractionService";
import { useAsync } from "@/lib/useAsync";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import { flattenFolders } from "@/features/folders/components/folderTree";
import type { CardKind, Deck, ExtractionDeckSpec, ExtractionItem, ExtractionJob } from "@/types/api.types";
import { KIND_LABELS, defaultDeckTitle, mostCommonLevel } from "../extractionUtils";

interface CreateDecksModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ExtractionJob;
  items: ExtractionItem[];
  onCreated: (decks: Deck[]) => void;
}

export const CreateDecksModal: React.FC<CreateDecksModalProps> = ({ isOpen, onClose, job, items, onCreated }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tạo bộ thẻ từ kết quả"
      icon="library_add"
      size="xl"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang tạo..." : "Tạo bộ thẻ"}
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> giá trị mặc định tính từ items hiện tại. */}
      <CreateDecksForm formId={formId} job={job} items={items} onSavingChange={setSaving} onCreated={onCreated} />
    </Modal>
  );
};

type SpecState = ExtractionDeckSpec & { enabled: boolean; count: number };

const KINDS: CardKind[] = ["vocab", "grammar"];

const CreateDecksForm: React.FC<Omit<CreateDecksModalProps, "isOpen" | "onClose"> & {
  formId: string;
  onSavingChange: (saving: boolean) => void;
}> = ({ formId, job, items, onSavingChange, onCreated }) => {
  const folderState = useAsync(fetchFolders, []);
  const folderOptions = flattenFolders(folderState.data ?? []);
  const [error, setError] = useState<string | null>(null);

  const [specs, setSpecs] = useState<Record<CardKind, SpecState>>(() => {
    const out = {} as Record<CardKind, SpecState>;
    for (const kind of KINDS) {
      const selected = items.filter((it) => it.kind === kind && it.selected);
      out[kind] = {
        enabled: selected.length > 0,
        count: selected.length,
        title: defaultDeckTitle(job, kind),
        folderId: null,
        level: mostCommonLevel(selected) ?? job.options.userLevel,
      };
    }
    return out;
  });

  const update = (kind: CardKind, patch: Partial<SpecState>) =>
    setSpecs((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));

  const activeKinds = KINDS.filter((k) => specs[k].enabled && specs[k].count > 0);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (activeKinds.length === 0) {
      setError("Chưa chọn mục nào để tạo bộ thẻ.");
      return;
    }
    if (activeKinds.some((k) => !specs[k].title.trim())) {
      setError("Vui lòng nhập tên bộ thẻ.");
      return;
    }
    setError(null);
    onSavingChange(true);
    try {
      const toSpec = (kind: CardKind): ExtractionDeckSpec | null =>
        activeKinds.includes(kind)
          ? { title: specs[kind].title.trim(), folderId: specs[kind].folderId, level: specs[kind].level }
          : null;
      const decks = await createDecksFromExtraction(job.id, { vocab: toSpec("vocab"), grammar: toSpec("grammar") });
      onCreated(decks);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      {job.deckIds.length > 0 && (
        <p className="p-3 rounded-lg bg-tertiary-fixed/40 text-on-surface text-body-sm">
          Job này đã tạo{" "}
          {job.deckIds.map((id, i) => (
            <React.Fragment key={id}>
              {i > 0 && ", "}
              <Link to={`/decks/${encodeURIComponent(id)}`} className="text-primary font-semibold hover:underline">
                bộ thẻ {i + 1}
              </Link>
            </React.Fragment>
          ))}
          . Tạo lại sẽ sinh bản sao mới, bộ thẻ cũ giữ nguyên.
        </p>
      )}

      {folderState.error && <p className="text-label-sm text-error">Không tải được thư mục: {folderState.error}</p>}

      {KINDS.map((kind) => {
        const spec = specs[kind];
        if (spec.count === 0) return null;
        return <SpecFields key={kind} kind={kind} spec={spec} folderOptions={folderOptions} onChange={(p) => update(kind, p)} />;
      })}

      {KINDS.every((k) => specs[k].count === 0) && (
        <p className="text-body-sm text-on-surface-variant">Hãy tick chọn ít nhất một mục trước khi tạo bộ thẻ.</p>
      )}
    </form>
  );
};

const SpecFields: React.FC<{
  kind: CardKind;
  spec: SpecState;
  folderOptions: { id: string; title: string; depth: number }[];
  onChange: (patch: Partial<SpecState>) => void;
}> = ({ kind, spec, folderOptions, onChange }) => {
  const enableId = useId();
  const titleId = useId();
  const folderId = useId();
  const levelId = useId();

  return (
    <fieldset className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/40 space-y-3">
      <legend className="sr-only">Bộ thẻ {KIND_LABELS[kind]}</legend>
      <label htmlFor={enableId} className="flex items-center gap-2 select-none cursor-pointer">
        <input
          id={enableId}
          type="checkbox"
          checked={spec.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="rounded accent-primary"
        />
        <span className="font-headline font-bold text-on-surface">
          Bộ thẻ {KIND_LABELS[kind].toLowerCase()} <span className="text-outline font-normal">({spec.count} thẻ đã chọn)</span>
        </span>
      </label>

      {spec.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_6rem] gap-3">
          <div className="space-y-1.5 sm:col-span-3">
            <label htmlFor={titleId} className={labelClass}>
              Tên bộ thẻ <span className="text-error">*</span>
            </label>
            <input
              id={titleId}
              required
              maxLength={200}
              value={spec.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className={fieldClass}
              type="text"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={folderId} className={labelClass}>
              Thư mục
            </label>
            <select
              id={folderId}
              value={spec.folderId ?? ""}
              onChange={(e) => onChange({ folderId: e.target.value || null })}
              className={fieldClass}
            >
              <option value="">Ngoài thư mục (gốc)</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {"  ".repeat(f.depth)}
                  {f.depth > 0 ? "└ " : ""}
                  {f.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={levelId} className={labelClass}>
              Cấp độ
            </label>
            <select
              id={levelId}
              value={spec.level ?? ""}
              onChange={(e) => onChange({ level: e.target.value || null })}
              className={fieldClass}
            >
              {JLPT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </fieldset>
  );
};
