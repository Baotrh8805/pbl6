import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCopyToClipboard } from "@/lib/clipboard";
import { canSpeak, speakJa } from "@/lib/speech";
import { extractErrorMessage } from "@/services/apiClient";
import { translateText } from "@/services/dictionaryService";
import type { DictKey, DictTranslateDirection, DictTranslateToken, DictTranslation } from "@/types/dictionary.types";
import { TRANSLATE_MAX_CHARS, detectTranslateDirection, tokenMeaning, translateDirectionLabel, translateStateNote } from "../dictUtils";
import { DictPopover } from "./DictQuickLookup";
import { ReportTranslationModal } from "./ReportTranslationModal";

const DIRECTIONS: { key: DictTranslateDirection; label: string }[] = [
  { key: "auto", label: "Tự nhận" },
  { key: "ja-vi", label: "Nhật → Việt" },
  { key: "vi-ja", label: "Việt → Nhật" },
];

const jlptChip = "text-[11px] px-1 rounded bg-primary/10 text-primary font-semibold";

/** Chữ Nhật có furigana theo run kanji (rubies từ ai-service); không có rubies thì chữ thường. */
const RubyText: React.FC<{ token: DictTranslateToken }> = ({ token }) => {
  if (!token.rubies) return <>{token.surface}</>;
  return (
    <>
      {token.rubies.map((r, i) =>
        r.reading ? (
          <ruby key={i}>
            {r.text}
            <rt className="text-[0.6em] text-on-surface-variant">{r.reading}</rt>
          </ruby>
        ) : (
          <React.Fragment key={i}>{r.text}</React.Fragment>
        )
      )}
    </>
  );
};

/** Câu Nhật dạng các cụm nối liền: cụm có mục từ điển là nút (gạch chấm) mở popover tra nhanh. */
const TokenSentence: React.FC<{ tokens: DictTranslateToken[]; onPick: (key: DictKey) => void }> = ({ tokens, onPick }) => (
  <p lang="ja" className="text-body-lg leading-loose text-on-surface">
    {tokens.map((t) => {
      const key = t.key;
      return key ? (
        <button
          key={t.i}
          type="button"
          onClick={() => onPick(key)}
          className="underline decoration-dotted decoration-primary/50 underline-offset-4 hover:bg-primary/10 rounded"
          title={`Tra ${t.lemma ?? t.surface}`}
        >
          <RubyText token={t} />
        </button>
      ) : (
        <span key={t.i}>
          <RubyText token={t} />
        </span>
      );
    })}
  </p>
);

/** Một dòng phân tích: cụm (ruby) + dạng gốc + JLPT · cách đọc / romaji / từ loại · nghĩa (AI theo ngữ cảnh → từ điển → gloss Anh). */
const TokenRow: React.FC<{ t: DictTranslateToken; onPick: (key: DictKey) => void }> = ({ t, onPick }) => {
  const m = tokenMeaning(t);
  const key = t.key;
  const head = (
    <span lang="ja" className="font-semibold text-on-surface">
      <RubyText token={t} />
    </span>
  );
  return (
    <li className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-0.5 items-baseline px-3 py-2 rounded-lg hover:bg-surface-container-low">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {key ? (
          <button type="button" onClick={() => onPick(key)} className="text-left hover:text-primary" title="Tra nhanh">
            {head}
          </button>
        ) : (
          head
        )}
        {t.lemma && t.lemma !== t.surface && (
          <span lang="ja" className="text-xs text-on-surface-variant" title="Dạng gốc">
            ← {t.lemma}
          </span>
        )}
        {t.jlpt && <span className={jlptChip}>{t.jlpt}</span>}
      </div>
      <div className="text-xs text-on-surface-variant">
        {t.reading && <span lang="ja">{t.reading}</span>}
        {t.romaji && <span className="ml-1.5">{t.romaji}</span>}
        {t.posVi && <span className="block">{t.posVi}</span>}
      </div>
      <div className="col-span-2 sm:col-span-1 text-body-sm text-on-surface">
        {m ? <span lang={m.lang}>{m.text}</span> : <span className="text-on-surface-variant">—</span>}
        {m?.source === "en" && <span className="ml-1 text-[11px] text-on-surface-variant">(nghĩa tiếng Anh)</span>}
      </div>
    </li>
  );
};

/** Kết quả một lượt dịch: bản dịch (AI dịch cả đoạn) + cách đọc, phương án khác, ghi chú, sát nghĩa theo cụm, phân tích câu. */
const TranslationResult: React.FC<{ r: DictTranslation; text: string; onOpen: (key: DictKey) => void }> = ({ r, text, onOpen }) => {
  const [popKey, setPopKey] = useState<DictKey | null>(null);
  const [reporting, setReporting] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  const targetLang = r.direction === "ja-vi" ? "vi" : "ja";
  const note = translateStateNote(r.state, r.aiLeft, r.aiLimit);
  const words = r.tokens.filter((t) => !t.symbol);
  const analysisTitle = r.direction === "ja-vi" ? "Phân tích câu gốc" : "Phân tích câu tiếng Nhật";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold text-on-surface">{translateDirectionLabel(r.direction)}</span>
          {r.cached && <span title="Câu này đã được dịch trước đó, lấy từ bộ nhớ dịch chung">· từ bộ nhớ dịch</span>}
          {r.edited && <span title="Bản dịch đã được quản trị viên sửa theo báo cáo của người học">· đã hiệu đính</span>}
        </span>
        {r.aiLimit > 0 && <span>Còn {r.aiLeft}/{r.aiLimit} lượt dịch AI trong giờ này</span>}
      </div>

      {note && (
        <p role="status" className="text-body-sm text-on-surface rounded-xl bg-surface-container-low px-4 py-3">
          {note}
        </p>
      )}

      {r.translation && (
        <section aria-label="Bản dịch" className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 sm:p-5 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <p lang={targetLang} className="flex-1 min-w-0 text-title-md sm:text-headline-sm text-on-surface whitespace-pre-line">
              {r.translation}
            </p>
            <div className="shrink-0 flex items-center gap-1">
              {targetLang === "ja" && canSpeak && (
                <button
                  type="button"
                  onClick={() => void speakJa(r.translation ?? "")}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
                  title="Nghe câu"
                  aria-label="Nghe câu tiếng Nhật"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">volume_up</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void copy(r.translation ?? "")}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
                title={copied ? "Đã chép" : "Chép bản dịch"}
                aria-label={copied ? "Đã chép bản dịch" : "Chép bản dịch"}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{copied ? "check" : "content_copy"}</span>
              </button>
              {r.state === "OK" && (
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
                  title="Báo bản dịch sai"
                  aria-label="Báo bản dịch sai"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">flag</span>
                </button>
              )}
            </div>
          </div>
          {r.direction === "vi-ja" && (r.reading || r.romaji) && (
            <div className="text-body-sm text-on-surface-variant flex flex-col gap-0.5">
              {r.reading && <span lang="ja">{r.reading}</span>}
              {r.romaji && <span>{r.romaji}</span>}
              {r.readingAgrees === false && (
                <span className="text-xs">Cách đọc do AI ghi chưa khớp với bộ tách từ, hãy đối chiếu phần phân tích bên dưới.</span>
              )}
            </div>
          )}
          {r.alternatives.length > 0 && (
            <div className="text-body-sm pt-1">
              <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Cách dịch khác</h4>
              <ul className="mt-1 flex flex-col gap-1">
                {r.alternatives.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span lang={targetLang} className="text-on-surface">{a.text}</span>
                    {a.reading && <span lang="ja" className="text-xs text-on-surface-variant">{a.reading}</span>}
                    {a.note && <span className="text-[11px] px-1.5 rounded-full bg-surface-container text-on-surface-variant">{a.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.notes && (
            <p className="text-body-sm text-on-surface-variant pt-1">
              <span className="font-semibold text-on-surface">Ghi chú: </span>
              {r.notes}
            </p>
          )}
          {r.literal && (
            <details className="text-body-sm pt-1">
              <summary className="cursor-pointer select-none text-primary font-semibold">Dịch sát nghĩa theo cụm (để học cấu trúc)</summary>
              <p lang="vi" className="mt-1 text-on-surface-variant whitespace-pre-line">{r.literal}</p>
            </details>
          )}
        </section>
      )}

      {r.tokens.length > 0 && (
        <section aria-label={analysisTitle} className="flex flex-col gap-2">
          <h3 className="font-semibold text-on-surface">{analysisTitle}</h3>
          <p className="text-xs text-on-surface-variant">
            Nghĩa từng cụm theo đúng ngữ cảnh của câu, không phải bản dịch. Bấm cụm có gạch chấm để tra từ điển.
          </p>
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest px-4 py-3">
            <TokenSentence tokens={r.tokens} onPick={setPopKey} />
          </div>
          {words.length > 0 && (
            <ul className="flex flex-col divide-y divide-surface-container-high rounded-xl border border-surface-container-high bg-surface-container-lowest" aria-label="Từng cụm từ">
              {words.map((t) => (
                <TokenRow key={t.i} t={t} onPick={setPopKey} />
              ))}
            </ul>
          )}
        </section>
      )}

      {reporting && r.translation && (
        <ReportTranslationModal text={text} direction={r.direction} translation={r.translation} onClose={() => setReporting(false)} />
      )}
      {popKey && <DictPopover entryKey={popKey} onClose={() => setPopKey(null)} onOpen={(k) => { setPopKey(null); onOpen(k); }} />}
    </div>
  );
};

// Tab Dịch (spec 2026-10-28-dich-cau-design, D33): dịch câu / đoạn Nhật ↔ Việt bằng AI dịch CẢ đoạn (không bao giờ ghép nghĩa từng từ)
// + phân tích câu Nhật (cụm từ, cách đọc, bậc JLPT, nghĩa theo ngữ cảnh). Trạng thái trên URL: ?tab=translate&t=…&dir=ja-vi|vi-ja
// (tự nhận thì bỏ dir); chỉ dịch khi bấm Dịch / Ctrl+Enter vì mỗi lượt tốn hạn mức AI.
export const TranslateTab: React.FC<{
  text: string;
  direction: DictTranslateDirection;
  onChange: (text: string, direction: DictTranslateDirection) => void;
  onOpen: (key: DictKey) => void;
}> = ({ text, direction, onChange, onOpen }) => {
  const [input, setInput] = useState(text);
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setInput(text);
  }
  const [dir, setDir] = useState<DictTranslateDirection>(direction);
  const [prevDir, setPrevDir] = useState(direction);
  if (direction !== prevDir) {
    setPrevDir(direction);
    setDir(direction);
  }
  const key = text ? `${direction}|${text}` : "";
  const [res, setRes] = useState<{ key: string; data?: DictTranslation; error?: string }>({ key: "" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!key) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const [d, ...rest] = key.split("|");
    translateText(rest.join("|"), d as DictTranslateDirection, ctl.signal)
      .then((r) => !ctl.signal.aborted && setRes({ key, data: r }))
      .catch((e) => !ctl.signal.aborted && setRes({ key, error: extractErrorMessage(e) }));
    return () => ctl.abort();
  }, [key]);

  const current = key && res.key === key ? res : null;
  const result = current?.data ?? null;
  const error = current?.error ?? null;
  const loading = !!key && !current;
  const trimmed = input.trim();
  const previewDir = dir === "auto" ? detectTranslateDirection(trimmed) : dir;

  const submit = () => {
    if (!trimmed) return;
    onChange(trimmed.slice(0, TRANSLATE_MAX_CHARS), dir);
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="dict-translate-text" className="sr-only">
          Câu hoặc đoạn cần dịch
        </label>
        <textarea
          id="dict-translate-text"
          value={input}
          rows={3}
          maxLength={TRANSLATE_MAX_CHARS}
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          aria-describedby="dict-translate-hint"
          placeholder="昨日は友達と映画を見ました。 — hoặc — Hôm qua tôi đi xem phim với bạn."
          className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Hướng dịch" className="inline-flex rounded-lg bg-surface-container-low p-0.5">
            {DIRECTIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={dir === d.key}
                onClick={() => setDir(d.key)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  dir === d.key ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <span id="dict-translate-hint" className="text-xs text-on-surface-variant">
            {trimmed && dir === "auto" ? `${translateDirectionLabel(previewDir)} · ` : ""}
            {input.length}/{TRANSLATE_MAX_CHARS} · Ctrl + Enter để dịch
          </span>
          <Button type="submit" variant="primary" size="sm" isLoading={loading} disabled={!trimmed}>
            Dịch
          </Button>
        </div>
      </form>

      {!text && (
        <p className="text-body-sm text-on-surface-variant">
          Dán một câu hoặc đoạn ngắn tiếng Nhật để dịch sang tiếng Việt, hoặc tiếng Việt để dịch sang tiếng Nhật. AI dịch cả câu để bản
          dịch tự nhiên; bên dưới là phân tích từng cụm (cách đọc, bậc JLPT, nghĩa theo ngữ cảnh) để bạn học cấu trúc câu.
        </p>
      )}
      {loading && <p className="text-body-sm text-on-surface-variant">Đang dịch…</p>}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      {result && <TranslationResult r={result} text={text} onOpen={onOpen} />}
      {result && (
        <p className="text-[11px] text-on-surface-variant">
          Bản dịch do AI tạo, có thể sai ở câu mơ hồ hoặc thành ngữ; câu bạn nhập được gửi tới dịch vụ AI để dịch và lưu trong bộ nhớ dịch
          chung 30 ngày, không gắn với tài khoản.
        </p>
      )}
    </div>
  );
};
