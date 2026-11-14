import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { patchAdminQuestion } from "@/services/adminQuestionService";
import type { AdminQuestionDetail } from "@/types/quiz.types";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  PROMPT_MAX,
  buildQuestionPatch,
  optionLetter,
  toQuestionDraft,
  validateQuestionDraft,
  type QuestionDraft,
} from "@/features/quiz/quizUtils";
import { adminFieldClass } from "./AdminFilterBar.tsx";

type QuestionDetail = AdminQuestionDetail;

/**
 * Bộ sửa một câu trong ngân hàng câu hỏi (G3, hợp đồng §1.3): câu hỏi hiển thị, phương án + đáp án đúng (câu chọn) hoặc
 * đáp án gõ. Chỉ gửi PATCH phần đã đổi (buildQuestionPatch); nơi dùng đặt key theo nội dung để lưu xong thì nháp dựng lại.
 */
export const QuestionEditor: React.FC<{
  detail: QuestionDetail;
  canAct: boolean;
  isJa: boolean;
  onSaved: (next: QuestionDetail) => void;
}> = ({ detail, canAct, isJa, onSaved }) => {
  const baseId = useId();
  const [draft, setDraft] = useState<QuestionDraft>(() => toQuestionDraft(detail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = buildQuestionPatch(detail, draft);
  const dirty = Object.keys(patch).length > 0;
  const invalid = validateQuestionDraft(draft);
  const readOnly = !canAct || busy;
  const jaProps = isJa ? { lang: "ja" as const } : {};

  const setOption = (i: number, value: string) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, k) => (k === i ? value : o)) }));

  const removeOption = (i: number) =>
    setDraft((d) => ({
      ...d,
      options: d.options.filter((_, k) => k !== i),
      // Giữ đúng phương án đang là đáp án khi xoá một dòng phía trên nó.
      correctIndex: d.correctIndex === i ? -1 : d.correctIndex > i ? d.correctIndex - 1 : d.correctIndex,
    }));

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dirty || invalid || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await patchAdminQuestion(detail.id, patch));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3 rounded-xl border border-surface-container-high p-space-sm" noValidate>
      <h3 className="font-bold text-on-surface">Nội dung câu hỏi</h3>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Câu hỏi hiển thị</span>
        <textarea
          value={draft.prompt}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          maxLength={PROMPT_MAX}
          rows={2}
          readOnly={readOnly}
          placeholder="Để trống: câu nghĩa chỉ hiện từ như trước"
          className={adminFieldClass}
        />
      </label>

      {draft.typing ? (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Đáp án đúng (câu gõ)</span>
          <input
            value={draft.correctText}
            onChange={(e) => setDraft((d) => ({ ...d, correctText: e.target.value }))}
            readOnly={readOnly}
            {...jaProps}
            className={`${adminFieldClass} ${isJa ? "font-japanese" : ""}`}
          />
          <span className="text-label-sm text-on-surface-variant">
            Server chấm sau khi chuẩn hoá (katakana → hiragana, bỏ khoảng trắng / dấu câu).
          </span>
        </label>
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold mb-1">Phương án (chọn đáp án đúng)</legend>
          {draft.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${baseId}-correct`}
                checked={draft.correctIndex === i}
                onChange={() => setDraft((d) => ({ ...d, correctIndex: i }))}
                disabled={readOnly}
                aria-label={`Phương án ${optionLetter(i)} là đáp án đúng`}
                className="w-4 h-4 shrink-0"
              />
              <span aria-hidden="true" className="w-5 text-center font-bold text-outline shrink-0">
                {optionLetter(i)}
              </span>
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                readOnly={readOnly}
                aria-label={`Phương án ${optionLetter(i)}`}
                {...jaProps}
                className={`${adminFieldClass} flex-1 min-w-0 ${isJa ? "font-japanese" : ""} ${
                  draft.correctIndex === i ? "border-secondary" : ""
                }`}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={readOnly || draft.options.length <= MIN_OPTIONS}
                aria-label={`Xoá phương án ${optionLetter(i)}`}
                className="p-2 rounded-lg text-outline hover:text-error hover:bg-error/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  delete
                </span>
              </button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraft((d) => ({ ...d, options: [...d.options, ""] }))}
              disabled={readOnly || draft.options.length >= MAX_OPTIONS}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add
              </span>
              Thêm phương án
            </Button>
          </div>
        </fieldset>
      )}

      {dirty && invalid && (
        <p role="alert" className="text-error">
          {invalid}
        </p>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {canAct && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!dirty || busy}
            onClick={() => {
              setDraft(toQuestionDraft(detail));
              setError(null);
            }}
          >
            Hoàn tác
          </Button>
          <Button type="submit" size="sm" isLoading={busy} disabled={!dirty || invalid !== null}>
            Lưu thay đổi
          </Button>
        </div>
      )}
    </form>
  );
};
