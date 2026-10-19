import React, { useEffect, useState } from "react";
import type { LearningPath, LearningPathPatch } from "@/types/api.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { geminiReasonText } from "@/features/extraction/extractionUtils";
import {
  ALL_WEEK,
  DEFAULT_DAILY_CAP,
  MAX_DAILY_CAP,
  MAX_DAYS,
  MIN_DAILY_CAP,
  MIN_DAYS,
  canReEnrichPath,
  enrichCooldownLeft,
  formatCountdown,
  isValidDailyCap,
  isValidDays,
  isValidStudyDays,
  studyDaysLabel,
  suggestDaysLabel,
} from "@/features/roadmap/roadmapUtils";
import { ChapterDraftCard } from "./ChapterDraftCard";
import { RecheckPathConflictsButton } from "./RecheckPathConflictsButton";
import { StudyDaysToggles } from "./StudyDaysToggles";

/** Giá trị đang gõ gửi kèm khi kích hoạt (blur-commit có thể chưa xong). */
export interface ActivateValues {
  title: string;
  startDate: string;
  totalDays: number;
  dailyCap: number;
  studyDays: string;
}

interface PathDraftEditorProps {
  path: LearningPath;
  /** Chỉ bật khi đang kích hoạt; lưu khi blur không khoá ô nhập (server là nguồn đúng, tải lại sau mỗi lần lưu). */
  activating: boolean;
  error: string | null;
  onPatchPath: (patch: LearningPathPatch) => void;
  onRenameChapter: (cid: string, title: string) => void;
  onMergeUp: (cid: string) => Promise<void>;
  onItemsPatched: () => void;
  onActivate: (values: ActivateValues) => void;
  /** "Dịch lại nghĩa" (POST /enrich) khi Gemini hết hạn mức / lỗi ở bước dịch. */
  onEnrich: () => void;
  enriching: boolean;
}

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

/**
 * Ô lưu-khi-blur tách riêng từng trường (LP-12): mỗi ô nhớ giá trị server lần nó thấy (`src`), chỉ reset ô đó khi server
 * trả giá trị khác — lưu ô này không xoá chữ đang gõ ở ô kia.
 */
function useField(server: string) {
  const [f, setF] = useState({ src: server, value: server });
  if (f.src !== server) setF({ src: server, value: server });
  const set = (value: string) => setF({ src: server, value });
  const reset = () => setF({ src: server, value: server });
  return { value: f.value, set, reset };
}

export const PathDraftEditor: React.FC<PathDraftEditorProps> = ({
  path,
  activating,
  error,
  onPatchPath,
  onRenameChapter,
  onMergeUp,
  onItemsPatched,
  onActivate,
  onEnrich,
  enriching,
}) => {
  const serverCap = path.dailyCap ?? DEFAULT_DAILY_CAP;
  const serverMask = path.studyDays ?? ALL_WEEK;
  const title = useField(path.title);
  const days = useField(String(path.totalDays));
  const start = useField(path.startDate);
  const cap = useField(String(serverCap));
  const mask = useField(serverMask);

  const commitTitle = () => {
    const next = title.value.trim();
    if (!next) title.reset();
    else if (next !== path.title) onPatchPath({ title: next });
  };
  const commitDays = () => {
    const n = Number(days.value);
    if (!isValidDays(n)) days.reset();
    else if (n !== path.totalDays) onPatchPath({ totalDays: n });
  };
  const commitStart = () => {
    if (!start.value) start.reset();
    else if (start.value !== path.startDate) onPatchPath({ startDate: start.value });
  };
  const commitCap = () => {
    const n = Number(cap.value);
    if (!isValidDailyCap(n)) cap.reset();
    else if (n !== serverCap) onPatchPath({ dailyCap: n });
  };
  // Bật/tắt ngày học lưu ngay (không có blur); giữ bản cục bộ để nút đổi màu tức thì trong lúc chờ server.
  const toggleMask = (next: string) => {
    mask.set(next);
    if (isValidStudyDays(next) && next !== serverMask) onPatchPath({ studyDays: next });
  };

  const chapters = path.chapters ?? [];
  const skipped = path.job?.stats?.skippedSections ?? [];
  const totalCards = chapters.reduce((s, c) => s + c.cardCount, 0);
  const perDay = Math.ceil(totalCards / Math.max(path.totalDays, 1));
  const daysNum = Number(days.value);
  const capNum = Number(cap.value);
  const suggested = path.suggestedDays != null && path.suggestedDays > 0 ? path.suggestedDays : null;
  const showSuggest = suggested !== null && suggested !== path.totalDays;

  // Dịch lại nghĩa: server chặn 5 phút kể từ `job.stats.enrichedAt` (429) và chỉ khi có mốc đó, nên đếm ngược duy nhất
  // theo mốc server (worker ghi mốc ngay khi nhận việc; trang tải lại sau mỗi lỗi). Chỉ tick khi còn phải chờ để không
  // render lại cả trang mỗi giây vô ích.
  const canEnrich = canReEnrichPath(path.job);
  const enrichedAt = path.job?.stats?.enrichedAt;
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    if (!canEnrich) return;
    const update = () => {
      const ms = enrichCooldownLeft(enrichedAt, Date.now());
      setCooldownLeft(ms);
      return ms;
    };
    if (update() <= 0) return;
    const timer = window.setInterval(() => {
      if (update() <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [canEnrich, enrichedAt]);
  const jobRunning = path.job?.status === "QUEUED" || path.job?.status === "RUNNING";
  // F2: mỗi lần "Kiểm tra lại mâu thuẫn" đổi reloadKey để chương đang mở tải lại `conflicts` của từng mục.
  const [recheckCount, setRecheckCount] = useState(0);

  const activate = () =>
    onActivate({
      title: title.value.trim() || path.title,
      startDate: start.value || path.startDate,
      totalDays: isValidDays(daysNum) ? daysNum : path.totalDays,
      dailyCap: isValidDailyCap(capNum) ? capNum : serverCap,
      studyDays: isValidStudyDays(mask.value) ? mask.value : serverMask,
    });

  return (
    <div className="flex flex-col gap-space-md">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm break-words">
          {error}
        </p>
      )}

      {jobRunning && (
        <p role="status" className="p-3 rounded-lg bg-primary-fixed text-on-primary-fixed text-body-sm flex items-center gap-2">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0" />
          Đang dịch lại nghĩa tiếng Việt cho các thẻ còn thiếu… Danh sách thẻ sẽ tự cập nhật khi xong.
        </p>
      )}

      {canEnrich && !jobRunning && (
        <div className="p-3 rounded-lg bg-[#FEF3C7] border border-[#F59E0B]/40 text-[#92400E] text-body-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="flex items-start gap-1.5 min-w-0">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">translate</span>
            <span>
              {geminiReasonText(path.job?.stats?.enrichReason ?? "error")} nên chưa dịch được nghĩa tiếng Việt; thẻ đang dùng nghĩa
              tiếng Anh. Bạn có thể dịch lại bây giờ hoặc sau khi kích hoạt.
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onEnrich}
            isLoading={enriching}
            disabled={enriching || cooldownLeft > 0 || activating}
            className="shrink-0"
          >
            {cooldownLeft > 0 ? `Thử lại sau ${formatCountdown(cooldownLeft)}` : "Dịch lại nghĩa"}
          </Button>
        </div>
      )}

      <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-space-sm">
        <Input
          label="Tên lộ trình"
          name="path-title"
          value={title.value}
          maxLength={100}
          onChange={(e) => title.set(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={blurOnEnter}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
          <Input
            label="Số ngày học"
            name="path-days"
            type="number"
            inputMode="numeric"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={days.value}
            onChange={(e) => days.set(e.target.value)}
            onBlur={commitDays}
            onKeyDown={blurOnEnter}
            helperText={`Từ ${MIN_DAYS} đến ${MAX_DAYS} ngày`}
          />
          <Input
            label="Ngày bắt đầu"
            name="path-start"
            type="date"
            value={start.value}
            onChange={(e) => start.set(e.target.value)}
            onBlur={commitStart}
            onKeyDown={blurOnEnter}
          />
          <Input
            label="Trần thẻ mỗi ngày"
            name="path-cap"
            type="number"
            inputMode="numeric"
            min={MIN_DAILY_CAP}
            max={MAX_DAILY_CAP}
            value={cap.value}
            onChange={(e) => cap.set(e.target.value)}
            onBlur={commitCap}
            onKeyDown={blurOnEnter}
            helperText={`Mới + ôn dự báo, ${MIN_DAILY_CAP}–${MAX_DAILY_CAP}`}
          />
        </div>

        <StudyDaysToggles mask={mask.value} onChange={toggleMask} disabled={activating} />

        {showSuggest && (
          <p className="text-body-sm text-on-surface flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">lightbulb</span>
            <span>{suggestDaysLabel(suggested, totalCards)} với trần {serverCap} thẻ.</span>
            <button
              type="button"
              disabled={activating}
              onClick={() => {
                days.set(String(suggested));
                onPatchPath({ totalDays: suggested });
              }}
              className="px-2.5 py-1 rounded-lg text-label-md font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
            >
              Áp dụng
            </button>
          </p>
        )}
        {path.overCap && (
          <p role="alert" className="text-body-sm text-error flex items-start gap-1.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">warning</span>
            <span>
              Với {path.totalDays} ngày và trần {serverCap} thẻ/ngày, lịch sẽ vượt trần ở một số ngày. Hãy tăng số ngày
              {suggested ? ` (gợi ý ${suggested})` : ""} hoặc nâng trần.
            </span>
          </p>
        )}

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

      {chapters.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-body-sm text-on-surface-variant">
            Đối chiếu lại các mục với nguồn tri thức chuẩn mới nhất (mục mâu thuẫn được đánh dấu trong từng chương).
          </p>
          {/* Lộ trình server trả về bỏ qua: tải lại qua onItemsPatched như mọi thao tác sửa mục để trang giữ một nguồn đúng */}
          <RecheckPathConflictsButton
            pathId={path.id}
            disabled={activating}
            onUpdated={() => {
              setRecheckCount((c) => c + 1);
              onItemsPatched();
            }}
          />
        </div>
      )}

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
              reloadKey={`${path.job?.status ?? ""}|${enrichedAt ?? ""}|${recheckCount}`}
            />
          ))}
        </ol>
      )}

      {/* Dính đáy khung nhìn khi cuộn; nằm cuối luồng nên không che chương cuối. */}
      <div className="sticky bottom-3 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-md border border-surface-container-high shadow-lg">
        <p className="min-w-0 text-label-md text-on-surface">
          {chapters.length} chương · {totalCards} thẻ · ~{perDay} thẻ mới/ngày · {studyDaysLabel(serverMask)}
        </p>
        <Button size="md" onClick={activate} isLoading={activating} disabled={activating || totalCards === 0} className="shrink-0">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">rocket_launch</span>
          Tạo lộ trình
        </Button>
      </div>
    </div>
  );
};
