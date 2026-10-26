import React, { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/services/apiClient";
import type { LearningPath, LearningPathPatch } from "@/types/api.types";
import {
  ALL_WEEK,
  DEFAULT_DAILY_CAP,
  MAX_DAILY_CAP,
  MAX_DAYS,
  MIN_DAILY_CAP,
  MIN_DAYS,
  isValidDailyCap,
  isValidDays,
  isValidStudyDays,
  replanFromDay,
  settingsPatch,
} from "@/features/roadmap/roadmapUtils";
import { StudyDaysToggles } from "./StudyDaysToggles";

interface PathSettingsDrawerProps {
  isOpen: boolean;
  path: LearningPath;
  onClose: () => void;
  /** PATCH + tải lại ở trang cha; ném lỗi để hộp thoại hiện tại chỗ. Patch rỗng không được gọi. */
  onSave: (patch: LearningPathPatch) => Promise<void>;
}

// Cài đặt lộ trình đang học: trần thẻ/ngày, ngày học trong tuần, nhắc học, số ngày / ngày bắt đầu.
// Đổi lịch chỉ xếp lại thẻ CHƯA học (spec §7) — ghi rõ trong hộp thoại để người dùng yên tâm.
export const PathSettingsDrawer: React.FC<PathSettingsDrawerProps> = ({ isOpen, path, onClose, onSave }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon="tune"
      size="lg"
      title="Cài đặt lộ trình"
      subtitle="Trần thẻ mỗi ngày, ngày học trong tuần, nhắc học"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            Lưu
          </Button>
        </>
      }
    >
      {/* Modal gỡ nội dung khi đóng -> form mount lại với giá trị mới nhất của lộ trình. */}
      <SettingsForm formId={formId} path={path} onSavingChange={setSaving} onSave={onSave} onDone={onClose} />
    </Modal>
  );
};

const SettingsForm: React.FC<{
  formId: string;
  path: LearningPath;
  onSavingChange: (saving: boolean) => void;
  onSave: (patch: LearningPathPatch) => Promise<void>;
  onDone: () => void;
}> = ({ formId, path, onSavingChange, onSave, onDone }) => {
  const [days, setDays] = useState(String(path.totalDays));
  const [start, setStart] = useState(path.startDate);
  const [cap, setCap] = useState(String(path.dailyCap ?? DEFAULT_DAILY_CAP));
  const [mask, setMask] = useState(path.studyDays ?? ALL_WEEK);
  const [reminder, setReminder] = useState(path.reminder ?? false);
  const [remindEmail, setRemindEmail] = useState(path.remindEmail ?? false);
  const [errors, setErrors] = useState<{ days?: string; start?: string; cap?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { days: useId(), start: useId(), cap: useId(), reminder: useId(), remindEmail: useId() };

  // Mốc tối thiểu tính đúng như server (`placeFrom`): theo ngày bắt đầu / ngày học ĐANG CHỌN trong form chứ không
  // phải `path.today` — đặt lại ngày bắt đầu = hôm nay thì được rút ngắn (từ = 1); ngày nghỉ thì thẻ xếp từ ngày học kế
  // (chỉ số + 1). Server vẫn là người quyết định cuối (400 kèm mốc).
  const minDays = path.status === "ACTIVE" && start ? replanFromDay(start, new Date(), mask) : MIN_DAYS;
  const reschedules =
    Number(days) !== path.totalDays ||
    start !== path.startDate ||
    Number(cap) !== (path.dailyCap ?? DEFAULT_DAILY_CAP) ||
    mask !== (path.studyDays ?? ALL_WEEK);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const daysNum = days.trim() === "" ? NaN : Number(days);
    const capNum = cap.trim() === "" ? NaN : Number(cap);
    const next: typeof errors = {};
    if (!isValidDays(daysNum)) next.days = `Số ngày học phải từ 1 đến ${MAX_DAYS}.`;
    else if (daysNum < minDays) next.days = `Số ngày học không thể nhỏ hơn ngày học hiện tại (${minDays}).`;
    if (!start) next.start = "Hãy chọn ngày bắt đầu.";
    if (!isValidDailyCap(capNum)) next.cap = `Trần thẻ mỗi ngày phải từ ${MIN_DAILY_CAP} đến ${MAX_DAILY_CAP}.`;
    setErrors(next);
    if (Object.keys(next).length > 0 || !isValidStudyDays(mask)) return;

    const patch = settingsPatch(path, { totalDays: daysNum, startDate: start, dailyCap: capNum, studyDays: mask, reminder, remindEmail });
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      await onSave(patch);
      onSavingChange(false);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm break-words">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          id={ids.cap}
          label="Trần thẻ mỗi ngày"
          type="number"
          inputMode="numeric"
          min={MIN_DAILY_CAP}
          max={MAX_DAILY_CAP}
          step={1}
          value={cap}
          onChange={(e) => {
            setCap(e.target.value);
            setErrors((er) => ({ ...er, cap: undefined }));
          }}
          error={errors.cap}
          helperText="Tải = thẻ mới + thẻ ôn dự báo; vượt trần thì giãn sang ngày sau."
        />
        <Input
          id={ids.days}
          label="Số ngày học"
          type="number"
          inputMode="numeric"
          min={minDays}
          max={MAX_DAYS}
          step={1}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setErrors((er) => ({ ...er, days: undefined }));
          }}
          error={errors.days}
          helperText={minDays > 1 ? `Tối thiểu ${minDays} (ngày học hiện tại theo lịch đang chọn).` : `Từ 1 đến ${MAX_DAYS} ngày.`}
        />
      </div>

      <StudyDaysToggles mask={mask} onChange={setMask} disabled={saving} />

      <Input
        id={ids.start}
        label="Ngày bắt đầu"
        type="date"
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          setErrors((er) => ({ ...er, start: undefined }));
        }}
        error={errors.start}
      />

      <SwitchRow
        id={ids.reminder}
        title="Nhắc học mỗi sáng"
        hint="Thông báo trong ứng dụng khi hôm nay có thẻ cần học."
        checked={reminder}
        onChange={setReminder}
      />
      {/* B4: email chỉ đi kèm nhắc trong app (server chỉ gửi khi cả hai bật); tắt nhắc thì công tắc email mờ đi nhưng giữ lựa chọn */}
      <SwitchRow
        id={ids.remindEmail}
        title="Nhắc thêm qua email"
        hint={
          reminder
            ? "Một email mỗi sáng khi hôm nay có thẻ cần học, gộp chung các lộ trình bật email."
            : "Bật “Nhắc học mỗi sáng” để dùng."
        }
        checked={remindEmail}
        disabled={!reminder}
        onChange={setRemindEmail}
      />

      {reschedules && (
        <p className="text-body-sm text-on-surface-variant flex items-start gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">info</span>
          <span>Đổi lịch chỉ xếp lại các thẻ chưa học kể từ hôm nay; thẻ đã học và lịch ôn giữ nguyên.</span>
        </p>
      )}
    </form>
  );
};

/** Một hàng công tắc (checkbox role=switch) dùng cho các lựa chọn nhắc học. */
const SwitchRow: React.FC<{
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ id, title, hint, checked, disabled = false, onChange }) => (
  <label
    htmlFor={id}
    className={`flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low ${
      disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-on-surface">{title}</span>
      <span className="block text-xs text-on-surface-variant">{hint}</span>
    </span>
    <span className="relative inline-flex shrink-0">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="w-10 h-6 rounded-full bg-outline-variant transition-colors peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"
      />
      <span
        aria-hidden="true"
        className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
      />
    </span>
  </label>
);
