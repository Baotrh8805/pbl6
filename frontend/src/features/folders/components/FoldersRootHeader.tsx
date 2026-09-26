import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export interface FoldersRootHeaderProps {
  foldersCount: number;
  decksCount: number;
  cardsCount: number;
  onCreateFolder: () => void;
}

// Ô KPI tóm tắt ở trang gốc.
const StatBox: React.FC<{ icon: string; iconClass: string; value: number; label: string }> = ({
  icon,
  iconClass,
  value,
  label,
}) => (
  <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-surface-container-high/60 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[26px]">
        {icon}
      </span>
    </div>
    <div>
      <div className="text-2xl font-bold text-primary tracking-tight font-headline">{value}</div>
      <div className="text-xs text-on-surface-variant font-medium">{label}</div>
    </div>
  </div>
);

// Header trang gốc "Thư mục": tiêu đề, nút tạo thư mục và 3 ô thống kê.
export const FoldersRootHeader: React.FC<FoldersRootHeaderProps> = ({
  foldersCount,
  decksCount,
  cardsCount,
  onCreateFolder,
}) => (
  <div className="space-y-space-md">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-label-sm text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            Không Gian Thư Mục
          </span>
          <span className="text-xs text-on-surface-variant font-medium">
            Tổ chức tài liệu học tập
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">
          Thư Mục & Không Gian Học Tập
        </h1>
        <p className="font-body-sm text-sm text-on-surface-variant max-w-2xl mt-0.5">
          Tổ chức bộ thẻ theo giáo trình (Shinkanzen, Soumatome, Mimikara), phân loại theo kỳ
          thi và chia sẻ tài nguyên nhóm kỹ sư BrSE.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
        <Button
          variant="primary"
          size="md"
          onClick={onCreateFolder}
          className="cursor-pointer shadow-sm"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            create_new_folder
          </span>
          <span>+ Tạo Thư Mục Mới</span>
        </Button>
        <Link
          to="/library"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-label-md text-label-md transition-colors shadow-2xs border border-surface-container-high"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            auto_stories
          </span>
          <span>Thư viện bộ thẻ</span>
        </Link>
      </div>
    </div>

    {/* 3 ô KPI */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
      <StatBox
        icon="folder"
        iconClass="bg-primary/10 text-primary"
        value={foldersCount}
        label="Thư mục đang quản lý"
      />
      <StatBox
        icon="style"
        iconClass="bg-secondary-container/40 text-secondary"
        value={decksCount}
        label="Bộ thẻ đã phân loại"
      />
      <StatBox
        icon="history_edu"
        iconClass="bg-surface-container text-on-surface"
        value={cardsCount}
        label="Flashcard được phân chia"
      />
    </div>
  </div>
);
