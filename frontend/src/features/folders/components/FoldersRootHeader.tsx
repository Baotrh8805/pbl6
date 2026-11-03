import React from "react";
import { Link } from "react-router-dom";

export interface FoldersRootHeaderProps {
  foldersCount: number;
  decksCount: number;
  cardsCount: number;
  onCreateFolder: () => void;
}

// Ô KPI tóm tắt ở trang gốc
const StatBox: React.FC<{ icon: string; iconClass: string; value: number; label: string }> = ({
  icon,
  iconClass,
  value,
  label,
}) => (
  <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/90 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[24px]">
        {icon}
      </span>
    </div>
    <div>
      <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-headline">{value}</div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  </div>
);

// Header trang gốc "Thư mục": tiêu đề, nút tạo thư mục và 3 ô thống kê
export const FoldersRootHeader: React.FC<FoldersRootHeaderProps> = ({
  foldersCount,
  decksCount,
  cardsCount,
  onCreateFolder,
}) => (
  <div className="space-y-4">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            Không Gian Thư Mục
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Tổ chức tài liệu học tập
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          Thư Mục & Không Gian Học Tập
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl mt-1 leading-relaxed">
          Tổ chức bộ thẻ theo giáo trình (Shinkanzen, Soumatome, Mimikara), phân loại theo kỳ
          thi và chia sẻ tài nguyên nhóm học tập.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            create_new_folder
          </span>
          <span>Tạo Thư Mục Mới</span>
        </button>
        <Link
          to="/library"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            auto_stories
          </span>
          <span>Thư viện bộ thẻ</span>
        </Link>
      </div>
    </div>

    {/* 3 ô KPI */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatBox
        icon="folder"
        iconClass="bg-blue-50 text-blue-600"
        value={foldersCount}
        label="Thư mục đang quản lý"
      />
      <StatBox
        icon="style"
        iconClass="bg-emerald-50 text-emerald-600"
        value={decksCount}
        label="Bộ thẻ đã phân loại"
      />
      <StatBox
        icon="history_edu"
        iconClass="bg-purple-50 text-purple-600"
        value={cardsCount}
        label="Flashcard được phân chia"
      />
    </div>
  </div>
);

export default FoldersRootHeader;
