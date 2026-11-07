// Nút lưu bộ thẻ ở Thư viện (rà soát Cộng đồng & Khám phá 30/10, A4): đã lưu → "Đã lưu · Mở" dẫn tới bản đã lưu thay vì cho
// lưu thêm bản trùng (backend chặn bằng 409 DECK_ALREADY_SAVED). Hàm thuần, scripts/selfcheck/library.ts kiểm.
import { errorCodeOf } from "../../lib/apiErrorInfo.ts";
import type { LibraryDeck } from "../../types/api.types.ts";

export type SaveAction = { kind: "save" } | { kind: "open"; href: string; label: string };

export const saveActionOf = (deck: Pick<LibraryDeck, "savedDeckId">): SaveAction =>
    deck.savedDeckId ? { kind: "open", href: `/decks/${encodeURIComponent(deck.savedDeckId)}`, label: "Đã lưu · Mở" } : { kind: "save" };

/** Lưu lần hai (vd. mở hai tab rồi bấm lưu ở cả hai): backend trả 409 DECK_ALREADY_SAVED. */
export const isAlreadySavedError = (error: unknown): boolean => errorCodeOf(error) === "DECK_ALREADY_SAVED";
