import React from "react";
import { highlightSpans } from "@/lib/moderation";
import type { ModerationSpan } from "@/types/moderation.types";

/** Nội dung với từ bị PhoBERT đánh dấu tô đỏ (admin, chủ bình luận); không có từ nào → chữ thường. */
export const ModerationText: React.FC<{ content: string; spans: readonly ModerationSpan[]; className?: string }> = ({
  content,
  spans,
  className = "",
}) => {
  const segments = highlightSpans(content, spans);
  return (
    <p className={`whitespace-pre-line break-words ${className}`}>
      {segments.map((s, i) =>
        s.flagged ? (
          <mark
            key={i}
            title={s.score != null ? `Từ bị đánh dấu (${Math.round(s.score * 100)} %)` : "Từ bị đánh dấu"}
            className="rounded px-0.5 bg-error/15 text-error font-semibold"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        )
      )}
    </p>
  );
};
