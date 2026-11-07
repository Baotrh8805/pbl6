import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { FolderItem } from "../types/dashboard.types";

interface FolderManagerSectionProps {
  folders: FolderItem[];
  onOpenCreateModal: () => void;
  onOpenShareModal: (folder: FolderItem) => void;
  onAddDeck: (folder: FolderItem) => void;
  onImportFile: () => void;
  onOpenCommunity: () => void;
  loading?: boolean;
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
  loading = false,
}) => {
  const searchId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("Tất cả");

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
    <section className="flex flex-col gap-4 mt-1">
      {/* Header Thư Mục */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Quản lý thư mục &amp; Học liệu
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổ chức tài liệu học cá nhân, chia sẻ theo nhóm BrSE và đồng bộ tài nguyên AI.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white font-label-md text-xs hover:bg-blue-700 transition-all shadow-xs active:scale-95 font-semibold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">create_new_folder</span>
            <span>+ Tạo Thư Mục Mới</span>
          </button>

          <button
            type="button"
            onClick={onImportFile}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/80 font-label-md text-xs transition-colors shadow-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">file_upload</span>
            <span>Tải tài liệu (AI)</span>
          </button>

          <button
            type="button"
            onClick={onOpenCommunity}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-label-md text-xs transition-colors font-semibold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">public</span>
            <span>Thư viện cộng đồng</span>
          </button>
        </div>
      </div>

      {/* Search bar + Level Filter Pills: Tự động ẩn khi có ít hơn 4 thư mục để tránh làm loãng giao diện */}
      {folders.length >= 4 && (
        <div className="bg-white rounded-2xl p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3 border border-slate-200/90">
          <div className="relative flex-1">
            <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <label htmlFor={searchId} className="sr-only">
              Tìm kiếm thư mục
            </label>
            <input
              id={searchId}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 border border-slate-200/70 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
              placeholder="Tìm kiếm folder, giáo trình, bộ thẻ từ vựng..."
              type="text"
              enterKeyHint="search"
            />
          </div>

          <div role="group" aria-label="Lọc theo cấp độ" className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
            <span className="text-xs text-slate-500 font-medium px-1 shrink-0">Cấp độ:</span>
            {levelOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={levelFilter === tag}
                onClick={() => setLevelFilter(tag)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  levelFilter === tag
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <ul className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" aria-label="Đang tải danh sách thư mục">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4 animate-pulse"
              aria-hidden="true"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-slate-100" />
                <div className="h-5 w-16 rounded-full bg-slate-100" />
              </div>
              <div className="space-y-2">
                <div className="h-5 w-3/5 rounded bg-slate-200" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="h-4 w-20 rounded bg-slate-100" />
                <div className="h-4 w-16 rounded bg-slate-100" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state khi chưa có thư mục */}
      {!loading && filteredFolders.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-slate-200 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">folder_open</span>
          </div>
          <p className="text-sm text-slate-600 max-w-sm">
            {folders.length === 0
              ? "Bạn chưa có thư mục nào. Tạo thư mục đầu tiên để sắp xếp bộ thẻ của bạn."
              : "Không tìm thấy thư mục phù hợp với bộ lọc."}
          </p>
          {folders.length === 0 && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">create_new_folder</span>
              <span>Tạo Thư Mục Mới</span>
            </button>
          )}
        </div>
      )}

      {/* Folder Cards Grid */}
      {!loading && filteredFolders.length > 0 && (
        <ul className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredFolders.map((folder) => (
          <li
            key={folder.id}
            className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative group"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div
                  className={`w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center ${folder.iconColor} group-hover:scale-105 transition-transform shrink-0`}
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[24px] ${folder.iconColor}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {folder.iconName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full ${folder.tagBg} ${folder.tagColor} font-semibold flex items-center gap-1 whitespace-nowrap`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                      {folder.tagIcon}
                    </span>
                    {folder.tagLabel}
                  </span>
                  <Link
                    to={`/folders?folderId=${encodeURIComponent(folder.id)}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Mở thư mục"
                    aria-label={`Mở thư mục ${folder.title}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
                  </Link>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                  <Link to={`/folders?folderId=${encodeURIComponent(folder.id)}`} className="hover:underline">
                    {folder.title}
                  </Link>
                </h3>
                {folder.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {folder.description}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200/60 text-center text-xs">
                <div>
                  <dt className="text-slate-500 text-[11px] whitespace-nowrap">Bộ thẻ</dt>
                  <dd className="font-bold text-sm text-slate-900 mt-0.5">{folderStats[folder.id]?.decks ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 text-[11px] whitespace-nowrap">Thẻ</dt>
                  <dd className="font-bold text-sm text-emerald-600 mt-0.5">{folderStats[folder.id]?.cards ?? 0}</dd>
                </div>
              </dl>
            </div>

            <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 mt-3">
              <button
                type="button"
                onClick={() => onOpenShareModal(folder)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                  {folder.accessType === "shared" ? "link" : "share"}
                </span>
                <span>{folder.accessType === "shared" ? "Chia sẻ link" : "Chia sẻ folder"}</span>
              </button>

              <button
                type="button"
                onClick={() => onAddDeck(folder)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-semibold text-xs cursor-pointer whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-colors"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">add</span>
                <span>Thêm bộ thẻ</span>
              </button>
            </div>
          </li>
        ))}
        </ul>
      )}
    </section>
  );
};
