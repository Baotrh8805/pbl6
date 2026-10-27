import { useAsync } from "@/lib/useAsync";
import { fetchFolder } from "@/services/folderService";
import { fetchLearningPath, fetchLearningPaths } from "@/services/learningPathService";
import type { Deck } from "@/types/api.types";
import { activePathIds, deckPathLink, folderLearningPathId, type DeckPathLink } from "./roadmapUtils";

/**
 * LP-15: bộ thẻ đang mở có phải bộ của một chương trong lộ trình không, để trang sửa / trang bộ thẻ nhắc rằng thêm / xoá thẻ
 * đổi lịch của lộ trình. Chỉ chủ bộ thẻ thấy folderId; chỉ thư mục mang metadata.learningPathId (thư mục lộ trình tạo lúc kích
 * hoạt) mới gọi tới /learning-paths, nên bộ thẻ thường không tốn thêm request học. Lỗi bất kỳ (lộ trình đã xoá -> 404, mất mạng)
 * -> null: đây chỉ là lời nhắc, không chặn sửa.
 */
export function useDeckLearningPath(deck: Pick<Deck, "id" | "folderId" | "access"> | null | undefined): DeckPathLink | null {
  const deckId = deck?.id ?? "";
  const folderId = deck?.access === "owner" ? (deck.folderId ?? "") : "";
  // Chỉ bộ của mình mới có thể là bộ của chương (lộ trình tạo bộ cho chủ); bộ được chia sẻ -> không tra
  const owner = deck?.access === "owner";
  const { data } = useAsync(() => (owner ? findDeckPath(deckId, folderId) : Promise.resolve(null)), [deckId, folderId, owner]);
  return data ?? null;
}

async function findDeckPath(deckId: string, folderId: string): Promise<DeckPathLink | null> {
  if (!deckId) return null;
  // Đường nhanh: thư mục của lộ trình (metadata.learningPathId) -> một lộ trình
  if (folderId) {
    const pathId = folderLearningPathId((await fetchFolder(folderId)).metadata);
    if (pathId) {
      const link = deckPathLink(await fetchLearningPath(pathId), deckId);
      if (link) return link;
    }
  }
  // B5.8 (LP-15): bộ đã rời thư mục lộ trình (kéo sang thư mục khác, thư mục bị xoá) vẫn là bộ của một chương -> so
  // chapters[].deckId của mọi lộ trình đang học; không phụ thuộc thư mục nữa.
  for (const id of activePathIds(await fetchLearningPaths())) {
    const link = deckPathLink(await fetchLearningPath(id), deckId);
    if (link) return link;
  }
  return null;
}
