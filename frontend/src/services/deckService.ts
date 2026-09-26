import { apiClient } from "./apiClient.ts";
import type {
    Card,
    CardDto,
    Deck,
    DeckDto,
    DeckMember,
    DeckVisibility,
    SharePermission,
} from "../types/api.types.ts";

const deckUrl = (deckId: string) => `/decks/${encodeURIComponent(deckId)}`;

export const fetchDecks = async (folderId?: string | null): Promise<Deck[]> =>
    (await apiClient.get<Deck[]>("/decks", { params: folderId ? { folderId } : {} })).data;

export const fetchDeck = async (deckId: string): Promise<Deck> =>
    (await apiClient.get<Deck>(deckUrl(deckId))).data;

export const createDeck = async (dto: DeckDto): Promise<Deck> =>
    (await apiClient.post<Deck>("/decks", dto)).data;

export const updateDeck = async (deckId: string, dto: DeckDto): Promise<Deck> =>
    (await apiClient.put<Deck>(deckUrl(deckId), dto)).data;

export const deleteDeck = async (deckId: string): Promise<void> => {
    await apiClient.delete(deckUrl(deckId));
};

export const addCard = async (deckId: string, dto: CardDto): Promise<Card> =>
    (await apiClient.post<Card>(`${deckUrl(deckId)}/cards`, dto)).data;

// Không fallback thêm từng thẻ: request timeout nhưng server đã lưu thì sẽ tạo thẻ trùng.
export const addCardsBatch = async (deckId: string, cards: CardDto[]): Promise<Card[]> =>
    (await apiClient.post<Card[]>(`${deckUrl(deckId)}/cards/batch`, cards)).data;

export const updateCard = async (deckId: string, cardId: string, dto: CardDto): Promise<Card> =>
    (await apiClient.put<Card>(`${deckUrl(deckId)}/cards/${encodeURIComponent(cardId)}`, dto)).data;

export const deleteCard = async (deckId: string, cardId: string): Promise<void> => {
    await apiClient.delete(`${deckUrl(deckId)}/cards/${encodeURIComponent(cardId)}`);
};

/**
 * Di chuyển bộ thẻ vào thư mục khác (hoặc ra gốc khi targetFolderId là null).
 * Không truyền mảng cards để backend không xóa thẻ và lịch sử ôn SRS.
 */
export const moveDeckToFolder = async (deck: Deck, targetFolderId: string | null): Promise<Deck> =>
    updateDeck(deck.id, {
        title: deck.title,
        level: deck.level,
        description: deck.description ?? undefined,
        folderId: targetFolderId,
    });

/** Lưu bản sao bộ thẻ (Thư viện, được chia sẻ) về tài khoản; backend ghi nguồn để đếm lượt tải. */
export const cloneDeck = async (deckId: string, folderId?: string | null): Promise<Deck> =>
    (await apiClient.post<Deck>(`${deckUrl(deckId)}/clone`, { folderId: folderId || null })).data;

/** Đổi chế độ hiển thị / chủ đề (chỉ chủ bộ thẻ). Không gửi cards -> thẻ và lịch sử ôn giữ nguyên. */
export const updateDeckPublishing = async (
    deck: Deck,
    publishing: { visibility: DeckVisibility; category?: string }
): Promise<Deck> =>
    updateDeck(deck.id, {
        title: deck.title,
        level: deck.level,
        description: deck.description ?? undefined,
        folderId: deck.folderId ?? null,
        ...publishing,
    });

export const fetchDeckMembers = async (deckId: string): Promise<DeckMember[]> =>
    (await apiClient.get<DeckMember[]>(`${deckUrl(deckId)}/shares`)).data;

/** Chia sẻ mới hoặc đổi quyền; trả danh sách sau khi đổi. */
export const shareDeck = async (deckId: string, email: string, permission: SharePermission): Promise<DeckMember[]> =>
    (await apiClient.put<DeckMember[]>(`${deckUrl(deckId)}/shares`, { email, permission })).data;

export const unshareDeck = async (deckId: string, userId: number): Promise<void> => {
    await apiClient.delete(`${deckUrl(deckId)}/shares/${userId}`);
};
