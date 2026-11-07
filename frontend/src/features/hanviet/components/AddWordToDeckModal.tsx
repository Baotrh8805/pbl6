import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { addCard, fetchDeck } from "@/services/deckService";
import { extractErrorMessage } from "@/services/apiClient";
import { findCardByTerm, sortDecksByLevel } from "@/lib/deckUtils";
import { wordToCardDto } from "@/lib/hanVietUtils";
import type { Card, Deck, HanVietWordNode } from "@/types/api.types";
import { LevelChip } from "./HanVietBits";

export interface AddWordToDeckModalProps {
  /** null = đóng. */
  word: HanVietWordNode | null;
  /** Bộ thẻ CỦA người dùng (access = owner) từ shell context; bộ được chia sẻ không thêm thẻ vào đây. */
  decks: Deck[];
  decksLoading: boolean;
  onClose: () => void;
}

// Ô chọn là radio thật (ẩn) bọc trong label -> bàn phím / đọc màn hình dùng được (cùng kiểu SaveToFolderModal).
const optionClass = (selected: boolean) =>
  `flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
    selected
      ? "bg-primary-container/10 border-primary text-primary font-semibold"
      : "bg-surface-container-lowest border-surface-container-high text-on-surface hover:bg-surface-container-low"
  }`;

// Chỉ mount khi có từ -> state (bộ đã chọn, lỗi, đã thêm) tự về mặc định mỗi lần mở, không cần effect reset.
export const AddWordToDeckModal: React.FC<AddWordToDeckModalProps> = (props) =>
  props.word ? <AddWordDialog {...props} word={props.word} /> : null;

const AddWordDialog: React.FC<AddWordToDeckModalProps & { word: HanVietWordNode }> = ({ word, decks, decksLoading, onClose }) => {
  const formId = useId();
  const sorted = sortDecksByLevel(decks);
  const dto = wordToCardDto(word);
  const term = dto?.term ?? word.label;
  // Mặc định chọn bộ đầu tiên CHƯA có từ này (backend không chặn thẻ trùng nên máy khách tự kiểm).
  const [deckId, setDeckId] = useState(
    () => (sorted.find((d) => !findCardByTerm(d.cards, term)) ?? sorted[0])?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Deck | null>(null);
  // Thẻ trùng chỉ thấy khi tải lại bộ lúc bấm "Thêm thẻ" (danh sách của shell có thể chưa có thẻ vừa thêm ở tab khác).
  const [freshDup, setFreshDup] = useState<Record<string, Pick<Card, "term" | "reading" | "meaning">>>({});
  const dupIn = (d: Deck) => freshDup[d.id] ?? findCardByTerm(d.cards, term);
  const target = sorted.find((d) => d.id === deckId) ?? null;
  const duplicate = target ? dupIn(target) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dto || !target || saving || duplicate) return;
    setSaving(true);
    setError(null);
    try {
      // Kiểm lại trên bản mới nhất của bộ; không tải được thì dựa vào danh sách đang có (đã kiểm ở trên).
      const fresh = await fetchDeck(target.id).then(
        (d) => findCardByTerm(d.cards, term),
        () => null
      );
      if (fresh) {
        setFreshDup((m) => ({ ...m, [target.id]: fresh }));
        return;
      }
      await addCard(target.id, dto);
      setAdded(target);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Thêm vào bộ thẻ"
      subtitle={word.label}
      icon="playlist_add"
      size="md"
      closeOnBackdrop={!saving}
      footer={
        added ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Link
              to={`/decks/${encodeURIComponent(added.id)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold font-headline hover:bg-primary-deep"
            >
              Mở bộ thẻ
            </Link>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={formId}
              size="sm"
              isLoading={saving}
              disabled={!dto || !target || decksLoading || !!duplicate}
            >
              Thêm thẻ
            </Button>
          </>
        )
      }
    >
      {added ? (
        <p role="status" className="text-body-sm text-on-surface">
          Đã thêm <strong lang="ja">{word.label}</strong> vào bộ thẻ «{added.title}». Thẻ mới sẽ xuất hiện ở lượt học tới.
        </p>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
              {error}
            </p>
          )}

          {/* Xem trước thẻ sẽ tạo */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
            <p className="text-title-md font-semibold font-japanese text-on-surface">
              <span lang="ja">{word.label}</span>
              {word.reading && (
                <span lang="ja" className="ml-2 text-label-md font-normal text-on-surface-variant">
                  {word.reading}
                </span>
              )}
            </p>
            <p className="text-body-sm text-on-surface-variant mt-0.5">{dto?.meaning ?? "Từ này chưa có nghĩa để tạo thẻ."}</p>
            <div className="flex items-center gap-2 mt-1.5 text-label-sm">
              {word.hanViet && <span className="font-semibold text-tertiary tracking-wide">{word.hanViet}</span>}
              <LevelChip level={word.level} />
            </div>
          </div>

          {decksLoading ? (
            <p className="text-body-sm text-on-surface-variant" aria-live="polite">
              Đang tải bộ thẻ của bạn…
            </p>
          ) : sorted.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              Bạn chưa có bộ thẻ nào.{" "}
              <Link to="/decks/new" className="text-primary font-semibold hover:underline">
                Tạo bộ thẻ mới
              </Link>{" "}
              rồi quay lại đây.
            </p>
          ) : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold font-headline text-on-surface tracking-wide mb-1.5">Chọn bộ thẻ</legend>
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                {sorted.map((d) => (
                  <label key={d.id} className={optionClass(deckId === d.id)}>
                    <input
                      type="radio"
                      name="hv-target-deck"
                      value={d.id}
                      checked={deckId === d.id}
                      onChange={() => setDeckId(d.id)}
                      className="sr-only"
                    />
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 flex items-center gap-1.5 text-[11px] text-outline">
                      {dupIn(d) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-semibold">Đã có</span>
                      )}
                      {d.cards.length} thẻ
                      <LevelChip level={d.level} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {target && duplicate && (
            <p
              role="status"
              className="flex items-start gap-2 p-3 rounded-lg bg-[#FEF3C7] border border-[#F59E0B]/40 text-[#92400E] text-body-sm"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">
                content_copy
              </span>
              <span>
                Bộ «{target.title}» đã có thẻ <strong lang="ja">{duplicate.term}</strong>
                {duplicate.reading && (
                  <>
                    {" "}
                    (<span lang="ja">{duplicate.reading}</span>)
                  </>
                )}
                {duplicate.meaning.trim() && ` — ${duplicate.meaning.split("\n")[0]}`}. Hãy chọn bộ khác, hoặc{" "}
                <Link to={`/decks/${encodeURIComponent(target.id)}`} className="font-semibold underline">
                  mở bộ thẻ
                </Link>{" "}
                để sửa thẻ đã có.
              </span>
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};
