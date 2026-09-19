import React, { useState } from "react";
import type { FolderItem } from "../../types/dashboard.types";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFolder: (newFolder: FolderItem) => void;
  currentLevel?: string;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onCreateFolder,
  currentLevel = "N5",
}) => {
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [folderLevel, setFolderLevel] = useState(currentLevel);
  const [folderAccess, setFolderAccess] = useState<"private" | "shared" | "public">("private");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    const newFolder: FolderItem = {
      id: `f-${Date.now()}`,
      title: folderName.trim(),
      description: folderDesc.trim() || "Thư mục tài liệu tự tạo trên NihonGen AI.",
      accessType: folderAccess,
      level: folderLevel,
      iconName:
        folderAccess === "shared" ? "folder_shared" : folderAccess === "public" ? "public" : "folder",
      iconBg: "bg-surface-container",
      iconColor:
        folderAccess === "shared"
          ? "text-secondary"
          : folderAccess === "public"
            ? "text-tertiary"
            : "text-primary",
      tagLabel:
        folderAccess === "shared" ? "Chia sẻ nhóm" : folderAccess === "public" ? "Công khai" : "Riêng tư",
      tagBg: folderAccess === "shared" ? "bg-secondary-fixed/40" : "bg-surface-container",
      tagColor: folderAccess === "shared" ? "text-on-secondary-fixed" : "text-on-surface-variant",
      tagIcon: folderAccess === "shared" ? "groups" : folderAccess === "public" ? "cloud_download" : "lock",
      metrics: [
        { value: "0", label: "Bộ thẻ" },
        { value: "0", label: "Flashcards" },
        { value: "0", label: "Quiz ôn luyện", highlight: true },
      ],
      link: `${window.location.origin}/share/f/${encodeURIComponent(
        folderName.toLowerCase().replace(/\s+/g, "-")
      )}-${Math.random().toString(36).substring(2, 6)}`,
    };

    onCreateFolder(newFolder);
    setFolderName("");
    setFolderDesc("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 border border-surface-container-high">
        {/* Modal Header */}
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">create_new_folder</span>
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
              Tạo Thư Mục Học Tập Mới
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-space-lg space-y-4">
            <div className="space-y-1.5">
              <label className="font-label-md text-label-md text-on-surface font-semibold block">
                Tên thư mục <span className="text-error">*</span>
              </label>
              <input
                required
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="VD: Mimikara Oboeru N2 Bunpou..."
                className="w-full px-3.5 py-2.5 bg-surface-container-low rounded-lg text-body-md text-on-surface placeholder:text-outline border border-surface-container-high focus:outline-none focus:bg-surface-container"
                type="text"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-label-md text-label-md text-on-surface font-semibold block">
                Mô tả ngắn
              </label>
              <textarea
                rows={2}
                value={folderDesc}
                onChange={(e) => setFolderDesc(e.target.value)}
                placeholder="VD: Tổng hợp toàn bộ mẫu ngữ pháp nghe hiểu kèm file âm thanh..."
                className="w-full px-3.5 py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface placeholder:text-outline border border-surface-container-high focus:outline-none focus:bg-surface-container"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Cấp độ phân loại
                </label>
                <select
                  value={folderLevel}
                  onChange={(e) => setFolderLevel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-high focus:outline-none cursor-pointer"
                >
                  <option value="N1">N1</option>
                  <option value="N2">N2</option>
                  <option value="N3">N3</option>
                  <option value="N4">N4</option>
                  <option value="N5">N5</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Chế độ quyền riêng tư
                </label>
                <select
                  value={folderAccess}
                  onChange={(e) => setFolderAccess(e.target.value as any)}
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-high focus:outline-none cursor-pointer"
                >
                  <option value="private">Riêng tư (Chỉ mình bạn)</option>
                  <option value="shared">Chia sẻ nhóm</option>
                  <option value="public">Công khai cộng đồng</option>
                </select>
              </div>
            </div>
          </div>

          <div className="px-space-lg py-3 bg-surface-container-low flex items-center justify-end gap-2 border-t border-surface-container">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm font-semibold cursor-pointer"
            >
              Tạo Thư Mục
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
