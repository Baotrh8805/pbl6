import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAsync } from "@/lib/useAsync";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import { MAX_LOOKUP_KANJI, easiestLevel, extractKanji, onKunDeckCards, onKunDeckTitle } from "@/lib/kanjiUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { createDeck } from "@/services/deckService";
import { fetchKanjiCards } from "@/services/kanjiService";
import { KanjiWritePanel } from "@/features/practice/components/KanjiWritePanel";
import type { KanjiInfoCard, Radical } from "@/types/api.types";
import { KanjiInfoCardView } from "./KanjiInfoCardView";

interface KanjiLookupTabProps {
  /** Chữ đang tra (từ ?k=), đã lọc chữ Hán, bỏ trùng, tối đa MAX_LOOKUP_KANJI. */
  kanji: string[];
  /** ?k= có nhiều chữ hơn giới hạn (phần dư bị bỏ). */
  truncated: boolean;
  onSearch: (kanji: string[]) => void;
  radicalByNo: ReadonlyMap<number, Radical>;
  /** Cấp người học (N5..N1): ví dụ đúng cấp xếp trước. */
  userLevel: string;
}

const EXAMPLES = [
  { label: "Học sinh", text: "学生" },
  { label: "Tiếng Nhật", text: "日本語" },
  { label: "Chữ Hán", text: "漢字" },
  { label: "Nhất sở huyền mệnh", text: "一所懸命" },
  { label: "Ôn cố tri tân", text: "温故知新" },
];

const isLevel = (v: string): v is (typeof JLPT_LEVELS)[number] => (JLPT_LEVELS as readonly string[]).includes(v);

// Tab "Tra chữ Hán": nhập hoặc dán văn bản -> tự động bóc tách chữ Hán -> thẻ từng chữ và tạo bộ thẻ On/Kun.
export const KanjiLookupTab: React.FC<KanjiLookupTabProps> = ({ kanji, truncated, onSearch, radicalByNo, userLevel }) => {
  const navigate = useNavigate();
  const inputId = useId();
  const errorId = useId();
  const query = kanji.join("");
  const [input, setInput] = useState(query);
  const [inputError, setInputError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [writeCard, setWriteCard] = useState<KanjiInfoCard | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [lastQuery, setLastQuery] = useState(query);
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  if (query !== lastQuery) {
    setLastQuery(query);
    setInput(query);
    setInputError(null);
    setCreateError(null);
    setOpenOverride({});
  }

  const level = isLevel(userLevel) ? userLevel : null;
  const result = useAsync<KanjiInfoCard[] | null>(
    () => (kanji.length > 0 ? fetchKanjiCards(kanji, level) : Promise.resolve(null)),
    [query, level, reloadKey]
  );
  const cards = result.data ?? [];
  const missing = result.data ? kanji.filter((k) => !cards.some((c) => c.kanji === k)) : [];
  const deckCards = onKunDeckCards(cards);
  const defaultOpen = (i: number) => cards.length <= 2 || i === 0;
  const isOpen = (k: string, i: number) => openOverride[k] ?? defaultOpen(i);
  const toggle = (k: string, i: number) => setOpenOverride((o) => ({ ...o, [k]: !(o[k] ?? defaultOpen(i)) }));
  const allOpen = cards.length > 0 && cards.every((c, i) => isOpen(c.kanji, i));
  const setAllOpen = (v: boolean) => setOpenOverride(Object.fromEntries(cards.map((c) => [c.kanji, v])));

  const submit = (text: string) => {
    const list = extractKanji(text);
    if (list.length === 0) {
      setInputError("Không có chữ Hán nào trong nội dung đã nhập. Hãy nhập chữ như 学, 日本語…");
      return;
    }
    setInputError(null);
    onSearch(list);
  };

  const handleCreateDeck = async () => {
    if (creating || deckCards.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const deck = await createDeck({
        title: onKunDeckTitle([...new Set(deckCards.map((c) => c.term))]),
        level: easiestLevel(deckCards.map((c) => c.level)) ?? level ?? "N5",
        cards: deckCards,
        description: `Bộ thẻ On/Kun tạo từ kết quả tra cứu chữ Hán: ${kanji.join(" ")}.`,
      });
      navigate(`/decks/${deck.id}`);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-space-md">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-2.5"
      >
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 px-3 py-2 rounded-xl">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">lightbulb</span>
          <span>
            <strong>Bóc tách tự động:</strong> Bạn có thể dán cả đoạn văn hoặc câu tiếng Nhật dài, hệ thống sẽ tự động tách từng Hán tự riêng biệt để tra cứu và luyện viết.
          </span>
        </div>

        <label htmlFor={inputId} className="text-label-md font-semibold text-on-surface flex items-center justify-between">
          <span>Nhập chữ Hán hoặc đoạn văn cần bóc tách</span>
          <span className="text-label-sm font-normal text-outline">Tối đa {MAX_LOOKUP_KANJI} chữ</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="text"
            enterKeyHint="search"
            lang="ja"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputError(null);
            }}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? errorId : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Nhập hoặc dán chữ, vd. 学生 / 日本語を勉強する / 桜の花が咲く..."
            className="flex-1 min-w-0 px-3.5 py-2.5 min-h-11 rounded-xl bg-surface-container-lowest border border-surface-container-high text-body-md text-on-surface placeholder:text-outline font-japanese focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" size="md" disabled={!input.trim()}>
            Tra cứu
          </Button>
        </div>
        {inputError && (
          <p id={errorId} role="alert" className="text-label-sm text-error">
            {inputError}
          </p>
        )}
      </form>

      {speakError && (
        <p role="status" className="p-2.5 rounded-lg bg-surface-container-low text-label-sm text-on-surface-variant flex items-center justify-between gap-2">
          <span>{speakError}</span>
          <button type="button" onClick={() => setSpeakError(null)} className="underline font-semibold shrink-0 cursor-pointer">
            Đóng
          </button>
        </p>
      )}

      {kanji.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[32px]">translate</span>
          </div>
          <p className="font-headline-sm text-headline-sm font-bold text-on-surface">Tra cứu & Luyện viết chữ Hán</p>
          <p className="text-body-sm text-on-surface-variant max-w-md">
            Xem âm Hán-Việt, bộ thủ, âm On / Kun, thứ tự nét viết động và mẹo nhớ của cộng đồng. Thử các mẫu sau:
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                type="button"
                onClick={() => submit(ex.text)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-surface-container-low text-on-surface hover:bg-surface-container hover:border-primary/40 text-xs font-semibold cursor-pointer transition-colors"
              >
                <span lang="ja" className="font-japanese font-bold text-primary">{ex.text}</span>
                <span className="text-[11px] text-on-surface-variant">({ex.label})</span>
              </button>
            ))}
          </div>
        </div>
      ) : result.loading ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-space-sm">
          <span className="sr-only">Đang tra chữ Hán...</span>
          {kanji.slice(0, 3).map((k) => (
            <div key={k} className="h-48 rounded-2xl bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : result.error ? (
        <div role="alert" className="p-space-md rounded-2xl bg-error/10 border border-error/20 flex flex-col items-start gap-2">
          <p className="text-error font-semibold">Không tải được thông tin chữ Hán: {result.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : cards.length === 0 && missing.length === 0 ? (
        <p className="p-space-md text-on-surface-variant">Không tìm thấy thông tin cho các chữ đã chọn.</p>
      ) : (
        <div className="flex flex-col gap-space-sm">
          {truncated && (
            <p role="status" className="p-2.5 rounded-xl bg-surface-container-low text-label-sm text-on-surface-variant">
              Bạn đã nhập nhiều hơn {MAX_LOOKUP_KANJI} chữ; hệ thống chỉ tra {MAX_LOOKUP_KANJI} chữ đầu tiên.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="text-label-sm text-outline">
              Hiển thị {cards.length} chữ Hán
            </span>
            <div className="flex items-center gap-2">
              {cards.length > 2 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAllOpen(!allOpen)}>
                  {allOpen ? "Thu gọn tất cả" : "Mở rộng tất cả"}
                </Button>
              )}
              {deckCards.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCreateDeck}
                  isLoading={creating}
                  disabled={creating}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span>
                  Tạo bộ thẻ On/Kun ({deckCards.length})
                </Button>
              )}
            </div>
          </div>

          {createError && (
            <p role="alert" className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-label-sm text-error">
              Không tạo được bộ thẻ: {createError}
            </p>
          )}

          <div className="flex flex-col gap-space-sm">
            {cards.map((card, idx) => (
              <KanjiInfoCardView
                key={card.kanji}
                card={card}
                radical={card.radical ? radicalByNo.get(card.radical.no) ?? null : null}
                query={query}
                onWrite={setWriteCard}
                onSpeakError={setSpeakError}
                expanded={isOpen(card.kanji, idx)}
                onToggle={() => toggle(card.kanji, idx)}
              />
            ))}
          </div>

          {missing.length > 0 && (
            <p className="text-label-sm text-outline pt-2">
              Chưa có dữ liệu chi tiết cho:{" "}
              <span lang="ja" className="font-japanese font-semibold text-on-surface">
                {missing.join(", ")}
              </span>
            </p>
          )}
        </div>
      )}

      {writeCard && (
        <Modal
          isOpen={!!writeCard}
          onClose={() => setWriteCard(null)}
          title={`Luyện viết chữ ${writeCard.kanji} (${writeCard.hanViet || ""})`}
          size="lg"
        >
          <div className="p-space-md">
            <KanjiWritePanel kanji={writeCard.kanji} />
          </div>
        </Modal>
      )}
    </div>
  );
};
