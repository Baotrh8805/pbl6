// Phần hiển thị dùng chung của panel sơ đồ chữ Hán (KanjiDiagramPanel, WordAnalysisPanel): nghĩa Việt trước rồi nghĩa Anh,
// đường dẫn sang từ điển. Tách khỏi file component để Fast Refresh không phàn nàn về export không phải component.
import type React from "react";

export const kanjiHref = (ch: string) => `/dictionary?tab=kanji&k=${encodeURIComponent(ch)}`;
export const wordHref = (key: string | null, term: string) =>
  key ? `/dictionary?e=${encodeURIComponent(key)}` : `/dictionary?q=${encodeURIComponent(term)}`;

export const meaningOf = (x: { meaningVi?: string | null; meaningEn?: string | null }): React.ReactNode =>
  x.meaningVi ? (
    <span className="text-on-surface">{x.meaningVi}</span>
  ) : x.meaningEn ? (
    <span className="text-on-surface-variant" title="Chưa có nghĩa tiếng Việt, hiện nghĩa tiếng Anh">
      {x.meaningEn}
    </span>
  ) : (
    <span className="text-outline">Chưa có nghĩa</span>
  );
