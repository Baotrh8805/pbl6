// Bộ lọc Thư viện cộng đồng trên URL (rà soát Cộng đồng & Khám phá 30/10, A2): ?q=&level=&cat=&tab=&sort=&page= (page đếm từ 1).
// Giữ trên URL để Back quay lại bộ lọc trước, chia sẻ được link đã lọc, và (cùng lib/searchMemory.ts) quay lại qua sidebar không mất.
// Hàm thuần, scripts/selfcheck/library.ts kiểm. Giá trị lạ → mặc định (không ném), giá trị mặc định không ghi lên URL.
import { JLPT_LEVELS } from "../../lib/deckUtils.ts";
import { CATEGORIES, SORT_OPTIONS, type LibraryTab, type SortOption } from "./components/libraryOptions.ts";

export interface LibraryFilters {
    q: string;
    /** "" = mọi cấp. */
    level: string;
    /** "all" = mọi chủ đề. */
    category: string;
    tab: LibraryTab;
    sort: SortOption;
    /** Đếm từ 0 (URL đếm từ 1). */
    page: number;
}

export const LIBRARY_DEFAULTS: LibraryFilters = { q: "", level: "", category: "all", tab: "all", sort: "downloads", page: 0 };
/** Khoá URL của Thư viện, cũng là khoá được nhớ khi rời trang. */
export const LIBRARY_PARAMS = ["q", "level", "cat", "tab", "sort", "page"] as const;
export const LIBRARY_MEMORY_KEY = "library:lastSearch";
/** Như giới hạn q của GET /api/library/decks. */
const MAX_Q = 100;
const TABS: readonly LibraryTab[] = ["all", "popular", "official", "community"];

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export function parseLibraryParams(params: URLSearchParams): LibraryFilters {
    const page = Number.parseInt(params.get("page") ?? "", 10);
    return {
        q: (params.get("q") ?? "").slice(0, MAX_Q),
        level: oneOf(params.get("level"), JLPT_LEVELS, "" as (typeof JLPT_LEVELS)[number]),
        category: oneOf(params.get("cat"), CATEGORIES.map((c) => c.id), "all"),
        tab: oneOf(params.get("tab"), TABS, "all"),
        sort: oneOf(params.get("sort"), SORT_OPTIONS.map((o) => o.value), "downloads"),
        page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    };
}

/** Chuỗi tham số cho URL, bỏ mọi giá trị mặc định (URL gọn, Thư viện mặc định là /library). */
export function libraryParamsToSearch(f: LibraryFilters): string {
    const out = new URLSearchParams();
    if (f.q) out.set("q", f.q);
    if (f.level) out.set("level", f.level);
    if (f.category !== LIBRARY_DEFAULTS.category) out.set("cat", f.category);
    if (f.tab !== LIBRARY_DEFAULTS.tab) out.set("tab", f.tab);
    if (f.sort !== LIBRARY_DEFAULTS.sort) out.set("sort", f.sort);
    if (f.page > 0) out.set("page", String(f.page + 1));
    return out.toString();
}
