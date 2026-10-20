import React from "react";
import { Link } from "react-router-dom";
import { DECK_PATH_NOTICE, type DeckPathLink } from "../roadmapUtils";

/**
 * Dải nhắc LP-15 ở trang sửa / thêm thẻ / chi tiết bộ thẻ: lịch lộ trình chốt theo id thẻ lúc kích hoạt, nên người học cần biết
 * trước khi thêm (thẻ mới không vào lịch) hay xoá thẻ (thẻ rời lịch). Chỉ là lời nhắc, không chặn sửa.
 */
export const DeckPathNotice: React.FC<{ link: DeckPathLink; className?: string }> = ({ link, className = "" }) => (
  <p
    role="note"
    className={`p-3 rounded-xl bg-surface-container-low border border-surface-container-high text-on-surface-variant text-body-sm flex items-start gap-2 ${className}`}
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0 text-primary">alt_route</span>
    <span className="min-w-0 break-words">
      Bộ thẻ này thuộc lộ trình{" "}
      <Link
        to={`/roadmap/${encodeURIComponent(link.pathId)}`}
        className="font-semibold text-primary hover:underline"
      >
        «{link.pathTitle}»
      </Link>
      . {DECK_PATH_NOTICE}
    </span>
  </p>
);
