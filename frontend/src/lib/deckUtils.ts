// Hàm thuần (không gọi API) cho bộ thẻ/thư mục: dễ kiểm bằng scripts/selfCheck.ts.
import { isDue, type Review } from "./srs.ts";
import type { Card, Deck, FolderNode } from "../types/api.types.ts";

/** Cấp JLPT theo thứ tự học (dễ -> khó). Nguồn duy nhất cho mọi select / bộ lọc cấp độ. */
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/**
 * Làm phẳng cây thành các đích di chuyển hợp lệ: bỏ `excludeId` và toàn bộ nhánh dưới nó
 * (cùng quy tắc backend chặn ở FolderService.checkMove) để select không hiện lựa chọn chắc chắn lỗi.
 */
export const moveTargets = (
    tree: FolderNode[],
    excludeId: string | null,
    depth = 0
): { id: string; title: string; depth: number }[] => {
    const out: { id: string; title: string; depth: number }[] = [];
    for (const node of tree) {
        if (node.id === excludeId) continue; // cắt cả subtree
        out.push({ id: node.id, title: node.title, depth });
        out.push(...moveTargets(node.children ?? [], excludeId, depth + 1));
    }
    return out;
};

/** Đếm ngược theo mốc hết giờ, không cộng dồn tick: tab bị treo vẫn ra đúng số giây. */
export const secondsLeft = (deadline: number, now: number): number =>
    Math.max(0, Math.ceil((deadline - now) / 1000));

const LEVEL_RANK: Record<string, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };

export const sortDecksByLevel = (decks: Deck[]): Deck[] =>
    [...decks].sort(
        (a, b) => (LEVEL_RANK[a.level] ?? 99) - (LEVEL_RANK[b.level] ?? 99) || a.title.localeCompare(b.title)
    );

/** Thẻ có khoảng ôn từ 21 ngày trở lên coi là đã thuộc (ngưỡng "mature" của SM-2/Anki). */
export const MASTERED_INTERVAL_DAYS = 21;

export interface DeckProgress {
    total: number;
    due: number;
    mastered: number;
    pct: number;
}

export const calcDeckProgress = (
    cards: Card[],
    reviews: Record<string, Review>,
    now: Date = new Date()
): DeckProgress => {
    const total = cards.length;
    const due = cards.filter((c) => isDue(reviews[c.id], now)).length;
    const mastered = cards.filter((c) => (reviews[c.id]?.intervalDays ?? 0) >= MASTERED_INTERVAL_DAYS).length;
    const pct = total ? Math.round((mastered / total) * 100) : 0;
    return { total, due, mastered, pct };
};

/** Nhãn nguồn bộ thẻ theo quyền của người đang xem. */
export const deckSourceLabel = (deck: Pick<Deck, "access" | "visibility">): string =>
    deck.access === "owner" ? "Cá nhân" : deck.access === "viewer" && deck.visibility === "public" ? "Thư viện" : "Được chia sẻ";

/** Chủ bộ thẻ và người được chia sẻ quyền sửa: sửa thông tin + thêm/sửa/xoá thẻ. Xoá bộ thẻ chỉ chủ. */
export const canEditDeck = (deck: Pick<Deck, "access">): boolean => deck.access !== "viewer";

/**
 * Liên kết chia sẻ bộ thẻ = đúng trang chi tiết (/decks/:deckId), không phải route riêng:
 * người mở chưa đăng nhập sẽ bị đưa tới /login rồi tự quay lại đây; backend cấp quyền xem
 * nếu bộ thẻ công khai hoặc người đó được mời. Cắt "/" thừa cuối origin để không ra "//decks".
 */
export const deckShareUrl = (origin: string, deckId: string): string =>
    `${origin.replace(/\/+$/, "")}/decks/${encodeURIComponent(deckId)}`;

/** So khớp thuật ngữ thẻ: NFKC (全角/半角 như nhau), bỏ khoảng trắng hai đầu; rỗng -> "". */
const termKey = (term: string | null | undefined): string => (term ?? "").normalize("NFKC").trim();

/**
 * Thẻ trong bộ đã có đúng thuật ngữ này (vd. thêm 学校 từ bản đồ Hán–Việt vào bộ đã có 学校) -> trả thẻ đó để báo trùng;
 * backend không chặn thẻ trùng nên máy khách tự kiểm trước khi thêm. Thuật ngữ rỗng -> null.
 */
export const findCardByTerm = (cards: readonly Pick<Card, "term" | "reading" | "meaning">[], term: string) => {
    const key = termKey(term);
    if (!key) return null;
    return cards.find((c) => termKey(c.term) === key) ?? null;
};
