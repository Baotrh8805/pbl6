import React from "react";
import { splitContent } from "@/lib/cardContent";

interface CardContentProps {
  text: string;
  /** Kiểu cho dòng chính (định nghĩa). */
  headClassName: string;
  /** Kiểu cho phần còn lại (định nghĩa phụ, ví dụ, ghi chú): nhỏ và nhạt hơn dòng chính. */
  restClassName?: string;
}

// Nội dung thẻ: dòng đầu nổi bật, các dòng sau giữ nguyên xuống dòng nhưng nhỏ hơn.
export const CardContent: React.FC<CardContentProps> = ({
  text,
  headClassName,
  restClassName = "text-sm font-normal text-on-surface-variant mt-1.5",
}) => {
  const { head, rest } = splitContent(text);
  return (
    <>
      <span className={`block whitespace-pre-line ${headClassName}`}>{head}</span>
      {rest && (
        <span lang="ja" className={`block whitespace-pre-line ${restClassName}`}>
          {rest}
        </span>
      )}
    </>
  );
};
