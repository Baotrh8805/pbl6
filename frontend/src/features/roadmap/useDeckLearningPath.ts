import { useAsync } from "@/lib/useAsync";
import { fetchFolder } from "@/services/folderService";
import { fetchLearningPath } from "@/services/learningPathService";
import type { Deck } from "@/types/api.types";
import { deckPathLink, folderLearningPathId, type DeckPathLink } from "./roadmapUtils";

/**
 * LP-15: bộ thẻ đang mở có phải bộ của một chương trong lộ trình không, để trang sửa / trang bộ thẻ nhắc rằng thêm / xoá thẻ
 * đổi lịch của lộ trình. Chỉ chủ bộ thẻ thấy folderId; chỉ thư mục mang metadata.learningPathId (thư mục lộ trình tạo lúc kích
 * hoạt) mới gọi tới /learning-paths, nên bộ thẻ thường không tốn thêm request học. Lỗi bất kỳ (lộ trình đã xoá -> 404, mất mạng)
 * -> null: đây chỉ là lời nhắc, không chặn sửa.
 */
export function useDeckLearningPath(deck: Pick<Deck, "id" | "folderId" | "access"> | null | undefined): DeckPathLink | null {
  const deckId = deck?.id ?? "";
  const folderId = deck?.access === "owner" ? (deck.folderId ?? "") : "";
  const { data } = useAsync(() => findDeckPath(deckId, folderId), [deckId, folderId]);
  return data ?? null;
}

async function findDeckPath(deckId: string, folderId: string): Promise<DeckPathLink | null> {
  if (!deckId || !folderId) return null;
  const pathId = folderLearningPathId((await fetchFolder(folderId)).metadata);
  if (!pathId) return null;
  return deckPathLink(await fetchLearningPath(pathId), deckId);
}
