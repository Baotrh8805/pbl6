import React from "react";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak } from "@/lib/speech";
import { isKanjiNode, isWordNode, wordNodesOf, type KanjiEntry } from "@/lib/hanVietUtils";
import type { HanVietGraph, HanVietKanjiNode, HanVietWordNode } from "@/types/api.types";
import { LevelChip, WordActions } from "./HanVietBits";

interface HanVietNodePanelProps {
  graph: HanVietGraph;
  kanji: KanjiEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddWord: (word: HanVietWordNode) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2 text-body-sm">
    <dt className="w-16 shrink-0 text-outline">{label}</dt>
    <dd className="min-w-0 text-on-surface">{children}</dd>
  </div>
);

const wordButtonClass =
  "w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer";

const KanjiDetail: React.FC<{ entry: KanjiEntry; onSelect: (id: string) => void }> = ({ entry, onSelect }) => {
  const k = entry.node;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span lang="ja" className="text-5xl font-bold font-japanese text-on-surface leading-none">
          {k.label}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-tertiary tracking-wide">{k.hanViet}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <LevelChip level={k.level} />
            <span className="text-label-sm text-outline">{entry.wordCount} từ ghép</span>
          </div>
        </div>
      </div>
      <dl className="flex flex-col gap-1">
        <Row label="Âm On">
          <span lang="ja" className="font-japanese">
            {k.on.length ? k.on.join("、") : "—"}
          </span>
        </Row>
        <Row label="Âm Kun">
          <span lang="ja" className="font-japanese">
            {k.kun.length ? k.kun.join("、") : "—"}
          </span>
        </Row>
        <Row label="Số nét">{k.strokes ?? "—"}</Row>
        <Row label="Bộ thủ">
          {k.radical ? (
            <span lang="ja" className="font-japanese">
              {k.radical}
            </span>
          ) : (
            "—"
          )}
        </Row>
      </dl>
      {entry.words.length > 0 && (
        <div>
          <h3 className="text-label-sm font-semibold uppercase tracking-wider text-outline mb-1">Từ ghép</h3>
          <ul className="flex flex-col max-h-64 overflow-y-auto -mx-1">
            {entry.words.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onSelect(w.id)} className={wordButtonClass}>
                  <span lang="ja" className="font-japanese font-semibold text-on-surface">
                    {w.label}
                  </span>
                  {w.reading && (
                    <span lang="ja" className="ml-1.5 text-label-sm text-on-surface-variant">
                      {w.reading}
                    </span>
                  )}
                  {w.meaning && <span className="block text-body-sm text-on-surface-variant truncate">{w.meaning}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const WordDetail: React.FC<{
  word: HanVietWordNode;
  kanjiOfWord: HanVietKanjiNode[];
  onSelect: (id: string) => void;
  onAddWord: (word: HanVietWordNode) => void;
}> = ({ word, kanjiOfWord, onSelect, onAddWord }) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-headline-md font-bold font-japanese text-on-surface">
          <Ruby term={word.label} reading={word.reading || undefined} />
        </p>
        {word.hanViet && <p className="font-semibold text-tertiary tracking-wide text-label-md mt-1">{word.hanViet}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <LevelChip level={word.level} />
        {canSpeak && (
          <button
            type="button"
            onClick={() => speak(word.label)}
            aria-label={`Phát âm ${word.label}`}
            title="Nghe phát âm"
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              volume_up
            </span>
          </button>
        )}
      </div>
    </div>
    <p className="text-body-md text-on-surface">{word.meaning || <span className="text-outline">Chưa có nghĩa</span>}</p>
    {kanjiOfWord.length > 0 && (
      <div className="flex items-center gap-1.5 flex-wrap text-label-sm text-on-surface-variant">
        <span>Chữ trong mạng lưới:</span>
        {kanjiOfWord.map((k) => (
          <button
            key={k.id}
            type="button"
            lang="ja"
            onClick={() => onSelect(k.id)}
            title={`Xem chữ ${k.label}`}
            className="px-2 py-0.5 rounded-md bg-surface-container-low font-japanese font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            {k.label}
          </button>
        ))}
      </div>
    )}
    <WordActions word={word} onAdd={onAddWord} />
  </div>
);

// Cột phải: chi tiết nút đang chọn (âm / chữ Hán / từ ghép). aria-live để trình đọc màn hình biết nội dung đổi
// khi bấm nút trên SVG.
export const HanVietNodePanel: React.FC<HanVietNodePanelProps> = ({ graph, kanji, selectedId, onSelect, onAddWord }) => {
  const node = selectedId ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null;
  const words = wordNodesOf(graph);

  let body: React.ReactNode;
  if (!node) {
    body = (
      <p className="text-body-sm text-on-surface-variant">
        Chọn một nút trên mạng lưới: chữ Hán để lọc từ của nó, từ ghép để xem nghĩa và thêm vào bộ thẻ.
      </p>
    );
  } else if (isKanjiNode(node)) {
    const entry = kanji.find((k) => k.node.id === node.id) ?? { node, words: [], wordCount: 0 };
    body = <KanjiDetail entry={entry} onSelect={onSelect} />;
  } else if (isWordNode(node)) {
    const kanjiOfWord = kanji.filter((k) => k.words.some((w) => w.id === node.id)).map((k) => k.node);
    body = <WordDetail word={node} kanjiOfWord={kanjiOfWord} onSelect={onSelect} onAddWord={onAddWord} />;
  } else {
    body = (
      <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
        <p className="text-headline-sm font-bold text-on-surface">Âm {node.label}</p>
        <p>
          {kanji.length} chữ Hán · {words.length} từ ghép. Bấm một chữ Hán để chỉ hiện từ của chữ đó; bấm một từ để xem
          nghĩa, tìm bộ thẻ hoặc thêm vào bộ thẻ của bạn.
        </p>
      </div>
    );
  }

  return (
    <aside
      aria-live="polite"
      aria-label="Chi tiết nút đang chọn"
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high lg:sticky lg:top-20 self-start w-full"
    >
      {body}
    </aside>
  );
};
