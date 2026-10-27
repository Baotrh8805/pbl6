// Link chia sẻ bộ thẻ (D9) + xuất bộ thẻ (UC-29), kế hoạch 2026-10-26 B1 / B2; mật khẩu link + CSV không tiêu đề (rà soát 27/10).
import { apiClient } from "./apiClient.ts";

const enc = encodeURIComponent;

/** token null = chưa có link; hasPassword = người mới mở link phải nhập mật khẩu. */
export interface ShareLinkInfo {
    token: string | null;
    hasPassword: boolean;
}

export const fetchShareLink = async (deckId: string): Promise<ShareLinkInfo> => {
    const d = (await apiClient.get<Partial<ShareLinkInfo>>(`/decks/${enc(deckId)}/share-link`)).data;
    return { token: d.token ?? null, hasPassword: d.hasPassword === true };
};

/** Tạo link mới (có rồi thì đổi token, link cũ hết hiệu lực); password rỗng = link không cần mật khẩu. */
export const rotateShareLink = async (deckId: string, password?: string): Promise<ShareLinkInfo> => {
    const body = password && password.trim() ? { password: password.trim() } : {};
    const d = (await apiClient.post<Partial<ShareLinkInfo>>(`/decks/${enc(deckId)}/share-link`, body)).data;
    return { token: d.token ?? null, hasPassword: d.hasPassword === true };
};

export const revokeShareLink = async (deckId: string): Promise<void> => {
    await apiClient.delete(`/decks/${enc(deckId)}/share-link`);
};

/** 403 code SHARE_PASSWORD_REQUIRED / SHARE_PASSWORD_WRONG khi link có mật khẩu (SharedDeckLinkPage hỏi rồi gửi lại). */
export const acceptShareLink = async (token: string, password?: string): Promise<{ deckId: string; access: string }> =>
    (await apiClient.post<{ deckId: string; access: string }>(`/decks/share-link/${enc(token)}/accept`, password ? { password } : {})).data;

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

/** Tải tệp xuất về máy (csv: mở bằng Excel; anki: File → Import trong Anki). header: CSV kèm dòng tên cột (mặc định không). */
export const downloadDeckExport = async (deckId: string, format: "csv" | "anki", opts: { header?: boolean } = {}): Promise<string> => {
    const res = await apiClient.get<Blob>(`/decks/${enc(deckId)}/export`, {
        params: { format, ...(opts.header ? { header: true } : {}) },
        responseType: "blob",
    });
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
