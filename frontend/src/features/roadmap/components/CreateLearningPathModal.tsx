import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/services/apiClient";
import { createLearningPath } from "@/services/learningPathService";
import { useAuth } from "@/context/useAuth";
import { dayKey } from "@/lib/learningStats";
import type { ExtractionOptions } from "@/types/api.types";
import { loadSavedOptions, saveOptions } from "@/features/extraction/extractionUtils";
import { SourceFields, type UploadSource } from "@/features/extraction/components/SourceFields";
import { ExtractionOptionsFields } from "@/features/extraction/components/ExtractionOptionsFields";
import {
  ALL_WEEK,
  DEFAULT_DAYS,
  MAX_DAILY_CAP,
  MAX_DAYS,
  MIN_DAILY_CAP,
  MIN_DAYS,
  isValidDailyCap,
  isValidDays,
} from "../roadmapUtils";
import { StudyDaysToggles } from "./StudyDaysToggles";

interface CreateLearningPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: { days?: number; title?: string };
}

const DAYS_ERROR = `Số ngày học phải từ ${MIN_DAYS} đến ${MAX_DAYS}.`;
const CAP_ERROR = `Trần thẻ mỗi ngày phải từ ${MIN_DAILY_CAP} đến ${MAX_DAILY_CAP}.`;

// Tải tệp / dán văn bản + số ngày học -> POST /learning-paths -> sang trang lộ trình (bản nháp chương).
export const CreateLearningPathModal: React.FC<CreateLearningPathModalProps> = ({ isOpen, onClose, initial }) => {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon="alt_route"
      size="2xl"
      title="Tạo lộ trình học tập"
      subtitle="Bóc tách tài liệu, chia thành các chương và lên lịch học theo số ngày bạn chọn"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form={formId} size="sm" isLoading={saving}>
            {saving ? "Đang gửi..." : "Tạo lộ trình"}
          </Button>
        </>
      }
    >
      {/* Form mount lại mỗi lần mở -> state về mặc định, tuỳ chọn đọc lại từ localStorage. */}
      <PathForm formId={formId} initial={initial} onSavingChange={setSaving} onDone={onClose} />
    </Modal>
  );
};

const PathForm: React.FC<{
  formId: string;
  initial?: { days?: number; title?: string };
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}> = ({ formId, initial, onSavingChange, onDone }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [source, setSource] = useState<UploadSource>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState(String(initial?.days ?? DEFAULT_DAYS));
  // LP-11: ngày bắt đầu luôn gửi theo máy khách (mặc định hôm nay) để server không lấy "hôm nay" theo múi giờ của nó.
  const [startDate, setStartDate] = useState(() => dayKey(new Date()));
  const [title, setTitle] = useState(initial?.title ?? "");
  // Để trống = không gửi dailyCap: server lấy mặc định do quản trị cấu hình (app_settings learning_path_daily_cap_default),
  // không ghim cứng 50 ở máy khách.
  const [dailyCap, setDailyCap] = useState("");
  const [studyDays, setStudyDays] = useState(ALL_WEEK);
  const [options, setOptions] = useState<ExtractionOptions>(() => loadSavedOptions(userProfile?.jlptLevel));
  const [error, setError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const daysId = useId();
  const startId = useId();
  const titleId = useId();
  const capId = useId();

  const set = <K extends keyof ExtractionOptions>(key: K, value: ExtractionOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const daysNum = days.trim() === "" ? NaN : Number(days);
    const capNum = dailyCap.trim() === "" ? undefined : Number(dailyCap);
    const badDays = !isValidDays(daysNum);
    const badCap = capNum !== undefined && !isValidDailyCap(capNum);
    setDaysError(badDays ? DAYS_ERROR : null);
    setCapError(badCap ? CAP_ERROR : null);
    if (badDays || badCap) return;
    if (!startDate) {
      setError("Hãy chọn ngày bắt đầu.");
      return;
    }
    if (source === "file" && !file) {
      setError("Hãy chọn tệp cần bóc tách.");
      return;
    }
    if (source === "text" && !text.trim()) {
      setError("Hãy dán văn bản tiếng Nhật.");
      return;
    }
    setError(null);
    setSaving(true);
    onSavingChange(true);
    try {
      saveOptions(options);
      const trimmedTitle = title.trim();
      const path = await createLearningPath({
        ...(source === "file" ? { file: file ?? undefined } : { text: text.trim() }),
        days: daysNum,
        title: trimmedTitle || undefined,
        startDate,
        dailyCap: capNum,
        studyDays,
        options,
      });
      // Đóng modal trước khi chuyển trang: mở từ /roadmap/:id (Tạo lại) thì trang không unmount, modal sẽ còn mở.
      onSavingChange(false);
      onDone();
      navigate(`/roadmap/${encodeURIComponent(path.id)}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {error}
        </p>
      )}

      <SourceFields
        source={source}
        onSourceChange={setSource}
        file={file}
        onFileChange={(f) => {
          setError(null);
          setFile(f);
        }}
        text={text}
        onTextChange={setText}
        onError={setError}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          id={daysId}
          label="Số ngày học"
          type="number"
          inputMode="numeric"
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setDaysError(null);
          }}
          error={daysError ?? undefined}
          helperText="Bản nháp sẽ gợi ý số ngày phù hợp với số thẻ."
        />
        <Input
          id={startId}
          label="Ngày bắt đầu"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setError(null);
          }}
          helperText="Mặc định hôm nay; đổi được ở bản nháp."
        />
        <Input
          id={titleId}
          label="Tên lộ trình (tuỳ chọn)"
          type="text"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mặc định: tên tệp hoặc ngày tạo"
        />
      </div>

      <details className="group">
        <summary className="cursor-pointer select-none text-label-md font-semibold text-primary">Tuỳ chọn nâng cao</summary>
        <div className="mt-3 space-y-3">
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/40 space-y-3">
            <div className="font-label-md text-label-md text-on-surface font-semibold">Lịch học</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <Input
                id={capId}
                label="Trần thẻ mỗi ngày"
                type="number"
                inputMode="numeric"
                min={MIN_DAILY_CAP}
                max={MAX_DAILY_CAP}
                step={1}
                value={dailyCap}
                placeholder="Mặc định hệ thống"
                onChange={(e) => {
                  setDailyCap(e.target.value);
                  setCapError(null);
                }}
                error={capError ?? undefined}
                helperText="Thẻ mới + thẻ ôn dự báo mỗi ngày không vượt quá mức này. Để trống để dùng mặc định; đổi được ở bản nháp."
              />
              <StudyDaysToggles mask={studyDays} onChange={setStudyDays} disabled={saving} />
            </div>
          </div>
          <ExtractionOptionsFields options={options} onChange={set} file={source === "file" ? file : null} />
        </div>
      </details>
    </form>
  );
};
