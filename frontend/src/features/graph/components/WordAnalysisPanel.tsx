import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { LevelChip } from "@/features/hanviet/components/HanVietBits";
import { NODE_FILL } from "@/features/graph/diagramStyle";
import { toHanVietWord } from "@/features/graph/diagramWords";
import { kanjiHref, meaningOf, wordHref } from "@/features/graph/diagramText";
import type { HanVietWordNode } from "@/types/api.types";
import type { KanjiDiagramWordInfo } from "@/types/kanjiDiagram.types";

/**
 * Panel "Phân tích từ" (spec 30/10 từ nhiều chữ §5): thẻ từ (ruby, Hán-Việt, nghĩa Việt hoặc Anh, JLPT, thêm vào bộ thẻ, mở từ
 * điển) rồi mỗi chữ một khối gọn (Hán-Việt, nghĩa, công thức cấu tạo, "Xem cấu tạo").
 */
interface WordAnalysisPanelProps {
  word: KanjiDiagramWordInfo;
  onChar: (ch: string) => void;
  onAddWord?: (w: HanVietWordNode) => void;
}

export const WordAnalysisPanel: React.FC<WordAnalysisPanelProps> = ({ word, onChar, onAddWord }) => (
  <>
    <div className="flex items-start gap-3">
      <span
        lang="ja"
        className="font-japanese font-bold text-2xl px-3 min-h-12 rounded-full inline-flex items-center justify-center shrink-0 shadow-sm text-white"
        style={{ background: NODE_FILL.word }}
      >
        <Ruby term={word.term} reading={word.reading ?? undefined} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-title-md font-bold text-primary tracking-wide">{word.hanViet ?? "—"}</span>
          <LevelChip level={word.jlpt} />
        </div>
        <p className="text-body-md">{meaningOf(word)}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      {onAddWord && (
        <Button size="sm" variant="secondary" onClick={() => onAddWord(toHanVietWord(word))}>
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">playlist_add</span>
          Thêm vào bộ thẻ
        </Button>
      )}
      <Link
        to={wordHref(word.key, word.term)}
        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-outline-variant hover:border-primary text-on-surface bg-surface-container-lowest hover:bg-surface-container-low font-semibold"
      >
        Mở trong từ điển
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </Link>
    </div>

    <section className="flex flex-col gap-2">
      <h3 className="text-label-md font-bold text-on-surface">Các chữ trong từ ({word.chars.length})</h3>
      <ul className="flex flex-col gap-2">
        {word.chars.map((c) => (
          <li key={c.kanji} className="rounded-xl border border-surface-container-high p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span lang="ja" className="font-japanese text-2xl font-bold text-on-surface w-9 text-center">{c.kanji}</span>
              <span className="text-label-sm font-bold text-primary shrink-0">{c.hanViet ?? ""}</span>
              <span className="flex-1 min-w-0 text-body-sm truncate">{meaningOf(c)}</span>
              <LevelChip level={c.jlpt} className="shrink-0" />
            </div>
            <p lang="ja" className="font-japanese text-body-sm text-on-surface-variant">
              {c.formula.length === 0 ? (
                <span className="font-sans text-outline">Chữ đơn, không tách thành phần.</span>
              ) : (
                `${c.formula.map((f) => f.part).join(" + ")} = ${c.kanji}`
              )}
              {c.radical && <span className="font-sans text-outline"> · bộ {c.radical.char} {c.radical.nameVi}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onChar(c.kanji)}>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">account_tree</span>
                Xem cấu tạo
              </Button>
              <Link to={kanjiHref(c.kanji)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-outline-variant hover:border-primary text-on-surface font-semibold">
                Tra chữ này
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  </>
);
