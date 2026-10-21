import React, { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/formStyles";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchLearningPathText } from "@/services/learningPathService";
import { TEXT_MAX_CHARS } from "@/features/extraction/extractionUtils";

interface PathSourceTextPanelProps {
  pathId: string;
  /** Gửi văn bản đã sửa (PUT /text) để dựng lại bản nháp; nơi gọi hỏi xác nhận và lo polling. */
  onReanalyze: (text: string) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}

/**
 * Ô sửa văn bản gốc của lộ trình (spec 21/10): hiện khi OCR hạ cấp vì Gemini quá tải. Tải văn bản khi mở (GET /text);
 * "Phân tích lại" chỉ bật khi đã sửa và còn chữ. Tách khỏi ExtractedTextPanel của trang Bóc tách vì panel đó gắn với
 * kiểu ExtractionJob (lowLines, meta OCR) mà lộ trình không trả.
 */
export const PathSourceTextPanel: React.FC<PathSourceTextPanelProps> = ({ pathId, onReanalyze, onClose, disabled }) => {
  const textId = useId();
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLearningPathText(pathId)
      .then((t) => {
        if (!alive) return;
        setOriginal(t);
        setText(t);
      })
      .catch((e) => {
        if (alive) setLoadError(extractErrorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [pathId]);

  const dirty = original !== null && text !== original;
  const tooLong = text.length > TEXT_MAX_CHARS;

  const handleReanalyze = async () => {
    if (!text.trim() || !dirty || tooLong || busy) return;
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
        <div className="min-w-0">
          <label htmlFor={textId} className="text-title-sm text-on-surface font-semibold block">
            Văn bản gốc đã trích
          </label>
          <p className="text-label-sm text-on-surface-variant">
            Sửa chữ OCR sai rồi bấm "Phân tích lại": bản nháp chương sẽ được dựng lại từ văn bản mới (không tốn lượt).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Đóng
        </Button>
      </div>
      {loadError ? (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm break-words">
          {loadError}
        </p>
      ) : (
        <textarea
          id={textId}
          className={`${fieldClass} min-h-[16rem] font-mono text-body-sm leading-relaxed`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={original === null || busy || disabled}
          spellCheck={false}
          lang="ja"
        />
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-label-sm ${tooLong ? "text-error" : "text-on-surface-variant"}`}>
          {text.length.toLocaleString("vi-VN")}/{TEXT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleReanalyze()}
          isLoading={busy}
          disabled={!dirty || !text.trim() || tooLong || busy || disabled || original === null}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">replay</span>
          Phân tích lại
        </Button>
      </div>
    </section>
  );
};
