import React, { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/formStyles";
import type { ExtractionJob } from "@/types/api.types";
import { TEXT_MAX_CHARS, geminiReasonText, ocrDegradedNotice } from "../extractionUtils";

interface ExtractedTextPanelProps {
  job: ExtractionJob;
  /** Gửi văn bản đã sửa để chạy lại bước ANALYZE; nơi gọi lo polling. */
  onReanalyze: (text: string) => Promise<void>;
}

const Chip: React.FC<{ icon: string; children: React.ReactNode; title?: string }> = ({ icon, children, title }) => (
  <span
    title={title}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm"
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
      {icon}
    </span>
    {children}
  </span>
);

// Cột trái khi DONE: văn bản đã trích (sửa được) + meta OCR. Mount lại khi job đổi (key ở nơi gọi)
// nên useState lấy thẳng extractedText làm giá trị đầu.
export const ExtractedTextPanel: React.FC<ExtractedTextPanelProps> = ({ job, onReanalyze }) => {
  const textId = useId();
  const original = job.extractedText ?? "";
  const [text, setText] = useState(original);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const meta = job.textMeta;
  const dirty = text !== original;
  const lowLines = meta?.lowLines ?? [];
  // geminiError đã nói cùng ý (Gemini không chép lại được) thì không hiện thêm cảnh báo hạ cấp
  const degradedNotice = meta?.geminiError ? null : ocrDegradedNotice(meta);

  // Bấm một dòng nghi sai → bôi đen đúng dòng đó trong textarea để sửa ngay (dòng đã bị sửa thì không còn tìm thấy)
  const selectLine = (lineText: string) => {
    const el = textareaRef.current;
    const start = text.indexOf(lineText);
    if (!el || start < 0) return;
    el.focus();
    el.setSelectionRange(start, start + lineText.length);
    const lineNo = text.slice(0, start).split("\n").length - 1;
    el.scrollTop = Math.max(0, lineNo - 2) * (el.scrollHeight / Math.max(1, text.split("\n").length));
  };

  const handleReanalyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onReanalyze(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-title-md text-title-md font-bold text-on-surface">Văn bản đã trích</h2>
          <p className="text-label-sm text-outline mt-0.5">Sửa lỗi nhận dạng rồi phân tích lại, không cần tải lại tệp.</p>
        </div>
        {meta && (
          <div className="flex flex-wrap gap-1.5">
            <Chip icon="memory" title="Bộ nhận dạng">{meta.engine}</Chip>
            {meta.pages > 1 && <Chip icon="auto_stories">{meta.pages} trang</Chip>}
            {meta.meanConfidence != null && (
              <Chip icon="verified" title="Độ tin cậy OCR trung bình">
                {Math.round(meta.meanConfidence * 100)}%
              </Chip>
            )}
            {meta.isVertical && <Chip icon="swap_vert">Chữ dọc</Chip>}
            {meta.truncated && <Chip icon="content_cut" title={`Chỉ xử lý ${TEXT_MAX_CHARS.toLocaleString("vi-VN")} ký tự đầu`}>Đã cắt bớt</Chip>}
          </div>
        )}
      </div>

      {meta?.lowConfidence && (
        <p role="status" className="flex items-start gap-2 p-3 rounded-lg bg-tertiary-fixed/50 text-on-tertiary-fixed text-body-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">warning</span>
          <span>Độ tin cậy nhận dạng thấp. Hãy đối chiếu văn bản bên dưới với tài liệu gốc trước khi tạo bộ thẻ.</span>
        </p>
      )}

      {degradedNotice && (
        <p role="status" className="flex items-start gap-2 p-3 rounded-lg bg-tertiary-fixed/50 text-on-tertiary-fixed text-body-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">warning</span>
          <span>{degradedNotice}</span>
        </p>
      )}

      {meta?.geminiError && (
        <p role="status" className="flex items-start gap-2 p-3 rounded-lg bg-error/10 text-error text-body-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">cloud_off</span>
          <span>{geminiReasonText(meta.geminiError)} nên chưa chép lại được ảnh. Văn bản dưới đây là bản OCR thô, hãy sửa rồi phân tích lại.</span>
        </p>
      )}
      {job.stats?.enrichReason && (
        <p role="status" className="flex items-start gap-2 p-3 rounded-lg bg-error/10 text-error text-body-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">translate</span>
          <span>{geminiReasonText(job.stats.enrichReason)} nên chưa dịch được nghĩa tiếng Việt. Thẻ đang dùng nghĩa tiếng Anh.</span>
        </p>
      )}

      {lowLines.length > 0 && (
        <details className="rounded-lg bg-surface-container-low p-3 text-body-sm" open={lowLines.length <= 5}>
          <summary className="cursor-pointer text-on-surface-variant">
            {lowLines.length} dòng nhận dạng không chắc — bấm để xem và sửa
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {lowLines.map((ln, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectLine(ln.text)}
                  disabled={busy || !text.includes(ln.text)}
                  title={`Độ tin cậy ${Math.round(ln.conf * 100)}% — bấm để chọn dòng này trong ô văn bản`}
                  className="w-full text-left font-japanese px-2 py-1 rounded hover:bg-surface-container disabled:opacity-50 disabled:line-through"
                >
                  <span className="text-label-sm text-outline mr-2">{Math.round(ln.conf * 100)}%</span>
                  {ln.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <label htmlFor={textId} className="sr-only">
        Văn bản đã trích
      </label>
      <textarea
        ref={textareaRef}
        id={textId}
        lang="ja"
        value={text}
        maxLength={TEXT_MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={16}
        className={`${fieldClass} font-japanese leading-relaxed resize-y min-h-[14rem]`}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-label-sm text-outline">
          {text.length.toLocaleString("vi-VN")} / {TEXT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setText(original)} disabled={busy}>
              Hoàn tác
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleReanalyze} isLoading={busy} disabled={!text.trim()}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
            Phân tích lại
          </Button>
        </div>
      </div>
    </section>
  );
};
