import React from "react";
import { useNavigate } from "react-router-dom";
import type { FolderNode } from "@/types/api.types";
import { Button } from "@/components/ui/Button";

export interface FolderDetailHeaderProps {
  folder: FolderNode;
  breadcrumbs: FolderNode[];
  decksCount: number;
  subfoldersCount: number;
  /** Chuyển tới thư mục khác ("" = gốc). */
  onNavigate: (folderId: string) => void;
  onAddExistingDeck: (folder: FolderNode) => void;
  onShare: (folder: FolderNode) => void;
  onCreateSubfolder: (parent: FolderNode) => void;
  onEdit: (folder: FolderNode) => void;
}

const iconBtnClass =
  "p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary transition-colors cursor-pointer";

// Breadcrumb + banner khi đang ở trong một thư mục.
export const FolderDetailHeader: React.FC<FolderDetailHeaderProps> = ({
  folder,
  breadcrumbs,
  decksCount,
  subfoldersCount,
  onNavigate,
  onAddExistingDeck,
  onShare,
  onCreateSubfolder,
  onEdit,
}) => {
  const navigate = useNavigate();
  // Thư mục người khác chia sẻ / public: chỉ xem & học
  const readOnly = folder.access === "viewer";
  const accessLabel = readOnly
    ? `Chia sẻ bởi ${folder.ownerName ?? "người khác"} · Chỉ xem`
    : folder.accessType === "public"
      ? "Ai có link đều xem được"
      : folder.accessType === "shared"
        ? "Đã chia sẻ"
        : "Thư mục cá nhân";

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav
        aria-label="Đường dẫn thư mục"
        className="flex items-center flex-wrap gap-1.5 text-xs text-on-surface-variant"
      >
        <button
          type="button"
          onClick={() => onNavigate("")}
          className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer hover:underline font-medium"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            {readOnly ? "folder_shared" : "folder_special"}
          </span>
          {readOnly ? "Được chia sẻ với tôi" : "Thư mục của tôi"}
        </button>
        {breadcrumbs.map((bc, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={bc.id}>
              <span aria-hidden="true" className="text-outline/50">
                /
              </span>
              <button
                type="button"
                disabled={isLast}
                aria-current={isLast ? "page" : undefined}
                onClick={() => onNavigate(bc.id)}
                className={`inline-flex items-center gap-1 transition-colors ${
                  isLast
                    ? "font-bold text-primary cursor-default"
                    : "hover:text-primary cursor-pointer hover:underline font-medium"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                  folder
                </span>
                {bc.title}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Banner thư mục */}
      <div className="p-6 rounded-2xl bg-surface-container-lowest border border-surface-container-high/70 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-xs">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[32px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              folder_open
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline-md text-2xl font-bold text-primary tracking-tight">
                {folder.title}
              </h1>
              {folder.level && (
                <span className="px-2.5 py-0.5 rounded font-label-sm text-xs font-bold bg-[#FFF7ED] text-[#C2410C]">
                  {folder.level}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-surface-container text-on-surface-variant font-medium flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                  {readOnly ? "visibility" : folder.accessType === "private" || !folder.accessType ? "lock" : "share"}
                </span>
                {accessLabel}
              </span>
            </div>
            <p className="font-body-sm text-sm text-on-surface-variant max-w-2xl">
              {folder.description || "Chưa có phần mô tả cho thư mục này."}
            </p>
            <div className="flex items-center gap-4 text-xs text-outline pt-1">
              <span>
                <strong>{decksCount}</strong> bộ thẻ trực thuộc
              </span>
              <span aria-hidden="true">•</span>
              <span>
                <strong>{subfoldersCount}</strong> thư mục con
              </span>
            </div>
          </div>
        </div>

        {/* Thao tác thư mục (chỉ chủ thư mục) */}
        {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="md"
            onClick={() => onAddExistingDeck(folder)}
            className="cursor-pointer border-primary/30 text-primary hover:bg-surface-container shadow-2xs"
            title="Chọn bộ thẻ có sẵn hoặc từ thư viện để đưa vào thư mục này"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              playlist_add
            </span>
            <span>Thêm bộ thẻ có sẵn</span>
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => navigate(`/decks/new?folderId=${encodeURIComponent(folder.id)}`)}
            className="cursor-pointer shadow-xs"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              add
            </span>
            <span>Tạo bộ thẻ mới</span>
          </Button>

          <button
            type="button"
            onClick={() => onShare(folder)}
            className={iconBtnClass}
            title="Chia sẻ thư mục"
            aria-label="Chia sẻ thư mục"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              share
            </span>
          </button>

          <button
            type="button"
            onClick={() => onCreateSubfolder(folder)}
            className={iconBtnClass}
            title="Thêm thư mục con bên trong"
            aria-label="Thêm thư mục con bên trong"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              create_new_folder
            </span>
          </button>

          <button
            type="button"
            onClick={() => onEdit(folder)}
            className={iconBtnClass}
            title="Chỉnh sửa thư mục"
            aria-label="Chỉnh sửa thư mục"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              edit
            </span>
          </button>
        </div>
        )}
      </div>
    </div>
  );
};
