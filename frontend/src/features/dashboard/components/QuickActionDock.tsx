import React from "react";
import { Link } from "react-router-dom";

interface QuickActionDockProps {
  foldersCount: number;
  onOpenCreateFolder: () => void;
  onImportFile: () => void;
  onOpenCommunity: () => void;
}

export const QuickActionDock: React.FC<QuickActionDockProps> = ({
  foldersCount,
  onOpenCreateFolder,
  onImportFile,
  onOpenCommunity,
}) => {
  return (
    <section
      aria-labelledby="quick-actions-title"
      className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <h2 id="quick-actions-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-blue-600">
            bolt
          </span>
          <span>Lối tắt thao tác nhanh</span>
        </h2>
        <span className="text-[11px] text-slate-400 font-medium">Quick Dock</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
        {/* Action 1: Bóc tách AI */}
        <button
          type="button"
          onClick={onImportFile}
          className="flex items-center justify-between p-3 rounded-xl bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/70 transition-all text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                document_scanner
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-purple-950 group-hover:text-purple-700 transition-colors">
                Bóc tách tài liệu AI
              </p>
              <p className="text-[11px] text-purple-700/80 truncate">Tải PDF, ảnh, tạo thẻ tự động</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-200/70 text-purple-800 shrink-0">
            AI
          </span>
        </button>

        {/* Action 2: Tạo bộ thẻ mới */}
        <Link
          to="/decks/new"
          className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200/60 transition-all group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-blue-950 group-hover:text-blue-700 transition-colors">
                Tạo bộ thẻ mới
              </p>
              <p className="text-[11px] text-blue-700/80 truncate">Tự soạn từ vựng &amp; Hán tự JLPT</p>
            </div>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-blue-400 group-hover:text-blue-600 transition-colors text-[18px]">
            chevron_right
          </span>
        </Link>

        {/* Action 3: Quản lý thư mục */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 transition-all group">
          <Link to="/folders" className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                folder_open
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Cây thư mục ({foldersCount})
              </p>
              <p className="text-[11px] text-slate-500 truncate">Quản lý &amp; chia sẻ theo nhóm</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={onOpenCreateFolder}
            className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white transition-colors"
            title="Tạo thư mục mới"
            aria-label="Tạo thư mục mới"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              create_new_folder
            </span>
          </button>
        </div>

        {/* Action 4: Thư viện cộng đồng */}
        <button
          type="button"
          onClick={onOpenCommunity}
          className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 hover:bg-emerald-100/50 border border-emerald-200/60 transition-all text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                public
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-950 group-hover:text-emerald-700 transition-colors">
                Thư viện cộng đồng
              </p>
              <p className="text-[11px] text-emerald-700/80 truncate">Khám phá bộ thẻ chia sẻ</p>
            </div>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-emerald-400 group-hover:text-emerald-600 transition-colors text-[18px]">
            arrow_forward
          </span>
        </button>
      </div>
    </section>
  );
};

