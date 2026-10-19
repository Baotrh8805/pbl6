import React, { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import {
  MAX_RADICAL_CARD_KANJI,
  radicalCardTargets,
  radicalMatches,
  radicalStrokeOptions,
} from "@/lib/kanjiUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchRadicalKanji } from "@/services/kanjiService";
import { fetchRadicalCardsWithSources, type RadicalCardsWithSources } from "@/services/mnemonicService";
import { LevelChip } from "@/features/hanviet/components/HanVietBits";
import type { Radical } from "@/types/api.types";
import { RadicalCardsPanel } from "./RadicalCardsPanel";

interface RadicalsTabProps {
  radicals: Radical[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  selectedNo: number | null;
  onSelect: (no: number | null) => void;
  userLevel: string;
}

const chipClass = (active: boolean) =>
  `px-2.5 py-1 min-h-8 rounded-full text-label-sm font-semibold border transition-colors cursor-pointer ${
    active
      ? "bg-primary-container text-on-primary border-primary-container"
      : "bg-surface-container-lowest text-on-surface-variant border-surface-container-high hover:bg-surface-container"
  }`;

// Tab "Bộ thủ" (C4): bảng 214 bộ Khang Hi (lọc theo số nét / tên), chọn một bộ -> chữ JLPT thuộc bộ (lọc cấp) -> bấm chữ để
// tra, hoặc chọn tối đa 30 chữ để xem "Thẻ bộ thủ" và tạo bộ thẻ. Bộ đang chọn nằm trên URL (?tab=radicals&r=) để link
// "Bộ thủ" ở thẻ chữ Hán mở đúng bộ.
export const RadicalsTab: React.FC<RadicalsTabProps> = ({
  radicals,
  loading,
  error,
  onRetry,
  selectedNo,
  onSelect,
  userLevel,
}) => {
  const searchId = useId();
  const [strokes, setStrokes] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const strokeOptions = useMemo(() => radicalStrokeOptions(radicals), [radicals]);
  const shown = radicals.filter((r) => (strokes === null || r.strokes === strokes) && radicalMatches(r, query));
  const selected = selectedNo !== null ? (radicals.find((r) => r.no === selectedNo) ?? null) : null;

  const pick = (no: number) => {
    onSelect(no);
    // Bảng dài: đưa focus (và khung nhìn trên mobile) tới phần chi tiết vừa đổi để người dùng thấy kết quả.
    requestAnimationFrame(() => detailHeadingRef.current?.focus());
  };

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        <span className="sr-only">Đang tải bảng bộ thủ...</span>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-container-low animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="p-space-md rounded-2xl bg-error/10 border border-error/20 flex flex-col items-start gap-2">
        <p className="text-error font-semibold">Không tải được bảng bộ thủ: {error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (radicals.length === 0) {
    // Bảng rỗng không bị cache (kanjiService) -> "Thử lại" gọi lại server khi ai-service đã nạp xong dữ liệu.
    return (
      <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-start gap-2">
        <p className="text-body-sm text-on-surface-variant">Máy chủ chưa có dữ liệu bộ thủ.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] gap-space-md items-start">
      {/* Chi tiết bộ đang chọn: trên mobile đứng trước bảng (order-first) để thấy ngay sau khi chọn; desktop là cột phải
          dính đầu màn hình, tự cuộn bên trong khi dài hơn khung nhìn (thẻ bộ thủ). */}
      <div className="order-first lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto min-w-0">
        {selected ? (
          <RadicalDetail
            key={selected.no}
            radical={selected}
            headingRef={detailHeadingRef}
            onClose={() => onSelect(null)}
            userLevel={userLevel}
          />
        ) : (
          <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-sm text-on-surface-variant flex items-center gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-outline">touch_app</span>
            <h2 ref={detailHeadingRef} tabIndex={-1} className="focus:outline-none">
              Chọn một bộ thủ để xem các chữ JLPT thuộc bộ đó.
            </h2>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-space-sm min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-col gap-2">
          <label htmlFor={searchId} className="sr-only">
            Tìm bộ thủ
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            placeholder="Tìm theo tên, nghĩa, âm Hán-Việt hoặc số bộ (vd. thủy, nước, 85)"
            className="w-full px-3 py-2.5 min-h-11 rounded-xl bg-surface-container-lowest border border-surface-container-high text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div role="group" aria-label="Lọc theo số nét" className="flex flex-wrap items-center gap-1.5">
            <span className="text-label-sm text-on-surface-variant mr-1">Số nét:</span>
            <button type="button" aria-pressed={strokes === null} onClick={() => setStrokes(null)} className={chipClass(strokes === null)}>
              Tất cả
            </button>
            {strokeOptions.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={strokes === n}
                onClick={() => setStrokes(strokes === n ? null : n)}
                className={`${chipClass(strokes === n)} tabular-nums`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-label-sm text-outline" aria-live="polite">
            {shown.length} / {radicals.length} bộ thủ
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Không có bộ thủ nào khớp bộ lọc.</p>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2">
            {shown.map((r) => {
              const active = r.no === selectedNo;
              return (
                <li key={r.no}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => pick(r.no)}
                    aria-label={`Bộ ${r.no}: ${r.unified}, ${r.hanViet}, ${r.meaningVi}, ${r.strokes} nét`}
                    className={`w-full h-full flex flex-col items-center gap-0.5 p-2 rounded-xl border text-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active
                        ? "bg-primary/5 border-primary"
                        : "bg-surface-container-lowest border-surface-container-high hover:border-outline-variant"
                    }`}
                  >
                    <span className="self-start text-[10px] font-semibold text-outline tabular-nums">#{r.no}</span>
                    <span lang="ja" className="font-japanese text-3xl text-on-surface leading-tight">
                      {r.unified}
                    </span>
                    <span className="text-label-sm font-bold text-tertiary tracking-wide break-words">{r.hanViet}</span>
                    <span className="text-[11px] text-on-surface-variant line-clamp-2 break-words">{r.meaningVi}</span>
                    <span className="text-[10px] text-outline tabular-nums">{r.strokes} nét</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

interface RadicalDetailProps {
  radical: Radical;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  userLevel: string;
}

// Mount lại theo số bộ (key) -> bộ lọc cấp, chữ đã chọn, thẻ bộ thủ đều về mặc định khi đổi bộ.
const RadicalDetail: React.FC<RadicalDetailProps> = ({ radical, headingRef, onClose, userLevel }) => {
  const [levels, setLevels] = useState<string[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  // Kèm nguồn mẹo từng chữ: server đợt 2 trả mẹo đã duyệt ("approved") mà RadicalCardsResponse không giữ được.
  const [cards, setCards] = useState<RadicalCardsWithSources | null>(null);
  // Mỗi lần tải thẻ mới, bảng thẻ mount lại (bỏ danh sách "Đã tạo" của lô trước).
  const [cardsVersion, setCardsVersion] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const levelKey = levels.join(",");
  const list = useAsync(() => fetchRadicalKanji(radical.no, levels), [radical.no, levelKey, reloadKey]);
  const items = list.data?.items ?? [];
  const targets = radicalCardTargets(items, selected);
  const selectedVisible = items.filter((i) => selected.has(i.kanji)).length;

  const toggleLevel = (lv: string) =>
    setLevels((cur) => (cur.includes(lv) ? cur.filter((x) => x !== lv) : JLPT_LEVELS.filter((x) => x === lv || cur.includes(x))));

  const toggleKanji = (k: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const loadCards = async () => {
    if (cardsLoading || targets.length === 0) return;
    setCardsLoading(true);
    setCardsError(null);
    try {
      setCards(await fetchRadicalCardsWithSources(targets));
      setCardsVersion((n) => n + 1);
    } catch (err) {
      setCardsError(extractErrorMessage(err));
    } finally {
      setCardsLoading(false);
    }
  };

  return (
    <section
      aria-labelledby={`radical-${radical.no}-heading`}
      className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs flex flex-col gap-space-sm min-w-0"
    >
      <div className="flex items-start gap-3">
        <span lang="ja" aria-hidden="true" className="font-japanese text-5xl leading-none text-on-surface shrink-0">
          {radical.unified}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={`radical-${radical.no}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="font-title-md text-title-md font-bold text-on-surface focus:outline-none"
          >
            Bộ {radical.hanViet || radical.nameVi} <span className="text-label-sm font-medium text-outline">#{radical.no}</span>
          </h2>
          <p className="text-body-sm text-on-surface-variant break-words">
            {radical.meaningVi} · {radical.strokes} nét
            {radical.char !== radical.unified && (
              <>
                {" · dạng bộ "}
                <span lang="ja" className="font-japanese">{radical.char}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Bỏ chọn bộ thủ"
          className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div role="group" aria-label="Lọc chữ theo cấp" className="flex flex-wrap items-center gap-1.5">
        <span className="text-label-sm text-on-surface-variant mr-1">Cấp:</span>
        <button type="button" aria-pressed={levels.length === 0} onClick={() => setLevels([])} className={chipClass(levels.length === 0)}>
          Tất cả
        </button>
        {JLPT_LEVELS.map((lv) => (
          <button key={lv} type="button" aria-pressed={levels.includes(lv)} onClick={() => toggleLevel(lv)} className={chipClass(levels.includes(lv))}>
            {lv}
          </button>
        ))}
      </div>

      {list.loading ? (
        <div aria-busy="true" aria-live="polite" className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          <span className="sr-only">Đang tải chữ thuộc bộ...</span>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : list.error ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-body-sm text-error">
          <span>Không tải được chữ thuộc bộ: {list.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Không có chữ JLPT nào thuộc bộ này{levels.length > 0 ? " ở cấp đã chọn" : ""}.</p>
      ) : (
        <>
          <p className="text-label-sm text-outline">
            {items.length} chữ · bấm chữ để tra, đánh dấu ô để chọn làm thẻ bộ thủ
          </p>
          <ul className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 gap-2">
            {items.map((it) => {
              const checked = selected.has(it.kanji);
              const full = !checked && selectedVisible >= MAX_RADICAL_CARD_KANJI;
              return (
                <li key={it.kanji} className="relative">
                  <Link
                    to={`/kanji?k=${encodeURIComponent(it.kanji)}&r=${radical.no}`}
                    title={`Tra chữ ${it.kanji}`}
                    className={`flex flex-col items-center gap-0.5 pt-5 pb-1.5 px-1 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      checked ? "bg-primary/5 border-primary" : "bg-surface-container-low border-surface-container-high hover:border-outline-variant"
                    }`}
                  >
                    <span lang="ja" className="font-japanese text-2xl text-on-surface leading-tight">
                      {it.kanji}
                    </span>
                    <LevelChip level={it.level} />
                  </Link>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={full}
                    onChange={() => toggleKanji(it.kanji)}
                    aria-label={`Chọn ${it.kanji} để làm thẻ bộ thủ`}
                    title={full ? `Tối đa ${MAX_RADICAL_CARD_KANJI} chữ` : `Chọn ${it.kanji}`}
                    className="absolute top-1 right-1 w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
                  />
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void loadCards()} isLoading={cardsLoading} disabled={targets.length === 0}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">style</span>
                Thẻ bộ thủ ({targets.length})
              </Button>
              {selectedVisible > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Bỏ chọn
                </Button>
              )}
            </div>
            <p className="text-label-sm text-on-surface-variant">
              {selectedVisible > 0
                ? `Đã chọn ${selectedVisible}/${MAX_RADICAL_CARD_KANJI} chữ.`
                : `Chưa chọn chữ nào: dùng ${targets.length} chữ đầu danh sách (tối đa ${MAX_RADICAL_CARD_KANJI}).`}
            </p>
          </div>
        </>
      )}

      {cardsError && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Không tạo được thẻ bộ thủ: {cardsError}
        </p>
      )}
      {speakError && (
        <p role="status" className="text-label-sm text-on-surface-variant">
          {speakError}
        </p>
      )}
      {cards && (
        <RadicalCardsPanel
          key={cardsVersion}
          result={cards.cards}
          mnemonicSources={cards.sources}
          userLevel={userLevel}
          onSpeakError={setSpeakError}
        />
      )}
    </section>
  );
};
