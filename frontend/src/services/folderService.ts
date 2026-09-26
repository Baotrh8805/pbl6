import { apiClient } from "./apiClient.ts";
import type { FolderDto, FolderNode } from "../types/api.types.ts";

/** Trả về cây thư mục (các node gốc, con nằm trong `children`). */
export const fetchFolders = async (): Promise<FolderNode[]> =>
    (await apiClient.get<FolderNode[]>("/folders")).data;

export const createFolder = async (dto: FolderDto): Promise<FolderNode> =>
    (await apiClient.post<FolderNode>("/folders", dto)).data;

// PUT kiêm luôn "di chuyển": parentId nằm trong body -> không cần endpoint move riêng.
export const updateFolder = async (id: string, dto: FolderDto): Promise<FolderNode> =>
    (await apiClient.put<FolderNode>(`/folders/${encodeURIComponent(id)}`, dto)).data;

export const deleteFolder = async (id: string): Promise<void> => {
    await apiClient.delete(`/folders/${encodeURIComponent(id)}`);
};
