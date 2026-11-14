import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DictKey, DictTranslateDirection } from "@/types/dictionary.types";
import { TRANSLATE_MAX_CHARS, detectTranslateDirection, looksLikeSentence, translateDirectionLabel } from "../dictUtils";
import { SentenceResults } from "./SentencesTab";
import { TranslateDirectionPicker, TranslationPanel } from "./TranslateTab";

/** Cụm tìm câu ví dụ: kho câu chỉ nhận ≤ 64 ký tự, dài hơn thì không tìm (đó là câu cần dịch, không phải cụm). */
const SEARCH_MAX = 64;
const searchOf = (text: string): string => {
  const t = text.trim();
  return t.length <= SEARCH_MAX ? t : "";
};

// Tab Câu & Dịch (gộp tab Câu + Dịch 31/10): một ô nhập, hai phần kết quả.
// - Câu ví dụ (Tatoeba, miễn phí): tìm ngay khi gõ, debounce 350 ms → ?s=…
// - Dịch HY-MT local: chỉ khi bấm Dịch / Ctrl+Enter → ?t=…&dir=… ; bản dịch nằm trên, câu ví dụ dưới.
// Ô nhập chỉ nhận lại giá trị từ URL khi chính tham số đó đổi từ bên ngoài (Back, link cũ ?tab=translate&t=…), không phải do mình đẩy.
export const SentenceTranslateTab: React.FC<{
  search: string;
  text: string;
  direction: DictTranslateDirection;
  onSearch: (s: string) => void;
  onTranslate: (text: string, direction: DictTranslateDirection) => void;
  onOpen: (key: DictKey) => void;
}> = ({ search, text, direction, onSearch, onTranslate, onOpen }) => {
  const [input, setInput] = useState(text || search);
  const [prevText, setPrevText] = useState(text);
  const [prevSearch, setPrevSearch] = useState(search);
  if (text !== prevText) {
    setPrevText(text);
    if (text && text !== input.trim()) setInput(text);
  } else if (search !== prevSearch) {
    setPrevSearch(search);
    if (search !== searchOf(input)) setInput(search);
  }
  const [dir, setDir] = useState<DictTranslateDirection>(direction);
  const [prevDir, setPrevDir] = useState(direction);
  if (direction !== prevDir) {
    setPrevDir(direction);
    setDir(direction);
  }
  const [attempt, setAttempt] = useState(0);

  // gõ xong 350 ms mới tìm câu ví dụ (và đẩy lên URL, thay mục lịch sử hiện tại)
  useEffect(() => {
    const target = searchOf(input);
    if (target === search) return;
    const t = setTimeout(() => onSearch(target), 350);
    return () => clearTimeout(t);
  }, [input, search, onSearch]);

  const trimmed = input.trim();
  const previewDir = dir === "auto" ? detectTranslateDirection(trimmed) : dir;
  const stale = !!text && trimmed !== text;

  const submit = () => {
    if (!trimmed) return;
    const next = trimmed.slice(0, TRANSLATE_MAX_CHARS);
    if (next === text && dir === direction) setAttempt((n) => n + 1); // cùng câu: bấm Dịch lại vẫn gửi lại (vd. sau BUSY / lỗi mạng)
    else onTranslate(next, dir);
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-colors"
      >
        <label htmlFor="dict-sentence-text" className="sr-only">
          Cụm từ để tìm câu ví dụ, hoặc câu / đoạn cần dịch
        </label>
        <textarea
          id="dict-sentence-text"
          value={input}
          rows={2}
          maxLength={TRANSLATE_MAX_CHARS}
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          aria-describedby="dict-sentence-hint"
          placeholder="食べた, ăn cơm… để xem câu ví dụ — hoặc dán cả câu rồi bấm Dịch"
          className="w-full bg-transparent px-1 py-1 text-body-md leading-relaxed focus:outline-none resize-y"
        />
        <div className="flex flex-wrap items-center gap-2">
          <TranslateDirectionPicker value={dir} onChange={setDir} />
          <span id="dict-sentence-hint" className="text-xs text-on-surface-variant mr-auto">
            {trimmed && dir === "auto" ? `${translateDirectionLabel(previewDir)} · ` : ""}
            {input.length}/{TRANSLATE_MAX_CHARS} · Ctrl + Enter để dịch
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={!trimmed}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">g_translate</span>
            Dịch
          </Button>
        </div>
      </form>

      {!trimmed && !text && (
        <div className="grid gap-3 sm:grid-cols-2 text-body-sm">
          <div className="rounded-2xl bg-surface-container-low p-4 flex gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">format_quote</span>
            <p className="text-on-surface-variant">
              <span className="font-semibold text-on-surface block">Gõ một cụm</span>
              (食べた, ご飯を, ăn cơm, eat…) để xem ngay các câu ví dụ có cụm đó, kèm bản dịch.
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4 flex gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">g_translate</span>
            <p className="text-on-surface-variant">
              <span className="font-semibold text-on-surface block">Dán cả câu rồi bấm Dịch</span>
              Model HY-MT dịch Nhật ↔ Việt từng câu, kèm phân tích từng cụm (cách đọc, JLPT, nghĩa từ điển).
            </p>
          </div>
        </div>
      )}

      {trimmed && !text && looksLikeSentence(trimmed) && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 text-body-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-primary">lightbulb</span>
          <span className="flex-1 min-w-0">Có vẻ đây là cả câu. Bấm Dịch để AI dịch và phân tích từng cụm.</span>
          <Button type="button" size="sm" variant="primary" onClick={submit}>Dịch câu này</Button>
        </div>
      )}

      {text && (
        <section aria-label="Bản dịch" className="flex flex-col gap-2">
          {stale && (
            <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">history</span>
              Bản dịch dưới đây là của câu trước.
              <button type="button" onClick={submit} disabled={!trimmed} className="font-semibold text-primary hover:underline">
                Dịch câu đang nhập
              </button>
            </p>
          )}
          <TranslationPanel text={text} direction={direction} attempt={attempt} onRetry={() => setAttempt((n) => n + 1)} onOpen={onOpen} />
        </section>
      )}

      <SentenceResults query={search} onOpen={onOpen} />
    </div>
  );
};
