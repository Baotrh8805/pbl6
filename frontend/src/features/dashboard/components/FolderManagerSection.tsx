import React, { useState } from "react";
import type { FolderItem } from "../types/dashboard.types";

interface FolderManagerSectionProps {
  folders: FolderItem[];
  onOpenCreateModal: () => void;
  onOpenShareModal: (folder: FolderItem) => void;
  onImportFile: () => void;
  onOpenCommunity: () => void;
}

export const FolderManagerSection: React.FC<FolderManagerSectionProps> = ({
  folders,
  onOpenCreateModal,
  onOpenShareModal,
  onImportFile,
  onOpenCommunity,
}) => {
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
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md hover:bg-tertiary-container transition-all shadow-sm active:scale-95 font-semibold cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
            <span>+ Tạo Thư Mục Mới</span>
          </button>

          <button
            onClick={onImportFile}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-primary hover:bg-surface-container font-label-md text-label-md transition-colors shadow-sm font-semibold cursor-pointer border border-surface-container-high/60 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">file_upload</span>
            <span>Nhập từ file (Anki/Excel)</span>
          </button>

          <button
            onClick={onOpenCommunity}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-low text-primary hover:bg-surface-container font-label-md text-label-md transition-colors font-semibold cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">public</span>
            <span>Thư viện cộng đồng</span>
          </button>
        </div>
      </div>

      {/* Search bar + Level Filter Pills */}
      <div className="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-space-sm border border-surface-container-high/40">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low rounded-lg text-body-md font-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container transition-colors"
            placeholder="Tìm kiếm folder, giáo trình, bộ thẻ từ vựng..."
            type="text"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          <span className="font-label-sm text-label-sm text-outline px-1 shrink-0">Cấp độ:</span>
          {levelOptions.map((tag) => (
            <button
              key={tag}
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
          <span className="material-symbols-outlined text-[36px] text-outline">folder_open</span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {folders.length === 0
              ? "Bạn chưa có thư mục nào. Tạo thư mục đầu tiên để sắp xếp bộ thẻ của bạn."
              : "Không tìm thấy thư mục phù hợp với bộ lọc."}
          </p>
          {folders.length === 0 && (
            <button
              onClick={onOpenCreateModal}
              className="mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md hover:bg-tertiary-container transition-colors font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
              <span>Tạo Thư Mục Mới</span>
            </button>
          )}
        </div>
      )}

      {/* 3 Folder Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
        {filteredFolders.map((folder) => (
          <div
            key={folder.id}
            className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group border border-surface-container-high/40"
          >
            <div className="space-y-space-sm">
              <div className="flex items-start justify-between">
                <div
                  className={`w-12 h-12 rounded-xl ${folder.iconBg} flex items-center justify-center ${folder.iconColor} group-hover:scale-105 transition-transform shrink-0`}
                >
                  <span
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
                    {folder.tagIcon && (
                      <span className="material-symbols-outlined text-[13px]">
                        {folder.tagIcon}
                      </span>
                    )}
                    {folder.tagLabel}
                  </span>
                  <button
                    onClick={() => alert(`Tùy chọn cho thư mục: ${folder.title}`)}
                    className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    title="Thao tác khác"
                  >
                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold leading-tight">
                  {folder.title}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {folder.description}
                </p>
              </div>

              {/* Metadata metrics */}
              {folder.metrics && (
                <div
                  className={`grid ${folder.metrics.length === 3 ? "grid-cols-3" : "grid-cols-2"
                    } gap-2 py-2 px-3 rounded-lg bg-surface-container-low text-center font-label-sm`}
                >
                  {folder.metrics.map((m, idx) => (
                    <div key={idx}>
                      <div
                        className={`font-bold text-[14px] ${m.highlight ? "text-secondary" : "text-primary"
                          }`}
                      >
                        {m.value}
                      </div>
                      <div className="text-outline text-[11px] whitespace-nowrap">{m.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Team Avatars */}
              {folder.members && (
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-container-low">
                  <div className="flex items-center -space-x-2">
                    {folder.members.map((member, mIdx) =>
                      member.type === "avatar" ? (
                        <img
                          key={mIdx}
                          alt="Member"
                          className="w-6 h-6 rounded-full ring-2 ring-surface-container-lowest object-cover shrink-0"
                          src={member.src}
                        />
                      ) : (
                        <div
                          key={mIdx}
                          className={`w-6 h-6 rounded-full ${member.bg} text-[10px] font-bold flex items-center justify-center ring-2 ring-surface-container-lowest shrink-0`}
                        >
                          {member.text}
                        </div>
                      )
                    )}
                  </div>
                  {folder.metricsRight && (
                    <div className="text-right font-label-sm">
                      <span className="text-primary font-bold text-[13px] whitespace-nowrap">
                        {folder.metricsRight.top}
                      </span>
                      <span className="text-outline text-[11px] block whitespace-nowrap">
                        {folder.metricsRight.sub}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Folder Actions */}
            <div className="pt-space-md flex items-center justify-between gap-2 border-t border-surface-container-low mt-3">
              <button
                onClick={() => onOpenShareModal(folder)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors font-medium cursor-pointer whitespace-nowrap text-xs"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {folder.accessType === "shared" ? "link" : "share"}
                </span>
                <span>{folder.accessType === "shared" ? "Chia sẻ link" : "Chia sẻ folder"}</span>
              </button>

              <button
                onClick={() =>
                  alert(
                    folder.accessType === "shared"
                      ? `Cài đặt nhóm cho: ${folder.title}`
                      : folder.accessType === "public"
                        ? `Xem thống kê phân tích của: ${folder.title}`
                        : `Thêm bộ thẻ vào: ${folder.title}`
                  )
                }
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors font-medium cursor-pointer whitespace-nowrap text-xs ${folder.accessType === "private"
                  ? "bg-primary text-on-primary hover:bg-primary-container"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                  }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {folder.accessType === "private"
                    ? "add"
                    : folder.accessType === "shared"
                      ? "manage_accounts"
                      : "monitoring"}
                </span>
                <span>
                  {folder.accessType === "private"
                    ? "Thêm bộ thẻ"
                    : folder.accessType === "shared"
                      ? "Cài đặt nhóm"
                      : "Xem thống kê"}
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
