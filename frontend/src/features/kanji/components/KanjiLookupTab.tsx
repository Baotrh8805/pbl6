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

const EXAMPLES = ["学生", "日本語", "漢字", "水", "話"];

const isLevel = (v: string): v is (typeof JLPT_LEVELS)[number] => (JLPT_LEVELS as readonly string[]).includes(v);

// Tab "Tra chữ Hán" (C5): nhập một hoặc nhiều chữ (lọc chữ Hán khỏi câu dán vào) -> thẻ từng chữ; tạo bộ thẻ On/Kun từ
// kết quả. Chữ đang tra nằm trên URL (?k=) để link "Chữ Hán" ở trang bộ thẻ và nút Back hoạt động.
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

  // Chữ trên URL đổi từ ngoài (link từ tab Bộ thủ / trang bộ thẻ, Back): đồng bộ ô nhập (so khoá trong render, không cần effect).
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setInput(query);
    setInputError(null);
    setCreateError(null);
  }

  const level = isLevel(userLevel) ? userLevel : null;
  const result = useAsync<KanjiInfoCard[] | null>(
    () => (kanji.length > 0 ? fetchKanjiCards(kanji, level) : Promise.resolve(null)),
    [query, level, reloadKey]
  );
  const cards = result.data ?? [];
  const missing = result.data ? kanji.filter((k) => !cards.some((c) => c.kanji === k)) : [];
  const deckCards = onKunDeckCards(cards);

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
        // Tiêu đề theo chữ thật sự có thẻ: chữ không có dữ liệu (không âm, không nghĩa) không được nêu trong tên bộ.
        title: onKunDeckTitle([...new Set(deckCards.map((c) => c.term))]),
        // Cấp bộ thẻ = cấp dễ nhất trong ví dụ; không có ví dụ có cấp thì lấy cấp người học.
        level: easiestLevel(deckCards.map((c) => c.level)) ?? level ?? "N5",
        description: "Tạo từ trang Chữ Hán & Bộ thủ: mỗi chữ một thẻ âm On và một thẻ âm Kun kèm từ ví dụ JLPT.",
        category: "kanji",
        cards: deckCards,
      });
      navigate(`/decks/${encodeURIComponent(deck.id)}`);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
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
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={inputId} className="text-label-md font-semibold text-on-surface">
          Chữ Hán cần tra
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="search"
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
            placeholder="Nhập hoặc dán chữ, vd. 学生 / 日本語を勉強する"
            className="flex-1 min-w-0 px-3 py-2.5 min-h-11 rounded-xl bg-surface-container-lowest border border-surface-container-high text-body-md text-on-surface placeholder:text-outline font-japanese focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" size="md" disabled={!input.trim()}>
            Tra
          </Button>
        </div>
        {inputError ? (
          <p id={errorId} role="alert" className="text-label-sm text-error">
            {inputError}
          </p>
        ) : (
          <p className="text-label-sm text-outline">
            Kana và chữ Latin được bỏ qua; tra tối đa {MAX_LOOKUP_KANJI} chữ mỗi lần.
          </p>
        )}
      </form>

      {speakError && (
        <p role="status" className="p-2.5 rounded-lg bg-surface-container-low text-label-sm text-on-surface-variant flex items-center justify-between gap-2">
          <span>{speakError}</span>
          <button type="button" onClick={() => setSpeakError(null)} className="underline font-semibold shrink-0">
            Đóng
          </button>
        </p>
      )}

      {kanji.length === 0 ? (
        <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">translate</span>
          <p className="text-body-md text-on-surface-variant">
            Xem âm Hán-Việt, bộ thủ, âm On / Kun và từ ví dụ JLPT của từng chữ. Thử:
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                lang="ja"
                onClick={() => submit(ex)}
                className="px-3 py-1 min-h-9 rounded-full text-body-md font-japanese border bg-surface-container-lowest text-on-surface border-surface-container-high hover:bg-surface-container cursor-pointer"
              >
                {ex}
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
          <p className="text-error font-semibold">Không tra được chữ Hán: {result.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-body-sm text-on-surface-variant">
              {cards.length} chữ
              {truncated && ` (chỉ tra ${MAX_LOOKUP_KANJI} chữ đầu)`}
              {missing.length > 0 && (
                <>
                  {" · Không có dữ liệu: "}
                  <span lang="ja" className="font-japanese">{missing.join(" ")}</span>
                </>
              )}
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleCreateDeck()}
              isLoading={creating}
              disabled={deckCards.length === 0}
              title={deckCards.length === 0 ? "Không có âm On / Kun để tạo thẻ" : undefined}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">library_add</span>
              Tạo bộ thẻ On/Kun{deckCards.length > 0 ? ` (${deckCards.length} thẻ)` : ""}
            </Button>
          </div>
          {createError && (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
              Không tạo được bộ thẻ: {createError}
            </p>
          )}
          {cards.length === 0 ? (
            <p className="p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-sm text-on-surface-variant">
              Không có dữ liệu cho các chữ này.
            </p>
          ) : (
            <div className="flex flex-col gap-space-md">
              {cards.map((c) => (
                <KanjiInfoCardView
                  key={c.kanji}
                  card={c}
                  radical={c.radical ? (radicalByNo.get(c.radical.no) ?? null) : null}
                  onWrite={setWriteCard}
                  onSpeakError={setSpeakError}
                  query={query}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Luyện viết: panel tự tải nét mẫu KanjiVG (không có thẻ nên không gửi cardId); số nét lấy sẵn từ thẻ tra cứu. */}
      <Modal
        isOpen={writeCard !== null}
        onClose={() => setWriteCard(null)}
        icon="draw"
        size="md"
        title={writeCard ? `Luyện viết ${writeCard.kanji}` : "Luyện viết"}
        subtitle={writeCard?.hanViet ?? undefined}
      >
        {writeCard && (
          <KanjiWritePanel
            key={writeCard.kanji}
            kanji={writeCard.kanji}
            expectedStrokeCount={writeCard.strokeCount}
          />
        )}
      </Modal>
    </div>
  );
};
