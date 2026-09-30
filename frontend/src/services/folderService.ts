import { apiClient } from "./apiClient.ts";
import type { FolderDto, FolderMember, FolderNode } from "../types/api.types.ts";

const folderUrl = (id: string) => `/folders/${encodeURIComponent(id)}`;

/** Trả về cây thư mục (các node gốc, con nằm trong `children`). */
export const fetchFolders = async (): Promise<FolderNode[]> =>
    (await apiClient.get<FolderNode[]>("/folders")).data;

/** Thư mục người khác chia sẻ cho mình (access = viewer). */
export const fetchSharedFolders = async (): Promise<FolderNode[]> =>
    (await apiClient.get<FolderNode[]>("/folders/shared")).data;

/** Một thư mục kèm cây con: của mình, được chia sẻ, hoặc public (mở từ link). */
export const fetchFolder = async (id: string): Promise<FolderNode> =>
    (await apiClient.get<FolderNode>(folderUrl(id))).data;

export const createFolder = async (dto: FolderDto): Promise<FolderNode> =>
    (await apiClient.post<FolderNode>("/folders", dto)).data;

// PUT kiêm luôn "di chuyển": parentId nằm trong body -> không cần endpoint move riêng.
export const updateFolder = async (id: string, dto: FolderDto): Promise<FolderNode> =>
    (await apiClient.put<FolderNode>(folderUrl(id), dto)).data;

export const deleteFolder = async (id: string): Promise<void> => {
    await apiClient.delete(folderUrl(id));
};

export const fetchFolderMembers = async (id: string): Promise<FolderMember[]> =>
    (await apiClient.get<FolderMember[]>(`${folderUrl(id)}/shares`)).data;

/** Mời người dùng xem thư mục (chỉ xem & học); trả danh sách sau khi thêm. */
export const shareFolder = async (id: string, email: string): Promise<FolderMember[]> =>
    (await apiClient.put<FolderMember[]>(`${folderUrl(id)}/shares`, { email })).data;

/** Bật/tắt "ai có link đều xem được" (không đụng vị trí / tên thư mục). */
export const setFolderLinkAccess = async (id: string, isPublic: boolean): Promise<FolderNode> =>
    (await apiClient.put<FolderNode>(`${folderUrl(id)}/link-access`, { public: isPublic })).data;

export const unshareFolder = async (id: string, userId: number): Promise<void> => {
    await apiClient.delete(`${folderUrl(id)}/shares/${userId}`);
};
