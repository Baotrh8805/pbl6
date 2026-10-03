// Hằng số + helper dùng chung cho trang Thư viện bộ thẻ (tách khỏi .tsx để không vướng rule only-export-components).

export const CATEGORIES = [
  { id: "all", label: "Tất Cả Môn" },
  { id: "dokkai", label: "📖 Đọc hiểu Dokkai" },
  { id: "goi", label: "🔤 Từ vựng Goi" },
  { id: "kanji", label: "🈯 Kanji Hán tự" },
  { id: "bunpou", label: "⛩️ Ngữ pháp Bunpou" },
  { id: "kaiwa", label: "🗣️ Hội thoại Kaiwa" },
  { id: "it", label: "💻 Tiếng Nhật CNTT (BrSE)" },
  { id: "business", label: "💼 Thương Mại (BJT)" },
];

export { JLPT_LEVELS as LEVELS } from "../../../lib/deckUtils.ts";

/** Nhãn chủ đề (mã lưu ở DB, CHECK decks_category_check); null/lạ -> null. */
export function categoryLabel(id: string | null | undefined): string | null {
  return CATEGORIES.find((c) => c.id === id && c.id !== "all")?.label ?? null;
}

export type LibraryTab = "all" | "popular" | "official" | "community";

export const SORT_OPTIONS = [
  { value: "downloads", label: "Lượt tải nhiều nhất" },
  { value: "rating", label: "Đánh giá cao nhất" },
  { value: "cards", label: "Nhiều flashcard nhất" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export function isSortOption(value: string): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value);
}

// 18500 -> "18.5k", 35000 -> "35k", 1200000 -> "1.2M", 950 -> "950" (cùng kiểu hiển thị dữ liệu cũ).
export function formatCompactCount(value: number): string {
  const fmt = (n: number, suffix: string) => `${Number(n.toFixed(1))}${suffix}`;
  if (value >= 999_950) return fmt(value / 1_000_000, "M"); // 999_950 làm tròn thành "1M", không phải "1000k"
  if (value >= 1_000) return fmt(value / 1_000, "k");
  return String(value);
}

export { getInitials as initials } from "../../../lib/textUtils.ts";

export function getLevelBadgeClass(lvl: string): string {
  switch (lvl) {
    case "N1":
      return "bg-[#FFF1F2] text-[#BE123C]";
    case "N2":
      return "bg-[#FFF7ED] text-[#C2410C]";
    case "N3":
      return "bg-[#FEF3C7] text-[#B45309]";
    case "N4":
      return "bg-[#ECFDF5] text-[#047857]";
    case "N5":
      return "bg-[#EFF6FF] text-[#1D4ED8]";
    default:
      return "bg-surface-container text-on-surface";
  }
}
