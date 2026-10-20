import React, { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runOnce } from "@/lib/inFlight";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/services/apiClient";
import { createRemedialPath } from "@/services/learningPathService";
import {
  REMEDIAL_GROUP_OPTIONS,
  REMEDIAL_MAX_DAYS,
  REMEDIAL_MIN_DAYS,
  defaultRemedialDays,
  isValidRemedialDays,
} from "@/lib/insightUtils";
import type { WeaknessGroupBy, WeaknessResponse } from "@/types/api.types";

interface CreateRemedialModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kết quả GET /insights/weaknesses: số ngày gợi ý + số nhóm của từng cách gom. */
  weakness: WeaknessResponse | null;
}

const DAYS_ERROR = `Số ngày phải từ ${REMEDIAL_MIN_DAYS} đến ${REMEDIAL_MAX_DAYS}.`;

// Lộ trình bổ khuyết (spec §3.8): chọn số ngày + cách gom thẻ yếu thành chương -> POST /learning-paths/remedial (tạo thẳng
// ACTIVE) -> sang trang lộ trình. 409 (chưa đủ 8 thẻ yếu — dữ liệu đổi từ lúc tải) hiện nguyên câu của server.
export const CreateRemedialModal: React.FC<CreateRemedialModalProps> = ({ isOpen, onClose, weakness }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      // Đang gửi (server nhân bản thẻ, có thể tới 60 s): Esc / nút X / nền tối không đóng được. Đóng giữa chừng sẽ gỡ form:
      // lỗi (vd. 409) rơi vào form đã gỡ, còn thành công thì bất ngờ chuyển trang sau khi người dùng tưởng đã hủy.
      onClose={saving ? () => {} : onClose}
      icon="healing"
      size="xl"
      title="Tạo lộ trình bổ khuyết"
      subtitle="Ôn lại các thẻ bạn hay quên, nhớ chậm hoặc làm sai theo một lịch ngắn"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang tạo..." : "Tạo lộ trình"}
          </Button>
        </>
      }
    >
      {/* Modal gỡ nội dung khi đóng -> form mount lại mỗi lần mở, số ngày về gợi ý mới nhất. */}
      <RemedialForm formId={formId} weakness={weakness} onSavingChange={setSaving} onDone={onClose} />
    </Modal>
  );
};

const RemedialForm: React.FC<{
  formId: string;
  weakness: WeaknessResponse | null;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}> = ({ formId, weakness, onSavingChange, onDone }) => {
  const navigate = useNavigate();
  const suggested = defaultRemedialDays(weakness?.suggestedDays);
  const [days, setDays] = useState(String(suggested));
  const [groupBy, setGroupBy] = useState<WeaknessGroupBy>("level");
  const [title, setTitle] = useState("");
  const [daysError, setDaysError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const daysId = useId();
  const titleId = useId();
  const groupName = useId();

  // LP-13 (thay cờ `saving` riêng của form): bấm đúp / Enter lặp trước khi nút kịp khoá = hai lộ trình bổ khuyết (hai thư
  // mục, hai bộ bộ thẻ clone).
  const inFlight = useRef(new Set<string>());

  const submit = async () => {
    const n = days.trim() === "" ? NaN : Number(days);
    if (!isValidRemedialDays(n)) {
      setDaysError(DAYS_ERROR);
      return;
    }
    setDaysError(null);
    setError(null);
    onSavingChange(true);
    try {
      const path = await createRemedialPath({ days: n, groupBy, title: title.trim() || undefined });
      // Đóng trước khi chuyển trang: RoadmapPage không unmount ngay nếu điều hướng bị chặn, modal không được kẹt mở.
      onSavingChange(false);
      onDone();
      navigate(`/roadmap/${encodeURIComponent(path.id)}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      onSavingChange(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void runOnce(inFlight.current, "create", submit);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      {weakness && (
        <p className="text-body-sm text-on-surface-variant">
          Có <strong className="text-on-surface">{weakness.total}</strong> thẻ yếu trong 30 ngày qua. Lộ trình lấy tối đa 150 thẻ
          yếu nhất, mỗi nhóm thành một chương (một bộ thẻ riêng trong thư mục “Bổ khuyết”) và bắt đầu từ hôm nay.
        </p>
      )}

      <Input
        id={daysId}
        label="Số ngày học"
        type="number"
        inputMode="numeric"
        min={REMEDIAL_MIN_DAYS}
        max={REMEDIAL_MAX_DAYS}
        step={1}
        value={days}
        onChange={(e) => {
          setDays(e.target.value);
          setDaysError(null);
        }}
        error={daysError ?? undefined}
        helperText={`Gợi ý ${suggested} ngày theo số thẻ và trần tải mỗi ngày (${REMEDIAL_MIN_DAYS}–${REMEDIAL_MAX_DAYS} ngày).`}
      />

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold font-headline text-on-surface tracking-wide mb-1.5">
          Gom thẻ thành chương theo
        </legend>
        {REMEDIAL_GROUP_OPTIONS.map((opt) => {
          const groups = weakness?.groups[opt.value].length ?? 0;
          const checked = groupBy === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                checked
                  ? "bg-primary/5 border-primary"
                  : "bg-surface-container-low border-surface-container-high hover:border-outline-variant"
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                checked={checked}
                onChange={() => setGroupBy(opt.value)}
                className="mt-1 w-4 h-4 accent-primary shrink-0"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 font-semibold text-body-sm text-on-surface">
                  {opt.label}
                  {groups > 0 && <span className="text-label-sm font-medium text-outline">{groups} nhóm</span>}
                </span>
                <span className="block text-label-sm text-on-surface-variant mt-0.5">{opt.hint}</span>
              </span>
            </label>
          );
        })}
        <p className="text-label-sm text-outline">Nhiều hơn 12 nhóm thì các nhóm nhỏ được gộp vào chương “Khác”.</p>
      </fieldset>

      <Input
        id={titleId}
        label="Tên lộ trình (tuỳ chọn)"
        type="text"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Mặc định: Bổ khuyết + ngày hôm nay"
      />
    </form>
  );
};
