// Link chia sẻ bộ thẻ (D9) + xuất bộ thẻ (UC-29), kế hoạch 2026-10-26 B1 / B2.
import { apiClient } from "./apiClient.ts";

const enc = encodeURIComponent;

export const fetchShareLink = async (deckId: string): Promise<string | null> =>
    (await apiClient.get<{ token: string | null }>(`/decks/${enc(deckId)}/share-link`)).data.token;

/** Tạo link mới (có rồi thì đổi token, link cũ hết hiệu lực). */
export const rotateShareLink = async (deckId: string): Promise<string> =>
    (await apiClient.post<{ token: string }>(`/decks/${enc(deckId)}/share-link`)).data.token;

export const revokeShareLink = async (deckId: string): Promise<void> => {
    await apiClient.delete(`/decks/${enc(deckId)}/share-link`);
};

export const acceptShareLink = async (token: string): Promise<{ deckId: string; access: string }> =>
    (await apiClient.post<{ deckId: string; access: string }>(`/decks/share-link/${enc(token)}/accept`)).data;

/** URL đầy đủ của link chia sẻ. */
export const shareLinkUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, "")}/d/${enc(token)}`;

/** Tên tệp từ Content-Disposition (ưu tiên filename* UTF-8); không có → fallback. */
export const fileNameFromDisposition = (header: string | null | undefined, fallback: string): string => {
    if (!header) return fallback;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) {
        try {
            return decodeURIComponent(star[1].trim());
        } catch {
            /* rơi xuống filename thường */
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain ? plain[1].trim() : fallback;
};

/** Tải tệp xuất về máy (csv: mở bằng Excel; anki: File → Import trong Anki). */
export const downloadDeckExport = async (deckId: string, format: "csv" | "anki"): Promise<string> => {
    const res = await apiClient.get<Blob>(`/decks/${enc(deckId)}/export`, { params: { format }, responseType: "blob" });
    const name = fileNameFromDisposition(res.headers["content-disposition"] as string | undefined, `bo-the.${format === "csv" ? "csv" : "txt"}`);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
};
