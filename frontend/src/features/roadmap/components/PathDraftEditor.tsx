import React, { useState } from "react";
import type { LearningPath, LearningPathPatch } from "@/types/api.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MAX_DAYS, MIN_DAYS, isValidDays } from "@/features/roadmap/roadmapUtils";
import { ChapterDraftCard } from "./ChapterDraftCard";

interface PathDraftEditorProps {
  path: LearningPath;
  /** Chỉ bật khi đang kích hoạt; lưu khi blur không khoá ô nhập (server là nguồn đúng, tải lại sau mỗi lần lưu). */
  activating: boolean;
  error: string | null;
  onPatchPath: (patch: LearningPathPatch) => void;
  onRenameChapter: (cid: string, title: string) => void;
  onMergeUp: (cid: string) => Promise<void>;
  onItemsPatched: () => void;
  /** Nhận giá trị đang gõ để tự lưu nốt trước khi kích hoạt (blur-commit có thể chưa xong). */
  onActivate: (values: { title: string; startDate: string; totalDays: number }) => void;
}

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

export const PathDraftEditor: React.FC<PathDraftEditorProps> = ({
  path,
  activating,
  error,
  onPatchPath,
  onRenameChapter,
  onMergeUp,
  onItemsPatched,
  onActivate,
}) => {
  // Giá trị đang gõ; đồng bộ lại khi server trả về bản mới (src khác).
  const src = `${path.title}|${path.totalDays}|${path.startDate}`;
  const [form, setForm] = useState({ src, title: path.title, days: String(path.totalDays), start: path.startDate });
  if (form.src !== src) setForm({ src, title: path.title, days: String(path.totalDays), start: path.startDate });
  const reset = (field: "title" | "days" | "start") =>
    setForm((f) => ({
      ...f,
      [field]: field === "title" ? path.title : field === "days" ? String(path.totalDays) : path.startDate,
    }));

  const commitTitle = () => {
    const next = form.title.trim();
    if (!next) reset("title");
    else if (next !== path.title) onPatchPath({ title: next });
  };
  const commitDays = () => {
    const n = Number(form.days);
    if (!isValidDays(n)) reset("days");
    else if (n !== path.totalDays) onPatchPath({ totalDays: n });
  };
  const commitStart = () => {
    if (!form.start) reset("start");
    else if (form.start !== path.startDate) onPatchPath({ startDate: form.start });
  };

  const chapters = path.chapters ?? [];

  const skipped = path.job?.stats?.skippedSections ?? [];
  const totalCards = chapters.reduce((s, c) => s + c.cardCount, 0);
  const perDay = Math.ceil(totalCards / Math.max(path.totalDays, 1));
  const daysNum = Number(form.days);

  const activate = () =>
    onActivate({
      title: form.title.trim() || path.title,
      startDate: form.start || path.startDate,
      totalDays: isValidDays(daysNum) ? daysNum : path.totalDays,
    });

  return (
    <div className="flex flex-col gap-space-md">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm break-words">
          {error}
        </p>
      )}
      <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-space-sm">
        <Input
          label="Tên lộ trình"
          name="path-title"
          value={form.title}
          maxLength={100}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          onBlur={commitTitle}
          onKeyDown={blurOnEnter}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
          <Input
            label="Số ngày học"
            name="path-days"
            type="number"
            inputMode="numeric"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={form.days}
            onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
            onBlur={commitDays}
            onKeyDown={blurOnEnter}
            helperText={`Từ ${MIN_DAYS} đến ${MAX_DAYS} ngày`}
          />
          <Input
            label="Ngày bắt đầu"
            name="path-start"
            type="date"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            onBlur={commitStart}
            onKeyDown={blurOnEnter}
          />
        </div>
        <p className="text-body-sm text-on-surface-variant flex items-start gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">info</span>
          <span>
            {path.chaptersDetected
              ? `Đã nhận dạng ${chapters.length} chương theo cấu trúc tài liệu.`
              : "Không nhận ra chương trong tài liệu, đã chia theo ngày."}
            {skipped.length > 0 && ` Đã bỏ qua: ${skipped.join(", ")}.`}
          </span>
        </p>
      </div>

      {chapters.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Bản nháp chưa có chương nào.</p>
      ) : (
        <ol className="flex flex-col gap-space-sm">
          {chapters.map((ch, i) => (
            <ChapterDraftCard
              key={ch.id}
              pathId={path.id}
              chapter={ch}
              index={i}
              canMergeUp={i > 0}
              activating={activating}
              onRename={onRenameChapter}
              onMergeUp={onMergeUp}
              onItemsPatched={onItemsPatched}
            />
          ))}
        </ol>
      )}

      {/* Dính đáy khung nhìn khi cuộn; nằm cuối luồng nên không che chương cuối. */}
      <div className="sticky bottom-3 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-md border border-surface-container-high shadow-lg">
        <p className="min-w-0 text-label-md text-on-surface">
          {chapters.length} chương · {totalCards} thẻ · ~{perDay} thẻ/ngày
        </p>
        <Button size="md" onClick={activate} isLoading={activating} disabled={activating || totalCards === 0} className="shrink-0">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">rocket_launch</span>
          Tạo lộ trình
        </Button>
      </div>
    </div>
  );
};
