import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useShell } from "@/components/layout/shellContext";
import { AddWordToDeckModal } from "@/features/hanviet/components/AddWordToDeckModal";
import { runOnce } from "@/lib/inFlight";
import { canSpeak, speakJa } from "@/lib/speech";
import { copyText } from "@/lib/clipboard";
import { extractErrorMessage } from "@/services/apiClient";
import { removeDictFavorite, saveDictFavorite, translateDictExamples } from "@/services/dictionaryService";
import type { DictEntry, DictExample, DictKey } from "@/types/dictionary.types";
import type { HanVietWordNode } from "@/types/api.types";
import { entryToWordNode, headOf, isKanjiKey, jlptChipClass, kanjiKey, pitchKindLabel, pitchSteps, posLabel, primaryMeaning, viStateNote } from "../dictUtils";
import { DictComments } from "./DictComments";
import { ReportEntryModal } from "./ReportEntryModal";
import { TokenizedSentence } from "./DictQuickLookup";

const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold";
const iconBtn =
  "w-10 h-10 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const section = "flex flex-col gap-3 border-t border-surface-container-high pt-5 scroll-mt-24 text-body-sm";

/** Bậc thang trọng âm H/L theo mora (kanjium, spec §6.5) + tên kiểu trọng âm tiếng Việt. */
const PitchView: React.FC<{ moras: string[]; hl: ("H" | "L")[]; kind: string }> = ({ moras, hl, kind }) => (
  <span className="inline-flex items-end gap-2">
    <span className="flex items-end gap-0.5" aria-label={`Trọng âm ${pitchKindLabel(kind)}: ${moras.map((m, i) => `${m} ${hl[i] === "H" ? "cao" : "thấp"}`).join(", ")}`}>
      {pitchSteps(moras, hl).map((s, i) => (
        <span
          key={i}
          lang="ja"
          className={`px-0.5 text-body-sm ${s.high ? "border-t-2 border-tertiary" : "border-b-2 border-outline-variant mt-2"} ${s.drop ? "border-r-2 border-r-tertiary" : ""}`}
        >
          {s.mora}
        </span>
      ))}
    </span>
    <span aria-hidden="true" className="text-[11px] text-on-surface-variant">{pitchKindLabel(kind)}</span>
  </span>
);

const SectionTitle: React.FC<{ icon: string; count?: number; children: React.ReactNode }> = ({ icon, count, children }) => (
  <h3 className="font-semibold text-on-surface inline-flex items-center gap-1.5">
    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
    {children}
    {count != null && count > 0 && <span className="font-normal text-on-surface-variant">· {count}</span>}
  </h3>
);

// Chi tiết một mục (D14, D17, D23, D25): tiêu đề + đọc + Hán-Việt + JLPT + trọng âm, nghĩa Việt (hoặc Anh, không nhãn), nghĩa Anh
// theo từ loại, câu ví dụ kèm bản dịch (dịch thêm khi cần), câu từ tài liệu của mình, chữ Hán trong từ, bình luận, các nút hành động.
// Giao diện 31/10: nút Nghe cạnh từ, nút chính "Thêm vào bộ thẻ", mục lục nhảy tới từng khối, loa cho từng câu ví dụ.
export const DictEntryView: React.FC<{
  entry: DictEntry;
  onOpen: (key: DictKey) => void;
  onChange: (e: DictEntry) => void;
}> = ({ entry, onOpen, onChange }) => {
  const dialog = useDialog();
  const { decks, statsLoading } = useShell();
  const ownDecks = useMemo(() => decks.filter((d) => d.access === "owner"), [decks]);
  const [addWord, setAddWord] = useState<HanVietWordNode | null>(null);
  const [reporting, setReporting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showAllEn, setShowAllEn] = useState(false);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(new Set<string>());
  const head = headOf(entry);
  const meaning = primaryMeaning(entry);
  const kanjiEntry = isKanjiKey(entry.key);
  const note = viStateNote(entry.viState, entry.aiLeft, entry.aiLimit);
  const examples = entry.examples ?? [];
  const untranslated = examples.filter((x) => !x.vi).slice(0, 5);
  const senses = !kanjiEntry ? (entry.senses ?? []) : [];
  const userExamples = entry.userExamples ?? [];
  const kanjiChars = !kanjiEntry ? (entry.kanjiChars ?? []) : [];
  const exampleWords = kanjiEntry ? (entry.exampleWords ?? []) : [];
  const sameReading = entry.relatedSameReading ?? [];
  // Nghĩa liên tiếp cùng từ loại: chỉ nghĩa đầu nhóm hiện chip từ loại (JMdict để trống pos = giống nghĩa trước)
  const senseRows = senses.map((s) => ({ s, pos: (s.pos ?? []).map((p, j) => posLabel(p, s.posText?.[j])) }));
  const showPos = senseRows.map((r, i) => {
    const prev = senseRows.slice(0, i).reverse().find((x) => x.pos.length > 0);
    return r.pos.length > 0 && r.pos.join("|") !== prev?.pos.join("|");
  });

  const toc = [
    { id: "dict-sec-senses", label: "Nghĩa JMdict", show: senses.length > 0 },
    { id: "dict-sec-examples", label: "Ví dụ", show: examples.length > 0 },
    { id: "dict-sec-mine", label: "Tài liệu của bạn", show: userExamples.length > 0 },
    { id: "dict-sec-kanji", label: "Chữ Hán", show: kanjiChars.length > 0 },
    { id: "dict-sec-words", label: "Từ chứa chữ", show: exampleWords.length > 0 },
    { id: "dict-sec-comments", label: `Bình luận${entry.commentCount ? ` (${entry.commentCount})` : ""}`, show: true },
  ].filter((t) => t.show);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const speak = (text: string) =>
    void speakJa(text, { rate: 0.85 }).catch((err) => void dialog.alert({ title: "Không đọc được", message: String(err.message ?? err) }));

  const copy = async () => {
    if (await copyText(head.main)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const toggleFavorite = () =>
    void runOnce(inFlight.current, "fav", async () => {
      try {
        if (entry.favorite?.saved) {
          await removeDictFavorite(entry.key);
          onChange({ ...entry, favorite: { saved: false, note: null } });
        } else {
          const f = await saveDictFavorite(entry.key);
          onChange({ ...entry, favorite: f });
        }
      } catch (err) {
        void dialog.alert({ title: "Không lưu được", message: extractErrorMessage(err) });
      }
    });

  const translateMore = (ids: string[]) =>
    void runOnce(inFlight.current, "translate", async () => {
      setTranslating(true);
      setTranslateError(null);
      try {
        const r = await translateDictExamples(entry.key, ids);
        onChange({ ...entry, examples: r.examples as DictExample[], meaningVi: r.meaningVi ?? entry.meaningVi, aiLeft: r.aiLeft });
      } catch (err) {
        setTranslateError(extractErrorMessage(err));
      } finally {
        setTranslating(false);
      }
    });


  return (
    <article className="flex flex-col gap-5" aria-labelledby="dict-head">
      {entry.redirectFrom && <p className="text-xs text-on-surface-variant">Đã chuyển sang mục đầy đủ của từ điển.</p>}

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <h2 id="dict-head" lang="ja" className={`font-bold text-on-surface break-all leading-none ${kanjiEntry ? "text-[64px]" : "text-[40px]"}`}>
            {head.main}
          </h2>
          {head.reading && <span lang="ja" className="text-headline-sm font-normal text-on-surface-variant pb-0.5">{head.reading}</span>}
          {canSpeak && (
            <button type="button" onClick={() => speak(entry.reading || head.main)} aria-label="Nghe phát âm" title="Nghe phát âm" className={`${iconBtn} bg-primary/5 text-primary`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[22px]">volume_up</span>
            </button>
          )}
        </div>
        {kanjiEntry && (entry.strokeCount != null || entry.radical) && (
          <p className="text-body-sm text-on-surface-variant">
            {entry.strokeCount != null && `${entry.strokeCount} nét`}
            {entry.strokeCount != null && entry.radical && " · "}
            {entry.radical && (
              <>
                bộ <span lang="ja">{entry.radical.char}</span>
                {entry.radical.nameVi && ` ${entry.radical.nameVi}`}
              </>
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {entry.hanViet && (
            <span className={`${chip} bg-tertiary-fixed text-on-tertiary-fixed-variant tracking-wide uppercase`}>
              {kanjiEntry
                ? entry.hanViet
                : (entry.hanVietChars ?? []).map((c, i) => (
                    <React.Fragment key={c.char + i}>
                      {i > 0 && " "}
                      <button type="button" onClick={() => onOpen(kanjiKey(c.char))} className="hover:underline uppercase" title={`Mở chữ ${c.char}`}>
                        {c.reading}
                      </button>
                    </React.Fragment>
                  ))}
            </span>
          )}
          {entry.jlpt && <span className={`${chip} ${jlptChipClass(entry.jlpt)}`}>{entry.jlpt}</span>}
          {entry.common && !kanjiEntry && (
            <span className={`${chip} bg-sky-100 text-sky-800`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">star</span>
              Thông dụng
            </span>
          )}
          {!kanjiEntry && entry.strokeCount != null && <span className="text-xs text-on-surface-variant">{entry.strokeCount} nét</span>}
          {entry.pitch && <PitchView moras={entry.pitch.moras} hl={entry.pitch.hl} kind={entry.pitch.kind} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!kanjiEntry && (
            <Button type="button" size="sm" variant="primary" onClick={() => setAddWord(entryToWordNode(entry))} disabled={!meaning}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span> Thêm vào bộ thẻ
            </Button>
          )}
          <Button type="button" size="sm" variant={entry.favorite?.saved ? "secondary" : "outline"} onClick={toggleFavorite} aria-pressed={!!entry.favorite?.saved}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{entry.favorite?.saved ? "bookmark_added" : "bookmark_add"}</span>
            {entry.favorite?.saved ? "Đã lưu sổ tay" : "Lưu sổ tay"}
          </Button>
          <span className="flex items-center gap-0.5 ml-auto">
            <button type="button" onClick={() => void copy()} aria-label={copied ? "Đã chép" : "Chép từ"} title={copied ? "Đã chép" : "Chép từ"} className={iconBtn}>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{copied ? "check" : "content_copy"}</span>
            </button>
            <button type="button" onClick={() => setReporting(true)} aria-label="Báo lỗi mục từ" title="Báo lỗi mục từ" className={iconBtn}>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">flag</span>
            </button>
          </span>
        </div>
      </header>

      <section aria-label="Nghĩa" className="rounded-2xl border-l-4 border-primary bg-primary-fixed/40 px-4 py-3.5 flex flex-col gap-1.5">
        {meaning ? (
          <p lang={meaning.lang} className="text-lg font-semibold text-on-surface whitespace-pre-line">{meaning.text}</p>
        ) : (
          <p className="text-body-sm text-on-surface-variant">Chưa có nghĩa cho mục này.</p>
        )}
        {note && <p className="text-xs text-on-surface-variant">{note}</p>}
        {kanjiEntry && entry.meaningEn && meaning?.lang === "vi" && <p lang="en" className="text-body-sm text-on-surface-variant">{entry.meaningEn}</p>}
      </section>

      {toc.length > 1 && (
        <nav aria-label="Các phần của mục từ" className="flex flex-wrap gap-1.5 -mt-1">
          {toc.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => jump(t.id)}
              className="px-2.5 py-1 rounded-full bg-surface-container-low text-xs text-on-surface-variant hover:bg-primary/10 hover:text-primary"
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {kanjiEntry && (entry.on?.length || entry.kun?.length || entry.radical) ? (
        <section aria-label="Cách đọc của chữ" className="grid gap-3 sm:grid-cols-2 text-body-sm">
          {entry.on && entry.on.length > 0 && (
            <div className="rounded-xl bg-surface-container-low px-3 py-2.5">
              <h3 className="text-xs font-semibold text-on-surface-variant mb-1">Âm On</h3>
              <p lang="ja" className="text-body-md">{entry.on.map((r) => r.reading).join("、")}</p>
            </div>
          )}
          {entry.kun && entry.kun.length > 0 && (
            <div className="rounded-xl bg-surface-container-low px-3 py-2.5">
              <h3 className="text-xs font-semibold text-on-surface-variant mb-1">Âm Kun</h3>
              <p lang="ja" className="text-body-md">{entry.kun.map((r) => r.reading + (r.okurigana ? `（${r.okurigana}）` : "")).join("、")}</p>
            </div>
          )}
          {entry.radical && (
            <div className="rounded-xl bg-surface-container-low px-3 py-2.5">
              <h3 className="text-xs font-semibold text-on-surface-variant mb-1">Bộ thủ</h3>
              <p><span lang="ja" className="text-body-md">{entry.radical.char}</span> {entry.radical.nameVi && `bộ ${entry.radical.nameVi}`} {entry.radical.meaningVi && `(${entry.radical.meaningVi})`}</p>
            </div>
          )}
          <p className="sm:col-span-2 text-xs">
            <Link to={`/dictionary?tab=kanji&k=${encodeURIComponent(entry.key.slice(2))}`} className="text-primary font-semibold hover:underline">
              Xem thẻ chữ Hán đầy đủ, mẹo nhớ và luyện viết →
            </Link>
          </p>
        </section>
      ) : null}

      {senses.length > 0 && (
        <section id="dict-sec-senses" aria-label="Nghĩa tiếng Anh theo từ loại" className={section}>
          <SectionTitle icon="list_alt" count={senses.length}>Nghĩa tiếng Anh (JMdict)</SectionTitle>
          <ol className="flex flex-col gap-2">
            {(showAllEn ? senseRows : senseRows.slice(0, 4)).map(({ s, pos }, i) => {
              return (
                <li key={i} className="flex flex-col gap-1">
                  {showPos[i] && (
                    <span className="flex flex-wrap gap-1">
                      {pos.map((p) => (
                        <span key={p} className="px-1.5 py-px rounded bg-surface-container text-[11px] font-medium text-on-surface-variant">{p}</span>
                      ))}
                    </span>
                  )}
                  <span className="flex gap-2">
                    <span className="w-5 shrink-0 text-right text-on-surface-variant tabular-nums">{i + 1}.</span>
                    <span>
                      <span lang="en" className="text-on-surface">{(s.gloss ?? []).join("; ")}</span>
                      {(s.misc ?? []).length > 0 && (
                        <span className="text-xs italic text-on-surface-variant ml-1">({(s.misc ?? []).map((m, j) => posLabel(m, s.miscText?.[j])).join(", ")})</span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {senses.length > 4 && (
            <button type="button" onClick={() => setShowAllEn((v) => !v)} className="self-start text-xs font-semibold text-primary hover:underline">
              {showAllEn ? "Thu gọn" : `Xem thêm ${senses.length - 4} nghĩa`}
            </button>
          )}
        </section>
      )}

      {examples.length > 0 && (
        <section id="dict-sec-examples" aria-label="Câu ví dụ" className={section}>
          <SectionTitle icon="format_quote" count={examples.length}>Câu ví dụ</SectionTitle>
          <ul className="flex flex-col gap-2">
            {examples.map((x) => (
              <li key={x.id} className="group flex gap-2 rounded-xl border border-surface-container-high px-3 py-2.5 hover:border-outline-variant transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-body-md text-on-surface"><TokenizedSentence text={x.jpn} onOpen={onOpen} /></p>
                  {x.vi ? <p className="mt-0.5 text-on-surface-variant">{x.vi}</p> : x.eng && <p lang="en" className="mt-0.5 text-on-surface-variant">{x.eng}</p>}
                </div>
                {canSpeak && (
                  <button type="button" onClick={() => speak(x.jpn)} aria-label="Nghe câu" title="Nghe câu" className={`${iconBtn} w-8 h-8 shrink-0`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">volume_up</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {untranslated.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" isLoading={translating} onClick={() => translateMore(untranslated.map((x) => x.id))}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">translate</span>
                Dịch {untranslated.length} câu sang tiếng Việt
              </Button>
              {entry.aiLimit ? <span className="text-xs text-on-surface-variant">Còn {entry.aiLeft ?? 0}/{entry.aiLimit} lượt dịch trong giờ này</span> : null}
              {translateError && <span role="alert" className="text-xs text-error">{translateError}</span>}
            </div>
          )}
          <p className="text-[11px] text-on-surface-variant">Câu ví dụ: Tatoeba (CC BY 2.0 FR). <Link to="/about/data" className="hover:underline">Nguồn dữ liệu</Link></p>
        </section>
      )}

      {userExamples.length > 0 && (
        <section id="dict-sec-mine" aria-label="Câu trong tài liệu của bạn" className={section}>
          <SectionTitle icon="description" count={userExamples.length}>Trong tài liệu của bạn</SectionTitle>
          <ul className="flex flex-col gap-2">
            {userExamples.map((x) => (
              <li key={x.id} className="rounded-xl bg-surface-container-low px-3 py-2.5">
                <p lang="ja" className="text-body-md">{x.jpn}</p>
                {x.vi && <p className="mt-0.5 text-on-surface-variant">{x.vi}</p>}
                {x.source && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-on-surface-variant">
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">attach_file</span>
                    {x.source}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {kanjiChars.length > 0 && (
        <section id="dict-sec-kanji" aria-label="Chữ Hán trong từ" className={section}>
          <SectionTitle icon="draw">Chữ Hán trong từ</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {kanjiChars.map((c) => (
              <button
                key={c.char}
                type="button"
                onClick={() => onOpen(kanjiKey(c.char))}
                className="group flex items-center gap-3 rounded-xl border border-surface-container-high px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span lang="ja" className="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-lg bg-surface-container-low text-[30px] leading-none">{c.char}</span>
                <span className="flex flex-col min-w-0">
                  {c.hanViet && <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">{c.hanViet}</span>}
                  <span className="text-body-sm text-on-surface-variant line-clamp-2">{c.meaningVi || c.meaningEn}</span>
                </span>
                <span aria-hidden="true" className="material-symbols-outlined ml-auto text-[18px] text-outline group-hover:text-primary">chevron_right</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {exampleWords.length > 0 && (
        <section id="dict-sec-words" aria-label="Từ chứa chữ" className={section}>
          <SectionTitle icon="dictionary" count={exampleWords.length}>Từ chứa chữ này</SectionTitle>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {exampleWords.map((w) => (
              <li key={w.key}>
                <button type="button" onClick={() => onOpen(w.key)} className="w-full text-left rounded-xl px-3 py-2 hover:bg-surface-container">
                  <span lang="ja" className="font-semibold">{w.headKanji}</span> <span lang="ja" className="text-on-surface-variant">{w.reading}</span>
                  <span className="block text-xs text-on-surface-variant truncate">{w.meaningVi || w.glossShort}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sameReading.length > 0 && (
        <section aria-label="Từ cùng cách đọc" className={section}>
          <SectionTitle icon="hearing">Cùng cách đọc</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {sameReading.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onOpen(r.key)}
                className="px-2.5 py-1 rounded-full border border-surface-container-high text-body-md hover:border-primary hover:text-primary"
              >
                <span lang="ja">{r.headKanji}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div id="dict-sec-comments" className="border-t border-surface-container-high pt-5 scroll-mt-24">
        <DictComments entryKey={entry.key} onCountChange={(n) => onChange({ ...entry, commentCount: n })} />
      </div>

      <AddWordToDeckModal word={addWord} decks={ownDecks} decksLoading={statsLoading} onClose={() => setAddWord(null)} />
      {reporting && <ReportEntryModal entry={entry} onClose={() => setReporting(false)} />}
    </article>
  );
};
