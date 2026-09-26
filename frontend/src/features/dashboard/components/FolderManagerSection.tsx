import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ComingSoonBadge } from "@/components/ui/Modal";
import type { FolderItem } from "../types/dashboard.types";

interface FolderManagerSectionProps {
  folders: FolderItem[];
  onOpenCreateModal: () => void;
  onOpenShareModal: (folder: FolderItem) => void;
  onAddDeck: (folder: FolderItem) => void;
  onImportFile: () => void;
  onOpenCommunity: () => void;
  /** Số bộ thẻ / thẻ theo id thư mục, tính từ GET /decks. */
  folderStats: Record<string, { decks: number; cards: number }>;
}

export const FolderManagerSection: React.FC<FolderManagerSectionProps> = ({
  folders,
  onOpenCreateModal,
  onOpenShareModal,
  onAddDeck,
  onImportFile,
  onOpenCommunity,
  folderStats,
}) => {
  const searchId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("Tất cả");

  // Bộ lọc cấp độ sinh từ chính thư mục thật của người dùng
  const levelOptions = ["Tất cả", ...new Set(folders.map((f) => f.level))];

  const filteredFolders = folders.filter((folder) => {
    const matchesLevel = levelFilter === "Tất cả" || folder.level === levelFilter;

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      folder.title.toLowerCase().includes(query) ||
      folder.description.toLowerCase().includes(query);

    return matchesLevel && matchesSearch;
  });

  return (
    <section className="flex flex-col gap-space-md mt-2">
      {/* Header Thư Mục */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
            Quản Lý Thư Mục &amp; Bộ Thẻ
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Tổ chức tài liệu học cá nhân, chia sẻ theo nhóm BrSE và đồng bộ tài nguyên AI.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-space-xs">
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md hover:bg-tertiary-container transition-all shadow-sm active:scale-95 font-semibold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">create_new_folder</span>
            <span>+ Tạo Thư Mục Mới</span>
          </button>

          <button
            type="button"
            onClick={onImportFile}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-primary hover:bg-surface-container font-label-md text-label-md transition-colors shadow-sm font-semibold cursor-pointer border border-surface-container-high/60 whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">file_upload</span>
            <span>Tải tài liệu (AI)</span>
            <ComingSoonBadge />
          </button>

          <button
            type="button"
            onClick={onOpenCommunity}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-low text-primary hover:bg-surface-container font-label-md text-label-md transition-colors font-semibold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">public</span>
            <span>Thư viện cộng đồng</span>
          </button>
        </div>
      </div>

      {/* Search bar + Level Filter Pills */}
      <div className="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-space-sm border border-surface-container-high/40">
        <div className="relative flex-1">
          <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <label htmlFor={searchId} className="sr-only">
            Tìm kiếm thư mục
          </label>
          <input
            id={searchId}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low rounded-lg text-body-md font-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container transition-colors"
            placeholder="Tìm kiếm folder, giáo trình, bộ thẻ từ vựng..."
            type="search"
          />
        </div>

        <div role="group" aria-label="Lọc theo cấp độ" className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          <span className="font-label-sm text-label-sm text-outline px-1 shrink-0">Cấp độ:</span>
          {levelOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={levelFilter === tag}
              onClick={() => setLevelFilter(tag)}
              className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-all shrink-0 cursor-pointer whitespace-nowrap ${levelFilter === tag
                ? "bg-primary text-on-primary font-semibold"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state khi chưa có thư mục thật */}
      {filteredFolders.length === 0 && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg border border-dashed border-surface-container-high flex flex-col items-center text-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">folder_open</span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {folders.length === 0
              ? "Bạn chưa có thư mục nào. Tạo thư mục đầu tiên để sắp xếp bộ thẻ của bạn."
              : "Không tìm thấy thư mục phù hợp với bộ lọc."}
          </p>
          {folders.length === 0 && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md hover:bg-tertiary-container transition-colors font-semibold cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">create_new_folder</span>
              <span>Tạo Thư Mục Mới</span>
            </button>
          )}
        </div>
      )}

      {/* Folder Cards Grid */}
      <ul className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
        {filteredFolders.map((folder) => (
          <li
            key={folder.id}
            className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group border border-surface-container-high/40"
          >
            <div className="space-y-space-sm">
              <div className="flex items-start justify-between">
                <div
                  className={`w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center ${folder.iconColor} group-hover:scale-105 transition-transform shrink-0`}
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[28px] ${folder.iconColor}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {folder.iconName}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`font-label-sm text-label-sm px-2 py-0.5 rounded-full ${folder.tagBg} ${folder.tagColor} font-medium flex items-center gap-1 whitespace-nowrap`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                      {folder.tagIcon}
                    </span>
                    {folder.tagLabel}
                  </span>
                  <Link
                    to={`/folders?folderId=${encodeURIComponent(folder.id)}`}
                    className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
                    title="Mở thư mục"
                    aria-label={`Mở thư mục ${folder.title}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">open_in_new</span>
                  </Link>
                </div>
              </div>

              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold leading-tight">
                  <Link to={`/folders?folderId=${encodeURIComponent(folder.id)}`} className="hover:underline">
                    {folder.title}
                  </Link>
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {folder.description}
                </p>
              </div>

              {/* Số liệu thật: bộ thẻ nằm trực tiếp trong thư mục */}
              <dl className="grid grid-cols-2 gap-2 py-2 px-3 rounded-lg bg-surface-container-low text-center font-label-sm">
                <div>
                  <dt className="text-outline text-[11px] whitespace-nowrap">Bộ thẻ</dt>
                  <dd className="font-bold text-[14px] text-primary">{folderStats[folder.id]?.decks ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-outline text-[11px] whitespace-nowrap">Thẻ</dt>
                  <dd className="font-bold text-[14px] text-secondary">{folderStats[folder.id]?.cards ?? 0}</dd>
                </div>
              </dl>
            </div>

            {/* Folder Actions */}
            <div className="pt-space-md flex items-center justify-between gap-2 border-t border-surface-container-low mt-3">
              <button
                type="button"
                onClick={() => onOpenShareModal(folder)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors font-medium cursor-pointer whitespace-nowrap text-xs"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  {folder.accessType === "shared" ? "link" : "share"}
                </span>
                <span>{folder.accessType === "shared" ? "Chia sẻ link" : "Chia sẻ folder"}</span>
              </button>

              <button
                type="button"
                onClick={() => onAddDeck(folder)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors font-medium cursor-pointer whitespace-nowrap text-xs bg-primary text-on-primary hover:bg-primary-container"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
                <span>Thêm bộ thẻ</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
