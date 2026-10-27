// Sắp xếp / lọc danh sách bộ thẻ (rà soát 27/10): mặc định "mới cập nhật trước", lọc theo khoảng thời gian và "cần ôn".
// Hàm thuần, import tương đối để scripts/selfcheck chạy được.
import type { Card, Deck } from "../../types/api.types.ts";
import type { Review } from "../../lib/srs.ts";
import { isDue } from "../../lib/srs.ts";
import { withinDays } from "../../lib/timeLabel.ts";

export type DeckSort = "updated" | "created" | "title" | "level" | "cards";
export type DeckPeriod = "" | "today" | "7d" | "30d";

export const DECK_SORTS: { value: DeckSort; label: string }[] = [
    { value: "updated", label: "Mới cập nhật" },
    { value: "created", label: "Mới tạo" },
    { value: "title", label: "Tên A → Z" },
    { value: "level", label: "Cấp N5 → N1" },
    { value: "cards", label: "Nhiều thẻ nhất" },
];

export const DECK_PERIODS: { value: DeckPeriod; label: string }[] = [
    { value: "", label: "Mọi thời gian" },
    { value: "today", label: "Cập nhật hôm nay" },
    { value: "7d", label: "7 ngày qua" },
    { value: "30d", label: "30 ngày qua" },
];

const PERIOD_DAYS: Record<Exclude<DeckPeriod, "">, number> = { today: 1, "7d": 7, "30d": 30 };

export const isDeckSort = (v: string | null): v is DeckSort => DECK_SORTS.some((s) => s.value === v);
export const isDeckPeriod = (v: string | null): v is DeckPeriod => v === "" || DECK_PERIODS.some((p) => p.value === v);

const ts = (iso: string | null | undefined): number => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
};

/** Mốc "cập nhật" dùng cho sắp xếp / lọc: updatedAt, thiếu thì createdAt (response cũ không có -> 0, xếp cuối). */
export const deckUpdatedAt = (d: Pick<Deck, "updatedAt" | "createdAt">): string | null => d.updatedAt ?? d.createdAt ?? null;

/** Số thẻ ĐÃ HỌC đến hạn của từng bộ (thẻ chưa học không tính: đó là "mới", không phải nợ ôn). */
export function dueByDeck(decks: Deck[], reviews: Record<string, Review>, now: Date = new Date()): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of decks) {
        let n = 0;
        for (const c of d.cards) if (reviews[c.id] && isDue(reviews[c.id], now)) n++;
        out[d.id] = n;
    }
    return out;
}

export function sortDecks(decks: Deck[], sort: DeckSort): Deck[] {
    const level = (d: Deck) => Number.parseInt(d.level.replace(/\D/g, ""), 10) || 0;
    const byUpdated = (a: Deck, b: Deck) => ts(deckUpdatedAt(b)) - ts(deckUpdatedAt(a));
    const out = [...decks];
    switch (sort) {
        case "created":
            out.sort((a, b) => ts(b.createdAt) - ts(a.createdAt) || byUpdated(a, b));
            break;
        case "title":
            out.sort((a, b) => a.title.localeCompare(b.title, "vi") || byUpdated(a, b));
            break;
        case "level":
            out.sort((a, b) => level(b) - level(a) || byUpdated(a, b)); // N5 (5) trước N1 (1)
            break;
        case "cards":
            out.sort((a, b) => b.cards.length - a.cards.length || byUpdated(a, b));
            break;
        default:
            out.sort(byUpdated);
    }
    return out;
}

export interface DeckFilter {
    q?: string;
    level?: string;
    period?: DeckPeriod;
    /** Chỉ bộ có thẻ đã học đến hạn (dùng với dueByDeck). */
    dueOnly?: boolean;
}

export function filterDecks(decks: Deck[], f: DeckFilter, due: Record<string, number> = {}, now: Date = new Date()): Deck[] {
    const q = (f.q ?? "").trim().toLowerCase();
    return decks.filter(
        (d) =>
            (!f.level || d.level === f.level) &&
            (!q || (d.title + " " + (d.description ?? "")).toLowerCase().includes(q)) &&
            (!f.period || withinDays(deckUpdatedAt(d), PERIOD_DAYS[f.period], now)) &&
            (!f.dueOnly || (due[d.id] ?? 0) > 0)
    );
}

export type CardSort = "position" | "newest" | "oldest";
export const CARD_SORTS: { value: CardSort; label: string }[] = [
    { value: "position", label: "Thứ tự trong bộ" },
    { value: "newest", label: "Mới thêm trước" },
    { value: "oldest", label: "Cũ nhất trước" },
];

/** Thẻ trong một bộ: theo vị trí (mặc định) hoặc theo mốc thêm (thiếu createdAt -> xem vị trí lớn hơn là mới hơn). */
export function sortCards<T extends Pick<Card, "position" | "createdAt">>(cards: T[], sort: CardSort): T[] {
    if (sort === "position") return cards;
    const pos = (c: T) => c.position ?? 0;
    const key = (c: T) => ts(c.createdAt ?? null) || pos(c);
    const out = [...cards];
    out.sort((a, b) => (sort === "newest" ? key(b) - key(a) || pos(b) - pos(a) : key(a) - key(b) || pos(a) - pos(b)));
    return out;
}
