import React, { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/formStyles";
import { extractErrorMessage } from "@/services/apiClient";
import type { LearningSettings } from "../../types/dashboard.types";
import { getTargetWordsByLevel } from "../../lib/dashboardUtils";
import { JLPT_LEVELS } from "@/lib/deckUtils";

interface LearningSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LearningSettings;
  currentLevel: string;
  displayName: string;
  onSave: (settings: LearningSettings, newLevel: string) => Promise<void>;
}

// Chỉ cho đặt MỤC TIÊU. Số đã học, streak, độ chính xác... tính từ lịch sử ôn/thi nên không sửa tay được.
export const LearningSettingsModal: React.FC<LearningSettingsModalProps> = ({
  isOpen,
  onClose,
  displayName,
  ...formProps
}) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mục tiêu học tập"
      subtitle={`Tài khoản ${displayName}`}
      icon="tune"
      size="lg"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            Lưu mục tiêu
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> state khởi tạo từ props, không cần effect đồng bộ. */}
      <SettingsForm formId={formId} onClose={onClose} onSavingChange={setSaving} {...formProps} />
    </Modal>
  );
};

interface SettingsFormProps extends Omit<LearningSettingsModalProps, "isOpen" | "displayName"> {
  formId: string;
  onSavingChange: (saving: boolean) => void;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
  formId,
  settings,
  currentLevel,
  onSave,
  onClose,
  onSavingChange,
}) => {
  const [level, setLevel] = useState(currentLevel);
  const [dailyGoal, setDailyGoal] = useState(String(settings.dailyGoalWords));
  const [customTarget, setCustomTarget] = useState(settings.targetWords !== null);
  const [target, setTarget] = useState(String(settings.targetWords ?? getTargetWordsByLevel(currentLevel)));
  const [error, setError] = useState("");
  const dailyId = useId();
  const targetId = useId();
  const autoId = useId();

  const autoTarget = getTargetWordsByLevel(level);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const daily = Number(dailyGoal);
    const targetNum = Number(target);
    if (!Number.isInteger(daily) || daily < 1 || daily > 500) {
      setError("Mục tiêu mỗi ngày phải là số nguyên từ 1 đến 500.");
      return;
    }
    if (customTarget && (!Number.isInteger(targetNum) || targetNum < 1)) {
      setError("Tổng số từ mục tiêu phải là số nguyên dương.");
      return;
    }
    setError("");
    onSavingChange(true);
    try {
      await onSave({ dailyGoalWords: daily, targetWords: customTarget ? targetNum : null }, level);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Trình độ JLPT mục tiêu</legend>
        <div className="grid grid-cols-5 gap-2">
          {JLPT_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              aria-pressed={level === lvl}
              onClick={() => setLevel(lvl)}
              className={`py-2 rounded-lg font-label-md text-label-md font-bold transition-all cursor-pointer border ${
                level === lvl
                  ? "bg-primary text-on-primary border-primary shadow-sm"
                  : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={dailyId} className={labelClass}>
          Số thẻ ôn mỗi ngày
        </label>
        <input
          id={dailyId}
          type="number"
          min={1}
          max={500}
          inputMode="numeric"
          value={dailyGoal}
          onChange={(e) => setDailyGoal(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={targetId} className={labelClass}>
          Tổng số từ mục tiêu
        </label>
        <input
          id={targetId}
          type="number"
          min={1}
          inputMode="numeric"
          disabled={!customTarget}
          value={customTarget ? target : String(autoTarget)}
          onChange={(e) => setTarget(e.target.value)}
          className={fieldClass}
        />
        <label htmlFor={autoId} className="flex items-center gap-2 text-body-sm text-on-surface-variant cursor-pointer">
          <input
            id={autoId}
            type="checkbox"
            checked={!customTarget}
            onChange={(e) => {
              setCustomTarget(!e.target.checked);
              if (!e.target.checked) setTarget(String(autoTarget));
            }}
            className="accent-primary"
          />
          Tự động theo trình độ ({level}: {autoTarget.toLocaleString()} từ)
        </label>
      </div>

      <p className="text-xs text-outline leading-relaxed">
        Số từ đã học, số thẻ đến hạn, chuỗi ngày học và độ chính xác Quiz được tính tự động từ lịch sử ôn tập và
        làm bài của bạn.
      </p>
    </form>
  );
};
