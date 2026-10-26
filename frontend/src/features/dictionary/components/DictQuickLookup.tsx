import React, { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchDictEntry, searchDictionary, tokenizeForDictionary } from "@/services/dictionaryService";
import type { DictEntry, DictKey, DictToken } from "@/types/dictionary.types";
import { headOf, primaryMeaning } from "../dictUtils";

/**
 * Tra nhanh (D25, spec §7.3): popover nhỏ cho một từ — từ, cách đọc, Hán-Việt, nghĩa, nút "Mở trong từ điển". Dùng ở câu ví dụ
 * (bấm từng từ sau khi tách câu) và ở màn học (nút "Tra từ điển" cạnh thuật ngữ). Esc / bấm ngoài để đóng; màn hẹp hiện dạng
 * bảng dưới đáy.
 */
export const DictPopover: React.FC<{
  entryKey?: DictKey | null;
  term?: string;
  onClose: () => void;
  onOpen?: (key: DictKey) => void;
}> = ({ entryKey, term, onClose, onOpen }) => {
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let key = entryKey ?? null;
        if (!key && term) {
          const res = await searchDictionary(term, "ja", 0, 1);
          key = res.items[0]?.key ?? null;
        }
        if (!key) throw new Error("Không tìm thấy từ này trong từ điển.");
        const e = await fetchDictEntry(key, term);
        if (alive) setEntry(e);
      } catch (err) {
        if (alive) setError(err instanceof Error && !("isAxiosError" in err) ? err.message : extractErrorMessage(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [entryKey, term]);

  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const head = entry ? headOf(entry) : null;
  const meaning = entry ? primaryMeaning(entry) : null;
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Tra nhanh từ điển"
      tabIndex={-1}
      className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 rounded-t-2xl sm:rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-xl p-4 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {head ? (
            <>
              <p lang="ja" className="text-headline-sm font-bold text-on-surface break-words">{head.main}</p>
              {head.reading && <p lang="ja" className="text-body-sm text-on-surface-variant">{head.reading}</p>}
            </>
          ) : (
            <p className="text-body-sm text-on-surface-variant">{error ?? "Đang tra…"}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg hover:bg-surface-container">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      {entry && (
        <div className="mt-2 flex flex-col gap-1.5 text-body-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            {entry.hanViet && <span className="font-semibold text-tertiary tracking-wide">{entry.hanViet}</span>}
            {entry.jlpt && <span className="px-1.5 rounded bg-primary/10 text-primary font-semibold">{entry.jlpt}</span>}
          </div>
          {meaning && <p lang={meaning.lang} className="text-on-surface">{meaning.text}</p>}
          {onOpen && (
            <button type="button" onClick={() => onOpen(entry.key)} className="self-start mt-1 text-primary font-semibold text-label-md hover:underline">
              Mở trong từ điển →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** Câu tiếng Nhật: bấm "Tra từng từ" → tách câu, mỗi từ có mục từ điển thành nút mở popover tra nhanh. */
export const TokenizedSentence: React.FC<{ text: string; onOpen: (key: DictKey) => void }> = ({ text, onOpen }) => {
  const [tokens, setTokens] = useState<DictToken[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popKey, setPopKey] = useState<DictKey | null>(null);

  const split = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setTokens(await tokenizeForDictionary(text));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline">
      {tokens ? (
        <span lang="ja">
          {tokens.map((t, i) =>
            t.key ? (
              <button
                key={i}
                type="button"
                onClick={() => setPopKey(t.key)}
                className="underline decoration-dotted decoration-primary/50 underline-offset-4 hover:bg-primary/10 rounded"
              >
                {t.surface}
              </button>
            ) : (
              <React.Fragment key={i}>{t.surface}</React.Fragment>
            )
          )}
        </span>
      ) : (
        <span lang="ja">{text}</span>
      )}
      {!tokens && (
        <button
          type="button"
          onClick={() => void split()}
          disabled={busy}
          aria-label="Tra từng từ trong câu"
          title="Tra từng từ trong câu"
          className="ml-1 align-middle inline-flex p-0.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{busy ? "hourglass_top" : "manage_search"}</span>
        </button>
      )}
      {error && <span role="alert" className="ml-1 text-xs text-error">{error}</span>}
      {popKey && <DictPopover entryKey={popKey} onClose={() => setPopKey(null)} onOpen={(k) => { setPopKey(null); onOpen(k); }} />}
    </span>
  );
};
