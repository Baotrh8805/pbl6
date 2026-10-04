import { apiClient } from "./apiClient.ts";
import type { DeckRatings, LibraryPage, LibraryRating } from "../types/api.types.ts";

export interface LibraryQuery {
    q?: string;
    level?: string;
    category?: string;
    tab?: string;
    sort?: string;
    page?: number;
    size?: number;
}

/** Tìm/lọc/sắp xếp/phân trang ở backend. Bỏ tham số rỗng hoặc "all" (backend coi thiếu = không lọc). */
export const fetchLibrary = async (query: LibraryQuery = {}): Promise<LibraryPage> => {
    const params = Object.fromEntries(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== "" && v !== "all")
    );
    return (await apiClient.get<LibraryPage>("/library/decks", { params })).data;
};

const ratingUrl = (deckId: string) => `/library/decks/${encodeURIComponent(deckId)}/rating`;

/** Chấm lại ghi đè cả sao lẫn bình luận (comment null = xoá bình luận). */
export const rateLibraryDeck = async (deckId: string, stars: number, comment: string | null): Promise<LibraryRating> =>
    (await apiClient.put<LibraryRating>(ratingUrl(deckId), { stars, comment })).data;

export const deleteMyRating = async (deckId: string): Promise<LibraryRating> =>
    (await apiClient.delete<LibraryRating>(ratingUrl(deckId))).data;

export const fetchDeckRatings = async (deckId: string, page = 0, size = 10): Promise<DeckRatings> =>
    (await apiClient.get<DeckRatings>(`${ratingUrl(deckId)}s`, { params: { page, size } })).data;
