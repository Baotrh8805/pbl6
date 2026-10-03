import type { Card, CardDto } from "@/types/api.types";

// Hàng thẻ trong trình soạn: thêm _key ổn định phía client để làm React key
// (hàng có thể thêm/xoá/chèn giữa). _key không bao giờ gửi lên API.
export type EditorCard = CardDto & { _key: string };

let keyCounter = 0;
const nextKey = () => `card-${++keyCounter}`;

export function createEmptyCard(): EditorCard {
  return { _key: nextKey(), term: "", reading: "", meaning: "" };
}

export function createEmptyCards(count: number): EditorCard[] {
  return Array.from({ length: count }, createEmptyCard);
}

/** Thẻ đã lưu (từ API) hoặc thẻ nhập hàng loạt -> hàng soạn thảo. */
export function toEditorCard(card: Card | CardDto): EditorCard {
  return {
    _key: nextKey(),
    id: card.id,
    term: card.term,
    reading: card.reading || "",
    meaning: card.meaning,
  };
}

/**
 * Đảo 2 cột: cột trái (Thuật ngữ + Cách đọc) <-> cột phải (Nội dung).
 * Dòng đầu của nội dung thành Thuật ngữ; Thuật ngữ, Cách đọc và các dòng còn lại gộp thành nội dung mới.
 * Không mất chữ nào.
 */
export function swapCardColumns(card: EditorCard): EditorCard {
  const [first = "", ...rest] = card.meaning.split("\n");
  const reading = card.reading?.trim() ?? "";
  const meaning = [card.term, reading, ...rest].filter((l) => l.trim().length > 0).join("\n");
  return { ...card, term: first.trim(), reading: "", meaning };
}

/** Bỏ _key, trim và loại hàng thiếu Thuật ngữ/Định nghĩa trước khi gửi API. */
export function toValidCardDtos(cards: EditorCard[]): CardDto[] {
  return cards
    .map((c) => ({
      id: c.id,
      term: c.term.trim(),
      reading: c.reading?.trim() || null,
      meaning: c.meaning.trim(),
    }))
    .filter((c) => c.term.length > 0 && c.meaning.length > 0);
}
