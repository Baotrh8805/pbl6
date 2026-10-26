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
import { entryToWordNode, headOf, isKanjiKey, kanjiKey, pitchSteps, posLabel, primaryMeaning, viStateNote } from "../dictUtils";
import { DictComments } from "./DictComments";
import { ReportEntryModal } from "./ReportEntryModal";
import { TokenizedSentence } from "./DictQuickLookup";

const chip = "px-1.5 py-0.5 rounded text-xs font-semibold";

/** Bậc thang trọng âm H/L theo mora (kanjium, spec §6.5). */
const PitchView: React.FC<{ moras: string[]; hl: ("H" | "L")[]; kind: string }> = ({ moras, hl, kind }) => (
  <div className="flex items-end gap-0.5" aria-label={`Trọng âm ${kind}: ${moras.map((m, i) => `${m} ${hl[i] === "H" ? "cao" : "thấp"}`).join(", ")}`}>
    {pitchSteps(moras, hl).map((s, i) => (
      <span
        key={i}
        lang="ja"
        className={`px-0.5 text-body-sm ${s.high ? "border-t-2 border-tertiary" : "border-b-2 border-outline-variant mt-2"} ${s.drop ? "border-r-2 border-r-tertiary" : ""}`}
      >
        {s.mora}
      </span>
    ))}
  </div>
);

// Chi tiết một mục (D14, D17, D23, D25): tiêu đề + đọc + Hán-Việt + JLPT + trọng âm, nghĩa Việt (hoặc Anh, không nhãn), nghĩa Anh
// theo từ loại, câu ví dụ kèm bản dịch (dịch thêm khi cần), câu từ tài liệu của mình, chữ Hán trong từ, bình luận, các nút hành động.
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

  const speak = () => {
    const text = entry.reading || head.main;
    void speakJa(text, { rate: 0.85 }).catch((err) => void dialog.alert({ title: "Không đọc được", message: String(err.message ?? err) }));
  };

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
    <article className="flex flex-col gap-4" aria-labelledby="dict-head">
      {entry.redirectFrom && (
        <p className="text-xs text-on-surface-variant">Đã chuyển sang mục đầy đủ của từ điển.</p>
      )}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <h2 id="dict-head" lang="ja" className={`font-bold text-on-surface break-all ${kanjiEntry ? "text-[56px] leading-none" : "text-headline-md"}`}>
            {head.main}
          </h2>
          {head.reading && <span lang="ja" className="text-headline-sm text-on-surface-variant">{head.reading}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.hanViet && (
            <span className="font-semibold tracking-wide text-tertiary">
              {kanjiEntry ? entry.hanViet : (entry.hanVietChars ?? []).map((c, i) => (
                <React.Fragment key={c.char + i}>
                  {i > 0 && " "}
                  <button type="button" onClick={() => onOpen(kanjiKey(c.char))} className="hover:underline" title={`Mở chữ ${c.char}`}>
                    {c.reading}
                  </button>
                </React.Fragment>
              ))}
            </span>
          )}
          {entry.jlpt && <span className={`${chip} bg-primary/10 text-primary`}>{entry.jlpt}</span>}
          {entry.common && !kanjiEntry && <span className={`${chip} bg-secondary/10 text-secondary`}>Thông dụng</span>}
          {entry.strokeCount != null && <span className="text-xs text-on-surface-variant">{entry.strokeCount} nét</span>}
          {entry.pitch && <PitchView moras={entry.pitch.moras} hl={entry.pitch.hl} kind={entry.pitch.kind} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {canSpeak && (
            <Button type="button" size="sm" variant="outline" onClick={speak} aria-label="Nghe phát âm">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">volume_up</span> Nghe
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">content_copy</span> {copied ? "Đã chép" : "Chép"}
          </Button>
          <Button type="button" size="sm" variant={entry.favorite?.saved ? "secondary" : "outline"} onClick={toggleFavorite} aria-pressed={!!entry.favorite?.saved}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{entry.favorite?.saved ? "bookmark_added" : "bookmark_add"}</span>
            {entry.favorite?.saved ? "Đã lưu sổ tay" : "Lưu sổ tay"}
          </Button>
          {!kanjiEntry && (
            <Button type="button" size="sm" variant="primary" onClick={() => setAddWord(entryToWordNode(entry))} disabled={!meaning}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span> Thêm vào bộ thẻ
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setReporting(true)}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">flag</span> Báo lỗi
          </Button>
        </div>
      </header>

      <section aria-label="Nghĩa" className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-2">
        {meaning ? (
          <p lang={meaning.lang} className="text-title-md font-semibold text-on-surface whitespace-pre-line">{meaning.text}</p>
        ) : (
          <p className="text-body-sm text-on-surface-variant">Chưa có nghĩa cho mục này.</p>
        )}
        {note && <p className="text-xs text-on-surface-variant">{note}</p>}
        {kanjiEntry && entry.meaningEn && meaning?.lang === "vi" && <p lang="en" className="text-body-sm text-on-surface-variant">{entry.meaningEn}</p>}
      </section>

      {kanjiEntry && (entry.on?.length || entry.kun?.length || entry.radical) ? (
        <section aria-label="Cách đọc của chữ" className="grid gap-3 sm:grid-cols-2 text-body-sm">
          {entry.on && entry.on.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Âm On</h3>
              <p lang="ja">{entry.on.map((r) => r.reading).join("、")}</p>
            </div>
          )}
          {entry.kun && entry.kun.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Âm Kun</h3>
              <p lang="ja">{entry.kun.map((r) => r.reading + (r.okurigana ? `（${r.okurigana}）` : "")).join("、")}</p>
            </div>
          )}
          {entry.radical && (
            <div>
              <h3 className="font-semibold mb-1">Bộ thủ</h3>
              <p><span lang="ja">{entry.radical.char}</span> {entry.radical.nameVi && `bộ ${entry.radical.nameVi}`} {entry.radical.meaningVi && `(${entry.radical.meaningVi})`}</p>
            </div>
          )}
          <p className="sm:col-span-2 text-xs">
            <Link to={`/dictionary?tab=kanji&k=${encodeURIComponent(entry.key.slice(2))}`} className="text-primary hover:underline">
              Xem thẻ chữ Hán đầy đủ, mẹo nhớ và luyện viết →
            </Link>
          </p>
        </section>
      ) : null}

      {!kanjiEntry && entry.senses && entry.senses.length > 0 && (
        <section aria-label="Nghĩa tiếng Anh theo từ loại" className="flex flex-col gap-1.5 text-body-sm">
          <h3 className="font-semibold">Nghĩa tiếng Anh (JMdict)</h3>
          <ol className="list-decimal pl-5 flex flex-col gap-1">
            {(showAllEn ? entry.senses : entry.senses.slice(0, 4)).map((s, i) => (
              <li key={i}>
                {(s.pos ?? []).length > 0 && (
                  <span className="text-xs text-on-surface-variant mr-1">[{(s.pos ?? []).map((p, j) => posLabel(p, s.posText?.[j])).join(", ")}]</span>
                )}
                <span lang="en">{(s.gloss ?? []).join("; ")}</span>
                {(s.misc ?? []).length > 0 && (
                  <span className="text-xs text-on-surface-variant ml-1">({(s.misc ?? []).map((m, j) => posLabel(m, s.miscText?.[j])).join(", ")})</span>
                )}
              </li>
            ))}
          </ol>
          {entry.senses.length > 4 && (
            <button type="button" onClick={() => setShowAllEn((v) => !v)} className="self-start text-xs text-primary hover:underline">
              {showAllEn ? "Thu gọn" : `Xem thêm ${entry.senses.length - 4} nghĩa`}
            </button>
          )}
        </section>
      )}

      {examples.length > 0 && (
        <section aria-label="Câu ví dụ" className="flex flex-col gap-2 text-body-sm">
          <h3 className="font-semibold">Câu ví dụ</h3>
          <ul className="flex flex-col gap-2">
            {examples.map((x) => (
              <li key={x.id} className="rounded-lg border border-surface-container-high p-2.5">
                <p className="text-on-surface"><TokenizedSentence text={x.jpn} onOpen={onOpen} /></p>
                {x.vi ? <p className="text-on-surface-variant">{x.vi}</p> : x.eng && <p lang="en" className="text-on-surface-variant">{x.eng}</p>}
              </li>
            ))}
          </ul>
          {untranslated.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" isLoading={translating} onClick={() => translateMore(untranslated.map((x) => x.id))}>
                Dịch {untranslated.length} câu sang tiếng Việt
              </Button>
              {entry.aiLimit ? <span className="text-xs text-on-surface-variant">Còn {entry.aiLeft ?? 0}/{entry.aiLimit} lượt dịch trong giờ này</span> : null}
              {translateError && <span role="alert" className="text-xs text-error">{translateError}</span>}
            </div>
          )}
          <p className="text-[11px] text-on-surface-variant">Câu ví dụ: Tatoeba (CC BY 2.0 FR). <Link to="/about/data" className="hover:underline">Nguồn dữ liệu</Link></p>
        </section>
      )}

      {entry.userExamples && entry.userExamples.length > 0 && (
        <section aria-label="Câu trong tài liệu của bạn" className="flex flex-col gap-2 text-body-sm">
          <h3 className="font-semibold">Trong tài liệu của bạn</h3>
          <ul className="flex flex-col gap-1.5">
            {entry.userExamples.map((x) => (
              <li key={x.id} className="rounded-lg bg-surface-container-low px-2.5 py-2">
                <p lang="ja">{x.jpn}</p>
                {x.vi && <p className="text-on-surface-variant">{x.vi}</p>}
                {x.source && <p className="text-[11px] text-on-surface-variant">{x.source}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(entry.kanjiChars?.length ?? 0) > 0 && !kanjiEntry && (
        <section aria-label="Chữ Hán trong từ" className="flex flex-col gap-2 text-body-sm">
          <h3 className="font-semibold">Chữ Hán trong từ</h3>
          <div className="flex flex-wrap gap-2">
            {entry.kanjiChars!.map((c) => (
              <button
                key={c.char}
                type="button"
                onClick={() => onOpen(kanjiKey(c.char))}
                className="flex items-center gap-2 rounded-lg border border-surface-container-high px-3 py-2 hover:border-primary text-left"
              >
                <span lang="ja" className="text-headline-sm">{c.char}</span>
                <span className="flex flex-col">
                  {c.hanViet && <span className="text-xs font-semibold text-tertiary">{c.hanViet}</span>}
                  <span className="text-xs text-on-surface-variant">{c.meaningVi || c.meaningEn}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {kanjiEntry && (entry.exampleWords?.length ?? 0) > 0 && (
        <section aria-label="Từ chứa chữ" className="flex flex-col gap-2 text-body-sm">
          <h3 className="font-semibold">Từ chứa chữ này</h3>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {entry.exampleWords!.map((w) => (
              <li key={w.key}>
                <button type="button" onClick={() => onOpen(w.key)} className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-surface-container">
                  <span lang="ja" className="font-semibold">{w.headKanji}</span> <span lang="ja" className="text-on-surface-variant">{w.reading}</span>
                  <span className="block text-xs text-on-surface-variant truncate">{w.meaningVi || w.glossShort}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(entry.relatedSameReading?.length ?? 0) > 0 && (
        <section aria-label="Từ cùng cách đọc" className="text-body-sm">
          <h3 className="font-semibold mb-1">Cùng cách đọc</h3>
          <div className="flex flex-wrap gap-1.5">
            {entry.relatedSameReading!.map((r) => (
              <button key={r.key} type="button" onClick={() => onOpen(r.key)} className="px-2 py-1 rounded-lg border border-surface-container-high hover:border-primary">
                <span lang="ja">{r.headKanji}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <DictComments entryKey={entry.key} onCountChange={(n) => onChange({ ...entry, commentCount: n })} />

      <AddWordToDeckModal word={addWord} decks={ownDecks} decksLoading={statsLoading} onClose={() => setAddWord(null)} />
      {reporting && <ReportEntryModal entry={entry} onClose={() => setReporting(false)} />}
    </article>
  );
};
