import type { Deck, FolderNode } from "@/types/api.types";

// Tìm thư mục theo id trong cây (duyệt đệ quy).
export function findFolder(tree: FolderNode[], id: string): FolderNode | null {
  for (const f of tree) {
    if (f.id === id) return f;
    if (f.children?.length) {
      const found = findFolder(f.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Đường dẫn từ gốc tới thư mục đích (dùng cho breadcrumb).
export function getBreadcrumbs(tree: FolderNode[], targetId: string): FolderNode[] {
  function search(nodes: FolderNode[], trail: FolderNode[]): FolderNode[] | null {
    for (const node of nodes) {
      const currentTrail = [...trail, node];
      if (node.id === targetId) return currentTrail;
      if (node.children?.length) {
        const found = search(node.children, currentTrail);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree, []) || [];
}

// Lọc theo từ khoá (tiêu đề/mô tả) và trình độ.
export function matchesFilter(
  item: { title: string; description?: string | null; level?: string | null },
  q: string,
  level: string
): boolean {
  const matchSearch =
    !q ||
    item.title.toLowerCase().includes(q.toLowerCase()) ||
    (item.description ?? "").toLowerCase().includes(q.toLowerCase());
  const matchLevel = !level || item.level === level;
  return matchSearch && matchLevel;
}

export type FolderMetrics = Record<string, { decks: number; cards: number }>;

// Đếm số bộ thẻ / số thẻ theo từng thư mục.
export function computeFolderMetrics(decks: Deck[] | null | undefined): FolderMetrics {
  const map: FolderMetrics = {};
  if (!decks) return map;
  for (const d of decks) {
    if (d.folderId) {
      if (!map[d.folderId]) map[d.folderId] = { decks: 0, cards: 0 };
      map[d.folderId].decks += 1;
      map[d.folderId].cards += d.cards?.length ?? 0;
    }
  }
  return map;
}
