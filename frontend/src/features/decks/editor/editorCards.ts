import type { Card, CardDto, FolderNode } from "@/types/api.types";

// Hàng thẻ trong trình soạn: thêm _key ổn định phía client để làm React key
// (hàng có thể thêm/xoá/chèn giữa). _key không bao giờ gửi lên API.
export type EditorCard = CardDto & { _key: string };

let keyCounter = 0;
const nextKey = () => `card-${++keyCounter}`;

export function createEmptyCard(): EditorCard {
  return { _key: nextKey(), term: "", reading: "", meaning: "", example: "" };
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
    example: card.example || "",
  };
}

/** Bỏ _key, trim và loại hàng thiếu Thuật ngữ/Định nghĩa trước khi gửi API. */
export function toValidCardDtos(cards: EditorCard[]): CardDto[] {
  return cards
    .map((c) => ({
      id: c.id,
      term: c.term.trim(),
      reading: c.reading?.trim() || null,
      meaning: c.meaning.trim(),
      example: c.example?.trim() || null,
    }))
    .filter((c) => c.term.length > 0 && c.meaning.length > 0);
}

export function flattenFolders(nodes: FolderNode[], prefix = ""): Array<{ id: string; title: string }> {
  let result: Array<{ id: string; title: string }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, title: prefix ? `${prefix} / ${node.title}` : node.title });
    if (node.children?.length) {
      result = result.concat(flattenFolders(node.children, prefix ? `${prefix} / ${node.title}` : node.title));
    }
  }
  return result;
}
