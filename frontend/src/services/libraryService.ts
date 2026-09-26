import { apiClient } from "./apiClient.ts";
import type { LibraryPage, LibraryRating } from "../types/api.types.ts";

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

export const rateLibraryDeck = async (deckId: string, stars: number): Promise<LibraryRating> =>
    (await apiClient.put<LibraryRating>(`/library/decks/${encodeURIComponent(deckId)}/rating`, { stars })).data;
